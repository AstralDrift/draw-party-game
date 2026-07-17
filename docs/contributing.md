# Contributing

Thanks for helping with Draw Party. Keep changes small, reviewable, and tested near the behavior you touch.

## Prerequisites

- **Node.js 22** (matches CI)
- **Stable Rust** with `clippy` and `rustfmt`
- npm (comes with Node)

## Repo layout

| Path | Role |
|------|------|
| `server/` | Authoritative Rust game server |
| `client/` | Vite + React + TypeScript TV/player app |
| `docs/` | Progressive documentation |
| Root `package.json` | Thin script facade (`client:dev`, `server:dev`, `e2e`, `test`) |

Prefer root scripts when they exist; app packages still live under `client/`.

## Local development

```bash
npm --prefix client ci
npm --prefix client run e2e:install   # Playwright browsers, once
npm run server:dev                    # Rust server on :3000
npm run client:dev                    # Vite; proxies /ws and /api to :3000
```

Open the display at the Vite URL or `http://localhost:3000` after a full build. See [deployment.md](deployment.md) for production-like runs.

## Validation

Full matrix (same as CI):

```bash
cargo fmt --check --manifest-path server/Cargo.toml
cargo clippy --manifest-path server/Cargo.toml --all-targets -- -D warnings
cargo test --manifest-path server/Cargo.toml
npm --prefix client run typecheck
npm --prefix client test -- --run
npm --prefix client run build
npm run e2e
```

Match blast radius for narrow PRs:

| Change | Validate with |
|--------|----------------|
| Engine / scoring | `cargo test --manifest-path server/Cargo.toml` (+ engine tests) |
| WebSocket / reconnect / health / static | `cargo test` (incl. `main.rs` tests) |
| Client logic / protocol | `npm --prefix client test -- --run` + typecheck |
| UI / layout / touch | Relevant Playwright e2e (include mobile phone contexts) |
| TV / display layout | `npm run e2e:tv` (required for lobby/display CSS). Optional human glance: `npm run review:tv` then open `client/artifacts/tv-review/index.html` |
| Protocol constants/messages | Both Rust and TS sides + tests above |
| Docs only | Link walk + constant accuracy vs code |

`npm run e2e` builds the client, starts the Rust server on `127.0.0.1:3100`, and runs Playwright. Set `E2E_PORT` or `E2E_BASE_URL` as needed.

### TV layout gate (living-room / TV Bro)

Geometric Playwright checks catch the failure modes that pixel snapshots miss on glass UI: clipped hero type, overlapping Players copy, oversized QR/code, and mid-game panels that force page scroll.

```bash
npm run e2e:tv          # empty + populated lobby + drawing/guessing across TV sizes
npm run review:tv       # same gate, also writes client/artifacts/tv-review/index.html
open client/artifacts/tv-review/index.html
```

CI runs the full e2e suite with `TV_REVIEW=1` and uploads the gallery as the `tv-layout-review` artifact.
## Design and protocol

- UI work: follow [design.md](design.md) and [client-ui.md](client-ui.md). CSS belongs under `client/src/design/`.
- Protocol work: update both `server/src/protocol.rs` and `client/src/protocol.ts`, then [protocol.md](protocol.md).
- Architecture / scoring: keep [architecture.md](architecture.md) aligned with the engine.

## Pull requests

- Prefer focused PRs with tests close to the changed behavior.
- Use the GitHub PR template checklist.
- Do not reintroduce client-owned phase transitions or peer-to-peer room authority.
- Spectators consume `MAX_PLAYERS` seats; disconnected players must not block progress once connected eligible players have submitted.

## Security

See [../SECURITY.md](../SECURITY.md). v1 is ephemeral (no accounts or database).
