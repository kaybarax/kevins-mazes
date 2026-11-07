# The Big Cahuna Run

A competitive collecting race through Kevin’s Maze 24, for up to four humans and bots.

Published URL: https://the-big-cahuna-run.the-big-cahuna-run.workers.dev

## Development

```sh
npm install
npm run build
npm run dev:server # terminal 1: local Cloudflare runtime
npm run dev        # terminal 2: frontend with API proxy
npm test
npm run build
```

## Rules

- Everyone gets the same maze and their own collectibles.
- Collect each item once: Big Cahuna 25, carrot 10, orange 9, smile 8, star 7, thumbs-up 5.
- Escape before the shared deadline. Finishers rank by score, then finishing time. Non-finishers rank below finishers.
- Watching an opponent stops your character, not the shared race clock.
- The server owns movement, collection, timing, and results in online rooms.

## Delivery milestones

- [x] Shared collision map, movement, scoring, and verified arena data
- [x] Solo game, touch/keyboard controls, feedback, and bots
- [x] Authoritative online rooms, reconnects, synchronized starts
- [x] Desktop arena/focus layouts, mobile spectating, results/rematch
- [x] Browser QA, deployment, and live multiplayer verification

Artwork and game material: Kevin (kaybarax). See the repository LICENSE.

The game arena includes five approved doorways to make sealed collectible chambers reachable. The source artwork is unchanged. `scripts/build-arena.py` records the source hash and doorway coordinates in `src/arena.json`.

Online integration check (with the local server running): `node scripts/check-online.mjs`. Set `CAHUNA_URL` to check a deployment.

Deploy with `npm run deploy` after `npx wrangler login`. The Worker serves the built assets and SQLite-backed Durable Object rooms together. Rooms expire after 24 hours; invite codes are not accounts. Reconnect seats are stored per browser tab.

## Starting entrances

Choose Left or Right on the home screen for practice or when joining online. Each online player can change their own entrance in the lobby before the host starts. The choice is locked during a race and retained for reconnects and rematches. Bots use both entrances. Both original blue location pins remain fixed in the maze artwork throughout play.

## Camera and navigation

The maze stays fixed while your player moves. Hold the left mouse button and move the pointer to steer; release to stop. Right-drag, middle-drag, or Shift + left-drag pans without steering. The Play mode / Pan mode button lets a single-button mouse switch between steering and left-drag panning. Touch keeps tap-to-move, drag-to-pan, and the movement stick. Scroll, pinch, or use +/− to zoom. **Fit** (Space) shows the whole maze. **Locate** manually centers and zooms on the displayed racer without enabling camera tracking. Escape cancels click-to-move. Each racer’s view keeps its own camera position.

## Movement and collectibles

The in-race Speed control applies to keyboard, mouse, and touch movement: Gentle (15), Slow (30), Steady (45, default), Brisk (60), or Sprint (360 maze units per second, 6× Brisk). Your selection is saved in this browser. Online movement enforces the Sprint maximum; bots continue at their existing 60-unit pace. Collected icons remain visible in muted grayscale with a checkmark; they still score only once per player.

## Playing online

Choose **Create online room**, copy the invite link, and share it with up to three friends. The host can fill empty seats with bots or start with just the connected players. Tap a competitor to spectate; your movement pauses, but the race clock does not. On larger screens, Arena view shows all four runs. Progress indicates proximity to the nearest exit along a legal route, so it can decrease while collecting prizes.

If the connection drops, the game retries automatically. After refreshing the page, choose **Join room** with the prefilled code to recover your seat in the same tab. Leaving explicitly clears that saved seat. The host can start a rematch from the results screen. Bots use local pathfinding, with no external AI service or API key.

For a complete real-time protocol check, run `node scripts/check-full-race.mjs` against the local server or set `CAHUNA_URL` for a deployment. It drives one player through legal controls, competes against a server bot, verifies both finish with prizes, and verifies the rematch resets.

Cloudflare free-tier usage limits apply. This initial release has private invite rooms and no accounts, public matchmaking, or persistent leaderboard.

## Release verification

Deployed from commit `04c79c5` on 7 November 2026 (Europe/Berlin), Cloudflare version `1cd8b854-ff23-4e55-916a-23ee8e9b3e1e`. Ten automated tests and GitHub checks passed. Local browser checks covered two-player joining, synchronized starts, quadrants, spectating, and mobile stick controls at 390 × 844. The production browser recovered an active seat after refresh.

Both public-protocol checks passed against the deployed HTTPS URL: two humans plus two bots, host handover, secret validation, cross-origin rejection, and a complete race plus rematch. In the complete production test, the controlled player finished with 38 points in 25.4 seconds and the server bot with 75 points in 32.7 seconds.
