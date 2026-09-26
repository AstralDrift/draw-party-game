# Draw Party marketing site

Standalone static landing page for Draw Party. It does not bundle the game client.

## Tagline

**Draw badly. Guess boldly.**

Support: Your TV is the stage. Every phone is a controller.

## Commands

From the repository root:

```bash
npm --prefix marketing ci
npm run marketing:dev    # Vite on http://localhost:5173 (port may vary)
npm run marketing:build  # Output in marketing/dist/
```

From this folder:

```bash
npm ci
npm run dev
npm run build
npm run preview
```

`predev` / `prebuild` copy screenshots from [`../docs/marketing/screenshots/`](../docs/marketing/screenshots/) into `public/screenshots/`.

## Design references

- Art direction: [`ART_DIRECTION.md`](../ART_DIRECTION.md) (repo root when present) and marketing brief in issue/PR
- Party Glass tokens: [`docs/design.md`](../docs/design.md) and [`DESIGN.md`](../DESIGN.md)
- Copy and capture notes: [`docs/marketing/README.md`](../docs/marketing/README.md)
- Fonts: reuses bundled WOFF2 from `client/src/assets/fonts/` (Syne + DM Sans latin)

## Primary CTA

The **Create a room** button links to `/` by default (same host as the game when co-deployed).

Override for standalone hosting:

```bash
VITE_PLAY_URL=https://drawparty.up.railway.app npm run marketing:build
```

Document the production play URL in your deploy notes when the marketing site ships on a different origin.

## Deploy

`marketing/dist/` is static files. Serve with any static host, or place behind the Rust server as an additional static root if you wire it in later.
