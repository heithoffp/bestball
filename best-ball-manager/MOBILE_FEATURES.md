# Mobile-Friendly Redesign Plan

## Context

The BestBall Manager app has zero mobile responsiveness — no media queries, no breakpoints, hardcoded pixel widths throughout (320px sidebar, 250px search inputs, 1065px player cards, 594px draft capital maps), and hundreds of inline `style={{}}` objects that cannot respond to media queries. The goal is a fully mobile-native experience that transforms the desktop dashboard into a thumb-friendly tool with progressive disclosure, bottom navigation, card-based layouts, and touch gestures.

## CSS Strategy

**Stay with plain CSS + CSS custom properties, add CSS Modules per component.**

- The codebase is small (6 components, 2 CSS files) — Tailwind adds unnecessary complexity
- The real blocker is inline `style={{}}` objects — they can't use media queries
- Each component gets a `.module.css` file (Vite supports CSS Modules out of the box)
- Dynamic styles (position colors, conditional opacity) stay inline; static layout/spacing moves to CSS classes
- Breakpoints: `0-599px` (mobile), `600-899px` (tablet), `900px+` (desktop)

---

## Phase 0: Foundation

**Goal:** Responsive skeleton — breakpoints, layout primitives, bottom nav, mobile detection hook.

### Files to create
- `src/hooks/useMediaQuery.js` — custom hook returning `{ isMobile, isTablet, isDesktop }` via `window.matchMedia`

### Files to modify
- **`src/index.css`**
  - Add responsive CSS custom properties: `--space-xs/sm/md/lg` with mobile overrides
  - Add media query blocks at `max-width: 599px` and `max-width: 899px`
  - `.app-container`: padding `0.5rem 0.75rem` on mobile (from `1rem 2.5rem`), add `padding-bottom: 64px` for bottom nav
  - `h1`: font-size `1.5rem` on mobile (from `2.5rem`)
  - `.tab-bar` on mobile: `position: fixed; bottom: 0; left: 0; right: 0; z-index: 100;` as CSS grid with equal columns, `padding-bottom: env(safe-area-inset-bottom)`
  - `.tab-button` on mobile: reduced padding, smaller font
  - Add `.touch-target { min-height: 44px; min-width: 44px; }` utility
- **`src/App.jsx`**
  - Use `useMediaQuery` to render Lucide icons in tab buttons on mobile (BarChart3, Users, TrendingUp, ListOrdered, Crosshair, HelpCircle)
  - Condense `<h1>` on mobile
- **`src/App.css`** — Delete dead Vite template styles (#root max-width, .logo, .read-the-docs)

### Verification
- Dev tools at 375px/390px/768px: bottom nav visible, text readable, no horizontal overflow on app shell

---

## Phase 1: ExposureTable Mobile

**Goal:** The most-visited tab becomes fully usable on phones.

### Files to create
- `src/components/ExposureTable.module.css` — extract all ~30 inline style objects

### Files to modify
- **`src/components/ExposureTable.jsx`**
  - **Toolbar**: Stack vertically on mobile. Search input full-width. Checkbox + Reset as horizontal row below.
  - **Filters**: Replace 3 `<select>` dropdowns (each minWidth: 180px) with horizontally scrollable filter chips
  - **Table → Card List**: On `isMobile`, replace `<table>` with card list:
    - Left color border by position
    - Line 1: player name (bold), position badge, team
    - Line 2: exposure %, count, ADP in compact grid
    - Tap to expand: sparkline + details
  - Keep `@tanstack/react-virtual` — change `estimateSize` to ~72px for cards
  - **Sort**: Add sort-by control at top of card list (replaces clickable column headers)
  - **Tablet (600-899px)**: Keep table but adjust colgroup — prioritize Name/Exposure/ADP, hide Sparkline column

### Verification
- 375px: card list renders, search works, filter chips scroll, sort works
- 768px: table with adjusted columns, no horizontal scroll

---

## Phase 2: RosterViewer Mobile

**Goal:** Roster browser usable on phones.

### Files to create
- `src/components/RosterViewer.module.css` — extract the `styles` object (lines 1418-1500) + all inline styles

### Files to modify
- **`src/components/RosterViewer.jsx`**
  - **Control Panel**: Stack sections vertically. Player search + team search go full-width stacked (remove minWidth: 250/180)
  - **Roster Table → Cards**: Each roster becomes an expandable card:
    - Header: grade letter (large, colored) + entry ID + draft date
    - Body: position snapshot pills, archetype pills
    - Footer: CLV, Spike Pts, Uniq Lift as 3-column stat row
    - Tap to expand: full player list
  - **PlayerDetail (expanded)**: 7-column inner table → card list (name + position on line 1, pick + ADP + CLV on line 2)
  - **DraftCapitalMap** (594px → mobile): Render as 2 rows of 9 rounds, or compact text summary (`"QB:R5 | RB:R1,R3,R7 | ..."`)
  - **Padding reduction**: `14px 18px` → `10px 12px` on mobile

### Verification
- 375px: roster cards stack, tap-to-expand works, DraftCapitalMap doesn't overflow

---

## Phase 3: AdpTimeSeries Mobile

**Goal:** Chart and player selector usable on phones.

### Files to create
- `src/components/AdpTimeSeries.module.css` — extract ~25 inline style objects

### Files to modify
- **`src/components/AdpTimeSeries.jsx`**
  - **Layout**: Replace side-by-side (30%/70%, height: 625px) with vertical stack on mobile — chart on top (full width, ~300px height), player list below
  - **Chart**: Reduce height to 280-300px on mobile, smaller axis ticks, `Tooltip trigger="click"` for touch
  - **Player selector grid**: Collapse `'30px 1fr 50px 50px 75px 50px'` — mobile shows only checkbox + name + ADP. Other columns hidden or moved to second line
  - **Controls**: Search full-width, buttons below search, checkbox wraps to new line

### Verification
- 375px: chart full-width, player list scrolls below, tap shows tooltip

---

## Phase 4: PlayerRankings Mobile + Touch Drag

**Goal:** Touch-native tier management on phones.

### Dependencies to install
- `@dnd-kit/core` + `@dnd-kit/sortable` — touch-native drag-and-drop (replaces HTML5 Drag API which doesn't work on mobile touch)

### Files to create
- `src/components/PlayerRankings.module.css` — extract ~20 inline style objects

### Files to modify
- **`src/components/PlayerRankings.jsx`**
  - **10-column table collapse**: Mobile shows only Rank, Player Name (with position color border), Tier badge, ADP. Hide Pos#, Pos, Team, Diff, Proj. Tap row for full details in expandable section
  - **Tier dividers**: Full-width, taller (44px) for touch targets
  - **Position toggle chips**: Reduce padding on mobile
  - **Header toolbar**: Stack search + buttons vertically on mobile
  - **Drag-and-drop**: Replace HTML5 drag API with `@dnd-kit` for first-class touch support. Wire to existing `handleDragStart`/`handleDrop` handlers

### Verification
- 375px: table no horizontal scroll, touch-drag reorders, tier breaks tappable

---

## Phase 5: DraftFlowAnalysis Mobile (most complex)

**Goal:** Draft assistant usable on phones via multi-screen approach.

### Files to create
- `src/components/DraftFlowAnalysis.module.css` — extract ~60 inline style objects (largest component)

### Files to modify
- **`src/components/DraftFlowAnalysis.jsx`**

  The desktop 2-column layout (320px sidebar + 1065px player cards) cannot shrink to 375px. Solution: **tabbed sub-views on mobile.**

  - Add `mobileSubView` state: `'board' | 'players'`
  - **Segmented control** at top: "Draft Board" / "Available Players" toggle
  - **Draft Board view**:
    - Draft slot selector + current pick stacked vertically, full-width
    - Drafted roster list below, full-width
    - "Undo Last" + "Clear Draft" as full-width button row
  - **Available Players view**:
    - Search full-width at top
    - PlayerCard → mobile card:
      - Line 1: position badge + name + stack/warning badges
      - Line 2: team, ADP, my avg (with delta)
      - Line 3: path %, lift, correlation %, global exposure as 4-column stat grid
    - ADP divider line still appears between cards
    - Tap to select (drafts the player)
  - **Correlation breakdown popup**: Replace hover popup with tap-to-toggle collapsible section below the card
  - **Auto-switch**: After selecting a player, briefly show Draft Board view or toast confirmation

### Verification
- 375px: segmented control switches views, player cards readable, tap-to-draft works, no horizontal overflow

---

## Phase 6: HelpGuide Mobile + PWA

**Goal:** Polish simplest tab, add installability.

### Dependencies to install
- `vite-plugin-pwa` (dev dependency)

### Files to create
- `public/manifest.json` — app name, icons, theme color `#0a0e1a`, display `standalone`
- App icons at 192x192 and 512x512

### Files to modify
- **`src/index.css`**: `.help-section` padding `1rem` on mobile (from `1.5rem 1.75rem`), smaller title font
- **`vite.config.js`**: Add PWA plugin config with runtime caching
- **`index.html`**: Add `<link rel="manifest">`, update viewport meta to `viewport-fit=cover` for notch devices, apply `env(safe-area-inset-*)` to bottom nav

### Verification
- Lighthouse PWA audit passes
- iOS Safari "Add to Home Screen" installs correctly
- HelpGuide readable at 375px

---

## Phase 7: Polish and Gestures

**Goal:** Native-like mobile feel.

### Dependencies to install (optional)
- `react-swipeable` (~3KB) — swipe gesture detection

### Files to create
- `src/components/BottomSheet.jsx` + `BottomSheet.module.css` — reusable slide-up panel for sort options, filter panels, detail views (replaces popups/dropdowns on mobile)

### Deliverables
- **Swipe between tabs**: Left/right swipe on main content cycles tabs (mobile only)
- **Bottom sheet component**: Replaces all hover-triggered popups with slide-up panels
- **Chart touch interactions**: Wrap chart containers with `touch-action: manipulation`, add zoom level controls (1x/2x/3x time range)
- **Transition animations**: CSS transitions for tab switching (opacity + translateX), card expansion (max-height)
- **Active states**: `:active` styles on all tappable elements with subtle scale/background change
- **Text selection prevention**: `user-select: none` on interactive elements (cards, drag handles, chips)

### Verification
- Swipe navigates tabs smoothly
- Bottom sheets dismiss on swipe-down
- No janky animations or layout shifts

---

## Dependency Summary

| Package | Phase | Purpose | Size |
|---------|-------|---------|------|
| `@dnd-kit/core` + `@dnd-kit/sortable` | 4 | Touch drag-and-drop | ~10KB gzipped |
| `vite-plugin-pwa` | 6 | PWA support | dev only |
| `react-swipeable` | 7 | Swipe gestures | ~3KB gzipped |

---

## Inline Style Extraction Order (cross-cutting)

Each phase extracts inline styles into CSS Modules for its target component. Order matches phase order by complexity:

| Phase | Component | Approx inline style objects | Key extraction |
|-------|-----------|----------------------------|----------------|
| 1 | ExposureTable | ~30 | cellBaseStyle, headerStyle, filter selects |
| 2 | RosterViewer | ~50 | `styles` constant (lines 1418-1500) |
| 3 | AdpTimeSeries | ~25 | grid template, pane dimensions |
| 4 | PlayerRankings | ~20 | colgroup, tier break styles |
| 5 | DraftFlowAnalysis | ~60 | sidebar, PlayerCard columns, StrategyCard |
