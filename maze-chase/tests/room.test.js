import test from "node:test";
import assert from "node:assert/strict";
import { Room } from "../src/room.js";
function setup() {
  const r = new Room("ABCDEFGH");
  const a = r.join("Kevin", null, 1000),
    b = r.join("Friend", null, 1000);
  return { r, a, b };
}
test("host authority, capacity and private room tokens", () => {
  const { r, a, b } = setup();
  r.join("Three");
  r.join("Four");
  assert.throws(() => r.join("Five"), /four/);
  assert.throws(() => r.command(b.id, { type: "start" }, 1000), /host/);
  assert.ok(r.publicState(a.id).members.every((m) => !m.token));
  r.command(a.id, { type: "start", arenaId: "2" }, 1000);
  assert.equal(r.game.players.length, 4);
  assert.equal(r.game.arenaId, "2");
  assert.equal(r.publicState(a.id, 1000).countdown, 4);
  r.advance(3000);
  assert.equal(r.game.elapsed, 0);
});
test("monotonic inputs, disconnect, reconnect and server restart preserve tournament", () => {
  const { r, a, b } = setup();
  r.command(a.id, { type: "start" }, 1000);
  r.command(a.id, { type: "input", seq: 1, x: 1, y: 0 }, 5000);
  r.command(a.id, { type: "input", seq: 0, x: -1, y: 0 }, 5000);
  assert.equal(r.game.players[0].input.x, 1);
  r.advance(5500);
  assert.equal(r.game.players[0].input.x, 0);
  r.game.players[0].points = 8;
  r.disconnect(a.id);
  assert.equal(r.hostId, b.id);
  assert.throws(() => r.join("Fake", { id: a.id, token: "wrong" }), /expired/);
  const restored = new Room(r.code, JSON.parse(JSON.stringify(r.save())));
  restored.join("Kevin", a, 6000);
  assert.equal(restored.game.players[0].points, 8);
  assert.equal(restored.game.players[0].connected, true);
  restored.advance(190000);
  assert.equal(restored.game.status, "finished");
  assert.equal(restored.game.players[0].total, 10);
});
test("arena voting and four rounds rotate each hunter exactly once, rematch resets totals", () => {
  const { r, a, b } = setup();
  r.command(a.id, { type: "start", arenaId: "1" }, 1000);
  const hunters = [];
  for (let i = 0; i < 4; i++) {
    hunters.push(r.game.players.find((p) => p.role === "hunter").id);
    r.advance(r.startAt + 181000);
    if (i < 3) {
      r.command(b.id, { type: "vote", arenaId: "5" });
      r.command(a.id, { type: "next" }, 200000 * (i + 1));
      assert.equal(r.game.arenaId, "5");
    }
  }
  assert.equal(new Set(hunters).size, 4);
  assert.throws(() => r.command(a.id, { type: "next" }), /finished/);
  r.command(
    a.id,
    { type: "rematch", arenaId: "3", difficulty: "expert" },
    900000,
  );
  assert.equal(r.round, 0);
  assert.equal(r.game.arenaId, "3");
  assert.ok(r.game.players.every((p) => p.total === 0));
});
test("online opponent positions are filtered per seat", () => {
  const { r, a, b } = setup();
  r.command(a.id, { type: "start", arenaId: "1" }, 1000);
  const sa = r.publicState(a.id, 5000),
    sb = r.publicState(b.id, 5000);
  assert.ok(Number.isFinite(sa.game.players[0].x));
  assert.equal(sa.game.players[1].x, undefined);
  assert.ok(Number.isFinite(sb.game.players[1].x));
  assert.equal(sb.game.players[0].x, undefined);
});
