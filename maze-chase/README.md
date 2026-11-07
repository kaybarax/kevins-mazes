# Maze Chase

A four-player pursuit game built from Kevin Barasa’s original mazes.

**Play:** https://kevins-maze-chase.the-big-cahuna-run.workers.dev

## Rules

- One hunter and three runners share the same maze. Empty seats become bots.
- Runners collect any **two of six personal keys**, then reach either green exit. A runner’s keys do not disappear for other runners.
- The hunter tags runners at close range; walls block captures. Runners are protected from capture for the first seven seconds.
- A round lasts three minutes, or ends when all runners have escaped or been caught. Any escape wins the round for the runners; otherwise the hunter wins.
- Four-round tournaments rotate the hunter role so each participant hunts once. Total points determine the winner; ties share the victory.
- Scoring: one point per distinct key, five extra for escaping; the hunter earns three per capture and two extra if nobody escapes.
- Between rounds, humans can vote for an arena. Most votes wins; tied votes use maze number. With no votes, rooms rotate arenas if enabled.

## Arenas

| Original | Environment | Route complexity | Original wall color |
| --- | --- | --- | --- |
| 01 | Fern Courtyard | Expert | Forest green |
| 02 | Violet Vault | Hard | Violet |
| 03 | Midnight Library | Gentle | Deep blue |
| 04 | Crimson Keep | Gentle | Red |
| 05 | Ember Ruins | Moderate | Rust brown |

Collision maps are derived from the exact SVG walls. Spawns, keys, and exits are placed in each maze’s largest connected interior region. Disconnected pockets are not playable; no walls in the source artwork were opened or modified. Difficulty labels use measured original route lengths. Bot difficulty is a separate Relaxed / Standard / Expert setting controlling speed and reaction time. Arena balance can continue to improve with human playtesting.

## Controls and abilities

- **WASD / arrows**: move. **Click or tap** a nearby corridor to follow a short legal route. Longer routes must be explored in stages.
- **Q / Sprint**: two-second burst; twelve-second cooldown.
- **E / special ability**: hunter pulse reveals runners for three seconds, with a twenty-five-second cooldown. Runners can leave three eight-second decoys per round, with an eighteen-second cooldown.
- **Right-drag / Shift-drag**: pan. Touch drag pans; touch tap routes. Play/Pan toggles left-button dragging.
- **Wheel / pinch / + / −**: zoom. **Space / Fit**: whole maze. **Locate**: manually center your character. The camera never automatically follows your movement.
- Touch joystick and on-screen ability buttons are available on phones. Careful / Steady / Brisk movement pace never exceeds the shared speed cap.
- Fog limits normal sight. Brief footprints and approximate golden sound rings provide clues. Sound is optional.
- Practice-only training quadrants show each bot’s perspective. Online opponents cannot be watched through fog; full positions appear only after the round ends.

## Multiplayer and privacy

Cloudflare Workers serves the Vite frontend. One SQLite-backed Durable Object per invite room owns the simulation, bots, timers, scores, and collision checks. Clients send control intentions over WebSockets, not positions. This follows the existing Cahuna deployment architecture; WebRTC is not required.

Each seat receives a separately filtered state: hidden opponents’ coordinates are omitted on the server. Reconnect uses a per-tab secret; secrets are never broadcast. Disconnect stops movement and transfers hosting. The wall-clock round deadline survives server restarts and browser suspension. Rooms expire after a day when idle. No accounts or analytics are required.

## Development

Requires Node.js 22+.

```sh
npm ci
npm test
npm run build
npm run dev:server  # localhost:8788
npm run dev -- --port 5174
node scripts/check-online.mjs
```

The tests check artwork provenance, reachability, legal movement, fog privacy, scoring, abilities, reconnects, authority, voting, and all twenty arena/hunter combinations. The online smoke test uses two real WebSocket clients and two server bots.

Regenerate collision data only when the source art intentionally changes:

```sh
# Python environment with numpy, scipy, opencv-python and resvg-py
python scripts/build-arenas.py
```

Deploy with `npm run deploy` after Wrangler authorization. Free-tier usage is subject to Cloudflare’s quotas; no paid services, custom domain, or third-party AI API is needed. Bots use local pathfinding and the same sight rules as players.

Original maze artwork and game source: © Kevin (kaybarax), under the repository’s [CC BY 4.0 license](../LICENSE). Keep attribution when reusing the work.
