# Deployment

The Rust server serves the built client from `client/dist`. Static-only hosting is not enough: gameplay requires the WebSocket server.

## Environment variables

| Variable | Purpose | Default / notes |
|----------|---------|-----------------|
| `DRAW_PARTY_BIND` | Listen address | `127.0.0.1:3000` locally; Docker sets `0.0.0.0:3000` |
| `DRAW_PARTY_STATIC_DIR` | Built client directory | `client/dist` (Docker: `/app/client/dist`) |
| `RAILWAY_GIT_COMMIT_SHA` / `GIT_SHA` | Health `gitSha` | Optional |
| `RAILWAY_GIT_BRANCH` / `GIT_BRANCH` | Health `gitBranch` | Optional |
| `RAILWAY_DEPLOYMENT_ID` / `DEPLOYMENT_ID` | Health `deploymentId` | Optional |
| `RAILWAY_ENVIRONMENT_NAME` / `ENVIRONMENT_NAME` | Health `environmentName` | Optional |

E2E helpers (client scripts, not the game server):

| Variable | Purpose |
|----------|---------|
| `E2E_PORT` | Local server port for Playwright (default `3100`) |
| `E2E_BASE_URL` | Run e2e against an already-running deployment |

## Local production-like run

```bash
npm --prefix client ci
npm --prefix client run build
cargo build --manifest-path server/Cargo.toml --release
DRAW_PARTY_STATIC_DIR=client/dist ./target/release/draw-party-server
```

Open `http://localhost:3000` for the TV display. Phones use the QR/code or `/join/:roomCode`.

## Docker

Root `Dockerfile` builds the client (Node 22), builds the release server (Rust), and runs with:

- `DRAW_PARTY_STATIC_DIR=/app/client/dist`
- `DRAW_PARTY_BIND=0.0.0.0:3000`
- port `3000` exposed

## HTTP routes

| Route | Role |
|-------|------|
| `GET /` | TV display SPA |
| `GET /join/:roomCode` | Phone join SPA shell |
| `GET /api/health` | Liveness + optional deploy metadata |
| `GET /ws` (upgrade) | Game WebSocket |

## PWA and caching

Production should serve `client/dist` from the same origin as `/ws` and `/api/*` so `sw.js`, `manifest.webmanifest`, and hashed assets share origin.

The service worker may cache the app shell and built assets. It must keep live game routes **network-first**:

- do not cache `/api/*`
- do not cache `/ws`

## Railway smoke

Confirm the deployed commit, then optionally run e2e against the public URL:

```bash
curl https://<your-service>/api/health
E2E_BASE_URL=https://<your-service> npm run e2e
```

GitHub Actions runs formatting, clippy, Rust tests, client typecheck/Vitest/build, and Playwright on pull requests and pushes to `main`.
