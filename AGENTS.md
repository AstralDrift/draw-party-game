# Draw Party Agent Context

Canonical guidance for AI agents working in this repository. Deep dives live under [`docs/`](docs/README.md) — open only what the task needs.

## Project Overview

Draw Party is an open-source Drawful-style party game for a TV/display browser and phone controllers. The display creates a room and shows a QR/code. Players join from phones, draw assigned prompts, submit fake guesses for other drawings, vote for the real prompt, and score points for correct votes and convincing fake answers.

## Product Principles

- Keep the core flow explainable in 30 seconds or less.
- Optimize for party play: loud rooms, mixed devices, quick joins, and low-friction rounds.
- Treat phones as controllers and the TV/display as the shared room state.
- Prefer reliability, clear recovery, and readable code over broad feature expansion.
- Keep v1 ephemeral: no accounts, no database, no persistent room history.

## Docs Index

| Doc | Use when |
|-----|----------|
| [docs/architecture.md](docs/architecture.md) | Phases, authority, reconnect, spectators, scoring |
| [docs/protocol.md](docs/protocol.md) | Constants, messages, dual Rust/TS updates |
| [docs/client-ui.md](docs/client-ui.md) | React tree, phase screens, client non-negotiables |
| [docs/design.md](docs/design.md) | Glass tokens, type, motion, components |
| [docs/deployment.md](docs/deployment.md) | Env vars, Docker, Railway, PWA/cache |
| [docs/contributing.md](docs/contributing.md) | Prerequisites, scripts, PR validation |

## Current Architecture

- `server/` is the Rust authoritative game server. It owns rooms, host tokens, WebSocket connections, phase transitions, deadlines, prompt assignment, scoring, reconnect/dropout handling, room cleanup, static client serving, and `/api/health` deploy metadata.
- `client/` is a Vite + TypeScript browser app. It renders the TV display and phone player flows, implements the drawing canvas, validates server protocol messages, syncs server time for countdowns, and ships PWA assets through `client/public/`.
- Drawings are compact vector stroke documents, not image data URLs.
- Rooms are in-memory and expire after all participants disconnect and the TTL passes.

## Important Source Areas

- `server/src/engine.rs`: room state, phase progression, scoring, prompt assignment, settings validation, reconnect/dropout rules.
- `server/src/engine/tests.rs`: engine unit tests.
- `server/src/main.rs`: HTTP/WebSocket routes, connection authorization, static serving/cache headers, health response, room maintenance, and integration-style WebSocket tests.
- `server/src/protocol.rs`: Rust protocol types and gameplay constants.
- `server/src/prompts.rs`: prompt packs (`safe-party`, `party-chaos`).
- `client/src/main.tsx`: React mount + service worker registration only.
- `client/src/app/GameProvider.tsx`: WebSocket, room join/reconnect, submissions, voting, shared client state.
- `client/src/app/App.tsx`: role + phase router.
- `client/src/views/`: display and player phase screens (including spectator watch).
- `client/src/protocol.ts`: TypeScript protocol types and runtime guards for server messages.
- `client/src/drawing.ts`: drawing pad, stroke capture, simplification, rendering, limits.
- `client/src/spectator.ts`, `polish.ts`, `hooks/useRevealStage.ts`: spectator helpers and results reveal staging.
- `client/src/design/`: CSS tokens and glass styles (see `docs/design.md`).
- `client/e2e/`: Playwright coverage for full rounds, device compatibility, polish, and PWA cache behavior.

## Game Flow

1. Lobby: the display creates a room; phones join by QR/code; the display can adjust room settings (timers, results pacing, prompt pack).
2. Drawing: all connected players draw their assigned prompts and submit once they have ink.
3. Guessing: each drawing is revealed in turn; non-artist players submit fake answers. Phones may send ephemeral reactions.
4. Voting: non-artist players choose the real prompt while the artist watches. Reactions remain available.
5. Results: the client stages the reveal (votes → correct answer → deltas); the engine auto-advances after `resultsSeconds` unless the display Continues early. Scoring includes nobody-found and perfect-truth bonuses.
6. Final Scores: after the configured round count, the display shows the podium (with titles) and can start again or export a share card.

Scoring values and reconnect rules: [docs/architecture.md](docs/architecture.md).

## When Changing X, Also Update Y

| If you change… | Also update… |
|----------------|--------------|
| `server/src/protocol.rs` | `client/src/protocol.ts`, `docs/protocol.md`, relevant tests |
| Scoring / phases / reconnect | `server/src/engine/tests.rs`, `docs/architecture.md` |
| Design tokens or glass rules | `client/src/design/**`, `docs/design.md` |
| Client phase ownership or routes | `docs/client-ui.md` (do not move phase authority to the client) |
| Env / deploy / PWA cache | `docs/deployment.md`, README deploy section if the quick start changes |
| Validation commands | `docs/contributing.md` only (README/AGENTS link there) |

## Validation

Canonical command list and blast-radius matrix: [docs/contributing.md](docs/contributing.md#validation).

Narrow change tips (see contributing for the full matrix):

- Engine / scoring: `cargo test --manifest-path server/Cargo.toml` (+ `server/src/engine/tests.rs`)
- WebSocket / reconnect / health / static: `cargo test` including `main.rs` tests
- Client logic / protocol: `npm --prefix client test -- --run` + typecheck
- UI / layout / touch: relevant Playwright e2e (include mobile phone contexts)
- Release verification: `/api/health` commit check, then `E2E_BASE_URL=<url> npm run e2e` when practical

## Development Guidance

- Keep the Rust server authoritative. Do not reintroduce peer-to-peer room authority or client-side phase ownership.
- Centralize phase advancement in the engine rather than duplicating progression rules in route handlers or client code.
- Preserve reconnect and dropout behavior: disconnected players should not block progress once all connected eligible players have submitted.
- Keep room and player limits enforced on both protocol constants and user-facing controls. Spectators consume `MAX_PLAYERS` seats (same roster cap as active players).
- Keep client protocol guards strict; unknown or malformed server messages should not mutate UI state.
- Avoid complex drawing features unless they directly improve the simple party flow.
- Prefer small, reviewable changes with tests close to the changed behavior.
- Do not duplicate this file into `CLAUDE.md` / Copilot instruction forks; keep one canonical agent doc.

## Deployment Notes

- The Rust server serves the built client from `client/dist`.
- Service worker and static asset behavior must keep live game routes network-first: `/api/*` and `/ws` should not be cached.
- Railway deployments can expose commit, branch, deployment, and environment metadata through `/api/health`.
- Do not assume static-only hosting is sufficient for current gameplay; the WebSocket server is required.
- Env catalog and smoke steps: [docs/deployment.md](docs/deployment.md).
