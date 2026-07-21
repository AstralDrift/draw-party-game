# Draw Party Design System

## 1. Atmosphere & Identity

Draw Party feels like a playful object made from darkened glass: calm enough to read across a living room, lively enough to signal that a game is underway, and immediate enough to operate from a phone in a loud room. The signature is **party glass**—deep optical surfaces with bright edge light, a restrained blue action color, and slow ambient illumination that makes the interface feel physical without competing with drawings or game instructions.

## 2. Color

| Role | Token | Value | Usage |
|---|---|---:|---|
| Canvas/deep | `--color-canvas-deep` | `#080b12` | Page and overscroll background |
| Canvas/mid | `--color-canvas-mid` | `#101827` | Atmospheric depth |
| Canvas/high | `--color-canvas-high` | `#17263b` | Lit background regions |
| Glass/default | `--glass-fill` | `rgba(15, 24, 39, 0.58)` | Standard panels |
| Glass/strong | `--glass-fill-strong` | `rgba(19, 30, 49, 0.76)` | Join and task panels |
| Glass/soft | `--glass-fill-soft` | `rgba(255, 255, 255, 0.075)` | Chips and controls |
| Glass/edge | `--glass-edge` | `rgba(255, 255, 255, 0.22)` | Optical containment |
| Glass/highlight | `--glass-highlight` | `rgba(255, 255, 255, 0.42)` | Specular light |
| Text/primary | `--color-text-primary` | `#f7f9ff` | Headlines and primary content |
| Text/secondary | `--color-text-secondary` | `#bdc8d8` | Support text and metadata |
| Text/tertiary | `--color-text-tertiary` | `#8290a5` | Disabled text |
| Accent/action | `--color-action` | `#0a84ff` | Primary actions and focus |
| Accent/action-high | `--color-action-high` | `#64b5ff` | Hover and edge light |
| Status/success | `--color-success` | `#55d6a7` | Connected and submitted |
| Status/warning | `--color-warning` | `#ffd37a` | Deadlines and waiting |
| Status/error | `--color-error` | `#ff6b81` | Errors and destructive actions |
| Drawing/paper | `--color-paper` | `#fbfcff` | Drawing and QR surfaces |
| Artwork/surface | `--surface-art` | `var(--color-paper)` | Explicit opaque drawing and reveal surface |
| Drawing/ink | `--color-ink` | `#101522` | QR and default drawing ink |
| Player/blue | `--player-accent-0` | `#64b5ff` | Stable player identity rail and doodle |
| Player/cyan | `--player-accent-1` | `#4adeda` | Stable player identity rail and doodle |
| Player/mint | `--player-accent-2` | `#55d6a7` | Stable player identity rail and doodle |
| Player/lime | `--player-accent-3` | `#a8e063` | Stable player identity rail and doodle |
| Player/yellow | `--player-accent-4` | `#ffd37a` | Stable player identity rail and doodle |
| Player/orange | `--player-accent-5` | `#ffb86b` | Stable player identity rail and doodle |
| Player/coral | `--player-accent-6` | `#ff8a80` | Stable player identity rail and doodle |
| Player/slate | `--player-accent-7` | `#b8c4d9` | Stable player identity rail and doodle |

- Blue is the only action accent. Ambient blue, cyan, and warm light are atmospheric and never encode controls.
- Player accents identify people only. Ready, offline, watching, host, and score states always remain explicit text.
- Primary content sits on dark glass. Pale surfaces are reserved for drawing paper and QR codes.
- Status colors always include text or shape changes; color is never the only signal.
- Add new colors here before component CSS.

## 3. Typography

| Level | Size | Weight | Line height | Tracking | Usage |
|---|---|---:|---:|---:|---|
| Display | `clamp(2.5rem, 5vw, 5.75rem)` | 700 | 0.94 | -0.055em | Room code and TV hero moments |
| H1 | `clamp(2rem, 3.8vw, 4.5rem)` | 680 | 0.98 | -0.05em | TV phase headline |
| H2 | `clamp(1.75rem, 3vw, 3.25rem)` | 650 | 1.02 | -0.04em | Player and panel headline |
| H3 | `1.25rem` | 650 | 1.2 | -0.025em | Panel title |
| Body/lg | `1.0625rem` | 500 | 1.5 | -0.01em | Lead instruction |
| Body | `1rem` | 450 | 1.5 | -0.006em | Default UI copy |
| Body/sm | `0.875rem` | 500 | 1.45 | 0 | Secondary information |
| Caption | `0.75rem` | 600 | 1.35 | 0.02em | Status and metadata |
| Overline | `0.6875rem` | 700 | 1.25 | 0.14em | Eyebrows and labels |

Display-only responsive tokens keep secondary TV copy readable without inflating phone controls: `--display-body: clamp(1rem, 0.63vw, 1.5rem)`, `--display-meta: clamp(0.8125rem, 0.47vw, 1.125rem)`, and `--display-panel-title: clamp(1.25rem, 0.83vw, 2rem)`.

- Primary: `system-ui, -apple-system, BlinkMacSystemFont, "SF Pro Display", "SF Pro Text", "Segoe UI", sans-serif`.
- Numeric: `"SF Mono", SFMono-Regular, ui-monospace, Menlo, Monaco, Consolas, monospace`.
- TV text must read from roughly ten feet away. Large headings use balanced wrapping.
- Room codes, scores, and countdowns use tabular numeric behavior where applicable.
- Body text never falls below 14px; 12px is metadata only.

## 4. Spacing & Layout

All spacing derives from 4px.

| Token | Value | Usage |
|---|---:|---|
| `--space-1` | `4px` | Tight icon and label spacing |
| `--space-2` | `8px` | Compact groups |
| `--space-3` | `12px` | Control internals |
| `--space-4` | `16px` | Standard gaps |
| `--space-5` | `20px` | Compact panel padding |
| `--space-6` | `24px` | Standard panel padding |
| `--space-8` | `32px` | Major panel padding |
| `--space-10` | `40px` | TV gutters |
| `--space-12` | `48px` | Large display separation |
| `--space-16` | `64px` | 4K separation |

- Display width is 92vw with a 2520px cap so 4K layouts retain couch-readable scale.
- The display lobby uses a primary join stage plus a narrower utility rail.
- Player layouts use one column on phones and task-oriented columns on tablets.
- Breakpoints: 520px compact phone, 700px tablet, 1120px narrow display, 1600×840 low-height TV, 1800px large TV, 3200px 4K.
- Host screens must not scroll at supported TV targets; drawing remains the largest player surface; touch controls remain at least 44px.
- Results are a two-column TV scene: drawing and truth on the left, labeled answers and causal score events on the right, with a compact always-visible Continue/next rail. Phones use a single-column look-up companion.

## 5. Components

### Optical Glass Panel

- **Structure**: semantic section with specular pseudo-elements and content above them.
- **Variants**: default, strong task panel, compact chip, toolbar.
- **Spacing**: `--space-5` through `--space-8`.
- **States**: default, focus-within, ready, warning, disabled.
- **Accessibility**: fallback fill maintains contrast without backdrop filtering.
- **Motion**: slow transform-only sheen, removed for reduced motion.

### Primary Action Capsule

- **Structure**: button with a Lucide symbol and text label.
- **Variants**: standard, wide, spotlight, disabled.
- **Spacing**: `--space-3` block and `--space-5` inline.
- **States**: default, hover, active, focus-visible, disabled.
- **Accessibility**: visible text, 44px minimum target, high-contrast focus halo.
- **Motion**: scale and translate response between 140ms and 220ms.

### Status Capsule

- **Structure**: state orb plus concise text.
- **Variants**: online, reconnecting, idle.
- **Spacing**: `--space-2` and `--space-3`.
- **States**: online glow, reconnecting pulse, neutral idle.
- **Accessibility**: explicit text updates independently of the decorative orb.
- **Motion**: opacity pulse only while reconnecting.

### Drawing Surface

- **Structure**: white vector canvas in a glass stage with compact tools and submit dock.
- **Variants**: phone drawing, phone reveal, TV reveal.
- **Spacing**: canvas-first with controls using `--space-2` through `--space-4`.
- **States**: empty, has ink, submitted, focus-visible.
- **Accessibility**: focus outline and non-color stroke-count feedback.
- **Motion**: the drawing surface itself remains stable.
- **Phone portrait**: rotate the fixed 4:3 drawing document into a 3:4 physical surface and inverse-map touch input, preserving the drawing's geometry when it appears on the TV.

### Empty State

- **Structure**: Lucide symbol, primary message, optional supporting line.
- **Variants**: player list and submission list.
- **Spacing**: `--space-4` through `--space-6`.
- **States**: neutral waiting.
- **Accessibility**: visible text always accompanies the decorative symbol.
- **Motion**: gentle opacity breathing on the symbol only.

### Player Identity

- **Structure**: stable ID-derived accent rail, hand-drawn initial badge, white name, explicit status text, optional score, and Host text badge.
- **Color**: identity accents never replace status text and never reveal answer authors before results.
- **Motion**: a newly mounted row may show a brief opacity-only doodle stamp; reduced motion renders it immediately.

## 6. Motion & Interaction

| Type | Duration | Easing | Usage |
|---|---:|---|---|
| Micro | 140ms | `cubic-bezier(0.2, 0.8, 0.2, 1)` | Press and selection |
| Standard | 240ms | `cubic-bezier(0.2, 0.8, 0.2, 1)` | Focus and panel state |
| Emphasis | 560ms | `cubic-bezier(0.16, 1, 0.3, 1)` | Phase and hero entry |
| Ambient | 10–18s | `ease-in-out` | Background light and sheen |

- Continuous motion is atmospheric and slow; task surfaces remain stable.
- Animated properties are limited to `transform`, `opacity`, and `filter`.
- Pointer light runs only on fine pointers and updates one transform layer.
- Reduced motion removes ambient and celebratory movement while retaining state feedback.

## 7. Depth & Surface

The strategy is mixed optical depth: tonal shifts and material edges do most of the work, with restrained shadows for floating glass and drawing paper.

| Level | Treatment | Usage |
|---|---|---|
| Canvas | Dark atmospheric field | Page background |
| Glass/soft | 7.5% white tint and hairline | Chips and secondary controls |
| Glass/default | 58% dark optical fill, blur, edge light | Standard panels |
| Glass/strong | 76% dark optical fill and stronger edge | Join and turn panels |
| Floating | Cool shadow plus top highlight | Top bar, QR stage |
| Paper | Near-white with neutral shadow | Drawing and reveal canvases |

Glass remains readable without backdrop-filter support. Avoid equal opacity across nested surfaces; child layers must be clearly lighter or darker than their parent.
Backdrop blur never exceeds 18px. It belongs to outer chrome and panels only; roster rows, score rows, answer rows, podium places, and empty states use stable tonal fills without backdrop blur or floating shadows.
