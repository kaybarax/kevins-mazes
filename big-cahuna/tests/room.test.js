import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { Room } from "../src/room.js";
import { decodeArena } from "../src/engine.js";
const arena = decodeArena(
  JSON.parse(readFileSync(new URL("../src/arena.json", import.meta.url))),
);
const setup = () => {
  const room = new Room(arena, "ABCDEFGH");
  const host = room.join("Kevin", null, 1000);
  const guest = room.join("Guest", null, 1000);
  return { room, host, guest };
};
test("host owns start, seats cap at four, tokens stay private", () => {
  const { room, host, guest } = setup();
  assert.throws(() => room.command(guest.id, { type: "start" }, 1000), /host/);
  room.join("Three");
  room.join("Four");
  assert.throws(() => room.join("Five"), /four/);
  room.command(host.id, { type: "start", bots: 99 }, 1000);
  assert.equal(room.match.players.length, 4);
  assert.ok(!JSON.stringify(room.publicState()).includes(host.token));
  assert.throws(() => room.join("Late"), /started/);
});
test("reconnect needs the secret and preserves score; disconnected host transfers", () => {
  const { room, host, guest } = setup();
  room.command(host.id, { type: "start", bots: 0 }, 1000);
  room.match.players[0].score = 25;
  room.disconnect(host.id, 2000);
  assert.equal(room.hostId, guest.id);
  assert.throws(
    () => room.join("Intruder", { id: host.id, token: "wrong" }, 2000),
    /saved seat/,
  );
  assert.equal(room.join("Kevin", host, 2000).id, host.id);
  assert.equal(room.match.players[0].score, 25);
  assert.equal(room.match.players[0].connected, true);
});
test("countdown, replayed input, stale controls and watching are enforced by server", () => {
  const { room, host } = setup();
  room.command(host.id, { type: "start", bots: 0 }, 1000);
  const p = room.match.players[0],
    start = { x: p.x, y: p.y };
  room.command(host.id, { type: "input", seq: 2, x: 1, y: 0 }, 3900);
  room.command(host.id, { type: "input", seq: 1, x: -1, y: 0 }, 3900);
  assert.equal(p.input.x, 1);
  room.advance(3999);
  assert.equal(p.x, start.x);
  room.advance(4100);
  assert.equal(room.match.elapsed, 0.1);
  room.advance(4600);
  assert.equal(p.input.x, 0);
  room.command(host.id, { type: "watch", watching: true }, 4600);
  room.command(host.id, { type: "input", seq: 3, x: 1, y: 0 }, 4600);
  const x = p.x;
  room.advance(4700);
  assert.equal(p.x, x);
});
test("deadline survives restart and all disconnected players; rematch resets state", () => {
  const { room, host, guest } = setup();
  room.command(host.id, { type: "start", bots: 0 }, 1000);
  room.disconnect(host.id, 5000);
  room.disconnect(guest.id, 5000);
  const restored = new Room(arena, room.code, structuredClone(room.save()));
  restored.advance(484001);
  assert.equal(restored.match.status, "finished");
  assert.equal(restored.match.elapsed, 480);
  restored.join("Kevin", host, 485000);
  restored.command(host.id, { type: "start", bots: 3 }, 485000);
  assert.equal(restored.round, 2);
  assert.equal(restored.match.players.length, 4);
  assert.equal(restored.match.elapsed, 0);
  assert.equal(restored.match.players[0].score, 0);
});

test("each player chooses an entrance before start and keeps it through reconnect and rematch", () => {
  const room = new Room(arena, "ABCDEFGH");
  const left = room.join("Left", null, 1000, 0),
    right = room.join("Right", null, 1000, 1);
  room.command(left.id, { type: "start", bots: 2 }, 1000);
  for (const [id, side] of [
    [left.id, 0],
    [right.id, 1],
  ]) {
    const p = room.match.players.find((p) => p.id === id);
    assert.equal(p.startSide, side);
    assert.deepEqual([p.x, p.y], arena.starts[side]);
  }
  assert.throws(
    () => room.command(right.id, { type: "entrance", startSide: 0 }),
    /before/,
  );
  room.disconnect(right.id);
  room.join("Right", right, 2000, 0);
  assert.equal(room.match.players.find((p) => p.id === right.id).startSide, 1);
  room.match.status = "finished";
  room.command(right.id, { type: "entrance", startSide: 0 });
  room.command(left.id, { type: "start", bots: 0 }, 3000);
  assert.equal(room.match.players.find((p) => p.id === right.id).startSide, 0);
});
