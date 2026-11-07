import assert from "node:assert/strict";
const base = process.env.CHASE_URL || "http://localhost:8788";
const room = await fetch(base + "/api/rooms", { method: "POST" }).then((r) =>
  r.json(),
);
assert.match(room.code, /^[A-Z2-9]{8}$/);
const clients = [];
async function until(fn, timeout = 15000) {
  const start = Date.now();
  while (!fn()) {
    if (Date.now() - start > timeout) throw Error("Timed out");
    await new Promise((r) => setTimeout(r, 40));
  }
}
async function connect(name, credentials) {
  const ws = new WebSocket(
      base.replace(/^http/, "ws") + "/api/rooms/" + room.code + "/socket",
    ),
    c = { ws, messages: [], state: null };
  clients.push(c);
  ws.onmessage = ({ data }) => {
    const m = JSON.parse(data);
    c.messages.push(m);
    if (m.state) c.state = m.state;
    if (m.credentials) c.credentials = m.credentials;
  };
  await new Promise((resolve, reject) => {
    ws.onopen = resolve;
    ws.onerror = reject;
  });
  ws.send(JSON.stringify({ type: "join", name, credentials }));
  await until(
    () => c.credentials || c.messages.some((m) => m.type === "error"),
  );
  return c;
}
const send = (c, m) => c.ws.send(JSON.stringify(m));
try {
  const a = await connect("QA Hunter"),
    b = await connect("QA Runner");
  send(b, { type: "start" });
  await until(() => b.messages.some((m) => m.type === "error"));
  assert.match(b.messages.find((m) => m.type === "error").message, /host/);
  send(a, { type: "start", arenaId: "4" });
  await until(() => a.state?.game && b.state?.game);
  assert.equal(a.state.game.players.length, 4);
  assert.equal(a.state.game.players[1].x, undefined);
  assert.equal(b.state.game.players[0].x, undefined);
  assert.ok(!JSON.stringify(b.state).includes(a.credentials.token));
  await until(() => a.state.countdown === 0);
  send(a, { type: "ability", kind: "utility" });
  await until(() => a.state.game.players[0].revealUntil > 0);
  assert.ok(Number.isFinite(a.state.game.players[1].x));
  send(b, { type: "ability", kind: "utility" });
  await until(() => b.state.game.players[1].decoysLeft === 2);
  const p = a.state.game.players[0],
    start = [p.x, p.y];
  for (let seq = 0; seq < 8; seq++) {
    send(a, { type: "input", seq, x: 0, y: 1 });
    await new Promise((r) => setTimeout(r, 80));
  }
  const moved = a.state.game.players[0];
  assert.ok(
    Math.hypot(moved.x - start[0], moved.y - start[1]) > 1,
    "movement accepted",
  );
  a.ws.close();
  await until(() => b.state.hostId === b.credentials.id);
  const resumed = await connect("QA Hunter", a.credentials);
  assert.equal(resumed.credentials.id, a.credentials.id);
  assert.equal(
    resumed.state.game.players[0].revealUntil,
    a.state.game.players[0].revealUntil,
  );
  const bad = await connect("Forged", { id: a.credentials.id, token: "wrong" });
  assert.ok(bad.messages.some((m) => m.type === "error"));
  const rejected = await fetch(base + "/api/rooms", {
    method: "POST",
    headers: { Origin: "https://unrelated.example" },
  });
  assert.equal(rejected.status, 403);
  console.log(
    JSON.stringify({
      ok: true,
      base,
      checks: [
        "two humans and two bots",
        "host-only start",
        "countdown",
        "per-seat fog privacy",
        "pulse reveal",
        "decoy inventory",
        "authoritative movement",
        "host transfer",
        "reconnect",
        "secret validation",
        "origin rejection",
      ],
    }),
  );
} finally {
  for (const c of clients) c.ws.close();
}
