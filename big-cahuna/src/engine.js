/** Shared deterministic rules. Online rooms run these on the server. */
export const SPEED = 105;
export const ROUND_SECONDS = 480;
export const COLORS = ['#167d8d', '#e17b42', '#8a67c7', '#c49d24'];
export function decodeArena(data) {
  const bytes = typeof Buffer !== 'undefined' ? new Uint8Array(Buffer.from(data.walkable, 'base64')) : Uint8Array.from(atob(data.walkable), c => c.charCodeAt(0));
  const walk = new Uint8Array(data.cols * data.rows);
  for (let i = 0; i < walk.length; i++) walk[i] = (bytes[i >> 3] >> (i & 7)) & 1;
  return { ...data, walk };
}
export function nodeAt(arena, x, y) {
  const col = Math.round(x / arena.step), row = Math.round(y / arena.step);
  return col < 0 || row < 0 || col >= arena.cols || row >= arena.rows ? -1 : row * arena.cols + col;
}
export function pointAt(arena, node) { return [node % arena.cols * arena.step, Math.floor(node / arena.cols) * arena.step]; }
export function canStand(arena, x, y) { return arena.walk[nodeAt(arena, x, y)] === 1; }
export function clearLine(arena, x, y, tx, ty) {
  const steps = Math.ceil(Math.hypot(tx - x, ty - y));
  for (let i = 0; i <= steps; i++) {
    const t = steps ? i / steps : 0;
    if (!canStand(arena, x + (tx - x) * t, y + (ty - y) * t)) return false;
  }
  return true;
}
export function createPlayer(arena, id, name, slot, bot = null, startSide = 0) {
  const [x, y] = arena.starts[startSide];
  return { id, name: String(name).trim().slice(0, 20) || 'Explorer', color: COLORS[slot % 4], slot, bot, x, y, score: 0, collected: [], finishedAt: null, watching: false, connected: true, trail: [[x, y]], distance: 0, input: { x: 0, y: 0 }, lastTrailAt: 0 };
}
export function createMatch(arena, players, duration = ROUND_SECONDS) {
  return { status: 'racing', elapsed: 0, duration, players, events: [], tick: 0 };
}
export function setInput(player, input) {
  const x = Number(input?.x), y = Number(input?.y);
  if (!Number.isFinite(x) || !Number.isFinite(y)) return;
  const length = Math.max(1, Math.hypot(x, y));
  player.input = { x: x / length, y: y / length };
}
export function movePlayer(arena, player, dx, dy) {
  const steps = Math.max(1, Math.ceil(Math.hypot(dx, dy)));
  let travelled = 0;
  for (let i = 0; i < steps; i++) {
    const ox = player.x, oy = player.y, sx = dx / steps, sy = dy / steps;
    if (clearLine(arena, ox, oy, ox + sx, oy + sy)) { player.x += sx; player.y += sy; }
    else {
      if (clearLine(arena, player.x, player.y, player.x + sx, player.y)) player.x += sx;
      if (clearLine(arena, player.x, player.y, player.x, player.y + sy)) player.y += sy;
    }
    travelled += Math.hypot(player.x - ox, player.y - oy);
  }
  player.distance += travelled;
}
export function stepMatch(arena, match, dt) {
  if (match.status !== 'racing') return [];
  dt = Math.max(0, Math.min(.1, Number.isFinite(dt) ? dt : 0));
  dt = Math.min(dt, match.duration - match.elapsed);
  match.elapsed += dt; match.tick++;
  const events = [];
  for (const p of match.players) {
    if (p.finishedAt !== null) continue;
    if (!p.watching && p.connected) movePlayer(arena, p, p.input.x * SPEED * dt, p.input.y * SPEED * dt);
    for (const item of arena.items) {
      if (p.collected.includes(item.id)) continue;
      const radius = item.kind === 'The Big Cahuna' ? 65 : 24;
      if (Math.hypot(p.x - item.x, p.y - item.y) <= radius && clearLine(arena, p.x, p.y, item.x, item.y)) {
        p.collected.push(item.id); p.score += item.value;
        events.push({ type: 'pickup', playerId: p.id, itemId: item.id, value: item.value, x: item.x, y: item.y });
      }
    }
    if (arena.exits.some(e => Math.hypot(p.x - e.x, p.y - e.y) <= e.radius)) {
      p.finishedAt = match.elapsed; p.input = { x: 0, y: 0 };
      events.push({ type: 'finish', playerId: p.id, score: p.score });
    }
    if (match.elapsed - p.lastTrailAt >= .25 && Math.hypot(p.x - p.trail.at(-1)[0], p.y - p.trail.at(-1)[1]) > 2) {
      p.trail.push([Math.round(p.x), Math.round(p.y)]); p.lastTrailAt = match.elapsed;
      if (p.trail.length > 2500) p.trail.splice(0, 1);
    }
  }
  if (match.elapsed >= match.duration || match.players.every(p => p.finishedAt !== null)) {
    match.status = 'finished'; events.push({ type: 'end' });
  }
  return events;
}
export function ranking(match) {
  return [...match.players].sort((a, b) => {
    const af = a.finishedAt !== null, bf = b.finishedAt !== null;
    if (af !== bf) return af ? -1 : 1;
    return b.score - a.score || (a.finishedAt ?? Infinity) - (b.finishedAt ?? Infinity) || a.slot - b.slot;
  });
}
export function snapshot(match, includeTrails = false) {
  return { status: match.status, elapsed: match.elapsed, duration: match.duration, tick: match.tick,
    players: match.players.map(({ input, lastTrailAt, trail, ...p }) => ({ ...p, ...(includeTrails ? { trail } : {}) })) };
}
