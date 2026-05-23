# Draw Party Agent Context

## Project Overview

Draw Party is an open-source Drawful-style party game for a TV/display browser and phone controllers. The display creates a room and shows a QR/code. Players join from phones, draw assigned prompts, submit fake guesses for other drawings, vote for the real prompt, and score points for correct votes and convincing fake answers.

## Product Principles

- Keep the core flow explainable in 30 seconds or less.
- Optimize for party play: loud rooms, mixed devices, quick joins, and low-friction rounds.
- Treat phones as controllers and the TV/display as the shared room state.
- Prefer reliability, clear recovery, and readable code over broad feature expansion.
- Keep v1 ephemeral: no accounts, no database, no persistent room history.

## Current Architecture

- `server/` is the Rust authoritative game server. It owns rooms, host tokens, WebSocket connections, phase transitions, deadlines, prompt assignment, scoring, reconnect/dropout handling, room cleanup, static client serving, and `/api/health` deploy metadata.
- `client/` is a Vite + TypeScript browser app. It renders the TV display and phone player flows, implements the drawing canvas, validates server protocol messages, syncs server time for countdowns, and ships PWA assets through `client/public/`.
- Drawings are compact vector stroke documents, not image data URLs.
- Rooms are in-memory and expire after all participants disconnect and the TTL passes.

## Important Source Areas

- `server/src/engine.rs`: room state, phase progression, scoring, prompt assignment, settings validation, reconnect/dropout rules, and engine unit tests.
- `server/src/main.rs`: HTTP/WebSocket routes, connection authorization, static serving/cache headers, health response, room maintenance, and integration-style WebSocket tests.
- `server/src/protocol.rs`: Rust protocol types and gameplay constants.
- `client/src/main.ts`: TV/player rendering, room joining, reconnect behavior, turn submission, voting, and dynamic status text.
- `client/src/protocol.ts`: TypeScript protocol types and runtime guards for server messages.
- `client/src/drawing.ts`: drawing pad, stroke capture, stroke simplification, canvas rendering, and drawing limits.
- `client/e2e/`: Playwright coverage for full rounds, device compatibility, polish, and PWA cache behavior.

## Game Flow

1. Lobby: the display creates a room; phones join by QR/code; the display can adjust room settings.
2. Drawing: all connected players draw their assigned prompts and submit once they have ink.
3. Guessing: each drawing is revealed in turn; non-artist players submit fake answers.
4. Voting: non-artist players choose the real prompt while the artist watches.
5. Results: the room shows the correct answer, vote breakdown, score deltas, and continues through submitted drawings.
6. Final Scores: after the configured round count, the display shows the podium and can start again.

## Validation

Use the repo scripts and direct toolchain commands already documented in `README.md` and CI:

```bash
cargo fmt --check --manifest-path server/Cargo.toml
cargo clippy --manifest-path server/Cargo.toml --all-targets -- -D warnings
cargo test --manifest-path server/Cargo.toml
npm --prefix client run typecheck
npm --prefix client test -- --run
npm --prefix client run build
npm run e2e
```

For narrow changes, match validation to blast radius:

- Engine or scoring changes: `cargo test --manifest-path server/Cargo.toml`, plus targeted tests in `server/src/engine.rs`.
- WebSocket, reconnect, health, or static-serving changes: `cargo test --manifest-path server/Cargo.toml`, plus relevant tests in `server/src/main.rs`.
- Client logic or protocol changes: `npm --prefix client test -- --run` and `npm --prefix client run typecheck`.
- UI/layout/touch changes: relevant Playwright e2e coverage, including mobile-sized phone contexts.
- Release/deployment verification: check `/api/health` for the expected deployed commit, then run `E2E_BASE_URL=<deployment-url> npm run e2e` when practical.

## Development Guidance

- Keep the Rust server authoritative. Do not reintroduce peer-to-peer room authority or client-side phase ownership.
- Centralize phase advancement in the engine rather than duplicating progression rules in route handlers or client code.
- Preserve reconnect and dropout behavior: disconnected players should not block progress once all connected eligible players have submitted.
- Keep room and player limits enforced on both protocol constants and user-facing controls.
- Keep client protocol guards strict; unknown or malformed server messages should not mutate UI state.
- Avoid complex drawing features unless they directly improve the simple party flow.
- Prefer small, reviewable changes with tests close to the changed behavior.

## Deployment Notes

- The Rust server serves the built client from `client/dist`.
- Service worker and static asset behavior must keep live game routes network-first: `/api/*` and `/ws` should not be cached.
- Railway deployments can expose commit, branch, deployment, and environment metadata through `/api/health`.
- Do not assume static-only hosting is sufficient for current gameplay; the WebSocket server is required.
