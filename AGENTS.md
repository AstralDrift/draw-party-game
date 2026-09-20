# Draw Party Agent Context

This project uses **AI Context as Code (AICaC) v2.0** — structured YAML in `.ai/` validated against JSON Schemas.

Before answering any question, use this router to load **ONLY the relevant `.ai/` file** — do not load them all at once.

## Router: intent → file

| Query intent | Load this file only |
|-------------|---------------------|
| Project overview, setup, dependencies, dev commands | `.ai/context.yaml` |
| Architecture, components, data flow, tech stack | `.ai/architecture.yaml` |
| How-to tasks, commands, adding features, workflows | `.ai/workflows.yaml` |
| Why decisions were made, trade-offs, ADRs | `.ai/decisions.yaml` |
| Errors, debugging, troubleshooting | `.ai/errors.yaml` |

## Examples

- "How do I add a protocol message?" → `.ai/workflows.yaml` → `add_protocol_message` workflow
- "Why is the server authoritative?" → `.ai/decisions.yaml` → `adr_001_server_authority`
- "Fix WebSocket connection error" → `.ai/errors.yaml` → `err_websocket_failed`
- "What are the main components?" → `.ai/architecture.yaml` → `components` section
- "How do I run tests?" → `.ai/workflows.yaml` → `run_tests` workflow

Each `.ai/*.yaml` file has a top-level `summary:` field — read that first to confirm you picked the right file, then load the rest as needed.

## Quick reference

- **Project**: Draw Party — Open-source Drawful-style party game
- **Stack**: Rust (server) + Vite/React/TypeScript (client)
- **Entry**: `server/src/main.rs` (server), `client/src/main.tsx` (client)
- **Docs**: See [`docs/`](docs/README.md) for deep dives (architecture, protocol, design, deployment, contributing)

```bash
npm run server:dev       # Rust server on :3000
npm run client:dev       # Vite; proxies /ws and /api to :3000
npm run test             # Full suite: server + client + e2e
npm run e2e              # Playwright tests
```

## Code principles

- **Server authority**: Rust server owns rooms, phases, deadlines, scoring, reconnect. Client renders authoritative snapshots. Do not reintroduce client-side phase ownership.
- **Ephemeral rooms**: In-memory only; no accounts or database in v1. Rooms expire 3 hours after all disconnect.
- **Vector drawings**: Compact stroke arrays, not image data URLs.
- **Protocol dual maintenance**: Changes to `server/src/protocol.rs` require mirroring in `client/src/protocol.ts` and `docs/protocol.md`.
- **Spectator seats**: Spectators consume `MAX_PLAYERS` (8) seats same as active players.

## When changing X, also update Y

| If you change… | Also update… |
|----------------|--------------|
| `server/src/protocol.rs` | `client/src/protocol.ts`, `docs/protocol.md`, relevant tests |
| Scoring / phases / reconnect | `server/src/engine/tests/`, `docs/architecture.md` |
| Design tokens or glass rules | `client/src/design/**`, `docs/design.md` |
| Validation commands | `docs/contributing.md` |

## Validation blast radius

| Change area | Validate with |
|-------------|---------------|
| Engine / scoring | `cargo test --manifest-path server/Cargo.toml` |
| WebSocket / reconnect / health | `cargo test` (incl. `main.rs` tests) |
| Client logic / protocol | `npm --prefix client test -- --run` + typecheck |
| UI / layout / touch | Relevant Playwright e2e (include mobile contexts) |
| TV display layout | `npm run e2e:tv` + `npm run e2e:tvbro` |

Full CI matrix: `docs/contributing.md#validation`
