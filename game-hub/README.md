# Kevin’s Mazes game hub

Public entry point: https://kevins-mazes.the-big-cahuna-run.workers.dev

A responsive static page for choosing The Big Cahuna Run or Maze Chase. Both games have a shared Games menu and a brand link back to this hub, including while playing.

Preview: `python3 -m http.server 5175 --directory public`

Deploy from this directory using the existing Cloudflare tooling:

```sh
../maze-chase/node_modules/.bin/wrangler deploy --config wrangler.jsonc
```

Artwork is derived from Kevin’s existing SVG mazes. Original files are unchanged. Attribution and license follow the root repository.
