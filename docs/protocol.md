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
| `MIN_PLAYERS` | 3 | Party start; Practice requires exactly 1 phone |
| `DEFAULT_TOTAL_ROUNDS` | 2 | Range 1–3; Practice always uses one round |
| `DEFAULT_DRAW_SECONDS` | 75 | Range 45–120 |
| `DEFAULT_GUESS_SECONDS` | 30 | Range 20–60 |
| `DEFAULT_VOTE_SECONDS` | 20 | Range 15–40 |
| `DEFAULT_RESULTS_SECONDS` | 8 | Range 6–15 |
| `DEADLINE_EXTENSION_SECONDS` | 30 | Once per active timed turn |
| `DEFAULT_PROMPT_PACK_ID` | `safe-party` | Also `party-chaos` |
| `ROOM_TTL_MS` | 3 hours | After all participants disconnect |
| `REACTION_COOLDOWN_MS` | 1500 | Per player |
| `ALLOWED_REACTIONS` | 😂 😱 🔥 👏 | Server-enforced allowlist |
| `MAX_STROKES` | 220 | Per drawing |
| `MAX_POINTS_PER_STROKE` | 180 | Per stroke |
| `MAX_NAME_LEN` | 24 | |
| `MAX_GUESS_LEN` | 60 | |

Room settings (`RoomSettings`) carry rounds and timer fields plus `promptPackId`. The server
clamps numeric values to the ranges above before storing and broadcasting the authoritative
snapshot. This keeps one-release cached clients compatible without permitting unsafe pacing;
an unknown prompt pack is still rejected. During a suspended blank-drawing retry, changing only
timers preserves the assignment; selecting another valid prompt pack abandons that hidden retry
and broadcasts settings for a fresh next start.

## Roles and phases

- **Roles:** `display` | `player`
- **Modes:** `party` | `practice`
- **Phases:** `lobby` | `drawing` | `guessing` | `voting` | `results` | `finalScores`

## Snapshot

`RoomSnapshot` is the shared public room state (code, phase, players, settings, timers, turn token, deadlines, current artist/drawing, voting options, round result, final scores, submission id lists). Clients should treat snapshots from the server as authoritative.

Important fields:

- `turnToken` — submissions must match the current turn
- `deadlineMs` / `serverNowMs` — client syncs countdowns to server time
- `gameMode` — current server-authoritative Party or Practice mode
- `deadlineExtensionAvailable` — true before expiry when the timed turn has not received its one extension
- `players[].spectator` — mid-game watchers until promoted
- `players[].isHost` — derived badge for the room host phone (sticky while connected; on disconnect, earliest joined connected non-spectator, else earliest joined connected)

## Client → server (`ClientMessage`)

| Type | Purpose |
|------|---------|
| `createRoom` | Display creates a room |
| `joinRoom` | Player joins with `roomCode` + `name` |
| `setName` | Rename player (no server phase gate; client exposes rename in lobby) |
| `updateRoomSettings` | Display or host phone updates timers/rounds/pack (lobby only; numeric values are server-clamped) |
| `startGame` | Starts Party, Continues the current mode after Results, or starts a Party replay |
| `startPractice` | Starts/replays a one-phone, one-round, unscored Practice game |
| `extendDeadline` | Adds 30 seconds once to the active Drawing/Guessing/Voting turn |
| `submitDrawing` | `turnToken` + `drawing` |
| `submitGuess` | `turnToken` + `guess` |
| `submitVote` | `turnToken` + `optionId` |
| `sendReaction` | `emoji` (allowlisted) |
| `heartbeat` | Keepalive |
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
| `pong` | Heartbeat reply (`nowMs` unused by client; countdown sync uses snapshot `serverNowMs`) |
| `error` | `code` + `message` |

## Client guards

`client/src/protocol.ts` validates inbound messages. Unknown or malformed server messages must not mutate UI state. Prefer failing closed over optimistic local phase ownership.

`RoundResult.scoreEvents` explains every award with `kind`, recipient `playerId`/`name`, `points`, and optional related player identity. Kinds are `foundTruth`, `artistClarity`, `fooledPlayer`, `nobodyFoundIt`, and `perfectTruth`. `ScoreDelta.scoreAfter` is the authoritative resulting total; event points for each recipient sum to that recipient's delta.

## Drawings

Drawings are compact vector stroke documents (`DrawingDoc`: width, height, strokes of color/size/points), not image data URLs. Limits above are enforced on the server; the pad also respects them in `client/src/drawing.ts`.
