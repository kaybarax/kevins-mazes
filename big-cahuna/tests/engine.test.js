import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import {
  decodeArena,
  createPlayer,
  createMatch,
  stepMatch,
  setInput,
  selectNavigator,
  snapshot,
  ranking,
  canStand,
  clearLine,
  SPEED,
  MAX_PACE,
} from "../src/engine.js";
import { findPath, createBot, steerBot } from "../src/navigation.js";
const arena = decodeArena(
  JSON.parse(readFileSync(new URL("../src/arena.json", import.meta.url))),
);
test("every collectible and both exits are reachable from both starts", () => {
  for (const start of arena.starts) {
    for (const item of arena.items)
      assert.ok(
        findPath(arena, start, [item.x, item.y]).length,
        item.kind + item.id,
      );
    for (const exit of arena.exits)
      assert.ok(findPath(arena, start, [exit.x, exit.y]).length, "exit");
  }
  assert.equal(arena.doors.length, 5);
});
test("movement cannot tunnel through walls, exceed speed, or leave the arena", () => {
  const p = createPlayer(arena, "p", "Player", 0),
    match = createMatch(arena, [p]);
  setInput(p, { x: 9999, y: 9999 });
  for (let i = 0; i < 1000; i++) {
    const x = p.x,
      y = p.y;
    stepMatch(arena, match, 0.05);
    assert.ok(canStand(arena, p.x, p.y));
    assert.ok(Math.hypot(p.x - x, p.y - y) <= SPEED * MAX_PACE * 0.05 + 0.001);
  }
  // A solid one-cell wall must stop even an oversized time step.
  const box = {
    step: 1,
    cols: 30,
    rows: 30,
    walk: new Uint8Array(900).fill(1),
    starts: [[10, 15]],
    items: [],
    exits: [],
  };
  for (let y = 0; y < 30; y++) box.walk[y * 30 + 15] = 0;
  const q = createPlayer(box, "q", "Q", 0),
    barrier = createMatch(box, [q]);
  setInput(q, { x: 1, y: 0 });
  stepMatch(box, barrier, 1000);
  assert.ok(q.x < 15);
  assert.ok(canStand(box, q.x, q.y));
  setInput(p, { x: NaN, y: Infinity });
  assert.ok(Number.isFinite(p.input.x));
});
test("items score once per player, independently; watching stops movement while time advances", () => {
  const players = [
    createPlayer(arena, "a", "A", 0),
    createPlayer(arena, "b", "B", 1),
  ];
  const item = arena.items[0];
  for (const p of players) {
    p.x = item.x;
    p.y = item.y;
  }
  const match = createMatch(arena, players);
  stepMatch(arena, match, 0.05);
  stepMatch(arena, match, 0.05);
  for (const p of players) {
    assert.equal(p.score, item.value);
    assert.deepEqual(p.collected, [item.id]);
  }
  const p = players[0];
  p.watching = true;
  const old = [p.x, p.y];
  setInput(p, { x: 1, y: 1 });
  stepMatch(arena, match, 0.05);
  assert.deepEqual([p.x, p.y], old);
  assert.ok(match.elapsed > 0.1);
});
test("finishers outrank non-finishers; points lead, then time; deadline freezes match", () => {
  const ps = [
    createPlayer(arena, "a", "A", 0),
    createPlayer(arena, "b", "B", 1),
    createPlayer(arena, "c", "C", 2),
  ];
  ps[0].score = 10;
  ps[0].finishedAt = 30;
  ps[1].score = 10;
  ps[1].finishedAt = 20;
  ps[2].score = 999;
  const m = createMatch(arena, ps, 0.1);
  assert.deepEqual(
    ranking(m).map((p) => p.id),
    ["b", "a", "c"],
  );
  stepMatch(arena, m, 0.1);
  assert.equal(m.status, "finished");
  const before = JSON.stringify(m);
  stepMatch(arena, m, 0.1);
  assert.equal(JSON.stringify(m), before);
});
test("a cautious bot collects prizes and escapes legally before the deadline", () => {
  const p = createPlayer(arena, "bot", "Bot", 0, "racer"),
    m = createMatch(arena, [p]),
    brain = createBot();
  for (let i = 0; i < 10000 && m.status === "racing"; i++) {
    steerBot(arena, m, p, brain, 0.05);
    stepMatch(arena, m, 0.05);
    assert.ok(canStand(arena, p.x, p.y));
  }
  assert.notEqual(p.finishedAt, null);
  assert.ok(p.score > 0);
  assert.ok(p.finishedAt < 480);
});
test("a full four-player bot race terminates with independent collections", () => {
  const ps = Array.from({ length: 4 }, (_, i) =>
    createPlayer(
      arena,
      "b" + i,
      "Bot " + i,
      i,
      i === 3 ? "racer" : "collector",
      i % 2,
    ),
  );
  const m = createMatch(arena, ps),
    brains = ps.map(() => createBot());
  for (let i = 0; i < 10000 && m.status === "racing"; i++) {
    for (let j = 0; j < ps.length; j++)
      steerBot(arena, m, ps[j], brains[j], 0.05);
    stepMatch(arena, m, 0.05);
  }
  assert.equal(m.status, "finished");
  for (const p of ps) {
    assert.notEqual(p.finishedAt, null, p.name);
    assert.equal(new Set(p.collected).size, p.collected.length);
    assert.ok(p.score > 0);
  }
});

test("fractional controls retain their pace and oversized controls cannot exceed the Sprint cap", () => {
  const open = {
    step: 1,
    cols: 600,
    rows: 600,
    walk: new Uint8Array(360000).fill(1),
    starts: [[100, 100]],
    items: [],
    exits: [],
  };
  for (const [input, expected] of [
    [0.25, 15],
    [0.5, 30],
    [0.75, 45],
    [1, 60],
    [6, 360],
    [20, 360],
  ]) {
    const p = createPlayer(open, "pace", "Pace", 0),
      match = createMatch(open, [p]);
    setInput(p, { x: input, y: 0 });
    for (let i = 0; i < 10; i++) stepMatch(open, match, 0.1);
    assert.ok(Math.abs(p.x - 100 - expected) < 1e-6, `pace ${input}`);
  }
});

test("progress uses each player’s own starting entrance", async () => {
  const { exitDistances, progress } = await import("../src/render.js");
  const distances = exitDistances(arena);
  for (const side of [0, 1]) {
    const p = createPlayer(arena, "p", "Player", 0, null, side);
    assert.equal(progress(arena, distances, p), 0);
  }
  const artwork = readFileSync(
    new URL("../public/arena.svg", import.meta.url),
    "utf8",
  );
  assert.ok(artwork.includes('id="entry-icon-0"'));
  assert.ok(artwork.includes('id="entry-icon-1"'));
});

test("independent navigators retain positions and trails when switching", () => {
  const p = createPlayer(arena, "you", "You", 0),
    match = createMatch(arena, [p]);
  assert.deepEqual(
    p.navigators.map((n) => [n.x, n.y]),
    arena.starts,
  );
  setInput(p, { x: 1, y: 0 });
  stepMatch(arena, match, 0.1);
  const left = [p.x, p.y];
  assert.notDeepEqual(left, arena.starts[0]);
  assert.equal(selectNavigator(p, 1), true);
  assert.deepEqual([p.x, p.y], arena.starts[1]);
  setInput(p, { x: -1, y: 0 });
  stepMatch(arena, match, 0.1);
  const right = [p.x, p.y];
  assert.notDeepEqual(right, arena.starts[1]);
  selectNavigator(p, 0);
  assert.deepEqual([p.x, p.y], left);
  selectNavigator(p, 1);
  assert.deepEqual([p.x, p.y], right);
  assert.equal(selectNavigator(p, 99), false);
  assert.equal(snapshot(match).players[0].navigators[0].trail, undefined);
  assert.ok(snapshot(match, true).players[0].navigators[0].trail);
});
