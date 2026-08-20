# NUForce V2

Modular, TypeScript rebuild of the NU Laboratories quoting app ("Classic" = V1).
This is the Phase 0 scaffold: theme, component library, routing, and the ported
data/auth layer. It runs read-only.

## Run it

```bash
npm install
npm run dev
```

Then open http://localhost:5173. You'll see the scaffold dashboard proving the
theme and routing (click a quote — it has a real URL you can open in a new tab).

## Viewing real data locally (read-only)

On localhost the app reads its session from `localStorage` (subdomain cookies
don't apply to localhost). To load real data you seed your current session once
via the dev token box (wired in Phase 2). Nothing writes to the database.

## Structure

```
src/
  main.tsx            app entry (mounts the router)
  App.tsx             thin shell: routes only
  theme/tokens.css    design tokens — the whole app themes from here
  lib/                restFetch, rpc, auth, config (ported from Classic)
  data/               constants (product codes, shift rates, …)
  components/         reusable UI (Button, Card, Tabs, StatTile, …)
  features/           feature-first screens (dashboard/, quote/, …)
docs/
  OPEN_ITEMS.md       decisions, open questions, flagged items
```

See `docs/OPEN_ITEMS.md` for the running decision log and flagged items.
