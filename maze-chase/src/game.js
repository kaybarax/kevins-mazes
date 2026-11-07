import data from "./arenas.json" with { type: "json" };
import {
  decodeArena,
  clearLine,
  movePlayer,
  nodeAt,
  pointAt,
} from "./geometry.js";
import { findPath } from "./pathfinding.js";
export const arenas = data.map(decodeArena);
export const colors = ["#ee7859", "#35a69a", "#9679da", "#d8a838"];
export const DURATION = 180,
  VISION = 280;
export const arenaFor = (id) => arenas.find((a) => a.id === id) || arenas[0];
export function input(p, x, y) {
  if (!Number.isFinite(x) || !Number.isFinite(y)) return;
  const mag = Math.max(1, Math.hypot(x, y));
  p.input = { x: x / mag, y: y / mag };
}
export function createGame(
  members,
  arenaId = "1",
  round = 0,
  difficulty = "standard",
  totals = {},
) {
  const arena = arenaFor(arenaId);
  return {
    arenaId: arena.id,
    round,
    difficulty,
    elapsed: 0,
    duration: DURATION,
    status: "playing",
    events: [],
    footprints: [],
    decoys: [],
    echoes: [],
    lastEcho: 0,
    players: members.map((m, i) => ({
      id: m.id,
      name: m.name,
      bot: !!m.bot,
      connected: m.connected !== false,
      color: colors[i],
      role: i === round % members.length ? "hunter" : "runner",
      x: arena.starts[i][0],
      y: arena.starts[i][1],
      input: { x: 0, y: 0 },
      distance: 0,
      keys: [],
      state: "active",
      points: 0,
      total: totals[m.id] || 0,
      sprintUntil: 0,
      sprintReady: 0,
      utilityReady: 0,
      revealUntil: 0,
      footAt: 0,
      decoysLeft: 3,
    })),
    winner: null,
  };
}
export function speed(game, p) {
  const base = p.role === "hunter" ? 166 : 150;
  const bot = p.bot
    ? { relaxed: 0.78, standard: 0.94, expert: 1.08 }[game.difficulty] || 0.94
    : 1;
  return base * bot * (p.sprintUntil > game.elapsed ? 1.65 : 1);
}
export function ability(game, id, kind) {
  const p = game.players.find((p) => p.id === id);
  if (!p || p.state !== "active" || game.status !== "playing" || !p.connected)
    return false;
  if (kind === "sprint" && p.sprintReady <= game.elapsed) {
    p.sprintUntil = game.elapsed + 2;
    p.sprintReady = game.elapsed + 12;
    return true;
  }
  if (kind === "utility" && p.utilityReady <= game.elapsed) {
    if (p.role === "hunter") {
      p.revealUntil = game.elapsed + 3;
      p.utilityReady = game.elapsed + 25;
    } else {
      if (!p.decoysLeft) return false;
      p.decoysLeft--;
      p.utilityReady = game.elapsed + 18;
      game.decoys.push({
        id: "echo-" + game.elapsed + "-" + p.id,
        x: p.x,
        y: p.y,
        color: p.color,
        until: game.elapsed + 8,
      });
    }
    return true;
  }
  return false;
}
export function visible(game, viewer, target) {
  return (
    game.status !== "playing" ||
    viewer.id === target.id ||
    viewer.revealUntil > game.elapsed ||
    Math.hypot(viewer.x - target.x, viewer.y - target.y) <= VISION
  );
}
export function endGame(game) {
  if (game.status !== "playing") return;
  game.status = "finished";
  const runners = game.players.filter((p) => p.role === "runner"),
    hunter = game.players.find((p) => p.role === "hunter");
  for (const p of runners) if (p.state === "active") p.state = "trapped";
  const escaped = runners.filter((p) => p.state === "escaped").length;
  game.winner = escaped ? "runners" : "hunter";
  if (!escaped) hunter.points += 2;
  for (const p of game.players) {
    p.total += p.points;
    p.input = { x: 0, y: 0 };
  }
}
export function step(game, dt) {
  if (game.status !== "playing") return;
  const arena = arenaFor(game.arenaId);
  dt = Math.min(0.1, Math.max(0, dt));
  game.elapsed = Math.min(game.duration, game.elapsed + dt);
  game.events = [];
  for (const p of game.players) {
    if (p.state !== "active" || !p.connected) continue;
    const v = speed(game, p);
    movePlayer(arena, p, p.input.x * v * dt, p.input.y * v * dt);
    if (
      game.elapsed - p.footAt > 0.6 &&
      Math.hypot(p.input.x, p.input.y) > 0.1
    ) {
      game.footprints.push({
        x: p.x,
        y: p.y,
        id: p.id,
        color: p.color,
        until: game.elapsed + 3,
      });
      p.footAt = game.elapsed;
    }
    if (p.role === "runner") {
      for (const [i, [x, y]] of arena.keys.entries())
        if (
          !p.keys.includes(i) &&
          Math.hypot(p.x - x, p.y - y) < 18 &&
          clearLine(arena, p.x, p.y, x, y)
        ) {
          p.keys.push(i);
          p.points++;
          game.events.push({ type: "key", id: p.id });
        }
      if (
        p.keys.length >= 2 &&
        arena.exits.some(
          ([x, y]) =>
            Math.hypot(p.x - x, p.y - y) < 22 &&
            clearLine(arena, p.x, p.y, x, y),
        )
      ) {
        p.state = "escaped";
        p.points += 5;
        game.events.push({ type: "escaped", id: p.id });
      }
    }
  }
  const hunter = game.players.find((p) => p.role === "hunter");
  if (hunter.connected)
    for (const p of game.players)
      if (
        p.role === "runner" &&
        p.state === "active" &&
        game.elapsed > 7 &&
        Math.hypot(p.x - hunter.x, p.y - hunter.y) < 15 &&
        clearLine(arena, p.x, p.y, hunter.x, hunter.y)
      ) {
        p.state = "caught";
        p.input = { x: 0, y: 0 };
        hunter.points += 3;
        game.events.push({ type: "caught", id: p.id });
      }
  game.footprints = game.footprints.filter((f) => f.until > game.elapsed);
  game.decoys = game.decoys.filter((d) => d.until > game.elapsed);
  if (game.elapsed - game.lastEcho >= 12) {
    game.lastEcho = game.elapsed;
    game.echoes = game.players
      .filter((p) => p.role === "runner" && p.state === "active")
      .map((p) => ({
        x: Math.round(p.x / 100) * 100,
        y: Math.round(p.y / 100) * 100,
        until: game.elapsed + 3,
      }));
  }
  game.echoes = game.echoes.filter((e) => e.until > game.elapsed);
  if (
    game.elapsed >= game.duration ||
    game.players
      .filter((p) => p.role === "runner")
      .every((p) => p.state !== "active")
  )
    endGame(game);
}
export function view(game, id, training = false) {
  const me = game.players.find((p) => p.id === id) || game.players[0];
  const show = (p) => training || visible(game, me, p);
  return {
    ...game,
    players: game.players.map((p) => {
      const { input, footAt, distance, ...pub } = p;
      if (!show(p)) {
        delete pub.x;
        delete pub.y;
      }
      return { ...pub, visible: show(p) };
    }),
    footprints: game.footprints.filter(
      (f) => training || Math.hypot(me.x - f.x, me.y - f.y) <= VISION,
    ),
    decoys: game.decoys.filter(
      (d) => training || Math.hypot(me.x - d.x, me.y - d.y) <= VISION,
    ),
    echoes: me.role === "hunter" ? game.echoes : [],
    events: game.events,
  };
}
export function nearest(arena, x, y, radius = 70) {
  let best = null,
    d = Infinity;
  for (let dy = -radius; dy <= radius; dy += arena.step)
    for (let dx = -radius; dx <= radius; dx += arena.step) {
      const n = nodeAt(arena, x + dx, y + dy);
      if (arena.walk[n] && dx * dx + dy * dy < d) {
        best = pointAt(arena, n);
        d = dx * dx + dy * dy;
      }
    }
  return best;
}
export function follow(arena, p, brain, dt, velocity) {
  while (
    brain.path?.length &&
    Math.hypot(p.x - brain.path[0][0], p.y - brain.path[0][1]) < 2
  )
    brain.path.shift();
  if (!brain.path?.length) {
    input(p, 0, 0);
    return;
  }
  let look = 0;
  while (
    look + 1 < Math.min(12, brain.path.length) &&
    clearLine(arena, p.x, p.y, ...brain.path[look + 1])
  )
    look++;
  if (look) brain.path.splice(0, look);
  const [x, y] = brain.path[0],
    dx = x - p.x,
    dy = y - p.y,
    d = Math.hypot(dx, dy),
    factor = Math.min(1, d / (velocity * dt));
  input(p, d ? (dx / d) * factor : 0, d ? (dy / d) * factor : 0);
}
export function steerBots(game, brains, dt) {
  const arena = arenaFor(game.arenaId),
    hunter = game.players.find((p) => p.role === "hunter");
  for (const p of game.players.filter((p) => p.bot && p.state === "active")) {
    const brain = (brains[p.id] ||= { path: [], next: 0, patrol: 0 });
    if (
      p.role === "hunter" &&
      game.elapsed > 8 &&
      p.utilityReady <= game.elapsed
    )
      ability(game, p.id, "utility");
    if (game.elapsed >= brain.next || !brain.path.length) {
      brain.next =
        game.elapsed +
        ({ relaxed: 3, standard: 1.8, expert: 1 }[game.difficulty] || 2);
      let candidates;
      if (p.role === "hunter") {
        const seen = game.players
          .filter(
            (q) =>
              q.role === "runner" &&
              q.state === "active" &&
              visible(game, p, q),
          )
          .map((q) => [q.x, q.y]);
        candidates = [
          ...seen,
          ...game.decoys
            .filter((d) => visible(game, p, d))
            .map((d) => [d.x, d.y]),
        ];
        if (!candidates.length && game.echoes.length)
          candidates = game.echoes
            .map((e) => nearest(arena, e.x, e.y))
            .filter(Boolean);
        if (!candidates.length) {
          if (
            !brain.patrolTarget ||
            Math.hypot(
              p.x - brain.patrolTarget[0],
              p.y - brain.patrolTarget[1],
            ) < 20
          )
            brain.patrolTarget = arena.keys[brain.patrol++ % arena.keys.length];
          candidates = [brain.patrolTarget];
        }
        if (seen.length) ability(game, p.id, "sprint");
      } else {
        candidates =
          p.keys.length >= 2
            ? arena.exits
            : arena.keys.filter((_, i) => !p.keys.includes(i));
        if (Math.hypot(p.x - hunter.x, p.y - hunter.y) < 200) {
          ability(game, p.id, "sprint");
          ability(game, p.id, "utility");
        }
      }
      const routes = candidates
        .map((to) => findPath(arena, [p.x, p.y], to))
        .filter((p) => p.length);
      routes.sort((a, b) => a.length - b.length);
      brain.path = routes[0] || [];
    }
    follow(arena, p, brain, dt, speed(game, p));
  }
}
