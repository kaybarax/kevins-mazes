# The Big Cahuna Run

A competitive collecting race through Kevin’s Maze 24, for up to four humans and bots.

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
- [ ] Browser QA, deployment, and live multiplayer verification

Artwork and game material: Kevin (kaybarax). See the repository LICENSE.

The game arena includes five approved doorways to make sealed collectible chambers reachable. The source artwork is unchanged. `scripts/build-arena.py` records the source hash and doorway coordinates in `src/arena.json`.

Online integration check (with the local server running): `node scripts/check-online.mjs`. Set `CAHUNA_URL` to check a deployment.

Deploy with `npm run deploy` after `npx wrangler login`. The Worker serves the built assets and SQLite-backed Durable Object rooms together. Rooms expire after 24 hours; invite codes are not accounts. Reconnect seats are stored per browser tab.

## Playing online

Choose **Create online room**, copy the invite link, and share it with up to three friends. The host can fill empty seats with bots or start with just the connected players. Tap a competitor to spectate; your movement pauses, but the race clock does not. On larger screens, Arena view shows all four runs. Progress indicates proximity to the nearest exit along a legal route, so it can decrease while collecting prizes.

If the connection drops, the game retries automatically. After refreshing the page, choose **Join room** with the prefilled code to recover your seat in the same tab. Leaving explicitly clears that saved seat. The host can start a rematch from the results screen. Bots use local pathfinding, with no external AI service or API key.

For a complete real-time protocol check, run `node scripts/check-full-race.mjs` against the local server or set `CAHUNA_URL` for a deployment. It drives one player through legal controls, competes against a server bot, verifies both finish with prizes, and verifies the rematch resets.

Cloudflare free-tier usage limits apply. This initial release has private invite rooms and no accounts, public matchmaking, or persistent leaderboard.
