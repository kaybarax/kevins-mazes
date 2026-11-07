import { DurableObject } from "cloudflare:workers";
import { Room } from "../src/room.js";
const codePattern = /^[A-HJ-NP-Z2-9]{8}$/;
const json = (body, status = 200) =>
  Response.json(body, { status, headers: { "Cache-Control": "no-store" } });

export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    if (!url.pathname.startsWith("/api/")) return env.ASSETS.fetch(request);
    const origin = request.headers.get("Origin");
    if (origin && origin !== url.origin)
      return json({ error: "Use the game site to connect." }, 403);
    if (url.pathname === "/api/health")
      return json({ ok: true, version: 1, game: "maze-chase" });
    if (url.pathname === "/api/rooms" && request.method === "POST") {
      const alphabet = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
      for (let attempt = 0; attempt < 3; attempt++) {
        const code = [...crypto.getRandomValues(new Uint8Array(8))]
          .map((v) => alphabet[v % alphabet.length])
          .join("");
        const stub = env.ROOMS.get(env.ROOMS.idFromName(code));
        const result = await stub.fetch(
          new Request(`https://room/init/${code}`, { method: "POST" }),
        );
        if (result.ok) return json({ code }, 201);
      }
      return json({ error: "Could not create a room. Please retry." }, 503);
    }
    const match = url.pathname.match(/^\/api\/rooms\/([^/]+)\/socket$/);
    if (match && codePattern.test(match[1])) {
      const stub = env.ROOMS.get(env.ROOMS.idFromName(match[1]));
      return stub.fetch(request);
    }
    return json({ error: "Room not found." }, 404);
  },
};

export class ChaseRoom extends DurableObject {
  constructor(ctx, env) {
    super(ctx, env);
    this.timer = null;
    this.lastSave = 0;
    this.pending = new Map();
    this.rates = new WeakMap();
    ctx.blockConcurrencyWhile(async () => {
      const saved = await ctx.storage.get("room");
      this.room = saved ? new Room(saved.code, saved.state) : null;
      if (this.room) {
        const online = new Set(
          ctx
            .getWebSockets()
            .map((ws) => ws.deserializeAttachment()?.id)
            .filter(Boolean),
        );
        for (const m of this.room.members)
          if (!m.bot) m.connected = online.has(m.id);
        for (const p of this.room.game?.players || [])
          if (!p.bot) p.connected = online.has(p.id);
        this.room.electHost();
        if (this.room.game?.status === "playing") this.startTick();
      }
    });
  }
  async persist() {
    if (this.room)
      await this.ctx.storage.put("room", {
        code: this.room.code,
        state: this.room.save(),
      });
  }
  async fetch(request) {
    const url = new URL(request.url);
    if (url.pathname.startsWith("/init/")) {
      if (this.room) return new Response("exists", { status: 409 });
      this.room = new Room(url.pathname.split("/").at(-1));
      await this.persist();
      await this.ctx.storage.setAlarm(Date.now() + 86400000);
      return new Response("ok");
    }
    if (!this.room)
      return json({ error: "This room does not exist or has expired." }, 404);
    if (request.headers.get("Upgrade")?.toLowerCase() !== "websocket")
      return new Response("WebSocket required", { status: 426 });
    if (this.ctx.getWebSockets().length >= 10)
      return new Response("Room busy", { status: 429 });
    const pair = new WebSocketPair();
    const [client, server] = Object.values(pair);
    this.ctx.acceptWebSocket(server);
    server.serializeAttachment({ id: null });
    const timeout = setTimeout(() => {
      if (!server.deserializeAttachment()?.id)
        server.close(1008, "Please join the room.");
      this.pending.delete(server);
    }, 10000);
    this.pending.set(server, timeout);
    return new Response(null, { status: 101, webSocket: client });
  }
  send(ws, body) {
    try {
      ws.send(JSON.stringify(body));
    } catch {
      /* Close event clears membership. */
    }
  }
  broadcast() {
    const now = Date.now();
    for (const ws of this.ctx.getWebSockets()) {
      const id = ws.deserializeAttachment()?.id;
      if (id)
        this.send(ws, { type: "state", state: this.room.publicState(id, now) });
    }
  }
  async webSocketMessage(ws, raw) {
    if (typeof raw !== "string" || raw.length > 2048) {
      ws.close(1009, "Message too large");
      return;
    }
    const now = Date.now(),
      rate = this.rates.get(ws) || { since: now, count: 0 };
    if (now - rate.since > 1000) {
      rate.since = now;
      rate.count = 0;
    }
    if (++rate.count > 70) {
      ws.close(1008, "Too many messages");
      return;
    }
    this.rates.set(ws, rate);
    try {
      const message = JSON.parse(raw);
      if (!message || typeof message !== "object")
        throw new Error("Invalid message.");
      let id = ws.deserializeAttachment()?.id;
      if (message.type === "join") {
        if (id) throw new Error("Already joined.");
        const credentials = this.room.join(
          message.name,
          message.credentials,
          now,
        );
        id = credentials.id;
        for (const other of this.ctx.getWebSockets())
          if (other !== ws && other.deserializeAttachment()?.id === id) {
            other.serializeAttachment({ id: null });
            other.close(4001, "Connected in another tab");
          }
        ws.serializeAttachment({ id });
        clearTimeout(this.pending.get(ws));
        this.pending.delete(ws);
        this.send(ws, {
          type: "welcome",
          credentials,
          state: this.room.publicState(id, now),
        });
        this.broadcast();
        await this.persist();
      } else {
        if (!id) throw new Error("Join first.");
        if (message.type === "leave") {
          this.room.leave(id);
          ws.serializeAttachment({ id: null });
          ws.close(1000, "Left room");
          this.broadcast();
          await this.persist();
          return;
        }
        this.room.command(id, message, now);
        if (["start", "next", "rematch", "vote"].includes(message.type)) {
          if (message.type !== "vote") this.startTick();
          this.broadcast();
          await this.persist();
        }
      }
    } catch (error) {
      this.send(ws, {
        type: "error",
        message: error.message || "Could not process that action.",
      });
    }
  }
  startTick() {
    if (this.timer) return;
    this.timer = setInterval(() => {
      const now = Date.now();
      this.room.advance(now);
      this.broadcast();
      if (now - this.lastSave > 5000 || this.room.game?.status === "finished") {
        this.lastSave = now;
        this.ctx.waitUntil(this.persist());
      }
      if (this.room.game?.status !== "playing") {
        clearInterval(this.timer);
        this.timer = null;
      }
    }, 50);
  }
  async webSocketClose(ws, code = 1000, reason = "") {
    try {
      ws.close(code === 1005 || code === 1006 ? 1000 : code, reason);
    } catch {}
    clearTimeout(this.pending.get(ws));
    this.pending.delete(ws);
    const id = ws.deserializeAttachment()?.id;
    if (id) {
      this.room.disconnect(id);
      this.broadcast();
      await this.persist();
    }
  }
  async webSocketError(ws) {
    await this.webSocketClose(ws);
  }
  async alarm() {
    if (this.room?.game?.status === "playing") {
      await this.ctx.storage.setAlarm(Date.now() + 3600000);
      return;
    }
    for (const ws of this.ctx.getWebSockets()) ws.close(1000, "Room expired");
    await this.ctx.storage.deleteAll();
    this.room = null;
  }
}
