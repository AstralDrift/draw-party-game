# Client UI

React + TypeScript Apple-glass UI is the sole client entry. All phases are implemented against the Rust protocol.

See [design.md](design.md) for the visual system and [architecture.md](architecture.md) for authority boundaries.
The phased UX plan and its current execution status live in [ui-ux-improvement-plan.md](ui-ux-improvement-plan.md).

## Phase coverage

1. **Lobby** — TV is pitch, QR, code, and names. The can’t-scan URL is recovery type, not a primary action. Host phone owns pace/pack/start. TV Start is an icon beside Sound, not a second Start Party panel. Scan join is the code, then your name, then Join the Party — Change room is quiet recovery, not a second primary. No seating interstitial. Seating count lives on the TV and the host phone. Non-host phones watch the TV.
2. **Drawing** — phone stroke pad + TV count of who is in; names still out sit under the count with no Waiting on coach line. The prompt owns the phone header; tools sit in the clock row; Submit appears after ink. Reconnect overlays the pad instead of hiding. Retry errors float above the pad without blocking Submit.
3. **Guessing / Voting** — Guessing TV is a living-room-sized drawing (no coach headline, no By artist eyebrow) with the wait count in the header; voting TV is the lettered titles (no coach headline) with the wait count in the header. Phones write a fake title (field focused, Submit after text), then tap a uniform letter grid — no phone countdown. Join and fake-title stay above the on-screen keyboard. Reconnect and retry errors overlay the title and letters instead of pushing them. Host +30 stays off those jobs until the phone looks up. After a vote locks, the letter grid leaves.
4. **Results** — hold is the drawing (no artist eyebrow), tally is the lettered titles (no vote chips, no Option A labels), correct is the prompt alone, scores open with the room outcome. Phones stay on Look up through the punchline; personal points wait until it is over. Host Continue has no phone clock. TV Continue is an icon after the punchline.
5. **Final Scores** — podium owns the TV; host Play Again after the podium beat; TV Play Again is an icon and Download Podium stays a labeled TV-only fallback after the same beat

## Architecture

```
client/src/
  main.tsx                 # React mount + service worker register
  app/App.tsx              # Role + phase router
  app/GameProvider.tsx     # WebSocket + room state (server-authoritative)
  design/                  # Tokens + base + layout + motion + drawing styles
  components/ui/           # Glass primitives + results/scores/progress
  hooks/useRevealStage.ts  # Results reveal staging timing + React hook
  hooks/useKeyboardInset.ts # Phone keyboard inset so join/title stay on-screen
  spectator.ts             # Active/playing/spectator roster helpers
  views/display/           # TV phase screens
  views/player/            # Phone phase screens + SpectatorWatch
  # shared contracts / helpers:
  protocol.ts, net.ts, drawing.ts, controller.ts, turn-draft-cache.ts,
  pending-rename-cache.ts,
  time.ts, polish.ts, sound.ts, share-card.ts
```

Mid-game joiners become `PlayerPublic.spectator` until the next drawing round (server promotes). Lobby readiness and progress panels count active (non-spectator) players only. Spectator phones look up; Spectating and you play next round live in the accessible name. They do not duplicate the TV drawing. Lobby spectators watch the TV the same way — no Spectating pill. TV roster names have no Watching pills.

## Non-negotiables

- URLs: `/` display, `/join/:code` player
- Rust server authority; client does not own phase transitions
- Stroke documents via `DrawingPad` (1024×768)
- PWA `sw.js` network-first for `/api/*` and `/ws`
- Protocol guards in `protocol.ts`
- Refresh recovery is one optional tab-scoped `sessionStorage` draft, limited to the current Drawing or Guessing turn, 5 minutes, and 1 MiB. Never persist a vote, auto-submit a restored draft, or treat it as pending server state; authoritative acceptance or identity/turn mismatch and explicit room exit clear it.
- Explicit renames are the separate exception: persist one room/client-bound pending rename for at most 3 hours and 2 KiB, replay its UUID-correlated request after reconnect, coalesce later edits, and settle only its matching `nameSet` acknowledgement (or the documented older-server snapshot fallback). Terminal room/session errors and explicit join cancellation clear it.
- All client CSS under `design/` (tokens, base, components, drawing, layout, motion)
- Primary actions use `Button` (`btn` / `btn--primary|secondary|ghost` / `btn--wide`); modifiers like `spotlight-button`, `tool-button`, and `reaction-button` are allowed

## Validation

For UI/layout/touch changes, prefer relevant Playwright coverage under `client/e2e/` (include mobile-sized phone contexts). Full matrix is in [contributing.md](contributing.md).
