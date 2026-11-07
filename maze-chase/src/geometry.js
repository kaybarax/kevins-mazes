export function decodeArena(data) {
  const bytes =
    typeof Buffer !== "undefined"
      ? new Uint8Array(Buffer.from(data.walkable, "base64"))
      : Uint8Array.from(atob(data.walkable), (c) => c.charCodeAt(0));
  const walk = new Uint8Array(data.cols * data.rows);
  for (let i = 0; i < walk.length; i++)
    walk[i] = (bytes[i >> 3] >> (i & 7)) & 1;
  return { ...data, walk };
}
export function nodeAt(arena, x, y) {
  const col = Math.round(x / arena.step),
    row = Math.round(y / arena.step);
  return col < 0 || row < 0 || col >= arena.cols || row >= arena.rows
    ? -1
    : row * arena.cols + col;
}
export function pointAt(arena, node) {
  return [
    (node % arena.cols) * arena.step,
    Math.floor(node / arena.cols) * arena.step,
  ];
}
export function canStand(arena, x, y) {
  return arena.walk[nodeAt(arena, x, y)] === 1;
}
export function clearLine(arena, x, y, tx, ty) {
  const steps = Math.ceil(Math.hypot(tx - x, ty - y));
  for (let i = 0; i <= steps; i++) {
    const t = steps ? i / steps : 0;
    if (!canStand(arena, x + (tx - x) * t, y + (ty - y) * t)) return false;
  }
  return true;
}
export function movePlayer(arena, player, dx, dy) {
  const steps = Math.max(1, Math.ceil(Math.hypot(dx, dy)));
  let travelled = 0;
  for (let i = 0; i < steps; i++) {
    const ox = player.x,
      oy = player.y,
      sx = dx / steps,
      sy = dy / steps;
    if (clearLine(arena, ox, oy, ox + sx, oy + sy)) {
      player.x += sx;
      player.y += sy;
    } else {
      if (clearLine(arena, player.x, player.y, player.x + sx, player.y))
        player.x += sx;
      if (clearLine(arena, player.x, player.y, player.x, player.y + sy))
        player.y += sy;
    }
    travelled += Math.hypot(player.x - ox, player.y - oy);
  }
  player.distance += travelled;
}
