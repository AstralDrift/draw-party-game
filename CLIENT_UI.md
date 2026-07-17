# Client UI (Glass Rewrite)

## Status

Branch: `micah/glass-ui-rewrite`

React + TypeScript Apple-glass UI is the sole client entry. All phases are implemented against the Rust protocol:

1. **Lobby** — TV create/QR/settings/start + phone join/wait
2. **Drawing** — phone stroke pad + TV progress
3. **Guessing / Voting** — reveal canvas, fake answers, vote options, reactions
4. **Results** — staged reveal (hold → tally → correct → deltas → complete) + Continue gate
5. **Final Scores** — podium, titles, share card

Legacy `main.ts` / monolithic `style.css` / DOM dual-stack are removed.

## Architecture

```
client/src/
  main.tsx                 # React entry
  app/App.tsx              # Role + phase router
  app/GameProvider.tsx     # WebSocket + room state (server-authoritative)
  design/                  # Tokens + base + layout + motion + drawing styles
  components/ui/           # Glass primitives + results/scores/progress
  hooks/useRevealStage.ts  # Results reveal staging timing + React hook
  spectator.ts             # Active/playing/spectator roster helpers
  views/player/SpectatorWatch.tsx  # Mid-game watch-only phone UI
  # shared contracts:
  protocol.ts, net.ts, drawing.ts, time.ts, polish.ts, sound.ts, share-card.ts
```

Mid-game joiners become `PlayerPublic.spectator` until the next drawing round (server promotes). Lobby readiness and progress panels count active (non-spectator) players only.

## Non-negotiables (preserved)

- URLs: `/` display, `/join/:code` player
- Rust server authority; client does not own phase transitions
- Stroke documents via `DrawingPad` (1024×768)
- PWA `sw.js` network-first for `/api/*` and `/ws`
- Protocol guards in `protocol.ts`

## Design system

See root `DESIGN.md`. All client CSS lives under `design/` (tokens, base, components, drawing, layout, motion).
Buttons use `btn` / `btn--primary|secondary|ghost` / `btn--wide` only.

## Validation

```bash
cargo fmt --check --manifest-path server/Cargo.toml
cargo clippy --manifest-path server/Cargo.toml --all-targets -- -D warnings
cargo test --manifest-path server/Cargo.toml
npm --prefix client run typecheck
npm --prefix client test -- --run
npm --prefix client run build
npm run e2e
```
