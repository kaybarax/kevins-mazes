// Exercise a complete real-time online race, then rematch, through the public protocol.
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { decodeArena } from "../src/engine.js";
import { createBot, steerBot } from "../src/navigation.js";
const arena = decodeArena(
  JSON.parse(readFileSync(new URL("../src/arena.json", import.meta.url))),
);
const base = process.env.CAHUNA_URL || "http://localhost:8787";
const { code } = await fetch(base + "/api/rooms", { method: "POST" }).then(
  (r) => r.json(),
);
const ws = new WebSocket(
  base.replace(/^http/, "ws") + "/api/rooms/" + code + "/socket",
);
let credentials,
  state,
  seq = 0,
  brain = createBot(),
  roundEnded = false;
const deadline = setTimeout(() => {
  console.error("Race integration timeout");
  process.exitCode = 1;
  ws.close();
}, 510000);
const send = (m) => ws.send(JSON.stringify(m));
ws.onopen = () => send({ type: "join", name: "Lifecycle QA" });
ws.onmessage = ({ data }) => {
  const m = JSON.parse(data);
  if (m.type === "error") throw new Error(m.message);
  if (m.type === "welcome") {
    credentials = m.credentials;
    send({ type: "start", bots: 1 });
  }
  if (m.state) state = m.state;
  if (state?.match?.status === "finished" && !roundEnded) {
    roundEnded = true;
    assert.ok(
      state.match.players.every((p) => p.finishedAt !== null),
      "both players must finish",
    );
    assert.ok(state.match.players.every((p) => p.score > 0));
    console.log(
      "Finished real-time race:",
      JSON.stringify(
        state.match.players.map((p) => ({
          name: p.name,
          score: p.score,
          finishedAt: p.finishedAt,
        })),
      ),
    );
    send({ type: "start", bots: 1 });
  }
  if (roundEnded && state?.round === 2) {
    assert.equal(state.match.elapsed, 0);
    assert.ok(state.match.players.every((p) => p.score === 0));
    console.log("Rematch reset verified");
    clearTimeout(deadline);
    clearInterval(timer);
    send({ type: "leave" });
    ws.close();
  }
};
const timer = setInterval(() => {
  if (!credentials || !state?.match || state.countdown > 0 || roundEnded)
    return;
  const p = state.match.players.find((p) => p.id === credentials.id);
  p.bot = "racer";
  p.input = { x: 0, y: 0 };
  steerBot(arena, state.match, p, brain, 0.08);
  send({ type: "input", seq: seq++, x: p.input.x, y: p.input.y });
}, 80);
ws.onerror = (e) => {
  console.error(e);
  clearInterval(timer);
  clearTimeout(deadline);
  process.exitCode = 1;
};
