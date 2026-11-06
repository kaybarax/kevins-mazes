# The Big Cahuna Run

A competitive collecting race through Kevin’s Maze 24, for up to four humans and bots.

## Development

```sh
npm install
npm run dev
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
- [ ] Solo game, touch/keyboard controls, feedback, and bots
- [ ] Authoritative online rooms, reconnects, synchronized starts
- [ ] Desktop arena/focus layouts, mobile spectating, results/rematch
- [ ] Browser QA, deployment, and live multiplayer verification

Artwork and game material: Kevin (kaybarax). See the repository LICENSE.

The game arena includes five approved doorways to make sealed collectible chambers reachable. The source artwork is unchanged. `scripts/build-arena.py` records the source hash and doorway coordinates in `src/arena.json`.
