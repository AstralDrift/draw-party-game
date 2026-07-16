# Draw Party Design System

## 1. Atmosphere & Identity

Draw Party should feel like a living-room apple-glass night: soft translucent surfaces floating over a deep charcoal stage, with quiet blue accents and couch-readable type. The signature is frosted glass — hairline borders, gentle blur, and layered depth — never neon arcade chrome, purple SaaS gradients, cream/terracotta editorial, or newspaper density.

## 2. Color

Party play is dark-first (TV living rooms). Tokens below are the product palette; light mode is not required for v1 glass rewrite.

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
| Ink | `--ink` | `#1d1d1f` | On-canvas / QR dark |

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

## 5. Elevation & Depth

| Level | Treatment |
|-------|-----------|
| Atmosphere | Radial glows on deep black |
| Glass 0 | Soft fill, no blur (scrolling content) |
| Glass 1 | `backdrop-filter: blur(18px) saturate(140%)`, hairline border, inset highlight |
| Glass 2 | Stronger fill + blur for sticky bars / modals |

Shadows are soft and short (`0 12px 40px rgba(0,0,0,0.35)`), never hard pixel-offset arcade shadows.

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
| `Badge` / `Pill` | Online, score, status chips |
| `BrandMark` | Wordmark treatment |
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
