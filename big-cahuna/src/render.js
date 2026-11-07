import { cameraTransform } from "./camera.js";
import { nodeAt } from "./engine.js";
export async function loadArt(arena) {
  const load = (src) =>
    new Promise((resolve, reject) => {
      const img = new Image();
      img.onload = () => resolve(img);
      img.onerror = () => reject(new Error("Could not load " + src));
      img.src = src;
    });
  const walls = await load("/arena.svg"),
    items = await Promise.all(
      arena.items.map((i) => load(`/item-${i.id}.svg`)),
    );
  return { walls, items };
}
export function drawView(
  canvas,
  arena,
  art,
  player,
  {
    overview = true,
    camera = null,
    particles = [],
    trail = true,
    time = 0,
  } = {},
) {
  const r = canvas.getBoundingClientRect();
  if (!r.width || !r.height) return;
  const dpr = Math.min(devicePixelRatio || 1, 2),
    w = Math.round(r.width * dpr),
    h = Math.round(r.height * dpr);
  if (canvas.width !== w || canvas.height !== h) {
    canvas.width = w;
    canvas.height = h;
  }
  const ctx = canvas.getContext("2d");
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  ctx.fillStyle = "#fff";
  ctx.fillRect(0, 0, r.width, r.height);
  const { scale, tx, ty } = cameraTransform(
    camera || { x: 1000, y: 650, zoom: 1 },
    r.width,
    r.height,
  );
  ctx.translate(tx, ty);
  ctx.scale(scale, scale);
  ctx.drawImage(art.walls, 0, 0);
  if (trail && player?.trail?.length > 1) {
    ctx.beginPath();
    ctx.moveTo(...player.trail[0]);
    for (const p of player.trail) ctx.lineTo(...p);
    ctx.strokeStyle = player.color + "60";
    ctx.lineWidth = 5;
    ctx.lineCap = "round";
    ctx.stroke();
  }
  arena.items.forEach((item, i) => {
    const taken = player?.collected.includes(item.id);
    ctx.save();
    if (taken) {
      ctx.globalAlpha = 0.48;
      ctx.filter = "grayscale(1)";
    }
    const size = item.kind === "The Big Cahuna" ? 190 : 110;
    ctx.drawImage(
      art.items[i],
      item.x - size / 2,
      item.y - size / 2,
      size,
      size,
    );
    ctx.restore();
    if (taken) {
      const x = item.x + size * 0.26,
        y = item.y + size * 0.26;
      ctx.fillStyle = "#e3ebe5";
      ctx.strokeStyle = "#47715a";
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.arc(x, y, 13, 0, Math.PI * 2);
      ctx.fill();
      ctx.stroke();
      ctx.beginPath();
      ctx.moveTo(x - 6, y);
      ctx.lineTo(x - 1, y + 5);
      ctx.lineTo(x + 7, y - 5);
      ctx.lineWidth = 3;
      ctx.stroke();
    }
  });
  for (const e of arena.exits) {
    ctx.fillStyle = "#eef5dd";
    ctx.beginPath();
    ctx.arc(e.x, e.y, 34, 0, Math.PI * 2);
    ctx.fill();
    ctx.strokeStyle = "#315d43";
    ctx.lineWidth = 3;
    ctx.beginPath();
    ctx.moveTo(e.x - 12, e.y + 20);
    ctx.lineTo(e.x - 12, e.y - 20);
    ctx.stroke();
    for (let y = 0; y < 3; y++)
      for (let x = 0; x < 4; x++) {
        ctx.fillStyle = (x + y) % 2 ? "#fff" : "#315d43";
        ctx.fillRect(e.x - 10 + x * 7, e.y - 20 + y * 7, 7, 7);
      }
  }
  if (player) {
    ctx.fillStyle = player.color + "20";
    ctx.beginPath();
    ctx.arc(player.x, player.y, 13 + Math.sin(time * 3) * 2, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = player.color;
    ctx.beginPath();
    ctx.arc(player.x, player.y, 6, 0, Math.PI * 2);
    ctx.fill();
    ctx.strokeStyle = "white";
    ctx.lineWidth = 2;
    ctx.stroke();
  }
  for (const p of particles) {
    const age = time - p.at;
    if (age > 1.2) continue;
    ctx.globalAlpha = 1 - age / 1.2;
    ctx.fillStyle = "#174b47";
    ctx.font = "bold 25px sans-serif";
    ctx.textAlign = "center";
    ctx.fillText("+" + p.value, p.x, p.y - 20 - age * 35);
    ctx.globalAlpha = 1;
  }
  return { scale, tx, ty };
}
export function exitDistances(arena) {
  const d = new Int32Array(arena.walk.length);
  d.fill(-1);
  const queue = new Int32Array(d.length);
  let head = 0,
    tail = 0;
  for (const e of arena.exits) {
    const n = nodeAt(arena, e.x, e.y);
    if (arena.walk[n]) {
      d[n] = 0;
      queue[tail++] = n;
    }
  }
  while (head < tail) {
    const n = queue[head++],
      x = n % arena.cols;
    for (const next of [
      x ? n - 1 : -1,
      x < arena.cols - 1 ? n + 1 : -1,
      n - arena.cols,
      n + arena.cols,
    ])
      if (next >= 0 && next < d.length && arena.walk[next] && d[next] === -1) {
        d[next] = d[n] + 1;
        queue[tail++] = next;
      }
  }
  return d;
}
export function progress(arena, distances, p, startSide = p.startSide ?? 0) {
  if (p.finishedAt !== null) return 100;
  const start = distances[nodeAt(arena, ...arena.starts[startSide])],
    now = distances[nodeAt(arena, p.x, p.y)];
  return now < 0
    ? 0
    : Math.max(0, Math.min(99, Math.round(100 * (1 - now / start))));
}
