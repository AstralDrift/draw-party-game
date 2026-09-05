# Draw Party Design System

Implementation lives under `client/src/design/` (tokens, base, components, drawing, layout, motion, glass, and the final show layer). This document is the sole implementation-binding design contract; keep CSS tokens aligned when either side changes. The repository-root `DESIGN.md` is historical reference only, and discrepancies resolve in favor of this document.

## 1. Atmosphere & Identity

Draw Party is a living-room comedy game show: frosted glass over a deep charcoal stage, huge punchline typography, player-color accents, and a few hand-drawn marks. The glass provides clarity; the drawings, ridiculous titles, and earned reactions provide personality. The signature is frosted glass — hairline borders, gentle blur, and layered depth — never neon arcade chrome, purple SaaS gradients, cream/terracotta editorial, or newspaper density.

## 2. Color

Party play is dark-first (TV living rooms). Tokens below are the product palette; light mode is not required for v1.

### Palette

| Role | Token | Value | Usage |
|------|-------|-------|-------|
| Atmosphere | `--bg-deep` | `#05060a` | Page root |
| Atmosphere glow A | `--glow-a` | `rgba(0, 113, 227, 0.28)` | Soft blue orb |
| Atmosphere glow B | `--glow-b` | `rgba(120, 190, 255, 0.14)` | Cool rim light |
| Atmosphere glow C | `--glow-c` | `rgba(255, 255, 255, 0.06)` | Soft highlight wash |
| Surface glass | `--surface-glass` | `rgba(255, 255, 255, 0.08)` | Panels |
| Surface glass strong | `--surface-glass-strong` | `rgba(255, 255, 255, 0.12)` | Elevated panels |
| Surface glass soft | `--surface-glass-soft` | `rgba(255, 255, 255, 0.05)` | Nested wells |
| Surface TV | `--surface-tv` | `rgba(12, 14, 22, 0.88)` | Display shell opaque glass |
| Surface TV soft | `--surface-tv-soft` | `rgba(12, 14, 22, 0.78)` | Display soft panels |
| Surface TV strong | `--surface-tv-strong` | `rgba(16, 18, 28, 0.92)` | Display elevated panels |
| Border hairline | `--border-hairline` | `rgba(255, 255, 255, 0.16)` | Glass edges |
| Border strong | `--border-strong` | `rgba(255, 255, 255, 0.28)` | Focused containment |
| Text primary | `--text-primary` | `#f5f5f7` | Headlines, body |
| Text secondary | `--text-secondary` | `#a1a1a6` | Hints, captions |
| Text tertiary | `--text-tertiary` | `#6e6e73` | Fine print |
| Accent | `--accent` | `#0071e3` | Primary CTAs |
| Accent hover | `--accent-hover` | `#0077ed` | Hover |
| Accent soft | `--accent-soft` | `rgba(0, 113, 227, 0.22)` | Soft fills |
| Success | `--status-success` | `#30d158` | Ready / online |
| Warning | `--status-warning` | `#ffd60a` | Urgent timers |
| Danger | `--status-danger` | `#ff453a` | Errors |
| Canvas | `--canvas` | `#ffffff` | Drawing surface |
| Artwork surface | `--surface-art` | `#fbfcff` | Explicit opaque drawing and reveal surface |
| Ink | `--ink` | `#1d1d1f` | On-canvas / QR dark |

Player identity uses eight non-purple accents (`--player-accent-0` through `--player-accent-7`): blue, cyan, mint, lime, yellow, orange, coral, and slate. Accents decorate identity rails, doodle badges, the fake stamp, and earned awards; names remain white and state remains explicit text.

### Rules
- Blue action accent identifies controls and focus. Player accents may decorate identity, show stamps, and awards; keep names and meaning explicit.
- Depth comes from glass translucency + blur + hairlines, not heavy drop shadows.
- Never introduce purple, magenta neon, or warm cream brand fills.

## 3. Typography

### Font Stack
- Display: `Syne`, fallbacks `Segoe UI Display`, `Avenir Next`, sans-serif
- Body: `DM Sans`, fallbacks `Segoe UI`, `Helvetica Neue`, sans-serif
- Mono (codes): `IBM Plex Mono`, fallbacks `ui-monospace`, monospace

Syne carries the brand mark and TV headlines; DM Sans handles controller UI. Avoid Inter, Roboto, Arial, and bare system UI as the primary voice.

### Scale

| Level | Size | Weight | Line Height | Tracking | Usage |
|-------|------|--------|-------------|----------|-------|
| Display | clamp(2.5rem, 5vw, 4.5rem) | 700 | 1.05 | -0.03em | Brand / room code |
| H1 | clamp(1.75rem, 3vw, 2.75rem) | 700 | 1.15 | -0.02em | Phase titles |
| H2 | clamp(1.35rem, 2.2vw, 1.85rem) | 600 | 1.2 | -0.015em | Panel titles |
| Body lg | 1.125rem | 400 | 1.45 | 0 | Lead copy (TV) |
| Body | 1rem | 400 | 1.45 | 0 | Phone body |
| Caption | 0.8125rem | 500 | 1.35 | 0.02em | Labels, meta |
| Overline | 0.6875rem | 600 | 1.3 | 0.14em | Eyebrows (uppercase) |

Display-only responsive tokens keep secondary TV content couch-readable: `--display-body: clamp(1rem, 0.63vw, 1.5rem)`, `--display-meta: clamp(0.8125rem, 0.47vw, 1.125rem)` (floored at 18px from 3200px wide), and `--display-panel-title: clamp(1.25rem, 0.83vw, 2rem)`.

## 4. Spacing & Layout

Base unit: **4px**.

| Token | Value | Usage |
|-------|-------|-------|
| `--space-1` | 4px | Icon gaps |
| `--space-2` | 8px | Compact inline |
| `--space-3` | 12px | Dense padding |
| `--space-4` | 16px | Default control padding |
| `--space-5` | 20px | Panel inner |
| `--space-6` | 24px | Section gaps |
| `--space-8` | 32px | Panel padding |
| `--space-10` | 40px | Major gaps |
| `--space-12` | 48px | TV breathing room |
| `--touch` | 52px | Minimum interactive target |
| `--radius-sm` | 12px | Controls |
| `--radius-md` | 20px | Panels |
| `--radius-lg` | 28px | Hero glass shells |
| `--radius-pill` | 999px | CTAs |

TV shell: centered, max ~2520px, one composition per phase. Phone shell: max 680px, safe-area aware, large tap targets.

Every interactive control has a hit box of at least 52×52 CSS pixels, including compact inputs and selects, drawing tools, vote options, share/replay actions, and TV fallback controls. Icons and visible glyphs may be smaller, but the interactive box may not opt out of `--touch` to save layout space.

Results use one full TV composition per beat: drawing hold, two-column lettered vote tally, an oversized best-fake spotlight, truth beside the art, then standings. Eight-player standings use two columns with point gains, totals, and rank movement. Continue appears only after the score beat. Phone results remain a single-column look-up companion until the server unlocks personal points.

## 5. Elevation & Depth

| Level | Treatment |
|-------|-----------|
| Atmosphere | Radial glows on deep black |
| Glass base | `.glass-panel`: `backdrop-filter: blur(var(--blur-glass)) saturate(140%)`, hairline border, inset highlight |
| Soft / strong | Phone/controller: fill opacity only, same blur. Display shell: use `--surface-tv*` opaque fills with blur disabled |

TV display shell uses opaque glass fills (no `backdrop-filter`) and skips enter transforms — TV Bro / living-room WebViews otherwise ghost or clip lobby type. QR sizing is stage-driven (`vh` with `svh` progressive enhancement) so canvases never keep a 640px intrinsic size that overlaps the join URL. The TV Start fallback is a Play icon beside Sound once the party can start — no Start Party label and no extra panel, so late joiners still see the QR. The TV lobby has no Scan to play eyebrow and no look-back subtitle; the pitch, QR, and four-letter code are the join — no Room Code label. The can’t-scan URL is recovery type (secondary, not action-high) so it does not compete with the code from the couch. Roster count lives on the players column with no Players heading and no Ready pills. Phone seating count is host-only — non-host phones watch the TV. Pace and pack live on the host phone — not on the TV. The TV Continue and Play Again fallbacks appear after the punchline and podium beats as icons — like Start — not as labeled chrome during the show. Download Podium waits with Play Again so the podium owns the cheer. The TV reveal clock waits for the score beat with no Next drawing in eyebrow. Reveal hold is the drawing with no artist eyebrow; tally pairs lettered titles with vote counts while hiding authors and truth; spotlight stamps the best fake and credits its authors and fooled voters; truth pairs the actual prompt with the drawing and artist; scores own the next beat and open with the room outcome. Progress on the TV is the count and the names still out — no Waiting on coach line and no roster of status pills. Vote TV is the lettered titles — no drawing column and no Which title is real headline. The vote wait count lives in the header. Phone vote letters stay aligned with the TV; the player’s own letter is marked Yours in a reserved caption so it is not a dead tap. Guessing is the drawing — no What did they draw headline and no By artist eyebrow. The wait count lives in the header. TV rematch is the podium — no look-up eyebrow and no second rematch headline. Phone reveal is `Look up`; personal points wait until the punchline is over, and a blank reveal stays Look up. The host Continue appears after the punchline. Reveal phones have no reaction bar. Join is the code as the eyebrow after a scan, then the name field: no how-to paragraph, no “Room found” chip, no seating interstitial, no second headline, and no kickoff spectator fine-print. Change room is ghost recovery under Join the Party, not a second wide button. TV lobby audio is an icon on the players column that opens Off, Effects, and Music + Effects; the control stays available during play. Music is sparse and original, drops out for Results, and ducks under cues. Phones never play music. Audio starts after a gesture and stops on mute, disconnect, or hidden tabs. The drawing prompt is the secret itself, not a `Draw:` prefix or a round eyebrow — round count stays on the TV. On phones the secret owns the header width; the clock sits under it. During Drawing the TV is the round, the clock, and the count — no Phones are drawing headline. Late joiners are a name line, not a second roster (spectating lives in the accessible name). After ink locks, the secret leaves the phone (`Look up` / `Watch the TV.`). Guessing keeps the drawing on the TV at living-room size — no 720px postcard, no What did they draw headline, and no By artist eyebrow. Hold is the drawing with no artist eyebrow. Voting is the lettered titles. Phones type and tap without a second TV coach. Guessing phones are the title field, focused and sized for thumbs and given the leftover screen; they skip the TV's "fool the room" headline. Voting phones show letters only; they skip "which one is real" and do not print "Your fake answer" on the letter. The player’s own letter is marked Yours in a reserved caption so a dead tap is obvious while every letter stays the same size as the TV. Phone drawing, guess, vote, reveal, and rematch hide the app topbar so the job owns the screen; reconnect overlays timed phone jobs instead of shoving the pad, title, or letters. TV hides the Draw Party topbar during the party so the QR and the show own the stage. Host +30 seconds is icon-only and stays off fake-title and vote jobs until that phone looks up. Titles stay on the TV. Vote letters outrank the reaction bar until a vote locks. Locked phone submits wait for input instead of a dead primary button. Drawing submit waits for ink; fake-title submit waits for text. Guessing, voting, and host Continue phones have no countdown — the clock stays on the TV. Join and fake-title phones lift Submit above the on-screen keyboard (visual viewport inset; Android also resizes content). After a drawing, title, or vote locks, the phone says `Watch the TV.` A locked vote also drops the letter grid. Nailed-it skippers look up with no second canvas. The TV lobby count is `Need N+ phones.` on the roster — not under the QR. Host pace presets have no how-to subtitle and no Advanced timer fields — Quick, Standard, or Relaxed, plus a prompt pack. Spectator phones are `Look up`; Spectating and you play next round live in the accessible name — no phone canvas, banner, or progress list. Lobby spectators watch the TV the same way — no Spectating pill. TV roster names have no Watching pills. Ready phones do not repeat host-phone copy; the host Start Party button is the start. The phone name control shows the player’s name (accessible name Edit name); there is no “you’re the host” eyebrow and no 1/8 ready fraction. Phone lobby does not duplicate the TV roster and does not restage the count as a headline. Only the host phone keeps the room code, to shout it. Can’t-scan recovery is the join URL only (the phrase lives in the accessible name); the room code stays on the QR column. The drawing button appears after ink (`Submit Drawing`); there is no Draw first overlay on an empty pad. Idle submit help stays off. Phone drawing tools are an icon and a color disc — not `Tools · black · 6px` on the art. On phones the chip sits in the clock row so the art is ink, not a control overlay. Phone reveal is `Look up`; personal points wait until the punchline is over, and a blank reveal stays Look up. The host Continue appears after the punchline. Results hide the lettered titles on the correct beat and hide the leftover prompt on the score beat so an 8-player 4K room keeps one punchline at a time. The 8-player tally and standings stay inside the TV frame. TV standings show gains, totals, and movement; personal score events stay on phones. Rematch phones cheer the podium; only the host sees Play Again, and it waits for the podium beat with no wait copy. Share stays a TV fallback after the same podium beat. The podium has no extra Final Podium title. Host pace presets have no Room Settings heading. Validate display CSS with `npm run e2e:tv` (geometry) and `npm run e2e:tvbro` (WebView-shaped pixel baselines); optional real-APK glance: `npm run review:tvbro:device` (see [contributing.md](contributing.md#tv-layout-gate-living-room--tv-bro)).

Shadows are soft and short (`0 12px 40px rgba(0,0,0,0.35)`), never hard pixel-offset arcade shadows.

Backdrop blur is capped at 18px and reserved for outer chrome/panels. Nested roster, score, answer, podium, and empty-state rows use tonal fills, hairlines, and inset highlights without backdrop blur or floating shadows. Drawing and reveal canvases remain fully opaque.

## 6. Motion

| Token | Value |
|-------|-------|
| `--ease-out` | `cubic-bezier(0.32, 0.72, 0, 1)` |
| `--motion-fast` | 160ms |
| `--motion-med` | 280ms |
| `--motion-slow` | 520ms |

Animate only `transform` and `opacity`. The fake stamp and score arrivals are short accents; reduced motion never skips the suspense or reveals information early. Honor `prefers-reduced-motion: reduce` by collapsing durations to near-zero and disabling decorative ambient motion.

## 7. Components

| Component | Role |
|-----------|------|
| `Atmosphere` | Fixed gradient orbs behind content |
| `Shell` | TV/phone frame + topbar |
| `GlassPanel` | Frosted content surface |
| `Button` | Pill CTA / glass secondary / quiet tool |
| `Field` | Glass input + label |
| Status chips | `.pill` status / meta chips |
| Shell brand | Wordmark via Shell / `.brand` |
| `PlayerList` | Couch-readable roster rows (`.player-row`) |
| `Deadline` | Large countdown on TV (`#deadline-text`). Drawing phones keep a clock; guessing and voting phones do not — the TV holds time. |
| `QrCode` | Join QR |
| `DrawingPadHost` | Mounts stroke pad (1024×768 logical). Phone tools are an icon plus ink swatch; idle stroke count stays off the art. |
| `ReactionBar` | Ephemeral emoji reactions |
| `ProgressPanel` | Submission progress for display |
| `ShowResults` | Server-timed TV tally, fake spotlight, truth, and standings |
| `GameAwards` | Earned finale awards; ties share recognition |
| `AudioControl` | Browser-local Off / Effects / Music + Effects menu |

Do / Don't:
- Do keep TV copy huge and sparse.
- Do keep phone controls thumb-sized.
- Don't clutter the first viewport with stats strips or chip clouds.
- Don't use purple accent or cream paper textures.
