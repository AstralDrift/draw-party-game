# Client UI

React + TypeScript Apple-glass UI is the sole client entry. All phases are implemented against the Rust protocol.

See [design.md](design.md) for the visual system and [architecture.md](architecture.md) for authority boundaries.
The phased UX plan and its current execution status live in [ui-ux-improvement-plan.md](ui-ux-improvement-plan.md).

## Phase coverage

1. **Lobby** — TV create/QR (read-only settings summary) + host phone settings/start + phone join/wait
2. **Drawing** — phone stroke pad + TV progress
3. **Guessing / Voting** — reveal canvas, fake answers, vote options, reactions
4. **Results** — staged reveal (hold → tally → correct → deltas → complete) + Continue gate
5. **Final Scores** — podium, titles, share card

## Architecture

```
client/src/
  main.tsx                 # React mount + service worker register
  app/App.tsx              # Role + phase router
  app/GameProvider.tsx     # WebSocket + room state (server-authoritative)
  design/                  # Tokens + base + layout + motion + drawing styles
  components/ui/           # Glass primitives + results/scores/progress
  hooks/useRevealStage.ts  # Results reveal staging timing + React hook
  spectator.ts             # Active/playing/spectator roster helpers
  views/display/           # TV phase screens
  views/player/            # Phone phase screens + SpectatorWatch
  # shared contracts / helpers:
  protocol.ts, net.ts, drawing.ts, time.ts, polish.ts, sound.ts, share-card.ts
```

Mid-game joiners become `PlayerPublic.spectator` until the next drawing round (server promotes). Lobby readiness and progress panels count active (non-spectator) players only.

## Non-negotiables

- URLs: `/` display, `/join/:code` player
- Rust server authority; client does not own phase transitions
- Stroke documents via `DrawingPad` (1024×768)
- PWA `sw.js` network-first for `/api/*` and `/ws`
- Protocol guards in `protocol.ts`
- All client CSS under `design/` (tokens, base, components, drawing, layout, motion)
- Primary actions use `Button` (`btn` / `btn--primary|secondary|ghost` / `btn--wide`); modifiers like `spotlight-button`, `tool-button`, and `reaction-button` are allowed

## Validation

For UI/layout/touch changes, prefer relevant Playwright coverage under `client/e2e/` (include mobile-sized phone contexts). Full matrix is in [contributing.md](contributing.md).
