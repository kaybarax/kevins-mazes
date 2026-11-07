import "./style.css";
import {
  arenas,
  arenaFor,
  createGame,
  input,
  ability,
  step,
  steerBots,
  view,
  nearest,
  follow,
  speed,
} from "./game.js";
import { findPath } from "./pathfinding.js";
import { RoomClient, createRoom } from "./network.js";
import { draw, loadArt, zoom } from "./render.js";
const app = document.querySelector("#app"),
  keys = new Set();
const esc = (s) =>
  String(s).replace(
    /[&<>"']/g,
    (c) =>
      ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[
        c
      ],
  );
let reviewing = false;
let prefs = {};
try {
  prefs = JSON.parse(localStorage.getItem("chase-prefs")) || {};
} catch {}
let selected = prefs.arenaId || "4",
  difficulty = prefs.difficulty || "standard",
  rotation = true,
  game = null,
  raw = null,
  room = null,
  client = null,
  myId = "you",
  screen = "home",
  brains = {},
  countdown = 0,
  startAt = 0,
  last = performance.now(),
  accum = 0,
  sent = 0,
  round = -1,
  training = false,
  panMode = false,
  sound = false,
  route = { path: [] },
  stick = { x: 0, y: 0 },
  cameras = {},
  connection = "Offline practice",
  stateKey = "",
  lastEvent = "",
  lastCue = "",
  mouseHeld = false;
const brand =
  '<a class="brand" href="/" aria-label="Kevin’s Mazes home"><span>✳</span> KEVIN’S MAZES</a>';
const camera = (id) => (cameras[id] ||= { x: 1000, y: 685, zoom: 1 });
function toast(message) {
  const el = document.querySelector("#toast");
  el.textContent = message;
  el.classList.add("show");
  clearTimeout(toast.timer);
  toast.timer = setTimeout(() => el.classList.remove("show"), 4200);
}
function save() {
  prefs = {
    name: document.querySelector("#name")?.value || prefs.name || "Explorer",
    arenaId: selected,
    difficulty,
  };
  try {
    localStorage.setItem("chase-prefs", JSON.stringify(prefs));
  } catch {}
}
function tone(freq = 660) {
  if (!sound) return;
  try {
    const ac = (tone.ac ||= new AudioContext());
    ac.resume();
    const o = ac.createOscillator(),
      g = ac.createGain();
    o.connect(g);
    g.connect(ac.destination);
    o.frequency.value = freq;
    g.gain.setValueAtTime(0.04, ac.currentTime);
    g.gain.exponentialRampToValueAtTime(0.001, ac.currentTime + 0.15);
    o.start();
    o.stop(ac.currentTime + 0.15);
  } catch {}
}
const arenaCards = () =>
  arenas
    .map(
      (a) =>
        `<button class="arena-card ${a.id === selected ? "selected" : ""}" data-arena="${a.id}" aria-pressed="${a.id === selected}"><img src="/arena-${a.id}.svg" alt="Kevin’s Maze ${a.number}, ${a.name}"><span class="arena-meta"><b>${a.name}</b><small>MAZE ${String(a.number).padStart(2, "0")} · ${a.difficulty}</small></span><i style="background:${a.color}"></i></button>`,
    )
    .join("");
function home() {
  screen = "home";
  stateKey = "";
  game = raw = null;
  keys.clear();
  route.path = [];
  client?.leave();
  client = null;
  room = null;
  myId = "you";
  cameras = {};
  history.replaceState({}, "", location.pathname);
  app.innerHTML = `<div class="shell"><header>${brand}<div class="nav"><a href="https://the-big-cahuna-run.the-big-cahuna-run.workers.dev">Cahuna Run ↗</a><span class="tag">A NEW WAY TO GET LOST</span></div></header><main><section class="hero"><div class="hero-copy"><span class="eyebrow">ONE HUNTER. THREE RUNNERS. NO STRAIGHT ANSWERS.</span><h1>Outrun.<br>Outwit.<br><em>Escape.</em></h1><p class="intro">A game of close calls in Kevin’s hand-drawn mazes. Find two keys. Slip past the hunter. Make your exit.</p><form id="practice" class="setup"><label>Your name<input id="name" value="${esc(prefs.name || "Explorer")}" maxlength="20" required></label><label>Bot difficulty<select id="difficulty"><option value="relaxed">Relaxed</option><option value="standard">Standard</option><option value="expert">Expert</option></select></label><button class="primary">Play with bots <span>↗</span></button></form><div class="online"><button class="secondary" id="create">Create online room</button><form id="join"><input id="code" placeholder="Room code" aria-label="Room code" maxlength="8" required><button class="secondary">Join ↗</button></form></div><p class="fine">Free to play · 1–4 players · 3-minute rounds · No account needed</p></div><div class="hero-art"><div class="art-head"><span class="tag">MAZE CHASE / FIELD NOTES</span><span class="live-dot">● LIVE PURSUIT</span></div><canvas id="preview" aria-label="Preview of the selected maze arena"></canvas><div class="art-note"><span>◆</span><div><b>Keep them guessing.</b><small>A well-timed decoy changes everything.</small></div></div><div class="art-bottom"><b id="preview-name"></b><span>ORIGINAL WALLS. NEW ADVENTURE.</span></div></div></section><section class="arenas"><div class="section-title"><div><span class="eyebrow">FIVE PLACES TO DISAPPEAR</span><h2>Choose your hunting ground.</h2></div><span>Different routes. Different instincts.</span></div><div class="arena-grid">${arenaCards()}</div></section><section class="how"><article><span>01</span><h3>Pick up two keys.</h3><p>As a runner, collect any two keys and reach a green exit. Keys are personal—your teammates get their own.</p></article><article><span>02</span><h3>Trust your instincts.</h3><p>The hunter sees nearby movement, brief footprints and occasional sound clues. A pulse reveals runners for three seconds.</p></article><article><span>03</span><h3>Turn the tables.</h3><p>Roles rotate over four rounds. Sprint, leave a decoy, and vote for the next arena. Everyone gets a turn hunting.</p></article></section></main><footer><span>Drawn by Kevin Barasa. Made for a good chase.</span><a href="https://github.com/kaybarax/kevins-mazes">Source & attribution ↗</a></footer></div>`;
  document.querySelector("#difficulty").value = difficulty;
  document.querySelector("#difficulty").onchange = (e) => {
    difficulty = e.target.value;
    save();
  };
  document.querySelectorAll("[data-arena]").forEach(
    (b) =>
      (b.onclick = () => {
        selected = b.dataset.arena;
        save();
        document.querySelectorAll("[data-arena]").forEach((el) => {
          el.classList.toggle("selected", el.dataset.arena === selected);
          el.setAttribute(
            "aria-pressed",
            String(el.dataset.arena === selected),
          );
        });
        preview();
      }),
  );
  document.querySelector("#practice").onsubmit = (e) => {
    e.preventDefault();
    save();
    round = -1;
    nextLocal();
  };
  document.querySelector("#create").onclick = async () => {
    save();
    try {
      await join(await createRoom());
    } catch (e) {
      toast(e.message);
    }
  };
  document.querySelector("#join").onsubmit = (e) => {
    e.preventDefault();
    save();
    join(document.querySelector("#code").value.trim().toUpperCase());
  };
  preview();
}
function preview() {
  const a = arenaFor(selected);
  document.querySelector("#preview-name").textContent = a.name;
  const demo = createGame(
    [0, 1, 2, 3].map((i) => ({ id: String(i), name: "Runner" })),
    a.id,
  );
  draw(document.querySelector("#preview"), demo, "0", camera("preview"), {
    preview: true,
  });
}
function nextLocal() {
  const totals = raw
    ? Object.fromEntries(raw.players.map((p) => [p.id, p.total]))
    : {};
  round++;
  if (round > 3) {
    round = 0;
    for (const id of Object.keys(totals)) totals[id] = 0;
  }
  const members = [
    { id: "you", name: prefs.name || "Explorer" },
    ...["Moss", "Luna", "Ember"].map((name, i) => ({
      id: "bot-" + i,
      name,
      bot: true,
    })),
  ];
  raw = createGame(members, selected, round, difficulty, totals);
  game = view(raw, myId);
  brains = {};
  route.path = [];
  keys.clear();
  startAt = performance.now() + 4000;
  countdown = 4;
  cameras = {};
  stateKey = "";
  renderRace();
}
async function join(code) {
  if (!/^[A-HJ-NP-Z2-9]{8}$/.test(code)) {
    toast("Enter the eight-character invite code.");
    return;
  }
  client?.leave();
  screen = "connecting";
  app.innerHTML = `<div class="loading">${brand}<h1>Finding your crew…</h1><button id="back" class="secondary">Back home</button></div>`;
  document.querySelector("#back").onclick = home;
  client = new RoomClient(code, prefs.name || "Explorer", {
    status: (s) => {
      connection = s;
      const el = document.querySelector("#connection");
      if (el) el.textContent = s;
      if (s !== "Connected") stop();
    },
    error: toast,
    state: (state, events, id) => {
      const previousHost = room?.hostId;
      myId = id;
      room = state;
      game = state.game;
      countdown = state.countdown;
      if (!game) {
        lobby();
        return;
      }
      round = state.round;
      const key = round + ":" + game.status;
      if (stateKey !== key) {
        stateKey = key;
        route.path = [];
        cameras = {};
        renderRace();
      }
      if (
        previousHost &&
        previousHost !== room.hostId &&
        game.status === "finished" &&
        !reviewing
      )
        results();
      updateHud();
    },
  });
  client.connect();
  history.replaceState({}, "", "?room=" + code);
}
function lobby() {
  screen = "lobby";
  app.innerHTML = `<div class="shell"><header>${brand}<button class="ghost" id="leave">Leave room</button></header><main class="lobby"><span class="eyebrow">GATHER YOUR CREW</span><h1>The chase is<br><em>better together.</em></h1><div class="invite"><strong>${esc(client.code)}</strong><button class="secondary" id="copy">Copy invite</button></div><p id="connection" role="status">${esc(connection)}</p><div class="members">${room.members.map((m) => `<div><span class="avatar">${esc(m.name.slice(0, 1))}</span><b>${esc(m.name)}</b><small>${m.id === room.hostId ? "Host · " : ""}${m.connected ? "Ready" : "Reconnecting"}</small></div>`).join("")}</div><p>Empty seats become bots. Each player hunts once over four rounds.</p>${room.hostId === myId ? `<div class="lobby-options"><label>First arena<select id="arena-select">${arenas.map((a) => `<option value="${a.id}">${a.name} · ${a.difficulty}</option>`).join("")}</select></label><label>Bot difficulty<select id="difficulty"><option value="relaxed">Relaxed</option><option value="standard">Standard</option><option value="expert">Expert</option></select></label><label class="check"><input id="rotation" type="checkbox" checked> Rotate arenas between rounds</label><button class="primary" id="start">Start the chase ↗</button></div>` : '<p class="tag">Waiting for the host to start.</p>'}<p class="fine">Opponents outside your sight stay hidden. Online play uses a shared authoritative room.</p></main></div>`;
  document.querySelector("#leave").onclick = home;
  document.querySelector("#copy").onclick = () =>
    navigator.clipboard.writeText(location.href).then(
      () => toast("Invite link copied."),
      () => toast("Invite code: " + client.code),
    );
  if (room.hostId === myId) {
    document.querySelector("#arena-select").value = selected;
    document.querySelector("#difficulty").value = difficulty;
    document.querySelector("#start").onclick = () =>
      client.send({
        type: "start",
        arenaId: document.querySelector("#arena-select").value,
        difficulty: document.querySelector("#difficulty").value,
        rotation: document.querySelector("#rotation").checked,
      });
  }
}
function renderRace() {
  reviewing = false;
  screen = "race";
  const me = game.players.find((p) => p.id === myId),
    a = arenaFor(game.arenaId);
  stateKey = round + ":" + game.status;
  app.innerHTML = `<div class="play-shell"><header class="race-header">${brand}<div class="round-title"><span class="eyebrow">ROUND ${round + 1} / 4 · ${esc(a.name)}</span><b id="timer">3:00</b></div><div class="race-nav"><span id="connection">${client ? esc(connection) : "Bot practice"}</span>${!client ? `<button class="ghost" id="training">${training ? "Focus view" : "Training quadrants"}</button>` : ""}<button class="ghost" id="sound">Sound ${sound ? "on" : "off"}</button><button class="ghost" id="leave">Leave</button></div></header><div class="mission ${me.role}"><span class="role-badge">${me.role === "hunter" ? "◆ HUNTER" : "● RUNNER"}</span><b>${me.role === "hunter" ? "Catch all three runners. Follow footprints and sound clues." : "Find two keys, then reach either green exit."}</b><span id="status"></span></div><main class="race-grid"><div class="boards ${training && !client ? "split" : ""}">${(training && !client ? game.players : [me]).map((p) => `<section class="board"><div class="board-label">${esc(p.name)} <span>${p.role.toUpperCase()}</span></div><canvas data-view="${p.id}" tabindex="0" aria-label="${esc(p.name)} maze view"></canvas>${p.id === myId ? '<div class="camera-tools"><button data-tool="pan" aria-pressed="false">Play</button><button data-tool="out" aria-label="Zoom out">−</button><button data-tool="in" aria-label="Zoom in">+</button><button data-tool="fit">Fit</button><button data-tool="locate">Locate</button></div><div class="joystick" aria-label="Touch movement joystick"><i></i></div>' : ""}</section>`).join("")}</div><aside class="race-sidebar"><span class="eyebrow">THE CREW</span><div class="roster">${game.players.map((p) => `<div class="player-card ${p.id === myId ? "you" : ""}" style="--player:${p.color}"><div><i></i><b>${esc(p.name)}${p.id === myId ? " · you" : ""}</b><span>${p.role === "hunter" ? "◆" : "●"}</span></div><p data-player-status="${p.id}"></p><div class="progress"><i data-progress="${p.id}"></i></div><small data-points="${p.id}"></small></div>`).join("")}</div><div class="abilities"><button class="primary" id="sprint">Sprint <kbd>Q</kbd><small></small></button><button class="secondary" id="utility">${me.role === "hunter" ? "Reveal pulse" : "Leave decoy"} <kbd>E</kbd><small></small></button></div><p class="hint">${me.role === "hunter" ? "Pulse reveals runners for 3 seconds. Golden rings are approximate sound clues, not exact locations." : "You have three decoys per round. Leave one before turning a corner to throw off the hunter."}</p><label class="pace">Movement pace<select id="pace"><option value="1">Brisk</option><option value="0.8">Steady</option><option value="0.5">Careful</option></select></label></aside></main><div class="control-help"><span><kbd>WASD</kbd> / arrows to move · Click nearby to route · Right/Shift-drag to pan · Scroll or pinch to zoom</span><span>Original maze ${String(a.number).padStart(2, "0")} · ${a.difficulty} arena · ${game.difficulty} bots</span></div><div id="round-overlay"></div></div>`;
  document.querySelector("#leave").onclick = home;
  document.querySelector("#sound").onclick = (e) => {
    sound = !sound;
    e.target.textContent = "Sound " + (sound ? "on" : "off");
    tone();
  };
  document.querySelector("#training")?.addEventListener("click", () => {
    training = !training;
    renderRace();
  });
  document.querySelector("#sprint").onclick = () => use("sprint");
  document.querySelector("#utility").onclick = () => use("utility");
  document.querySelectorAll("canvas[data-view]").forEach(bindCanvas);
  bindStick();
  document.querySelectorAll("[data-tool]").forEach(
    (b) =>
      (b.onclick = () => {
        const c = camera(myId),
          canvas = document.querySelector(`canvas[data-view="${myId}"]`),
          r = canvas.getBoundingClientRect();
        if (b.dataset.tool === "pan") {
          panMode = !panMode;
          b.textContent = panMode ? "Pan" : "Play";
          b.setAttribute("aria-pressed", String(panMode));
        }
        if (b.dataset.tool === "fit")
          Object.assign(c, { x: 1000, y: 685, zoom: 1 });
        if (b.dataset.tool === "locate")
          Object.assign(c, { x: meNow().x, y: meNow().y, zoom: 3 });
        if (["in", "out"].includes(b.dataset.tool))
          zoom(c, b.dataset.tool === "in" ? 1.3 : 1 / 1.3, r.width, r.height);
      }),
  );
  updateHud();
}
const meNow = () => game?.players.find((p) => p.id === myId);
function use(kind) {
  if (countdown || game?.status !== "playing") return;
  if (client) client.send({ type: "ability", kind });
  else if (ability(raw, myId, kind)) tone(kind === "sprint" ? 880 : 440);
}
function updateHud() {
  if (screen !== "race" || !game) return;
  const me = meNow(),
    remaining = Math.max(0, Math.ceil(game.duration - game.elapsed));
  document.querySelector("#timer").textContent =
    `${Math.floor(remaining / 60)}:${String(remaining % 60).padStart(2, "0")}`;
  document.querySelector("#status").textContent =
    game.status === "finished"
      ? "Round complete."
      : me.state === "active"
        ? me.role === "runner"
          ? `${Math.min(2, me.keys.length)} / 2 keys`
          : game.elapsed < 7
            ? "Runners have a head start."
            : "The hunt is on."
        : me.state === "escaped"
          ? "You escaped!"
          : me.state === "caught"
            ? "Caught this round."
            : "Time’s up.";
  for (const p of game.players) {
    document.querySelector(`[data-player-status="${p.id}"]`).textContent =
      p.state === "active"
        ? p.role === "hunter"
          ? game.status === "finished"
            ? "Round complete"
            : "Hunting"
          : `${p.keys.length} keys · ${p.visible ? "in sight" : "out of sight"}`
        : p.state;
    document.querySelector(`[data-progress="${p.id}"]`).style.width =
      `${p.role === "hunter" ? (game.players.filter((q) => q.state === "caught").length / 3) * 100 : Math.min(100, (p.keys.length / 2) * 100)}%`;
    document.querySelector(`[data-points="${p.id}"]`).textContent =
      `${p.points} this round · ${p.total} tournament pts${!p.connected ? " · reconnecting" : ""}`;
  }
  for (const [id, ready] of [
    ["sprint", me.sprintReady],
    ["utility", me.utilityReady],
  ]) {
    const b = document.querySelector("#" + id),
      wait = Math.ceil(Math.max(0, ready - game.elapsed));
    b.disabled =
      !!countdown ||
      me.state !== "active" ||
      game.status !== "playing" ||
      wait > 0 ||
      (id === "utility" && me.role === "runner" && !me.decoysLeft);
    b.querySelector("small").textContent = wait
      ? `${wait}s`
      : id === "utility" && me.role === "runner"
        ? `${me.decoysLeft} left`
        : "Ready";
  }
  const overlay = document.querySelector("#round-overlay");
  if (countdown) {
    overlay.innerHTML = `<div class="countdown"><b>${countdown}</b><p>You are the ${me.role}. Get ready.</p></div>`;
  } else if (
    game.status === "finished" &&
    !reviewing &&
    !overlay.querySelector(".results")
  )
    results();
  else if (game.status === "playing") overlay.innerHTML = "";
  const cue = game.round + ":" + game.lastEcho;
  if (
    me.role === "hunter" &&
    game.status === "playing" &&
    game.echoes?.length &&
    cue !== lastCue
  ) {
    lastCue = cue;
    tone(300);
  }
  const event = game.events?.at(-1);
  if (event) {
    const signature = game.elapsed + event.type + event.id;
    if (signature !== lastEvent) {
      lastEvent = signature;
      if (event.id === myId) tone(event.type === "caught" ? 180 : 750);
    }
  }
}
function results() {
  reviewing = false;
  const final = round >= 3,
    sorted = [...game.players].sort((a, b) => b.total - a.total);
  document.querySelector("#round-overlay").innerHTML =
    `<div class="results-backdrop"><section class="results"><span class="eyebrow">${final ? "TOURNAMENT COMPLETE" : `ROUND ${round + 1} COMPLETE`}</span><h2>${final ? (sorted.filter((p) => p.total === sorted[0].total).length > 1 ? "A shared victory." : esc(sorted[0].name) + " takes the crown.") : game.winner === "hunter" ? "The hunter wins." : "A narrow escape."}</h2><p>${game.players.filter((p) => p.state === "escaped").length} escaped · ${game.players.filter((p) => p.state === "caught").length} caught · ${game.players.filter((p) => p.state === "trapped").length} ran out of time</p><div class="standings">${sorted.map((p, i) => `<div><b>${i + 1}. ${esc(p.name)}</b><span>${p.total} pts</span><small>${p.role} · ${p.state === "active" ? "finished" : p.state}</small></div>`).join("")}</div>${!final ? `<label>${client ? "Vote for the next arena" : "Next arena"}<select id="next-arena">${arenas.map((a) => `<option value="${a.id}">${a.name} · ${a.difficulty}</option>`).join("")}</select></label><p id="vote-note" class="fine">Roles rotate next round. Each player hunts once.</p>` : ""}<div class="result-actions">${!client || room.hostId === myId ? `<button class="primary" id="next">${final ? "Play another tournament" : "Next round ↗"}</button>` : "<p>Waiting for the host to continue…</p>"}<button class="secondary" id="review">Review maze</button><button class="ghost" id="home">Home</button></div></section></div>`;
  const next = document.querySelector("#next-arena");
  if (next) {
    next.value =
      room?.votes?.[myId] ||
      (client && !room.options.rotation
        ? game.arenaId
        : String((Number(game.arenaId) % 5) + 1));
    next.onchange = () => {
      if (client) {
        client.send({ type: "vote", arenaId: next.value });
        document.querySelector("#vote-note").textContent =
          "Vote cast. Most votes wins; ties use maze number.";
      }
    };
  }
  document.querySelector("#next")?.addEventListener("click", () => {
    if (client) {
      client.send({
        type: final ? "rematch" : "next",
        arenaId: selected,
        difficulty,
        rotation,
      });
    } else {
      selected = next?.value || selected;
      nextLocal();
    }
  });
  document.querySelector("#home").onclick = home;
  document.querySelector("#review").onclick = () => {
    reviewing = true;
    document.querySelector("#round-overlay").innerHTML =
      '<button class="review-return secondary" id="show-results">Return to results</button>';
    document.querySelector("#show-results").onclick = results;
  };
}
function stop() {
  keys.clear();
  stick = { x: 0, y: 0 };
  route.path = [];
  mouseHeld = false;
  client?.input(0, 0);
  if (raw) {
    const p = raw.players.find((p) => p.id === myId);
    if (p) input(p, 0, 0);
  }
}
function setRoute(canvas, e) {
  if (
    canvas.dataset.view !== myId ||
    countdown ||
    game.status !== "playing" ||
    meNow().state !== "active"
  )
    return;
  const r = canvas.getBoundingClientRect(),
    t = canvas.viewTransform;
  if (!t) return;
  const a = arenaFor(game.arenaId),
    point = nearest(
      a,
      (e.clientX - r.left - t.tx) / t.scale,
      (e.clientY - r.top - t.ty) / t.scale,
      40,
    );
  if (point) {
    const p = meNow();
    const path = findPath(a, [p.x, p.y], point);
    if (
      path.length * 2 > 700 ||
      path.some(([x, y]) => Math.hypot(x - p.x, y - p.y) > 300)
    ) {
      toast("Choose a nearby corridor within your sight.");
      return;
    }
    route.path = path;
  }
}
function bindCanvas(canvas) {
  const c = camera(canvas.dataset.view);
  let pointers = new Map(),
    drag = null,
    lastRoute = 0;
  canvas.oncontextmenu = (e) => e.preventDefault();
  canvas.onpointerdown = (e) => {
    if (![0, 1, 2].includes(e.button)) return;
    canvas.setPointerCapture(e.pointerId);
    pointers.set(e.pointerId, { x: e.clientX, y: e.clientY });
    drag = {
      x: e.clientX,
      y: e.clientY,
      moved: false,
      pan: e.button !== 0 || e.shiftKey || panMode,
      touch: e.pointerType === "touch",
    };
    if (!drag.pan && !drag.touch) {
      mouseHeld = true;
      setRoute(canvas, e);
    }
  };
  canvas.onpointermove = (e) => {
    if (!pointers.has(e.pointerId) || !drag) return;
    const before = [...pointers.values()];
    pointers.set(e.pointerId, { x: e.clientX, y: e.clientY });
    const after = [...pointers.values()],
      r = canvas.getBoundingClientRect();
    if (after.length === 2) {
      const d0 = Math.hypot(
          before[0].x - before[1].x,
          before[0].y - before[1].y,
        ),
        d1 = Math.hypot(after[0].x - after[1].x, after[0].y - after[1].y);
      if (d0 > 5)
        zoom(
          c,
          d1 / d0,
          r.width,
          r.height,
          (after[0].x + after[1].x) / 2 - r.left,
          (after[0].y + after[1].y) / 2 - r.top,
        );
      drag.moved = true;
      route.path = [];
      return;
    }
    const dx = e.clientX - drag.x,
      dy = e.clientY - drag.y;
    if (Math.hypot(dx, dy) > 3) {
      drag.moved = true;
      if (drag.pan || drag.touch) {
        route.path = [];
        const scale = canvas.viewTransform?.scale || 1;
        c.x = Math.max(100, Math.min(1900, c.x - dx / scale));
        c.y = Math.max(50, Math.min(1300, c.y - dy / scale));
      } else if (performance.now() - lastRoute > 200) {
        setRoute(canvas, e);
        lastRoute = performance.now();
      }
      drag.x = e.clientX;
      drag.y = e.clientY;
    }
  };
  canvas.onpointerup = (e) => {
    if (drag?.touch && !drag.moved && !drag.pan) setRoute(canvas, e);
    pointers.delete(e.pointerId);
    mouseHeld = false;
    if (!pointers.size) drag = null;
  };
  canvas.onpointercancel = () => {
    pointers.clear();
    drag = null;
    mouseHeld = false;
  };
  canvas.onwheel = (e) => {
    e.preventDefault();
    const r = canvas.getBoundingClientRect();
    zoom(
      c,
      Math.exp(-e.deltaY * 0.0015),
      r.width,
      r.height,
      e.clientX - r.left,
      e.clientY - r.top,
    );
  };
}
function bindStick() {
  const el = document.querySelector(".joystick");
  if (!el) return;
  const move = (e) => {
    const r = el.getBoundingClientRect(),
      dx = e.clientX - r.left - r.width / 2,
      dy = e.clientY - r.top - r.height / 2,
      d = Math.max(28, Math.hypot(dx, dy));
    stick = { x: dx / d, y: dy / d };
    route.path = [];
    el.firstElementChild.style.transform = `translate(${stick.x * 25}px,${stick.y * 25}px)`;
  };
  el.onpointerdown = (e) => {
    el.setPointerCapture(e.pointerId);
    move(e);
  };
  el.onpointermove = (e) => {
    if (e.buttons) move(e);
  };
  el.onpointerup = el.onpointercancel = () => {
    stick = { x: 0, y: 0 };
    el.firstElementChild.style.transform = "";
  };
}
function controls(dt) {
  const me = meNow();
  if (!me || me.state !== "active" || countdown) return { x: 0, y: 0 };
  const x =
      (keys.has("d") || keys.has("ArrowRight") ? 1 : 0) -
      (keys.has("a") || keys.has("ArrowLeft") ? 1 : 0) +
      stick.x,
    y =
      (keys.has("s") || keys.has("ArrowDown") ? 1 : 0) -
      (keys.has("w") || keys.has("ArrowUp") ? 1 : 0) +
      stick.y;
  const dummy = { ...me, input: { x: 0, y: 0 } };
  if (x || y) {
    route.path = [];
    input(dummy, x, y);
  } else if (route.path.length)
    follow(arenaFor(game.arenaId), dummy, route, dt, speed(game, me));
  const pace = Number(document.querySelector("#pace")?.value || 1);
  return { x: dummy.input.x * pace, y: dummy.input.y * pace };
}
function tick(now) {
  const delta = Math.min(0.1, (now - last) / 1000);
  last = now;
  if (screen === "race" && game) {
    if (!client && raw.status === "playing") {
      countdown = Math.max(0, Math.ceil((startAt - now) / 1000));
      if (!countdown) {
        accum += delta;
        while (accum >= 0.025) {
          const p = raw.players.find((p) => p.id === myId),
            i = controls(0.025);
          input(p, i.x, i.y);
          steerBots(raw, brains, 0.025);
          step(raw, 0.025);
          accum -= 0.025;
        }
      }
      game = view(raw, myId);
    } else if (client && now - sent > 80) {
      const i = controls(0.08);
      client.input(i.x, i.y);
      sent = now;
    }
    for (const canvas of document.querySelectorAll("canvas[data-view]")) {
      const id = canvas.dataset.view;
      draw(canvas, training && !client ? view(raw, id) : game, id, camera(id), {
        route: id === myId ? route.path : [],
      });
    }
    updateHud();
  }
  requestAnimationFrame(tick);
}
window.addEventListener("keydown", (e) => {
  if (["INPUT", "SELECT", "TEXTAREA"].includes(e.target.tagName)) return;
  if (screen !== "race") return;
  const key = e.key.length === 1 ? e.key.toLowerCase() : e.key;
  if (
    [
      "ArrowUp",
      "ArrowDown",
      "ArrowLeft",
      "ArrowRight",
      "w",
      "a",
      "s",
      "d",
      " ",
    ].includes(key)
  ) {
    e.preventDefault();
    keys.add(key);
  }
  if (!e.repeat && key === "q") use("sprint");
  if (!e.repeat && key === "e") use("utility");
  if (key === "Escape") stop();
  if (key === " ") Object.assign(camera(myId), { x: 1000, y: 685, zoom: 1 });
});
window.addEventListener("keyup", (e) =>
  keys.delete(e.key.length === 1 ? e.key.toLowerCase() : e.key),
);
window.addEventListener("blur", stop);
document.addEventListener("visibilitychange", () => {
  if (document.hidden) stop();
});
window.addEventListener("resize", () => {
  if (screen === "home") preview();
});
const initialCode = new URLSearchParams(location.search).get("room");
loadArt(arenas)
  .then(() => {
    home();
    if (initialCode) join(initialCode);
    requestAnimationFrame(tick);
  })
  .catch(() => {
    app.innerHTML =
      '<div class="loading"><h1>The maze is taking a moment.</h1><p>Please reload to retry loading the artwork.</p></div>';
  });
