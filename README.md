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
npm --prefix client install
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
```

## Deployment

The Rust server serves the built client from `client/dist`.

```bash
npm --prefix client ci
npm --prefix client run build
cargo build --manifest-path server/Cargo.toml --release
DRAW_PARTY_STATIC_DIR=client/dist ./server/target/release/draw-party-server
```

`GET /api/health` returns server status. `GET /` opens the TV display. `GET /join/:roomCode` opens the phone join flow.

## License

MIT
