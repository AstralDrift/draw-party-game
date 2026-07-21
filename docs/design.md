# Draw Party Design System

Implementation lives under `client/src/design/` (tokens, base, components, drawing, layout, motion, and the final glass layer). This document is the product design source of truth; keep CSS tokens aligned when either side changes.

## 1. Atmosphere & Identity

Draw Party should feel like a living-room apple-glass night: soft translucent surfaces floating over a deep charcoal stage, with quiet blue accents and couch-readable type. The signature is frosted glass — hairline borders, gentle blur, and layered depth — never neon arcade chrome, purple SaaS gradients, cream/terracotta editorial, or newspaper density.

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

Player identity uses eight non-purple accents (`--player-accent-0` through `--player-accent-7`): blue, cyan, mint, lime, yellow, orange, coral, and slate. Accents decorate the identity rail and doodle badge; names remain white and state remains explicit text.

### Rules
- Accent is for interactive actions and focus only — not decorative fills.
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

Display-only responsive tokens keep secondary TV content couch-readable: `--display-body: clamp(1rem, 0.63vw, 1.5rem)`, `--display-meta: clamp(0.8125rem, 0.47vw, 1.125rem)`, and `--display-panel-title: clamp(1.25rem, 0.83vw, 2rem)`.

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

Results use a contained two-column scene on TV (truth/art on the left; A-H answers and causal score events on the right) plus a compact always-visible Continue/next rail. Phone results remain a single-column look-up companion.

## 5. Elevation & Depth

| Level | Treatment |
|-------|-----------|
| Atmosphere | Radial glows on deep black |
| Glass base | `.glass-panel`: `backdrop-filter: blur(var(--blur-glass)) saturate(140%)`, hairline border, inset highlight |
| Soft / strong | Phone/controller: fill opacity only, same blur. Display shell: use `--surface-tv*` opaque fills with blur disabled |

TV display shell uses opaque glass fills (no `backdrop-filter`) and skips enter transforms — TV Bro / living-room WebViews otherwise ghost or clip lobby type. QR sizing is stage-driven (`vh` with `svh` progressive enhancement) so canvases never keep a 640px intrinsic size that overlaps the join URL / Start CTA. Validate display CSS with `npm run e2e:tv` (geometry) and `npm run e2e:tvbro` (WebView-shaped pixel baselines); optional real-APK glance: `npm run review:tvbro:device` (see [contributing.md](contributing.md#tv-layout-gate-living-room--tv-bro)).

Shadows are soft and short (`0 12px 40px rgba(0,0,0,0.35)`), never hard pixel-offset arcade shadows.

Backdrop blur is capped at 18px and reserved for outer chrome/panels. Nested roster, score, answer, podium, and empty-state rows use tonal fills, hairlines, and inset highlights without backdrop blur or floating shadows. Drawing and reveal canvases remain fully opaque.

## 6. Motion

| Token | Value |
|-------|-------|
| `--ease-out` | `cubic-bezier(0.32, 0.72, 0, 1)` |
| `--motion-fast` | 160ms |
| `--motion-med` | 280ms |
| `--motion-slow` | 520ms |

Animate only `transform` and `opacity`. Honor `prefers-reduced-motion: reduce` by collapsing durations to near-zero and disabling decorative ambient motion.

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
| `Deadline` | Large countdown (`#deadline-text`) |
| `QrCode` | Join QR |
| `DrawingPadHost` | Mounts stroke pad (1024×768 logical) |
| `ReactionBar` | Ephemeral emoji reactions |
| `ProgressPanel` | Submission progress for display |

Do / Don't:
- Do keep TV copy huge and sparse.
- Do keep phone controls thumb-sized.
- Don't clutter the first viewport with stats strips or chip clouds.
- Don't use purple accent or cream paper textures.
