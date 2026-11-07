import { arenaFor, VISION } from "./game.js";
export const art = {};
export async function loadArt(arenas) {
  await Promise.all(
    arenas.map(
      (a) =>
        new Promise((resolve, reject) => {
          const img = new Image();
          img.onload = () => {
            art[a.id] = img;
            resolve();
          };
          img.onerror = reject;
          img.src = `/arena-${a.id}.svg`;
        }),
    ),
  );
}
export function transform(camera, width, height) {
  const scale = Math.min(width / 1840, height / 1280) * camera.zoom;
  return {
    scale,
    tx: width / 2 - camera.x * scale,
    ty: height / 2 - camera.y * scale,
  };
}
export function zoom(
  camera,
  factor,
  width,
  height,
  x = width / 2,
  y = height / 2,
) {
  const a = transform(camera, width, height),
    wx = (x - a.tx) / a.scale,
    wy = (y - a.ty) / a.scale;
  camera.zoom = Math.max(1, Math.min(8, camera.zoom * factor));
  const b = transform(camera, width, height);
  camera.x += wx - (x - b.tx) / b.scale;
  camera.y += wy - (y - b.ty) / b.scale;
}
export function pin(ctx, x, y, color, label) {
  ctx.fillStyle = color;
  ctx.beginPath();
  ctx.arc(x, y, 10, 0, Math.PI * 2);
  ctx.fill();
  ctx.strokeStyle = "#fff";
  ctx.lineWidth = 3;
  ctx.stroke();
  if (label) {
    ctx.font = "bold 18px system-ui";
    ctx.textAlign = "center";
    ctx.fillStyle = "#173b34";
    ctx.fillText(label, x, y - 19);
  }
}
function key(ctx, x, y, taken) {
  ctx.save();
  ctx.translate(x, y);
  ctx.strokeStyle = taken ? "#a4ac9e" : "#bb8617";
  ctx.fillStyle = taken ? "#e3e7de" : "#fff0ba";
  ctx.lineWidth = 4;
  ctx.beginPath();
  ctx.arc(-7, -3, 9, 0, Math.PI * 2);
  ctx.fill();
  ctx.stroke();
  ctx.beginPath();
  ctx.moveTo(1, 1);
  ctx.lineTo(19, 19);
  ctx.moveTo(13, 13);
  ctx.lineTo(19, 7);
  ctx.stroke();
  ctx.restore();
}
export function draw(
  canvas,
  game,
  viewerId,
  camera,
  { preview = false, route = [] } = {},
) {
  const a = arenaFor(game.arenaId),
    r = canvas.getBoundingClientRect(),
    dpr = Math.min(devicePixelRatio || 1, 2);
  if (!r.width || !r.height) return;
  if (
    canvas.width !== Math.round(r.width * dpr) ||
    canvas.height !== Math.round(r.height * dpr)
  ) {
    canvas.width = Math.round(r.width * dpr);
    canvas.height = Math.round(r.height * dpr);
  }
  const ctx = canvas.getContext("2d");
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  ctx.clearRect(0, 0, r.width, r.height);
  ctx.fillStyle = a.background;
  ctx.fillRect(0, 0, r.width, r.height);
  const t = transform(camera, r.width, r.height);
  canvas.viewTransform = t;
  ctx.translate(t.tx, t.ty);
  ctx.scale(t.scale, t.scale);
  ctx.drawImage(art[a.id], 0, 0);
  const me = game.players.find((p) => p.id === viewerId) || game.players[0];
  for (const [i, [x, y]] of a.keys.entries())
    key(ctx, x, y, me?.keys.includes(i));
  for (const [x, y] of a.exits) {
    ctx.fillStyle = "#fff";
    ctx.strokeStyle = "#287b64";
    ctx.lineWidth = 4;
    ctx.beginPath();
    ctx.roundRect(x - 15, y - 19, 30, 38, 5);
    ctx.fill();
    ctx.stroke();
    ctx.fillStyle = "#287b64";
    ctx.font = "bold 24px system-ui";
    ctx.textAlign = "center";
    ctx.fillText("↗", x, y + 8);
  }
  if (route.length) {
    ctx.beginPath();
    ctx.moveTo(me.x, me.y);
    for (const [x, y] of route) ctx.lineTo(x, y);
    ctx.strokeStyle = "#25857588";
    ctx.setLineDash([5, 8]);
    ctx.lineWidth = 3;
    ctx.stroke();
    ctx.setLineDash([]);
  }
  for (const f of game.footprints) {
    ctx.globalAlpha = Math.max(0, (f.until - game.elapsed) / 3) * 0.6;
    ctx.fillStyle = f.color;
    ctx.beginPath();
    ctx.ellipse(f.x, f.y, 3, 6, 0, 0, Math.PI * 2);
    ctx.fill();
  }
  ctx.globalAlpha = 1;
  // Fog obscures opponents and objectives beyond local sight; original walls remain faintly legible.
  if (!preview && game.status === "playing" && me && Number.isFinite(me.x)) {
    ctx.save();
    ctx.beginPath();
    ctx.rect(-5000, -5000, 10000, 10000);
    ctx.arc(me.x, me.y, VISION, 0, Math.PI * 2, true);
    ctx.fillStyle = "#16372fe8";
    ctx.fill("evenodd");
    ctx.restore();
    ctx.strokeStyle = "#ffffff55";
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.arc(me.x, me.y, VISION, 0, Math.PI * 2);
    ctx.stroke();
  }
  for (const e of game.echoes || []) {
    ctx.strokeStyle = "#e8a951";
    ctx.lineWidth = 4;
    ctx.setLineDash([8, 8]);
    ctx.beginPath();
    ctx.arc(e.x, e.y, 60 + Math.sin(game.elapsed * 5) * 10, 0, Math.PI * 2);
    ctx.stroke();
    ctx.setLineDash([]);
  }
  for (const d of game.decoys || []) {
    pin(ctx, d.x, d.y, d.color, "");
  }
  for (const p of game.players) {
    if (!Number.isFinite(p.x) || p.state !== "active") continue;
    const active = p.id === viewerId;
    ctx.fillStyle = p.color + "30";
    ctx.beginPath();
    ctx.arc(p.x, p.y, active ? 22 : 16, 0, Math.PI * 2);
    ctx.fill();
    pin(
      ctx,
      p.x,
      p.y,
      p.color,
      preview ? "" : p.role === "hunter" ? "◆" : active ? "YOU" : p.name,
    );
    if (p.sprintUntil > game.elapsed) {
      ctx.strokeStyle = p.color;
      ctx.lineWidth = 3;
      ctx.beginPath();
      ctx.arc(p.x, p.y, 27, game.elapsed * 5, game.elapsed * 5 + 4);
      ctx.stroke();
    }
  }
  return t;
}
