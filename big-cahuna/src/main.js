import "./style.css";
import data from "./arena.json";
import { zoomCamera, panCamera } from "./camera.js";
import { RoomClient, createRoom } from "./network.js";
import {
  decodeArena,
  createPlayer,
  createMatch,
  stepMatch,
  setInput,
  ranking,
} from "./engine.js";
import { createBot, steerBot } from "./navigation.js";
import { loadArt, drawView, exitDistances, progress } from "./render.js";
const arena = decodeArena(data),
  app = document.querySelector("#app");
const esc = (s) =>
  String(s).replace(
    /[&<>"']/g,
    (c) =>
      ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[
        c
      ],
  );
const fmt = (t) =>
  `${Math.floor(Math.ceil(Math.max(0, t)) / 60)}:${String(Math.ceil(Math.max(0, t)) % 60).padStart(2, "0")}`;
let online = null,
  roomState = null,
  networkStatus = "",
  onlineRound = -1,
  resultRound = -1,
  sentAt = 0;
let art,
  distances,
  match = null,
  brains = {},
  screen = "home",
  myId = "you",
  watchId = "you",
  layout = "focus",
  sound = false,
  countdown = 0,
  last = 0,
  accum = 0,
  particles = [],
  keys = new Set(),
  stick = { x: 0, y: 0 },
  toastTimer,
  raf;
const saved = (() => {
  try {
    return JSON.parse(localStorage.getItem("cahuna-preferences") || "{}");
  } catch {
    return {};
  }
})();
let panMode = false;
let cameras = {},
  mouseTarget = null;
function cameraFor(id) {
  return (cameras[id] ||= { x: 1000, y: 650, zoom: 1 });
}
function resetCameras() {
  cameras = {};
  mouseTarget = null;
}
let pace = [0.25, 0.5, 0.75, 1, 6].includes(saved.pace) ? saved.pace : 0.75;
function pacedInput(x, y) {
  const length = Math.max(1, Math.hypot(x, y));
  return { x: (x / length) * pace, y: (y / length) * pace };
}
const brand =
  '<div class="brand"><span class="brand-mark">✳</span><span>KEVIN’S MAZES</span></div>';
const prizes = [
  ["0", "The Big Cahuna", 25],
  ["8", "Carrot", 10],
  ["1", "Orange", 9],
  ["13", "Smile", 8],
  ["18", "Star", 7],
  ["22", "Thumbs up", 5],
];
function toast(message) {
  document.querySelector(".toast")?.remove();
  const el = document.createElement("div");
  el.className = "toast";
  el.role = "status";
  el.textContent = message;
  document.body.append(el);
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => el.remove(), 3500);
}
function savePrefs(name, bots) {
  try {
    localStorage.setItem(
      "cahuna-preferences",
      JSON.stringify({ name, bots, sound, pace }),
    );
  } catch {}
}
function showHome() {
  online?.leave();
  online = null;
  roomState = null;
  onlineRound = -1;
  resultRound = -1;
  myId = "you";
  watchId = "you";
  document.querySelector(".overlay")?.remove();
  screen = "home";
  match = null;
  keys.clear();
  app.innerHTML = `<div class="shell"><header class="topbar">${brand}<span class="pill">HAND-DRAWN. READY TO RACE.</span></header><main><section class="hero"><div><div class="eyebrow tag">A little adventure. A big prize.</div><h1>The Big<br><span class="accent">Cahuna</span> Run.</h1><p class="intro">Take the scenic route. Grab the good stuff.<br>Find your way out before the clock does.</p><form class="setup" id="setup"><label>Your explorer name<input id="name" maxlength="20" value="${esc(saved.name || "Explorer")}" autocomplete="nickname" required></label><label>Your competition<select id="bots"><option value="3">3 bots · full arena</option><option value="1">1 bot · head to head</option><option value="0">Solo practice</option></select></label><button class="primary" type="submit">Practice run <span aria-hidden="true">↗</span></button></form><div class="online-setup"><button class="secondary" id="create-room">Create online room ↗</button><form id="join-room"><label>Invite code<input id="room-code" maxlength="8" placeholder="8-letter code" aria-label="Room code" value="${esc(new URLSearchParams(location.search).get("room") || "")}"></label><button class="secondary">Join room</button></form><p>Invite friends. Up to four explorers, with bots filling spare seats.</p></div><p class="status-note">8 minutes. 32 collectibles. Two ways out.<br>Highest score wins—if you make it to a flag in time.</p></div><div class="preview-card"><canvas id="preview" aria-label="Preview of Kevin’s Maze 24 and its collectibles"></canvas><div class="floating-note">Worth the detour.<span>THE BIG CAHUNA · 25 POINTS</span></div><div class="preview-caption"><span class="tag">Arena 24 / Royal blue</span><span>✦ Original maze by Kevin</span></div></div></section><section class="how"><article><span class="step-num">01</span><div><h3>Find your rhythm</h3><p>Hold the left mouse button to steer, or use WASD, arrows, or the touch stick. Right-drag to pan; scroll to zoom.</p></div></article><article><span class="step-num">02</span><div><h3>Make the detour count</h3><p>Collect your own prizes. Watch your rivals and choose when to head for the exit.</p></div></article><article><span class="step-num">03</span><div><h3>Get out. Get the glory.</h3><p>Reach either flag before time runs out. Points decide the winner; time breaks a tie.</p></div></article></section><section class="prize-strip" aria-label="Points guide">${prizes.map(([id, label, points]) => `<div class="prize"><img src="/item-${id}.svg" alt=""><div><strong>${label}</strong><small>${points} points</small></div></div>`).join("")}</section></main><footer><span>A maze worth getting lost in. © Kevin (kaybarax)</span><a href="https://github.com/kaybarax/kevins-mazes">Source & attribution ↗</a></footer></div>`;
  document.querySelector("#bots").value = saved.bots ?? "3";
  document.querySelector("#setup").onsubmit = (e) => {
    e.preventDefault();
    const name = document.querySelector("#name").value,
      bots = +document.querySelector("#bots").value;
    savePrefs(name, bots);
    startLocal(name, bots);
  };
  document.querySelector("#create-room").onclick = async (e) => {
    e.currentTarget.disabled = true;
    try {
      joinOnline(await createRoom());
    } catch (error) {
      toast(error.message);
      document.querySelector("#create-room").disabled = false;
    }
  };
  document.querySelector("#join-room").onsubmit = (e) => {
    e.preventDefault();
    const code = document
      .querySelector("#room-code")
      .value.trim()
      .toUpperCase();
    if (!/^[A-HJ-NP-Z2-9]{8}$/.test(code))
      return toast("Enter the eight-character invite code.");
    joinOnline(code);
  };
  if (art) drawView(document.querySelector("#preview"), arena, art, null);
}
function joinOnline(code) {
  const name = document.querySelector("#name").value.trim() || "Explorer";
  const roomUrl = new URL(location.href);
  roomUrl.searchParams.set("room", code);
  history.replaceState(null, "", roomUrl);
  savePrefs(name, document.querySelector("#bots").value);
  online = new RoomClient(code, name, {
    status(message) {
      networkStatus = message;
      if (screen === "lobby") buildLobby();
      document
        .querySelector("#connection")
        ?.replaceChildren(document.createTextNode(message));
      if (message !== "Connected") {
        keys.clear();
        stick = { x: 0, y: 0 };
      }
    },
    error: toast,
    state: receiveRoom,
  });
  screen = "lobby";
  buildLobby();
  online.connect();
}
function buildLobby() {
  screen = "lobby";
  const members = roomState?.members || [],
    host = roomState?.hostId === myId;
  app.innerHTML = `<div class="shell"><header class="topbar">${brand}<button class="ghost" id="lobby-leave">Back home</button></header><main class="lobby"><div class="tag">YOUR NEXT EXPEDITION</div><h1>Better with<br><span class="accent">company.</span></h1><p>Invite friends, then race for the best haul. Everyone gets their own prizes.</p><div class="invite"><strong>${esc(online.code)}</strong><button class="secondary" id="copy-invite">Copy invite link</button></div><p id="connection" role="status">${esc(networkStatus)}</p><div class="lobby-members">${members.map((m) => `<div><i class="dot" style="background:${m.bot ? "#b08a39" : "#27614c"}"></i> ${esc(m.name)} ${m.id === myId ? "· you" : ""} ${m.id === roomState.hostId ? "· host" : ""}<small>${m.connected ? (m.bot ? "Bot" : "Ready") : "Reconnecting"}</small></div>`).join("")}</div>${host ? `<label>Fill spare seats<select id="fill-bots"><option value="3">With bots · four racers</option><option value="0">Just us · no bots</option></select></label><button class="primary" id="start-online">Start the expedition ↗</button>` : "<p>Waiting for the host to start…</p>"}<p class="status-note">The clock keeps running while you watch rivals or reconnect.</p></main></div>`;
  document.querySelector("#lobby-leave").onclick = showHome;
  document.querySelector("#copy-invite").onclick = async () => {
    const url = new URL(location.href);
    url.search = "";
    url.searchParams.set("room", online.code);
    try {
      await navigator.clipboard.writeText(url.href);
      toast("Invite link copied.");
    } catch {
      toast("Share room code " + online.code);
    }
  };
  const start = document.querySelector("#start-online");
  if (start)
    start.onclick = () =>
      online.send({
        type: "start",
        bots: +document.querySelector("#fill-bots").value,
      });
}
function receiveRoom(state, events, id) {
  if (!online) return;
  myId = id;
  roomState = state;
  const rematchButton = document.querySelector("#rematch");
  if (rematchButton) {
    rematchButton.disabled = state.hostId !== myId;
    rematchButton.textContent =
      state.hostId === myId ? "Run it back ↗" : "Waiting for host";
  }
  if (!state.match || !state.match.players.some((p) => p.id === id)) {
    buildLobby();
    return;
  }
  const fresh = onlineRound !== state.round || screen !== "race";
  const previous = match;
  match = state.match;
  for (const p of match.players) {
    p.input = { x: 0, y: 0 };
    if (!p.trail) {
      p.trail = fresh
        ? []
        : previous?.players.find((old) => old.id === p.id)?.trail || [];
      const tail = p.trail.at(-1);
      if (!tail || Math.hypot(p.x - tail[0], p.y - tail[1]) > 3)
        p.trail.push([p.x, p.y]);
      if (p.trail.length > 2500) p.trail.shift();
    }
  }
  countdown = state.countdown;
  if (!countdown)
    document.querySelectorAll(".countdown").forEach((el) => el.remove());
  if (fresh) {
    document.querySelector(".overlay")?.remove();
    if (onlineRound !== state.round) resetCameras();
    onlineRound = state.round;
    watchId = myId;
    particles = [];
    keys.clear();
    stick = { x: 0, y: 0 };
    screen = "race";
    buildRace();
  }
  for (const e of events) {
    if (e.type === "pickup") {
      particles.push({ ...e, at: performance.now() / 1000 });
      if (e.playerId === myId) beep(500 + e.value * 15);
    }
    if (e.type === "finish")
      toast(
        match.players.find((p) => p.id === e.playerId).name +
          " escaped with " +
          e.score +
          " points!",
      );
  }
  if (match.status === "finished" && resultRound !== state.round) {
    resultRound = state.round;
    results();
  }
}
function startLocal(name, bots) {
  myId = "you";
  const players = [createPlayer(arena, myId, name, 0)];
  brains = {};
  for (let i = 0; i < bots; i++) {
    const id = "bot" + i;
    players.push(
      createPlayer(
        arena,
        id,
        ["Mango", "Clover", "Scout"][i],
        i + 1,
        i === 2 ? "racer" : "collector",
      ),
    );
    brains[id] = createBot();
  }
  resetCameras();
  match = createMatch(arena, players);
  watchId = myId;
  layout = "focus";
  particles = [];
  countdown = 3;
  accum = 0;
  screen = "race";
  buildRace();
}
function buildRace() {
  mouseTarget = null;
  keys.clear();
  stick = { x: 0, y: 0 };
  online?.input(0, 0);
  const me = match.players.find((p) => p.id === myId),
    watch = match.players.find((p) => p.id === watchId) || me;
  const quad = layout === "arena" && innerWidth > 700;
  app.innerHTML = `<div class="play-shell"><header class="racebar"><div class="race-heading">${brand}<div><small>TIME TO ESCAPE</small><span class="timer" id="timer">${fmt(match.duration - match.elapsed)}</span></div></div><div class="race-actions">${online ? `<small id="connection" role="status">${esc(networkStatus)}</small>` : ""}<button class="ghost arena-toggle" id="layout">${quad ? "Focus view" : "Arena view"}</button><label class="pace-control">Speed<select id="pace" aria-label="Movement speed"><option value="0.25">Gentle</option><option value="0.5">Slow</option><option value="0.75">Steady</option><option value="1">Brisk</option><option value="6">Sprint · 6×</option></select></label><button class="ghost" id="sound">Sound ${sound ? "on" : "off"}</button><button class="ghost" id="leave">Leave</button></div></header><main class="race-layout ${quad ? "quadrants" : ""}">${quad ? match.players.map((p) => viewMarkup(p, p.id === watchId)).join("") : viewMarkup(watch, true) + `<aside class="sidebar" aria-label="Competitors">${match.players.map((p) => `<button class="competitor ${p.id === watchId ? "selected" : ""}" data-watch="${p.id}" aria-label="${p.id === myId ? "Return to your race" : "Watch " + esc(p.name)}"><div class="row"><span class="name"><i class="dot" style="background:${p.color}"></i> ${esc(p.name)}${p.id === myId ? " · you" : ""}</span><span class="score" data-score="${p.id}">0</span></div><div class="row"><small>${p.bot ? (p.bot === "racer" ? "Cautious racer" : "Collector bot") : p.id === myId ? "You" : "Live rival"}</small><small data-progress="${p.id}">0% to exit</small></div><div class="bar"><i data-bar="${p.id}" style="width:0%"></i></div><canvas data-mini="${p.id}" aria-hidden="true"></canvas></button>`).join("")}</aside>`}</main><div class="race-help"><span><span class="keys"><kbd>W A S D</kbd><kbd>↑ ↓ ← →</kbd></span> Move · Hold left mouse to steer · Right-drag / Shift-drag to pan · Scroll to zoom · <b>Space</b> fit</span><span id="race-hint">Your prizes are yours alone. Watching stops your character, not the clock.</span></div></div>`;
  document.querySelector("#layout").onclick = () => {
    layout = quad ? "focus" : "arena";
    buildRace();
  };
  document.querySelector("#pace").value = String(pace);
  document.querySelector("#pace").onchange = (e) => {
    pace = Number(e.target.value);
    savePrefs(me.name, saved.bots ?? "3");
  };
  document.querySelector("#sound").onclick = () => {
    sound = !sound;
    document.querySelector("#sound").textContent =
      "Sound " + (sound ? "on" : "off");
    if (sound) beep(440);
  };
  document.querySelector("#leave").onclick = () => {
    if (confirm("Leave this run? Your current progress will be lost."))
      showHome();
  };
  document
    .querySelectorAll("[data-watch]")
    .forEach((el) => (el.onclick = () => watchPlayer(el.dataset.watch)));
  document.querySelectorAll("[data-camera]").forEach(
    (el) =>
      (el.onclick = () => {
        const canvas = el.closest(".view").querySelector("canvas");
        const id = canvas.dataset.player,
          camera = cameraFor(id),
          r = canvas.getBoundingClientRect();
        if (el.dataset.camera === "fit")
          Object.assign(camera, { x: 1000, y: 650, zoom: 1 });
        else if (el.dataset.camera === "locate") {
          const p = match.players.find((p) => p.id === id);
          Object.assign(camera, {
            x: p.x,
            y: p.y,
            zoom: Math.max(3, camera.zoom),
          });
        } else
          zoomCamera(
            camera,
            el.dataset.camera === "in" ? 1.3 : 1 / 1.3,
            r.width,
            r.height,
          );
      }),
  );
  document.querySelectorAll("[data-pan]").forEach(
    (el) =>
      (el.onclick = () => {
        panMode = !panMode;
        mouseTarget = null;
        el.textContent = panMode ? "Pan mode" : "Play mode";
        el.setAttribute("aria-pressed", String(panMode));
        document
          .querySelectorAll("canvas[data-player]")
          .forEach((c) => (c.style.cursor = panMode ? "grab" : "crosshair"));
      }),
  );
  for (const canvas of document.querySelectorAll("canvas[data-player]"))
    bindCanvas(canvas);
  for (const s of document.querySelectorAll(".stick")) bindStick(s);
  updateHud();
}
function viewMarkup(p, active) {
  return `<section class="view"><div class="view-label"><i class="dot" style="background:${p.color}"></i> ${esc(p.name)} ${p.id === myId ? "· YOU" : p.bot ? "· BOT" : "· LIVE"} <span data-score="${p.id}">${p.score}</span> pts</div><canvas data-player="${p.id}" aria-label="${esc(p.name)}’s live maze" tabindex="0"></canvas><div class="view-tools">${p.id === myId ? `<button class="ghost" data-pan aria-pressed="${panMode}">${panMode ? "Pan mode" : "Play mode"}</button>` : ""}<button class="ghost" data-camera="out" aria-label="Zoom out">−</button><button class="ghost" data-camera="in" aria-label="Zoom in">+</button><button class="ghost" data-camera="fit">Fit</button><button class="ghost" data-camera="locate">Locate</button>${p.id !== myId ? `<button class="ghost" data-watch="${watchId === p.id ? myId : p.id}">${watchId === p.id ? "Return" : "Watch"}</button>` : ""}</div>${active && p.id === myId ? '<div class="stick" aria-label="Touch movement joystick"><i></i></div>' : ""}${active && p.id !== myId ? '<div class="watch-banner">Watching live · Your character is standing still</div>' : ""}${countdown > 0 && active ? '<div class="countdown"><b id="count">3</b><p>Find the prizes. Find your way out.</p></div>' : ""}</section>`;
}
function watchPlayer(id) {
  watchId = id;
  keys.clear();
  stick = { x: 0, y: 0 };
  const me = match.players.find((p) => p.id === myId);
  me.watching = id !== myId;
  online?.send({ type: "watch", watching: me.watching });
  setInput(me, { x: 0, y: 0 });
  buildRace();
}
function bindCanvas(canvas) {
  const pointers = new Map();
  let gesture = null,
    dragged = false;
  let steering = null;
  const camera = cameraFor(canvas.dataset.player);
  const position = (e) => {
    const r = canvas.getBoundingClientRect();
    return { x: e.clientX - r.left, y: e.clientY - r.top };
  };
  const steer = (e) => {
    const point = position(e),
      t = canvas.viewTransform;
    if (t)
      mouseTarget = {
        x: (point.x - t.tx) / t.scale,
        y: (point.y - t.ty) / t.scale,
        lastX: null,
        lastY: null,
        stuck: 0,
        held: true,
      };
  };
  canvas.style.cursor = panMode ? "grab" : "crosshair";
  canvas.style.touchAction = "none";
  canvas.oncontextmenu = (e) => e.preventDefault();
  canvas.onpointerdown = (e) => {
    if (![0, 1, 2].includes(e.button)) return;
    if (
      e.pointerType !== "touch" &&
      e.button === 0 &&
      !e.shiftKey &&
      !panMode &&
      canvas.dataset.player === myId &&
      watchId === myId
    ) {
      e.preventDefault();
      steering = e.pointerId;
      canvas.setPointerCapture(e.pointerId);
      steer(e);
      return;
    }
    mouseTarget = null;
    canvas.setPointerCapture(e.pointerId);
    pointers.set(e.pointerId, position(e));
    dragged = false;
    gesture = {
      ...position(e),
      startX: e.clientX,
      startY: e.clientY,
      distance: 0,
    };
  };
  canvas.onpointermove = (e) => {
    if (steering === e.pointerId) {
      if (!(e.buttons & 1)) {
        steering = null;
        mouseTarget = null;
        return;
      }
      steer(e);
      return;
    }
    if (!pointers.has(e.pointerId)) return;
    const old = [...pointers.values()],
      before =
        old.length === 2
          ? Math.hypot(old[0].x - old[1].x, old[0].y - old[1].y)
          : 0;
    const prev = pointers.get(e.pointerId),
      next = position(e);
    pointers.set(e.pointerId, next);
    const r = canvas.getBoundingClientRect(),
      t = canvas.viewTransform;
    if (pointers.size === 2) {
      const pair = [...pointers.values()],
        distance = Math.hypot(pair[0].x - pair[1].x, pair[0].y - pair[1].y);
      if (before > 0)
        zoomCamera(
          camera,
          distance / before,
          r.width,
          r.height,
          (pair[0].x + pair[1].x) / 2,
          (pair[0].y + pair[1].y) / 2,
        );
      dragged = true;
    } else if (
      t &&
      (dragged ||
        Math.hypot(e.clientX - gesture.startX, e.clientY - gesture.startY) > 5)
    ) {
      dragged = true;
      panCamera(camera, next.x - prev.x, next.y - prev.y, t.scale);
    }
  };
  canvas.onpointerup = (e) => {
    if (steering === e.pointerId) {
      steering = null;
      mouseTarget = null;
      online?.input(0, 0);
      return;
    }
    if (
      e.pointerType === "touch" &&
      !dragged &&
      pointers.size === 1 &&
      canvas.dataset.player === myId &&
      watchId === myId &&
      match.status === "racing"
    ) {
      const point = position(e),
        t = canvas.viewTransform;
      if (t)
        mouseTarget = {
          x: (point.x - t.tx) / t.scale,
          y: (point.y - t.ty) / t.scale,
          lastX: null,
          lastY: null,
          stuck: 0,
        };
    }
    pointers.delete(e.pointerId);
    if (pointers.size) dragged = true;
  };
  canvas.onlostpointercapture = () => {
    if (steering !== null) {
      steering = null;
      mouseTarget = null;
    }
  };
  canvas.onpointercancel = (e) => {
    steering = null;
    pointers.delete(e.pointerId);
    dragged = true;
    mouseTarget = null;
  };
  canvas.onwheel = (e) => {
    e.preventDefault();
    const r = canvas.getBoundingClientRect(),
      p = position(e);
    zoomCamera(
      camera,
      Math.exp(-e.deltaY * 0.002),
      r.width,
      r.height,
      p.x,
      p.y,
    );
  };
}
function movementInput(x, y, dt) {
  if (x || y || stick.x || stick.y) {
    mouseTarget = null;
    return pacedInput(x || y ? x : stick.x, x || y ? y : stick.y);
  }
  if (!mouseTarget || watchId !== myId) return { x: 0, y: 0 };
  const p = match.players.find((p) => p.id === myId),
    target = mouseTarget;
  const dx = target.x - p.x,
    dy = target.y - p.y,
    d = Math.hypot(dx, dy);
  target.stuck =
    target.lastX !== null &&
    Math.hypot(p.x - target.lastX, p.y - target.lastY) < 0.01
      ? target.stuck + dt
      : 0;
  target.lastX = p.x;
  target.lastY = p.y;
  if (d < 2 || (!target.held && target.stuck > 0.5)) {
    if (!target.held) mouseTarget = null;
    return { x: 0, y: 0 };
  }
  const input = pacedInput(dx / d, dy / d),
    factor = Math.min(1, d / (60 * pace * dt));
  return { x: input.x * factor, y: input.y * factor };
}
function bindStick(el) {
  const knob = el.querySelector("i");
  let active = false;
  const move = (e) => {
    const r = el.getBoundingClientRect(),
      x = e.clientX - r.left - r.width / 2,
      y = e.clientY - r.top - r.height / 2,
      d = Math.max(1, Math.hypot(x, y)),
      m = Math.min(35, d);
    knob.style.transform = `translate(${(x / d) * m}px,${(y / d) * m}px)`;
    stick = {
      x: (x / d) * Math.min(1, d / 20),
      y: (y / d) * Math.min(1, d / 20),
    };
  };
  el.onpointerdown = (e) => {
    active = true;
    el.setPointerCapture(e.pointerId);
    move(e);
  };
  el.onpointermove = (e) => {
    if (active) move(e);
  };
  el.onpointerup = el.onpointercancel = () => {
    active = false;
    stick = { x: 0, y: 0 };
    knob.style.transform = "";
  };
}
let audio;
function beep(freq) {
  if (!sound) return;
  try {
    audio ??= new AudioContext();
    audio.resume();
    const o = audio.createOscillator(),
      g = audio.createGain();
    o.connect(g);
    g.connect(audio.destination);
    o.frequency.setValueAtTime(freq, audio.currentTime);
    o.frequency.exponentialRampToValueAtTime(
      freq * 1.5,
      audio.currentTime + 0.12,
    );
    g.gain.setValueAtTime(0.06, audio.currentTime);
    g.gain.exponentialRampToValueAtTime(0.001, audio.currentTime + 0.2);
    o.start();
    o.stop(audio.currentTime + 0.2);
  } catch {}
}
function updateHud() {
  if (!match) return;
  const timer = document.querySelector("#timer");
  if (timer) {
    timer.textContent = fmt(match.duration - match.elapsed);
    timer.classList.toggle("urgent", match.duration - match.elapsed < 60);
  }
  for (const p of match.players) {
    document
      .querySelectorAll(`[data-score="${p.id}"]`)
      .forEach((el) => (el.textContent = p.score));
    const percent = progress(arena, distances, p);
    document
      .querySelectorAll(`[data-progress="${p.id}"]`)
      .forEach(
        (el) =>
          (el.textContent = !p.connected
            ? "Offline"
            : p.finishedAt !== null
              ? "Escaped!"
              : `${percent}% to exit`),
      );
    document
      .querySelectorAll(`[data-bar="${p.id}"]`)
      .forEach((el) => (el.style.width = percent + "%"));
  }
}
function results() {
  const order = ranking(match),
    me = order.find((p) => p.id === myId);
  let best = 0;
  try {
    best = +(localStorage.getItem("cahuna-best") || 0);
    if (me.finishedAt !== null && me.score > best)
      localStorage.setItem("cahuna-best", String(me.score));
  } catch {}
  const el = document.createElement("div");
  el.className = "overlay";
  el.innerHTML = `<section class="result-card" role="dialog" aria-modal="true" aria-labelledby="result-title"><div class="tag muted">EXPEDITION COMPLETE</div><h2 id="result-title">${order[0].finishedAt !== null ? esc(order[0].name) + " takes the glory." : "Lost, but not forgotten."}</h2><p class="muted">${me.finishedAt !== null ? "You escaped with " + me.score + " points." : "Time ran out before your escape. Your next run awaits."}${me.finishedAt !== null && me.score > best ? " A new personal best!" : ""}</p><table class="results"><thead><tr><th>Place</th><th>Explorer</th><th>Points</th><th>Escape</th></tr></thead><tbody>${order.map((p, i) => `<tr><td>${i + 1}</td><td><i class="dot" style="background:${p.color}"></i> ${esc(p.name)}</td><td>${p.score}</td><td>${p.finishedAt === null ? "Did not finish" : fmt(p.finishedAt)}</td></tr>`).join("")}</tbody></table><p class="muted" style="font-size:12px">Finishers rank first. Highest score wins; fastest escape breaks a tie.</p><div class="result-actions"><button class="primary" id="rematch">Run it back ↗</button><button class="secondary" id="review">Explore the routes</button><button class="secondary" id="home">Back home</button></div></section>`;
  document.body.append(el);
  el.querySelector("#rematch").onclick = () => {
    const name = me.name,
      bots = match.players.length - 1;
    el.remove();
    if (online) {
      if (roomState.hostId === myId)
        online.send({
          type: "start",
          bots: match.players.filter((p) => p.bot).length,
        });
      else toast("The host starts the next expedition.");
    } else startLocal(name, bots);
  };
  if (online && roomState.hostId !== myId) {
    el.querySelector("#rematch").disabled = true;
    el.querySelector("#rematch").textContent = "Waiting for host";
  }
  el.querySelector("#home").onclick = () => {
    el.remove();
    showHome();
  };
  el.querySelector("#review").onclick = () => {
    el.remove();
    resetCameras();
    buildRace();
    toast("Select a competitor to inspect their route. Leave returns home.");
  };
  el.querySelector("#rematch").focus();
}
function tick(now) {
  const delta = Math.min(0.1, (now - last) / 1000 || 0);
  last = now;
  if (screen === "race" && match) {
    if (countdown > 0) {
      countdown = Math.max(0, countdown - delta);
      const c = document.querySelector("#count");
      if (c) c.textContent = Math.ceil(countdown);
      if (!countdown) {
        document.querySelectorAll(".countdown").forEach((e) => e.remove());
        beep(600);
      }
    } else if (online && match.status === "racing") {
      if (now - sentAt >= 80) {
        const x =
          (keys.has("ArrowRight") || keys.has("d") ? 1 : 0) -
          (keys.has("ArrowLeft") || keys.has("a") ? 1 : 0);
        const y =
          (keys.has("ArrowDown") || keys.has("s") ? 1 : 0) -
          (keys.has("ArrowUp") || keys.has("w") ? 1 : 0);
        const input = movementInput(x, y, 0.08);
        online.input(
          watchId === myId ? input.x : 0,
          watchId === myId ? input.y : 0,
        );
        sentAt = now;
      }
    } else if (match.status === "racing") {
      accum += delta;
      while (accum >= 0.025) {
        const me = match.players.find((p) => p.id === myId);
        let x =
            (keys.has("ArrowRight") || keys.has("d") ? 1 : 0) -
            (keys.has("ArrowLeft") || keys.has("a") ? 1 : 0),
          y =
            (keys.has("ArrowDown") || keys.has("s") ? 1 : 0) -
            (keys.has("ArrowUp") || keys.has("w") ? 1 : 0);
        setInput(me, movementInput(x, y, 0.025));
        for (const p of match.players)
          if (p.bot) steerBot(arena, match, p, brains[p.id], 0.025);
        const events = stepMatch(arena, match, 0.025);
        for (const e of events) {
          if (e.type === "pickup") {
            particles.push({ ...e, at: now / 1000 });
            if (e.playerId === myId) beep(500 + e.value * 15);
          }
          if (e.type === "finish") {
            toast(
              match.players.find((p) => p.id === e.playerId).name +
                " escaped with " +
                e.score +
                " points!",
            );
            if (e.playerId === myId) beep(900);
          }
          if (e.type === "end") results();
        }
        accum -= 0.025;
        if (match.status !== "racing") {
          accum = 0;
          break;
        }
      }
    }
    updateHud();
    particles = particles.filter((p) => now / 1000 - p.at < 1.2);
    for (const c of document.querySelectorAll("canvas[data-player]")) {
      const p = match.players.find((p) => p.id === c.dataset.player);
      c.viewTransform = drawView(c, arena, art, p, {
        camera: cameraFor(p.id),
        particles: particles.filter((e) => e.playerId === p.id),
        time: now / 1000,
      });
    }
    for (const c of document.querySelectorAll("canvas[data-mini]")) {
      const p = match.players.find((p) => p.id === c.dataset.mini);
      drawView(c, arena, art, p, { time: now / 1000 });
    }
  }
  raf = requestAnimationFrame(tick);
}
window.addEventListener("keydown", (e) => {
  if (screen !== "race" || e.target.matches("input,select")) return;
  if (e.key === "Escape") mouseTarget = null;
  if (
    [
      "ArrowUp",
      "ArrowDown",
      "ArrowLeft",
      "ArrowRight",
      " ",
      "w",
      "a",
      "s",
      "d",
    ].includes(e.key)
  ) {
    e.preventDefault();
    keys.add(e.key);
    if (e.key === " " && !e.repeat) {
      Object.assign(cameraFor(watchId), { x: 1000, y: 650, zoom: 1 });
    }
  }
});
window.addEventListener("keyup", (e) => keys.delete(e.key));
window.addEventListener("blur", () => {
  mouseTarget = null;
  keys.clear();
  stick = { x: 0, y: 0 };
  online?.input(0, 0);
});
let wasMobile = innerWidth <= 700;
window.addEventListener("resize", () => {
  if (screen === "race" && wasMobile !== innerWidth <= 700) {
    wasMobile = innerWidth <= 700;
    keys.clear();
    stick = { x: 0, y: 0 };
    buildRace();
  }
  if (screen === "home" && art)
    drawView(document.querySelector("#preview"), arena, art, null);
});
app.innerHTML =
  '<div class="shell"><header class="topbar">' +
  brand +
  "</header><p>Preparing your expedition…</p></div>";
try {
  art = await loadArt(arena);
  distances = exitDistances(arena);
  showHome();
  raf = requestAnimationFrame(tick);
} catch (error) {
  app.innerHTML =
    '<div class="shell"><h1>The trail is taking a moment.</h1><p>Please reload to retry loading the maze.</p></div>';
  console.error(error);
}
