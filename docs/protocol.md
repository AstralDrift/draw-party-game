# Protocol

Wire contract between the Rust server and TypeScript client. **Edit both sides** when changing messages or constants:

- `server/src/protocol.rs`
- `client/src/protocol.ts` (types + runtime guards)

JSON uses `camelCase` field names (`serde(rename_all = "camelCase")`). Message enums are tagged with `"type"`.

After protocol changes, update this doc and run client typecheck/tests plus `cargo test`.

## Gameplay constants

From `server/src/protocol.rs` (defaults and limits):

| Constant | Value | Notes |
|----------|-------|-------|
| `CANVAS_WIDTH` × `CANVAS_HEIGHT` | 1024 × 768 | Logical stroke canvas |
| `MAX_PLAYERS` | 8 | Includes spectators |
| `MIN_PLAYERS` | 1 | Engine allows; party UX expects more |
| `DEFAULT_TOTAL_ROUNDS` | 5 | Range 1–12 |
| `DEFAULT_DRAW_SECONDS` | 90 | Range 15–300 |
| `DEFAULT_GUESS_SECONDS` | 45 | Range 10–180 |
| `DEFAULT_VOTE_SECONDS` | 30 | Range 10–120 |
| `DEFAULT_RESULTS_SECONDS` | 12 | Range 5–30 |
| `DEFAULT_PROMPT_PACK_ID` | `safe-party` | Also `party-chaos` |
| `ROOM_TTL_MS` | 3 hours | After all participants disconnect |
| `REACTION_COOLDOWN_MS` | 1500 | Per player |
| `ALLOWED_REACTIONS` | 😂 😱 🔥 👏 | Server-enforced allowlist |
| `MAX_STROKES` | 220 | Per drawing |
| `MAX_POINTS_PER_STROKE` | 180 | Per stroke |
| `MAX_NAME_LEN` | 24 | |
| `MAX_GUESS_LEN` | 60 | |

Room settings (`RoomSettings`) carry rounds and timer fields plus `promptPackId`.

## Roles and phases

- **Roles:** `display` | `player`
- **Phases:** `lobby` | `drawing` | `guessing` | `voting` | `results` | `finalScores`

## Snapshot

`RoomSnapshot` is the shared public room state (code, phase, players, settings, timers, turn token, deadlines, current artist/drawing, voting options, round result, final scores, submission id lists). Clients should treat snapshots from the server as authoritative.

Important fields:

- `turnToken` — submissions must match the current turn
- `deadlineMs` / `serverNowMs` — client syncs countdowns to server time
- `players[].spectator` — mid-game watchers until promoted

## Client → server (`ClientMessage`)

| Type | Purpose |
|------|---------|
| `createRoom` | Display creates a room |
| `joinRoom` | Player joins with `roomCode` + `name` |
| `setName` | Rename in lobby |
| `updateRoomSettings` | Display updates timers/rounds/pack |
| `startGame` | Display starts |
| `submitDrawing` | `turnToken` + `drawing` |
| `submitGuess` | `turnToken` + `guess` |
| `submitVote` | `turnToken` + `optionId` |
| `sendReaction` | `emoji` (allowlisted) |
| `heartbeat` | Keepalive / time sync |
| `leaveRoom` | Leave |

## Server → client (`ServerMessage`)

| Type | Purpose |
|------|---------|
| `roomCreated` | Snapshot + `hostToken` |
| `roomSnapshot` | Full state refresh |
| `phaseChanged` | Phase transition snapshot |
| `promptAssigned` | Private prompt for a player |
| `playerListChanged` | Roster update |
| `drawingReveal` | Artist drawing for guess/vote |
| `votingOptions` | Shuffled options (correct flag only where allowed) |
| `roundResult` | Scores and breakdown |
| `finalScores` | End-of-game podium data |
| `reactionBurst` | Ephemeral reaction |
| `pong` | Heartbeat reply with `nowMs` |
| `error` | `code` + `message` |

## Client guards

`client/src/protocol.ts` validates inbound messages. Unknown or malformed server messages must not mutate UI state. Prefer failing closed over optimistic local phase ownership.

## Drawings

Drawings are compact vector stroke documents (`DrawingDoc`: width, height, strokes of color/size/points), not image data URLs. Limits above are enforced on the server; the pad also respects them in `client/src/drawing.ts`.
