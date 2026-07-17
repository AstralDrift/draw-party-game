# Draw Party

Open-source Drawful-style party drawing for a TV and phones.

The TV browser creates a room and shows a join code. Each player joins from a phone, draws a prompt, submits fake guesses for other drawings, votes for the real prompt, and scores points for correct votes and convincing fake answers.

## Architecture

- `server/` is a Rust WebSocket server. It owns rooms, phase transitions, deadlines, prompt assignment, scoring, reconnects, and cleanup.
- `client/` is a Vite + TypeScript app. It has two roles: TV display and phone player.
- Drawings are compact vector stroke documents, not image data URLs.
- Rooms are in-memory and ephemeral. No accounts or database are required for v1.

## Documentation

| Doc | Audience |
|-----|----------|
| [AGENTS.md](AGENTS.md) | AI agents (canonical map + rules) |
| [docs/](docs/README.md) | Architecture, protocol, design, deploy, contributing |
| [CONTRIBUTING.md](CONTRIBUTING.md) | How to develop and validate changes |
| [SECURITY.md](SECURITY.md) | Vulnerability reporting |

## Prerequisites

- Node.js 22
- Stable Rust (`clippy`, `rustfmt`)
- npm

## Local Development

```bash
npm --prefix client ci
npm --prefix client run e2e:install
npm run server:dev
npm run client:dev
```

The Vite dev server proxies `/ws` and `/api` to the Rust server on port `3000`. Open the Vite URL on the TV/display; phones join with the QR/code.

Production-like local run (server serves the built client):

```bash
npm --prefix client run build
cargo run --manifest-path server/Cargo.toml
```

Then open `http://localhost:3000`. Root `package.json` also exposes `client:test`, `client:typecheck`, `server:test`, `e2e`, and `test`.

## Validation

Full CI matrix, blast-radius table, and e2e notes: [docs/contributing.md](docs/contributing.md#validation).

```bash
npm run test   # or follow the contributing matrix for a narrower PR
```

## Deployment

The Rust server serves the built client from `client/dist`. Env vars, Docker, Railway health metadata, and PWA cache rules: [docs/deployment.md](docs/deployment.md).

```bash
npm --prefix client ci
npm --prefix client run build
cargo build --manifest-path server/Cargo.toml --release
DRAW_PARTY_STATIC_DIR=client/dist ./target/release/draw-party-server
```

`GET /api/health` returns server status plus deploy metadata when the host provides it. `GET /` opens the TV display. `GET /join/:roomCode` opens the phone join flow.

For Railway release verification:

```bash
curl https://drawparty.up.railway.app/api/health
E2E_BASE_URL=https://drawparty.up.railway.app npm run e2e
```

GitHub Actions runs Rust formatting, clippy, Rust tests, client typecheck, Vitest, client build, and Playwright on pull requests and pushes to `main`.

## License

MIT — see [LICENSE](LICENSE).
