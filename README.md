# Draw Party

Open-source Drawful-style party drawing for a TV and phones.

The TV browser creates a room and shows a join code. Each player joins from a phone, draws a prompt, submits fake guesses for other drawings, votes for the real prompt, and scores points for correct votes and convincing fake answers.

## Architecture

- `server/` is a Rust WebSocket server. It owns rooms, phase transitions, deadlines, prompt assignment, scoring, reconnects, and cleanup.
- `client/` is a Vite + TypeScript app. It has two roles: TV display and phone player.
- Drawings are compact vector stroke documents, not image data URLs.
- Rooms are in-memory and ephemeral. No accounts or database are required for v1.

## Local Development

Install Rust, Node.js, and npm first.

```bash
npm --prefix client ci
npm --prefix client run e2e:install
npm --prefix client run build
cargo run --manifest-path server/Cargo.toml
```

Then open `http://localhost:3000` on the TV/display browser. Phones join with the QR/code shown on the display.

For client-only development:

```bash
npm --prefix client run dev
```

The Vite dev server proxies `/ws` and `/api` to the Rust server on port `3000`.

## Validation

```bash
cargo fmt --check --manifest-path server/Cargo.toml
cargo clippy --manifest-path server/Cargo.toml --all-targets -- -D warnings
cargo test --manifest-path server/Cargo.toml
npm --prefix client run typecheck
npm --prefix client test -- --run
npm --prefix client run build
npm run e2e
```

`npm run e2e` builds the client, starts the Rust server on `127.0.0.1:3100`, and runs Playwright against the built app. Set `E2E_PORT` to use a different local port, or set `E2E_BASE_URL` to run the same tests against an already-running deployment.

The E2E suite covers one TV and three isolated phone browser contexts through drawing, guessing, voting, results, and the next round transition. It also checks that `/sw.js` is served as JavaScript, includes the app-shell cache behavior, leaves `/api/*` routes uncached, and keeps browser routes such as `/join/:roomCode` on the SPA shell.

## Deployment

The Rust server serves the built client from `client/dist`.

```bash
npm --prefix client ci
npm --prefix client run build
cargo build --manifest-path server/Cargo.toml --release
DRAW_PARTY_STATIC_DIR=client/dist ./server/target/release/draw-party-server
```

`GET /api/health` returns server status. `GET /` opens the TV display. `GET /join/:roomCode` opens the phone join flow.

The production server should serve `client/dist` as its static directory so the copied `sw.js`, `manifest.webmanifest`, and hashed assets are all available from the same origin. The service worker caches the app shell and built assets for browser/PWA resilience, but intentionally bypasses `/api/*` and `/ws` so live game state and WebSocket traffic stay network-first.

GitHub Actions runs Rust formatting, clippy, Rust tests, client typecheck, Vitest, client build, and Playwright on pull requests and pushes to `main`.

## License

MIT
