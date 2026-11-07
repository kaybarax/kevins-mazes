import {
  createPlayer,
  createMatch,
  setInput,
  stepMatch,
  snapshot,
} from "./engine.js";
import { createBot, steerBot } from "./navigation.js";

/** Transport-independent authority. Clients can submit intentions, never positions or scores. */
export class Room {
  constructor(arena, code, saved = null) {
    this.arena = arena;
    this.code = code;
    this.members = saved?.members || [];
    this.hostId = saved?.hostId || null;
    this.match = saved?.match || null;
    this.startAt = saved?.startAt || null;
    this.round = saved?.round || 0;
    this.createdAt = saved?.createdAt || Date.now();
    this.lastAt = null;
    this.brains = {};
    this.inputAt = new Map();
    this.lastSeq = new Map();
    for (const p of this.match?.players || []) {
      p.input = { x: 0, y: 0 };
      if (p.bot) this.brains[p.id] = createBot();
    }
  }
  save() {
    return {
      members: this.members,
      hostId: this.hostId,
      match: this.match,
      startAt: this.startAt,
      round: this.round,
      createdAt: this.createdAt,
    };
  }
  join(name, credentials = null, now = Date.now(), startSide = 0) {
    let member =
      credentials &&
      this.members.find(
        (m) => m.id === credentials.id && m.token === credentials.token,
      );
    if (!member) {
      if (credentials)
        throw new Error(
          "This saved seat is no longer available. Join as a new player.",
        );
      if (this.match && this.match.status !== "finished")
        throw new Error("This race has started. Join the next room.");
      if (this.members.filter((m) => !m.bot).length >= 4)
        throw new Error("This room has four players already.");
      // Bot seats are reclaimed when people join a finished race/lobby.
      this.members = this.members.filter((m) => !m.bot);
      member = {
        startSide: startSide === 1 ? 1 : 0,
        id: crypto.randomUUID(),
        token: crypto.randomUUID(),
        name:
          String(name || "Explorer")
            .trim()
            .slice(0, 20) || "Explorer",
        connected: true,
        disconnectedAt: null,
        bot: null,
      };
      this.members.push(member);
      this.hostId ||= member.id;
    }
    member.connected = true;
    member.disconnectedAt = null;
    this.electHost();
    const p = this.match?.players.find((p) => p.id === member.id);
    if (p) {
      p.connected = true;
      p.watching = false;
      setInput(p, { x: 0, y: 0 });
    }
    this.inputAt.set(member.id, now);
    this.lastSeq.delete(member.id);
    return { id: member.id, token: member.token };
  }
  disconnect(id, now = Date.now()) {
    const m = this.members.find((m) => m.id === id);
    if (!m) return;
    m.connected = false;
    m.disconnectedAt = now;
    const p = this.match?.players.find((p) => p.id === id);
    if (p) {
      p.connected = false;
      setInput(p, { x: 0, y: 0 });
    }
    this.electHost();
  }
  electHost() {
    const host = this.members.find((m) => m.id === this.hostId);
    if (!host?.connected)
      this.hostId =
        this.members.find((m) => m.connected && !m.bot)?.id || this.hostId;
  }
  leave(id) {
    this.disconnect(id);
    if (!this.match || this.match.status === "finished") {
      this.members = this.members.filter((m) => m.id !== id);
      if (this.hostId === id)
        this.hostId = this.members.find((m) => !m.bot)?.id || null;
    }
  }
  command(id, message, now = Date.now()) {
    const member = this.members.find(
      (m) => m.id === id && m.connected && !m.bot,
    );
    if (!member) throw new Error("Join the room before playing.");
    if (message.type === "entrance") {
      if (this.match && this.match.status !== "finished")
        throw new Error("Choose an entrance before the race starts.");
      member.startSide = message.startSide === 1 ? 1 : 0;
      return;
    }
    if (message.type === "start") {
      if (id !== this.hostId)
        throw new Error("Only the room host can start a race.");
      if (this.match && this.match.status !== "finished")
        throw new Error("A race is already in progress.");
      this.members = this.members.filter((m) => !m.bot && m.connected);
      const rawBots = Number(message.bots);
      const bots = Number.isFinite(rawBots)
        ? Math.max(0, Math.min(4 - this.members.length, Math.floor(rawBots)))
        : 0;
      for (let i = 0; i < bots; i++)
        this.members.push({
          startSide: (i + 1) % 2,
          id: "bot-" + i,
          name: ["Mango", "Clover", "Scout"][i],
          bot: i === 2 ? "racer" : "collector",
          connected: true,
        });
      this.match = createMatch(
        this.arena,
        this.members.map((m, i) =>
          createPlayer(this.arena, m.id, m.name, i, m.bot, m.startSide),
        ),
      );
      this.startAt = now + 3000;
      this.lastAt = this.startAt;
      this.round++;
      this.brains = {};
      for (const p of this.match.players)
        if (p.bot) this.brains[p.id] = createBot();
      return;
    }
    const p = this.match?.players.find((p) => p.id === id);
    if (!p || this.match.status !== "racing") return;
    if (message.type === "input") {
      if (
        !Number.isSafeInteger(message.seq) ||
        message.seq < 0 ||
        message.seq <= (this.lastSeq.get(id) ?? -1)
      )
        return;
      this.lastSeq.set(id, message.seq);
      this.inputAt.set(id, now);
      setInput(p, message);
    } else if (message.type === "watch") {
      p.watching = Boolean(message.watching);
      setInput(p, { x: 0, y: 0 });
    }
  }
  advance(now = Date.now()) {
    if (!this.match || this.match.status !== "racing" || now < this.startAt)
      return [];
    if (now <= (this.lastAt ?? this.startAt)) return [];
    // Match time belongs to the server's wall clock, including reconnects or stalls.
    // Bound catch-up physics so stale movement never teleports across a room.
    const elapsed = Math.min(this.match.duration, (now - this.startAt) / 1000);
    let pending = Math.min(0.2, Math.max(0, elapsed - this.match.elapsed));
    this.match.elapsed = Math.max(this.match.elapsed, elapsed - pending);
    const events = [];
    while (pending > 1e-6 && this.match.status === "racing") {
      const dt = Math.min(0.05, pending);
      for (const p of this.match.players) {
        if (p.bot) steerBot(this.arena, this.match, p, this.brains[p.id], dt);
        else if (now - (this.inputAt.get(p.id) || 0) > 400)
          setInput(p, { x: 0, y: 0 });
      }
      events.push(...stepMatch(this.arena, this.match, dt));
      pending -= dt;
    }
    this.lastAt = now;
    return events;
  }
  publicState(now = Date.now(), trails = false) {
    return {
      code: this.code,
      hostId: this.hostId,
      round: this.round,
      countdown: this.match ? Math.max(0, (this.startAt - now) / 1000) : 0,
      members: this.members.map(({ token, ...m }) => m),
      match: this.match ? snapshot(this.match, trails) : null,
    };
  }
}
