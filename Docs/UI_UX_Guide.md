# UI/UX Guiding Star
## Best Ball Portfolio Manager

**Version:** 1.0
**Date:** 2026-04-01

---

## 1. Aesthetic Identity — "Command Deck"

Best Ball Portfolio Manager's visual identity is **Command Deck** — a fusion of *Data-Driven Dashboard* precision and *Scientific/Technical* authority. The aesthetic evokes a professional trading terminal: dark, focused, information-dense, and premium — without feeling cold or intimidating.

### Why This Direction

Serious best-ball drafters managing 50+ rosters need a tool that matches the sophistication of their approach. They're making real-money decisions in 30-second draft windows. The UI must communicate:

- **Competence.** This tool knows what it's doing. Dense data presented with clarity signals expertise.
- **Focus.** Dark surfaces reduce eye strain during long draft sessions and keep attention on the data, not the chrome.
- **Premium quality.** Gold accents on midnight surfaces feel valuable — something worth paying for, not a free hobby project.
- **Native precision.** Every element feels purposefully placed, like cockpit instrumentation — not a bolted-on overlay.

### The Mood in One Sentence

> A midnight control room where gold light picks out exactly the data that matters.

---

## 2. Design Principles

Each principle maps directly to the product vision. When a design decision feels ambiguous, return here.

### Mirror, Not Advisor
The UI describes portfolio state. It never judges whether a portfolio is "good" or "bad."

- **Do:** Show exposure percentages, ADP trends, archetype distributions as neutral facts.
- **Don't:** Use red/green to imply good/bad on portfolio-level views. No health scores, no letter grades, no thumbs-up/thumbs-down iconography on the Dashboard or Exposure views.
- **Exception:** Computed opinions (grades, scores) are permitted in Draft Assistant and Roster Viewer, where the user is evaluating a specific completed roster or making a time-pressured pick — not surveying their portfolio.

### Zero-Config
Every screen must deliver value the moment data is loaded. No setup wizards, no preference panels, no targets to configure.

- **Do:** Ship smart defaults. Auto-select the most useful view. Pre-filter to the most relevant data.
- **Don't:** Show empty states that require configuration. Never add a "Set your target exposure" input.
- **Test:** If a first-time user uploads a CSV, can they understand their portfolio in 60 seconds without clicking a single settings button?

### Shape Over Spreadsheet
Visual patterns communicate faster than numbers. Prioritize charts, sparklines, distributions, and small multiples over raw tables.

- **Do:** Use area charts for ADP trends, pie/donut charts for archetype distribution, sparklines inline with table rows.
- **Don't:** Default to number-heavy tables. If a component is all text and numbers, ask: "Could a visual communicate this faster?"
- **Balance:** Tables are fine for detail views (Exposure Table, Player Rankings) — but even there, embed sparklines and color-coded badges to create visual anchors.

### Layered Depth
Present information in progressive layers: headline metrics first, detail on demand.

- **Surface layer:** Dashboard cards with single headline numbers (total rosters, top exposure, portfolio CLV).
- **Detail layer:** Clicking a card or switching tabs reveals the full breakdown.
- **Deep layer:** Individual roster or player drill-downs.
- **Rule:** Most users will glance at headlines and leave. That's success. Don't force depth.

### Dashboard-First Navigation
The Dashboard is home. Tabs are neighborhoods you visit when the Dashboard reveals something worth exploring.

- **Hierarchy:** Dashboard > Detail Tab > Individual Record.
- **Navigation:** Tab bar is always visible. Active tab is unmistakable. Dashboard tab is first and visually distinct.
- **Return:** Every drill-down should have a clear path back to Dashboard.

### Transparency Builds Trust
Show your work. When displaying a metric, make it obvious where the number comes from.

- **Do:** Include small "N rosters" counts next to percentages. Show "based on ADP from [date]" labels. Use tooltips to explain calculations.
- **Don't:** Display opaque composite scores without breakdown. If a user can't verify a number against their own data, they won't trust it.

---

## 3. Color System — Midnight Gold

### Philosophy
Dark surfaces reduce fatigue during draft sessions and create a premium atmosphere. Gold (#E8BF4A) is the singular brand accent — warm, distinctive, and impossible to confuse with position-coded colors. Every color has a job; decorative color is banned.

### Surface Hierarchy (Depth Through Darkness)

| Token | Hex | Role |
|-------|-----|------|
| `--surface-0` | `#060E1F` | App background, deepest layer |
| `--surface-1` | `#0C1A30` | Cards, elevated containers |
| `--surface-2` | `#142440` | Hover states, interactive surfaces |
| `--surface-3` | `#1C3055` | Raised interactive elements, active states |

**Rule:** Deeper = further back. Each surface layer is one step lighter. Never skip layers (don't place surface-3 directly on surface-0 without an intermediate container).

### Brand Accent — Gold

| Token | Value | Usage |
|-------|-------|-------|
| `--accent` | `#E8BF4A` | Primary actions, active states, brand moments |
| `--accent-hover` | `#F0CC5B` | Hover state for accent elements |
| `--accent-muted` | `rgba(232, 191, 74, 0.15)` | Background tint for active filters, selected states |
| `--accent-glow` | `rgba(232, 191, 74, 0.35)` | Glow effects, focus rings |
| `--gradient-accent` | `linear-gradient(135deg, #F0CC5B 0%, #D4A843 50%, #E8BF4A 100%)` | Primary buttons, h1 gradient text |

**Gold is reserved for action and emphasis.** Don't dilute it by applying gold to decorative elements. If everything glows gold, nothing does.

### Text

| Token | Hex | Usage |
|-------|-----|-------|
| `--text-primary` | `#E8E8E8` | Main content, headings, data values |
| `--text-secondary` | `#8A9BB5` | Labels, descriptions, column headers |
| `--text-muted` | `#5A6A80` | Placeholders, disabled text, tertiary info |
| `--text-inverse` | `#060E1F` | Text on gold/light backgrounds |

### Borders

| Token | Hex | Usage |
|-------|-----|-------|
| `--border-subtle` | `#1A2D50` | Default container borders, dividers |
| `--border-default` | `#243A5C` | Emphasized borders, input fields |
| `--border-strong` | `#2E4A6E` | High-emphasis borders, active containers |

### Semantic Colors

| Token | Hex | Usage |
|-------|-----|-------|
| `--positive` | `#2ECC71` | Upward trends, positive CLV, gains |
| `--negative` | `#E74C3C` | Downward trends, negative CLV, losses |
| `--info` | `#3B82F6` | Informational callouts, links |

**Mirror Principle constraint:** Positive/negative colors are used for *directional data* (ADP trending up/down, CLV above/below zero) — never for *judgmental evaluation* (good portfolio/bad portfolio). A 40% exposure to one player is neither green nor red; it's a fact.

### Position Colors

| Position | Color | Background |
|----------|-------|------------|
| QB | `#BF44EF` (Purple) | `rgba(191, 68, 239, 0.15)` |
| RB | `#10B981` (Green) | `rgba(16, 185, 129, 0.15)` |
| WR | `#F59E0B` (Amber) | `rgba(245, 158, 11, 0.15)` |
| TE | `#3B82F6` (Blue) | `rgba(59, 130, 246, 0.15)` |

Position colors are the **only** place multiple hues appear simultaneously. They're functional, not decorative — used in badges, filter chips, chart series, and position-coded table rows.

---

## 4. Typography

### Font Pairing

| Role | Font | Weight(s) | Rationale |
|------|------|-----------|-----------|
| Headlines & Data | **JetBrains Mono** | 400, 500, 700 | Monospace communicates precision and technical authority. Numbers align perfectly in columns. Creates the "command deck" feel. |
| Body & UI | **DM Sans** | 400, 500, 600 | Geometric sans-serif that's warm enough to be approachable but clean enough not to compete with data. Excellent legibility at small sizes. |

### Type Scale

| Token | Size | Usage |
|-------|------|-------|
| `--text-xs` | `0.7rem` | Footnotes, chart axis labels |
| `--text-sm` | `0.8rem` | Badges, filter chips, table secondary data |
| `--text-base` | `0.9rem` | Default body text, table cells |
| `--text-md` | `1rem` | Emphasized body text, form labels |
| `--text-lg` | `1.15rem` | Section titles, card headers |
| `--text-xl` | `1.4rem` | Tab section headers |
| `--text-2xl` | `2rem` | Page-level headers |

### Usage Rules

- **JetBrains Mono for:** h1, section headers, metric values (exposure %, ADP numbers, roster counts), data table cells with numeric content, tab labels.
- **DM Sans for:** body paragraphs, descriptions, tooltips, form inputs, button labels, navigation text.
- **Section titles:** Uppercase, `letter-spacing: 0.05em`, `--text-secondary` color, JetBrains Mono. Creates visual separation without adding weight.
- **Metric values:** JetBrains Mono, `--text-primary`, larger than surrounding text (typically `1.7rem`). Numbers are the hero — they should be the first thing the eye lands on.

### Responsive Typography
- Desktop: Scale as defined above.
- Tablet (600–899px): Reduce h1 and metric values by ~15%.
- Mobile (<600px): Reduce all sizes one step. h1 drops from `2.5rem` to `1.8rem`. Metric values drop from `1.7rem` to `1.3rem`.

---

## 5. Component Patterns

### Cards

The fundamental container for all content groups.

```
Background:   var(--surface-1)
Border:       1px solid var(--border-subtle)
Radius:       12px
Padding:      1.25rem 1.9rem
Shadow:       0 1px 3px rgba(0, 0, 0, 0.2)
Margin-bottom: 0.65rem
```

- Cards sit on `surface-0`. They never float above other cards (no stacked card depth).
- Hover state (if interactive): background shifts to `surface-2`, border to `border-default`.

### Buttons

**Primary (Gold Gradient):**
```
Background:   var(--gradient-accent)
Color:        var(--text-inverse)
Padding:      0.65rem 1.55rem (standard) | 1.25rem 2.5rem (large)
Radius:       8px
Hover:        translateY(-1px), enhanced box-shadow
Active:       translateY(0), reduced shadow
```

**Ghost (Secondary):**
```
Background:   transparent
Border:       1px solid var(--border-default)
Color:        var(--text-secondary)
Hover:        background var(--surface-2), color var(--text-primary)
```

**Rule:** One primary button per visual group. If there are two actions, one is primary (gold), one is ghost.

### Tab Bar

```
Container:    var(--surface-1), padding 5px, radius 10px, border 1px solid var(--border-subtle)
Active tab:   Gold gradient background, dark text, shadow 0 1px 6px rgba(232, 191, 74, 0.4)
Inactive tab: Transparent, var(--text-secondary)
Hover:        var(--surface-2) background
```

The active tab's gold glow is one of the strongest brand moments in the UI. It should feel like a lit indicator on an instrument panel.

### Tables

```
Layout:       table-layout: fixed (predictable column widths)
Header:       Sticky, z-index 1, uppercase, letter-spacing 0.05em, var(--text-secondary)
Row hover:    var(--surface-2) background
Cell padding: 1rem 1.25rem
Row border:   1px solid var(--border-subtle) bottom
```

- Numeric columns right-align. Text columns left-align.
- Embed sparklines in table cells where ADP trend context adds value.
- Use position-color badges inline — never color entire rows by position.

### Filter Chips

```
Default:      border-radius 20px, padding 0.35rem 0.75rem, border 1px solid var(--border-subtle)
Active:       background var(--accent-muted), border-color var(--accent), color var(--accent)
Position:     Use position-specific colors with matching translucent backgrounds
```

Chips should feel tactile — small, rounded, clearly tappable. Active state must be unmistakable at a glance.

### Inputs

```
Background:   var(--surface-2)
Border:       1px solid var(--border-subtle)
Focus:        border-color var(--accent), subtle glow ring
Radius:       6–8px
Placeholder:  var(--text-muted)
```

### Tooltips

```
Background:   var(--surface-3)
Border:       1px solid var(--border-default)
Color:        var(--text-primary)
Radius:       8px
Shadow:       0 4px 12px rgba(0, 0, 0, 0.3)
Max-width:    280px
```

Tooltips are a key Transparency tool — use them to explain how metrics are calculated.

---

## 6. Motion & Interaction

### Timing Tokens

| Token | Value | Usage |
|-------|-------|-------|
| `--duration-fast` | `120ms` | Hovers, focus states, micro-interactions |
| `--duration-normal` | `200ms` | Tab switches, card transitions, filter changes |
| `--ease-default` | `cubic-bezier(0.25, 0.1, 0.25, 1)` | All transitions |

### Entry Animation

```css
@keyframes fadeSlideIn {
  from { opacity: 0; transform: translateY(8px); }
  to   { opacity: 1; transform: translateY(0); }
}
```

Applied to tab content on switch. Stagger child elements: 0ms, 60ms, 120ms, 180ms delay for the first four cards/sections. Creates a subtle "instruments lighting up" cascade.

### Hover States

- **Buttons:** `translateY(-1px)` lift + enhanced shadow.
- **Cards (interactive):** Background shift to `surface-2` + border to `border-default`.
- **Table rows:** Background shift to `surface-2`.
- **Filter chips:** Border and text color shift to accent.

### Principles

- **No animation should delay a user action.** Transitions are instant feedback, not ceremonies. A drafter in a 30-second pick window cannot wait for a 500ms animation to complete.
- **Motion is subtle.** 8px translate, not 40px. The UI should feel responsive, not bouncy.
- **CSS-only when possible.** Avoid JS-driven animation for standard interactions. Reserve JS animation for chart rendering (Recharts handles this).

---

## 7. Chrome Extension Design

### Core Principle: Native, Not Bolted-On

The Chrome extension — especially the draft overlay — must feel like a natural part of the draft platform, not a separate panel stapled to the side. This is the #1 competitive differentiator vs. Best Ball Overlay, which streamers reject as distracting.

### Popup (280px Fixed Width)

The popup is a compact status panel. Same Midnight Gold aesthetic, scaled down:

- Font size: `13px` base (vs `14.4px` in the web app).
- Padding: Tighter — `12px` container padding, `8px` element spacing.
- h1: JetBrains Mono, `15px`, gradient text.
- Inputs/buttons: Same styling as web app, proportionally scaled.
- Status indicators: Monospace, `12px`.

**Popup is for configuration and status, not analytics.** Keep it minimal — the web app is where analysis happens.

### Draft Overlay

The overlay injects information directly into the draft platform's player rows — inline annotations, not floating panels.

- **Match the platform.** Use the adapter's `getStyles()` to inherit the host platform's font, spacing, and color conventions.
- **Minimal footprint.** Show exposure %, ADP delta, and one sparkline per player row. Nothing more. The drafter should process the annotation in under 1 second.
- **Subdued presence.** Use muted text colors and small font sizes. The overlay data is secondary to the platform's native draft UI. It whispers, it doesn't shout.
- **No floating panels.** No sidebar. No modal overlays. No popups triggered during active drafting. Information lives inline, where the user's eyes already are.

### Why This Matters

Streamers and serious drafters are the target early adopters. If they feel the extension is distracting or "overlay-y," they won't use it, won't recommend it, and won't stream with it. The extension must feel invisible until you need it, then instantly useful.

---

## 8. Responsive Design

### Breakpoints

| Name | Width | Layout |
|------|-------|--------|
| Desktop | 900px+ | Full layout — 2-column grids, expanded tab bar, sidebar space |
| Tablet | 600–899px | Condensed — 2–3 column grids, compact spacing |
| Mobile | <600px | Stacked — single column, collapsible sections, touch-optimized |

### Mobile-Specific Rules

- **Touch targets:** Minimum 44x44px for all interactive elements.
- **Tab bar:** Horizontally scrollable if tabs overflow. Active tab always visible.
- **Tables:** Horizontal scroll with sticky first column (player name). Consider card-based layouts for tables with 5+ columns.
- **Charts:** Respect container width. Simplify tooltips on touch (tap to reveal, not hover).
- **Padding:** Reduce to `0.5rem 0.75rem` on cards. Reduce gaps to `8px`.

### Mobile is a Draft Companion

Drafters check portfolios on their phone between drafts. The mobile experience should answer "what do I own?" in one glance — Dashboard headline metrics, top exposures, and nothing else that requires horizontal scrolling or complex interaction.

---

## 9. Data Visualization

### Chart Styling

All charts (Recharts) follow the Midnight Gold palette:

- **Background:** Transparent (inherits card surface).
- **Grid lines:** `var(--border-subtle)`, dashed, `opacity: 0.5`.
- **Axis labels:** JetBrains Mono, `--text-xs`, `--text-secondary`.
- **Tooltips:** Match the component tooltip style (surface-3, border-default, 8px radius).
- **Series colors:** Use position colors for position-segmented data. Use gold accent for single-series charts. Use a muted blue-to-gold gradient for non-position data.

### Sparklines

Small inline charts embedded in table cells or cards. No axes, no grid, no labels — just the shape of the trend.

- **Width:** 60–80px.
- **Height:** 20–28px.
- **Stroke:** 1.5px, position color or `--text-secondary`.
- **Purpose:** Instant pattern recognition. "Is this player's ADP rising or falling?" should be answered by glancing at the sparkline, not reading a number.

### Mirror Principle in Charts

- **Neutral framing.** An ADP trend line going up isn't "bad" and going down isn't "good" — it's market movement. Don't color-code the direction on portfolio-level views.
- **Exception:** CLV (Closing Line Value) is inherently directional — positive means you got value, negative means you overpaid. Green/red is appropriate here because it's describing a mathematical fact about price difference, not judging portfolio quality.

---

## 10. Anti-Patterns — What We Never Do

| Anti-Pattern | Why |
|-------------|-----|
| Glass morphism / frosted glass | Reduces readability of data-dense views. Feels trendy, not purposeful. |
| Generic SaaS blue (#3B82F6) as primary accent | We're gold. Blue is reserved for TE position and info callouts. |
| Red/green good/bad on portfolio views | Violates Mirror, Not Advisor. Portfolio state is neutral. |
| Floating overlay panels during live drafts | Violates "native, not bolted-on." Inline annotations only. |
| Configuration wizards or target-setting flows | Violates Zero-Config. If it needs setup, redesign it. |
| Opaque composite scores without breakdown | Violates Transparency. Show the calculation or don't show the score. |
| Animation delays on user actions | Drafters operate in 30-second windows. UI must be instant. |
| Multiple competing accent colors | Gold is the accent. Position colors are functional. That's the full palette. |
| Light theme | The entire brand identity is built on dark surfaces. A light mode would require a parallel design system and dilute brand recognition. |

---

## 11. Accessibility

### Non-Negotiables

- **Contrast:** All text meets WCAG AA (4.5:1 for body text, 3:1 for large text). Current palette achieves ~12:1 for primary text on surface-0.
- **Keyboard navigation:** All interactive elements are reachable via Tab. Focus rings use `--accent-glow`.
- **Semantic HTML:** Tables use `<thead>`, `<th>`, `scope`. Charts include `aria-label` descriptions.
- **Color independence:** Never rely on color alone to convey information. Pair position colors with text labels (QB, RB, WR, TE). Pair trend colors with directional icons (arrow up/down).
- **Touch targets:** 44x44px minimum on all interactive elements.

### Dark Theme Accessibility

Dark themes create specific challenges:
- Avoid pure white (`#FFFFFF`) text — it causes halation on dark backgrounds. `#E8E8E8` is the ceiling.
- Maintain sufficient contrast between surface layers. Each step should be visibly distinct.
- Ensure gold accent text remains legible against all surface levels.

---

## Quick Reference — Design Decision Checklist

When building or reviewing any new UI element, verify:

1. **Does it show data without judging it?** (Mirror, Not Advisor)
2. **Does it work immediately with no configuration?** (Zero-Config)
3. **Could a visual replace a number?** (Shape Over Spreadsheet)
4. **Is detail progressive, not forced?** (Layered Depth)
5. **Does the Dashboard remain the entry point?** (Dashboard-First)
6. **Can the user verify the calculation?** (Transparency)
7. **Is gold reserved for action/emphasis only?** (Brand discipline)
8. **Does motion serve speed, not ceremony?** (Draft-time performance)
9. **Would a streamer feel comfortable using this on camera?** (Extension: native feel)
10. **Does it work on a phone between drafts?** (Mobile companion)

---

*This document is the aesthetic authority for Best Ball Portfolio Manager. For product direction and feature scope, see `Vision_and_Scope.md`. For detailed feature behavior, see `Feature_Specs/`.*
