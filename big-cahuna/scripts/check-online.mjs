import assert from "node:assert/strict";
const base = process.env.CAHUNA_URL || "http://localhost:8787";
const origin = new URL(base).origin;
const room = await fetch(base + "/api/rooms", { method: "POST" }).then((r) =>
  r.json(),
);
assert.match(room.code, /^[A-Z2-9]{8}$/);
const clients = [];
async function connect(name, credentials) {
  const ws = new WebSocket(
    base.replace(/^http/, "ws") + "/api/rooms/" + room.code + "/socket",
  );
  const client = { ws, messages: [], state: null };
  clients.push(client);
  ws.onmessage = ({ data }) => {
    const m = JSON.parse(data);
    client.messages.push(m);
    if (m.state) client.state = m.state;
    if (m.credentials) client.credentials = m.credentials;
  };
  await new Promise((resolve, reject) => {
    ws.onopen = resolve;
    ws.onerror = reject;
  });
  ws.send(JSON.stringify({ type: "join", name, credentials }));
  await until(
    () => client.credentials || client.messages.some((m) => m.type === "error"),
  );
  return client;
}
async function until(fn, timeout = 12000) {
  const start = Date.now();
  while (!fn()) {
    if (Date.now() - start > timeout) throw new Error("Timed out");
    await new Promise((r) => setTimeout(r, 40));
  }
}
const send = (c, m) => c.ws.send(JSON.stringify(m));
try {
  const a = await connect("QA Host"),
    b = await connect("QA Guest");
  send(b, { type: "start", bots: 2 });
  await until(() => b.messages.some((m) => m.type === "error"));
  assert.match(b.messages.find((m) => m.type === "error").message, /host/);
  send(a, { type: "start", bots: 2 });
  await until(() => a.state?.match && b.state?.match);
  assert.equal(a.state.match.players.length, 4);
  await until(() => a.state.countdown === 0);
  const p = a.state.match.players.find((p) => p.id === a.credentials.id);
  const x = p.x,
    y = p.y;
  for (let seq = 0; seq < 10; seq++) {
    send(a, { type: "input", seq, x: 1, y: 0 });
    await new Promise((r) => setTimeout(r, 80));
  }
  const moved = a.state.match.players.find((p) => p.id === a.credentials.id);
  assert.ok(Math.hypot(moved.x - x, moved.y - y) > 1, "movement accepted");
  send(a, { type: "watch", watching: true });
  await until(
    () => a.state.match.players.find((p) => p.id === a.credentials.id).watching,
  );
  const stationary = a.state.match.players.find(
    (p) => p.id === a.credentials.id,
  );
  send(a, { type: "input", seq: 10, x: 1, y: 0 });
  await new Promise((r) => setTimeout(r, 250));
  assert.equal(
    a.state.match.players.find((p) => p.id === a.credentials.id).x,
    stationary.x,
  );
  a.ws.close();
  await until(() => b.state.hostId === b.credentials.id);
  const resumed = await connect("QA Host", a.credentials);
  assert.equal(resumed.credentials.id, a.credentials.id);
  assert.equal(
    resumed.state.match.players.find((p) => p.id === a.credentials.id).x,
    stationary.x,
  );
  assert.ok(!JSON.stringify(b.state).includes(a.credentials.token));
  const rejected = await connect("Intruder", {
    id: a.credentials.id,
    token: "wrong",
  });
  assert.ok(rejected.messages.some((m) => m.type === "error"));
  const forbidden = await fetch(base + "/api/rooms", {
    method: "POST",
    headers: { Origin: "https://unrelated.example" },
  });
  assert.equal(forbidden.status, 403);
  console.log(
    JSON.stringify({
      ok: true,
      origin,
      checks: [
        "room creation",
        "two humans + two bots",
        "host-only start",
        "countdown",
        "authoritative movement",
        "spectating stops movement",
        "host transfer",
        "seat reconnect",
        "secret validation",
        "cross-origin rejection",
      ],
    }),
  );
} finally {
  for (const c of clients) c.ws.close();
}
