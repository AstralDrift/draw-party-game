# UI/UX Improvement Plan

This plan treats the TV as the shared game state and phones as focused controllers. The Rust server remains authoritative for rooms, turns, scoring, reconnects, and expiry.

## Phase 1 — Establish the visual and interaction baseline

**Outcome:** a single, legible cross-device experience.

- Keep the Apple-glass design system in `client/src/design/` and its source of truth in [design.md](design.md).
- Preserve large TV hierarchy, 52px controller targets, safe-area phone layouts, keyboard focus, reduced motion, and accessible labels.
- Validate real lobby, drawing, guessing, voting, results, and final-score layouts at phone, tablet, 720p, and 4K sizes.

**Status:** complete on current `main`.

## Phase 2 — Make onboarding and hosting obvious

**Outcome:** a host can create a room, guests can join, and the next action is clear without instructions.

- Keep the display QR/code as the lobby anchor and expose readiness through the player list and progress panel.
- Keep room controls on the host phone so the TV remains a shared, uncluttered surface.
- Make invalid room and full-room recovery return the controller to a usable join state.

**Status:** complete on current `main`.

## Phase 3 — Make every in-round controller state decisive

**Outcome:** every player can immediately tell whether to draw, guess, vote, watch, or wait.

- Keep the drawing canvas first on a phone, with compact tools and a clear submit state.
- Preserve spectator, artist, submitted, countdown, reaction, and staged-results feedback.
- Keep client state derived from server snapshots; never let a visual transition alter game authority.

**Status:** complete on current `main`.

## Phase 4 — Harden recovery so polish survives real party conditions

**Outcome:** temporary network loss, a stale tab, a slow controller, or denied browser storage does not make the room feel broken.

- Replace unbounded WebSocket outbound queues with bounded per-connection delivery; retire only the slow connection when it falls behind.
- Give every socket generation an identity so a superseded tab cannot mutate or disconnect its replacement.
- Close superseded sockets promptly and keep mutation plus snapshot enqueueing ordered under the room lock.
- Treat browser storage as optional: retain a usable in-session identity, name, host recovery, and sound control when persistence is blocked.

**Status:** implemented by this PR.

## Phase 5 — Keep the quality bar regression-proof

**Outcome:** design changes remain playable, readable, and recoverable across devices.

- Run Rust formatting, Clippy, server tests, client typecheck/Vitest/build, and the full Playwright matrix.
- Include the TV geometry and TV Bro visual gates for presentation changes.
- Finish each UX PR with a Graphify refresh for impact mapping and an independent Thermos review.

**Status:** validation and final review are required before merge.
