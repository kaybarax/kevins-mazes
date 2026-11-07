import {
  arenas,
  createGame,
  input,
  ability,
  steerBots,
  step,
  view,
  endGame,
} from "./game.js";
export class Room {
  constructor(code, saved = null) {
    this.code = code;
    this.members = saved?.members || [];
    this.hostId = saved?.hostId || null;
    this.game = saved?.game || null;
    this.round = saved?.round ?? -1;
    this.options = saved?.options || {
      arenaId: "1",
      difficulty: "standard",
      rotation: true,
    };
    this.votes = saved?.votes || {};
    this.startAt = saved?.startAt || 0;
    this.lastAt = null;
    this.brains = {};
    this.sequences = new Map();
    this.inputAt = new Map();
    for (const p of this.game?.players || []) input(p, 0, 0);
  }
  save() {
    return {
      members: this.members,
      hostId: this.hostId,
      game: this.game,
      round: this.round,
      options: this.options,
      votes: this.votes,
      startAt: this.startAt,
    };
  }
  electHost() {
    if (!this.members.some((m) => m.id === this.hostId && m.connected))
      this.hostId =
        this.members.find((m) => m.connected && !m.bot)?.id || this.hostId;
  }
  join(name, credentials = null, now = Date.now()) {
    let member =
      credentials &&
      this.members.find(
        (m) => m.id === credentials.id && m.token === credentials.token,
      );
    if (credentials && !member)
      throw Error("This saved seat has expired. Join a new room.");
    if (!member) {
      if (this.game)
        throw Error("This tournament has started. Create a new room to join.");
      if (this.members.length >= 4)
        throw Error("This room already has four players.");
      member = {
        id: crypto.randomUUID(),
        token: crypto.randomUUID(),
        name:
          String(name || "Explorer")
            .trim()
            .slice(0, 20) || "Explorer",
        connected: true,
        bot: false,
      };
      this.members.push(member);
      this.hostId ||= member.id;
    }
    member.connected = true;
    this.electHost();
    this.sequences.delete(member.id);
    this.inputAt.set(member.id, now);
    const p = this.game?.players.find((p) => p.id === member.id);
    if (p) {
      p.connected = true;
      input(p, 0, 0);
    }
    return { id: member.id, token: member.token };
  }
  disconnect(id) {
    const m = this.members.find((m) => m.id === id);
    if (m) m.connected = false;
    const p = this.game?.players.find((p) => p.id === id);
    if (p) {
      p.connected = false;
      input(p, 0, 0);
    }
    this.electHost();
  }
  leave(id) {
    this.disconnect(id);
    if (!this.game) this.members = this.members.filter((m) => m.id !== id);
    this.electHost();
  }
  command(id, message, now = Date.now()) {
    const m = this.members.find((m) => m.id === id && m.connected && !m.bot);
    if (!m) throw Error("Join first.");
    if (message.type === "vote") {
      if (this.game?.status === "playing") throw Error("Vote between rounds.");
      if (arenas.some((a) => a.id === message.arenaId))
        this.votes[id] = message.arenaId;
      return;
    }
    if (
      message.type === "start" ||
      message.type === "next" ||
      message.type === "rematch"
    ) {
      if (id !== this.hostId) throw Error("Only the host can start a round.");
      if (this.game?.status === "playing")
        throw Error("A round is already playing.");
      if (message.type === "start" && this.game)
        throw Error("Use next round or rematch.");
      if (message.type === "next" && (!this.game || this.round >= 3))
        throw Error("Tournament finished. Start a rematch.");
      if (message.type !== "next") {
        this.options = {
          arenaId: arenas.some((a) => a.id === message.arenaId)
            ? message.arenaId
            : "1",
          difficulty: ["relaxed", "standard", "expert"].includes(
            message.difficulty,
          )
            ? message.difficulty
            : "standard",
          rotation: message.rotation !== false,
        };
        this.members = this.members.filter((m) => !m.bot && m.connected);
        while (this.members.length < 4) {
          const i = this.members.length;
          this.members.push({
            id: "bot-" + i,
            name: ["Moss", "Luna", "Ember", "Scout"][i],
            bot: true,
            connected: true,
          });
        }
        this.round = -1;
      }
      const totals =
        message.type === "next"
          ? Object.fromEntries(this.game.players.map((p) => [p.id, p.total]))
          : {};
      this.round++;
      const votes = Object.values(this.votes),
        counts = {};
      for (const v of votes) counts[v] = (counts[v] || 0) + 1;
      const choice = Object.keys(counts).sort(
        (a, b) => counts[b] - counts[a] || Number(a) - Number(b),
      )[0];
      const arenaId =
        this.round === 0
          ? this.options.arenaId
          : choice ||
            (this.options.rotation
              ? String((Number(this.game.arenaId) % arenas.length) + 1)
              : this.options.arenaId);
      this.game = createGame(
        this.members,
        arenaId,
        this.round,
        this.options.difficulty,
        totals,
      );
      this.votes = {};
      this.startAt = now + 4000;
      this.lastAt = this.startAt;
      this.brains = {};
      this.sequences.clear();
      return;
    }
    const p = this.game?.players.find((p) => p.id === id);
    if (!p || this.game.status !== "playing") return;
    if (message.type === "input") {
      if (
        !Number.isSafeInteger(message.seq) ||
        message.seq < 0 ||
        message.seq <= (this.sequences.get(id) ?? -1)
      )
        return;
      this.sequences.set(id, message.seq);
      this.inputAt.set(id, now);
      input(p, message.x, message.y);
    } else if (message.type === "ability" && now >= this.startAt)
      ability(this.game, id, message.kind);
  }
  advance(now = Date.now()) {
    if (!this.game || this.game.status !== "playing" || now < this.startAt)
      return;
    const realElapsed = (now - this.startAt) / 1000;
    if (realElapsed >= this.game.duration) {
      this.game.elapsed = this.game.duration;
      endGame(this.game);
      return;
    }
    let dt = Math.min(0.2, Math.max(0, (now - (this.lastAt ?? now)) / 1000));
    this.lastAt = now;
    this.game.elapsed = Math.max(this.game.elapsed, realElapsed - dt);
    for (const p of this.game.players)
      if (!p.bot && now - (this.inputAt.get(p.id) || 0) > 400) input(p, 0, 0);
    while (dt > 0 && this.game.status === "playing") {
      const slice = Math.min(0.05, dt);
      steerBots(this.game, this.brains, slice);
      step(this.game, slice);
      dt -= slice;
    }
  }
  publicState(id, now = Date.now()) {
    return {
      code: this.code,
      hostId: this.hostId,
      members: this.members.map(({ token, ...m }) => m),
      options: this.options,
      votes: this.votes,
      round: this.round,
      countdown: Math.max(0, Math.ceil((this.startAt - now) / 1000)),
      game: this.game ? view(this.game, id) : null,
    };
  }
}
