# Client UI Migration (Glass Rewrite)

## Status

Branch: `micah/glass-ui-rewrite` (isolated worktree at `../draw-party-game-glass` to avoid clobbering parallel WIP).

This pass scaffolds **React + TypeScript** over the existing Vite client and ships an Apple-glass design system. Migrated end-to-end for:

1. **Lobby** — TV create/QR/settings/start + phone join/wait
2. **Drawing** — phone stroke pad + TV progress

Other phases (`guessing`, `voting`, `results`, `finalScores`) render glass-styled React views that preserve protocol behavior, but should get visual polish pass 2.

## Architecture

```
client/src/
  main.tsx                 # React entry (replaces main.ts)
  app/App.tsx              # Role + phase router
  app/GameProvider.tsx     # WebSocket + room state (server-authoritative)
  design/                  # Tokens + base + motion + drawing styles
  components/ui/           # Glass primitives
  views/display|player/    # Phase screens
  # unchanged contracts:
  protocol.ts, net.ts, drawing.ts, time.ts, store.ts, polish.ts, sound.ts
```

Legacy DOM renderer remains at `src/main.legacy.ts` for reference until e2e fully green.

## Non-negotiables (preserved)

- URLs: `/` display, `/join/:code` player
- Rust server authority; client does not own phase transitions
- Stroke documents via `DrawingPad` (1024×768)
- PWA `sw.js` network-first for `/api/*` and `/ws`
- Protocol guards in `protocol.ts`

## Design system

See root `DESIGN.md`. CSS is split:

| File | Purpose |
|------|---------|
| `design/tokens.css` | Color, type, space, radius, motion tokens |
| `design/base.css` | Reset, atmosphere, shells, typography utilities |
| `design/components.css` | Buttons, fields, panels, lists, badges |
| `design/drawing.css` | Drawing pad / canvas / submit dock |
| `design/motion.css` | Entrances + reduced-motion |

## Migration path (remaining)

1. Polish guessing / voting / results / podium compositions to match lobby density.
2. Port reveal staging helpers (thermo decomp `reveal.ts` when merged) into React.
3. Update Playwright selectors only if class contracts change; prefer keeping `.room-code`, `.player-row`, `#prompt-text`, `#deadline-text`.
4. Delete `main.legacy.ts` + leftover monolithic `style.css` after e2e passes.
5. Optionally extract shared packages (`protocol`, `drawing`) if a second client surface appears.

## Validation

```bash
npm --prefix client run typecheck
npm --prefix client test -- --run
npm --prefix client run build
# e2e: run after lobby+drawing selector QA; skip if mid-migration
```

## Coordination notes

- Thermo decomp WIP was pinned at `refs/backup/thermo-decomp-wip` + `refs/backup/thermo-decomp-untracked` in the main repo — do not clobber when merging.
- Do not mix spectator-late-join protocol changes into this branch unless intentionally rebasing.
