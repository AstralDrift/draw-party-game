# Draw Party Docs

Progressive documentation for humans and AI agents. Start at the root, then open only the deep dive you need.

## Start here

| Audience | Read first | Then |
|----------|------------|------|
| Players / hosts | [../README.md](../README.md) | [deployment.md](deployment.md) if self-hosting |
| Contributors | [contributing.md](contributing.md) | [architecture.md](architecture.md) |
| AI agents | [../AGENTS.md](../AGENTS.md) | This index, then the topic doc below |

## Topic map

| Doc | When to open it |
|-----|-----------------|
| [architecture.md](architecture.md) | Phases, server authority, reconnect/dropout, spectators, scoring |
| [protocol.md](protocol.md) | Constants, WebSocket messages, dual Rust/TS update rule |
| [client-ui.md](client-ui.md) | React client tree, phase screens, non-negotiables |
| [design.md](design.md) | Glass design system (tokens, type, motion, components) |
| [deployment.md](deployment.md) | Env vars, Docker, Railway, PWA/cache, health smoke |
| [contributing.md](contributing.md) | Prerequisites, scripts, validation matrix, PR expectations |

## Source of truth

- Game rules, phases, scoring, and reconnect behavior: Rust engine (`server/src/engine.rs`) and tests (`server/src/engine/tests.rs`)
- Wire protocol and limits: `server/src/protocol.rs` mirrored by `client/src/protocol.ts`
- Visual system: `docs/design.md` with CSS under `client/src/design/`
- Agent defaults and blast-radius validation: root `AGENTS.md`
