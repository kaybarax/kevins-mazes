import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { createHash } from "node:crypto";
import {
  arenas,
  createGame,
  step,
  view,
  input,
  ability,
  steerBots,
  arenaFor,
} from "../src/game.js";
import { clearLine, canStand, movePlayer } from "../src/geometry.js";
import { findPath } from "../src/pathfinding.js";
const members = [0, 1, 2, 3].map((i) => ({
  id: String(i),
  name: "Player " + i,
  connected: true,
}));
test("five arenas derive from unchanged original walls; spawns and every objective connect", () => {
  assert.equal(arenas.length, 5);
  for (const a of arenas) {
    const source = readFileSync(
      new URL(
        `../../cleaned mazes/Kevin's Maze ${String(a.number).padStart(2, "0")}.svg`,
        import.meta.url,
      ),
    );
    assert.equal(
      createHash("sha256").update(source).digest("hex"),
      a.sourceSha256,
    );
    for (const dest of [...a.starts, ...a.keys, ...a.exits])
      assert.ok(findPath(a, a.starts[0], dest).length, `${a.id} ${dest}`);
    assert.ok(a.metrics.spawnMinDistance > 1500);
    assert.equal(canStand(a, 0, 0), false);
  }
});
test("fog snapshots remove hidden coordinates and secrets, reveal expires", () => {
  const g = createGame(members, "1"),
    p = g.players[0],
    other = g.players[1];
  other.x = p.x + 600;
  other.y = p.y;
  let v = view(g, "0");
  assert.equal(v.players[1].x, undefined);
  assert.equal(v.players[0].input, undefined);
  assert.ok(ability(g, "0", "utility"));
  assert.equal(view(g, "0").players[1].x, other.x);
  g.elapsed = 4;
  assert.equal(view(g, "0").players[1].x, undefined);
  g.status = "finished";
  assert.equal(view(g, "0").players[1].x, other.x);
});
test("keys are personal and score once; two keys unlock a legal escape", () => {
  const g = createGame(members, "4"),
    a = arenaFor("4"),
    p = g.players[1];
  [p.x, p.y] = a.keys[0];
  step(g, 0.05);
  assert.deepEqual(p.keys, [0]);
  assert.equal(p.points, 1);
  step(g, 0.05);
  assert.equal(p.points, 1);
  const q = g.players[2];
  [q.x, q.y] = a.keys[0];
  step(g, 0.05);
  assert.equal(q.points, 1);
  [p.x, p.y] = a.exits[0];
  step(g, 0.05);
  assert.equal(p.state, "active");
  [p.x, p.y] = a.keys[1];
  step(g, 0.05);
  assert.equal(p.keys.length, 2);
  [p.x, p.y] = a.exits[0];
  step(g, 0.05);
  assert.equal(p.state, "escaped");
  assert.equal(p.points, 7);
});
test("capture respects walls and grace period; powers enforce cooldown and inventory", () => {
  const g = createGame(members, "4"),
    p = g.players[0],
    q = g.players[1],
    a = arenaFor("4");
  q.x = p.x;
  q.y = p.y;
  step(g, 0.1);
  assert.equal(q.state, "active");
  g.elapsed = 8;
  step(g, 0.1);
  assert.equal(q.state, "caught");
  assert.equal(p.points, 3);
  assert.equal(ability(g, q.id, "sprint"), false);
  assert.equal(ability(g, p.id, "sprint"), true);
  assert.equal(ability(g, p.id, "sprint"), false);
  const r = g.players[2];
  for (let i = 0; i < 3; i++) {
    g.elapsed += 19;
    assert.equal(ability(g, r.id, "utility"), true);
  }
  g.elapsed += 19;
  assert.equal(ability(g, r.id, "utility"), false);
  assert.equal(g.decoys.length, 3);
  // A narrow wall separates these two walkable samples: proximity alone cannot tag.
  let pair;
  for (let y = 150; y < 1200 && !pair; y += 2)
    for (let x = 200; x < 1800; x += 2)
      if (
        canStand(a, x, y) &&
        canStand(a, x + 12, y) &&
        !clearLine(a, x, y, x + 12, y)
      ) {
        pair = [x, y];
        break;
      }
  assert.ok(pair);
  [p.x, p.y] = pair;
  r.x = p.x + 12;
  r.y = p.y;
  step(g, 0.01);
  assert.equal(r.state, "active");
});
test("oversized and invalid input cannot exceed speed or cross walls; deadline freezes result", () => {
  const g = createGame(members, "4"),
    p = g.players[0],
    a = arenaFor("4");
  input(p, 999, 999);
  assert.ok(Math.hypot(p.input.x, p.input.y) <= 1.0001);
  input(p, NaN, Infinity);
  for (let i = 0; i < 50; i++) {
    const x = p.x,
      y = p.y;
    step(g, 0.1);
    assert.ok(Math.hypot(p.x - x, p.y - y) <= 16.61);
    assert.ok(canStand(a, p.x, p.y));
  }
  const wall = {
    cols: 30,
    rows: 30,
    step: 1,
    walk: new Uint8Array(900).fill(1),
  };
  for (let y = 0; y < 30; y++) wall.walk[y * 30 + 15] = 0;
  const probe = { x: 10, y: 15, distance: 0 };
  movePlayer(wall, probe, 100, 0);
  assert.ok(probe.x < 15, "substeps cannot tunnel through a solid wall");
  g.elapsed = 179.99;
  step(g, 0.1);
  assert.equal(g.status, "finished");
  const total = p.total;
  step(g, 1);
  assert.equal(p.total, total);
});
test("all arenas and rotating hunter roles finish legal bot games", () => {
  for (const a of arenas) {
    for (let round = 0; round < 4; round++) {
      const g = createGame(
        members.map((m) => ({ ...m, bot: true })),
        a.id,
        round,
      );
      const brains = {};
      for (let i = 0; i < 3601 && g.status === "playing"; i++) {
        steerBots(g, brains, 0.05);
        step(g, 0.05);
      }
      assert.equal(g.status, "finished", `${a.id} round ${round}`);
      assert.equal(g.players[round].role, "hunter");
      assert.ok(
        g.players.some((p) => p.state === "escaped" || p.state === "caught"),
        `${a.id} needs interaction`,
      );
      for (const p of g.players) assert.ok(canStand(a, p.x, p.y));
    }
  }
});

test("hunter patrol retains a destination until reached instead of oscillating", () => {
  const g = createGame(members, "1"),
    p = g.players[0];
  p.bot = true;
  p.utilityReady = 999;
  const brains = {};
  steerBots(g, brains, 0.05);
  const destination = brains[p.id].path.at(-1);
  g.elapsed = 2;
  steerBots(g, brains, 0.05);
  assert.deepEqual(brains[p.id].path.at(-1), destination);
});
