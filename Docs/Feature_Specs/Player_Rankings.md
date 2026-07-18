# Player Rankings

## Purpose
The user's personal draft board for pre-draft preparation. Tier-based ranking system with drag-and-drop reordering, enabling users to establish their own player valuations before entering drafts.

## Current Status
Active

## User-Facing Behavior

### Console band (desktop + mobile)
All controls live in a single "console band" above the board (same idiom as Combo Analysis):
- Head row: **Draft Board** title · live mono stats (`N players · N tiers`, updates with position filter and search) · right-aligned usage hint (desktop only).
- Controls row: platform segmented control (Underdog / DraftKings / Both), position filter chips, search, and actions — ghost Reset to ADP / Export / Upload CSV, with gold **Save** as the single primary button.

### Desktop
- Fixed table layout in a surface-1 panel; grip handle column on the left for drag reordering (grips fade in on row hover)
- JetBrains Mono for all numeric columns (#, Pos#, ADP, Diff, Proj); uppercase mono column headers; numeric columns right-aligned
- Alternating background per tier for readability; row hover highlight
- Tier breaks render as slim "tier rails": a dark bar with a colored left ridge, a mono label chip in the tier color, and a hairline rule — editable inline labels, drag grip, hover-reveal ✕
- Hovering the gap between two rows reveals a gold "+ Tier" affordance to insert a break

### Mobile
- Vertical card layout with touch-friendly drag handles; mono rank + ADP
- Compact tier rails; muted always-visible "+ Tier" pills between cards
- Console band collapses (usage hint hidden, icon-only Reset/Save)

### Tier System
14 tiers: S, A+, A, A-, B+, B, B-, C+, C, C-, D+, D, D-, F. Each tier has a distinct hue (S = gold, A+ = red, F = gray), applied as rail ridge/label/badge accents rather than full-width color bars.

## Key Controls & Interactions

| Control | Behavior |
|---------|----------|
| Drag & Drop | @dnd-kit with PointerSensor + TouchSensor for mobile-friendly reordering |
| Platform Toggle | Underdog / DraftKings / Both — each platform keeps its own saved order |
| Position Views | Overall, QB, RB, WR, TE chips — filters player list by position |
| Tier Breaks | Click the "+ Tier" affordance between players to insert tier rails |
| Inline Label Editing | Click tier label to edit; Enter to save, Escape to cancel |
| Search | Filter players by name or team (150ms debounce); drag is paused while searching, with a notice pill |
| Reset to ADP | Restores the platform's ADP order and clears tier breaks (local until Save) |
| Save | Persists the current board for the selected platform |
| Export / Upload CSV | Download rankings as CSV via `rankingsExport.js`; upload a rankings CSV (desktop only) |

## Computations & Data Dependencies

**Props received:** `masterPlayers`, rankings state

**Key computations:**
- `getTierLabel(tierNum)` — maps tier number (1-14) to letter grade
- `getTierColor(tierNum)` — maps tier to color scheme
- Position filtering on the fly
- Rank calculation based on sort order within position group

**Storage:** Rankings persist to IndexedDB (local) and optionally Supabase (cloud) via the same sync mechanism as rosters.

## Compare Mode

Desktop-only side-by-side view of Underdog (half-PPR) and DraftKings (full-PPR) rankings.

### Activation
- Selectable via the **Both** button in the console band's platform switcher alongside Underdog / DraftKings. Styled to match the main board: console band on top, compare controls row (position chips, search, movers slider, scroll lock, Save Both), platform-colored column headers with mono source pills, and tier rails in both columns.
- Available regardless of which platforms have saved rankings (falls back to ADP order for either column with no saved order).
- Hidden on viewports < 900px (mobile/tablet); selecting it on desktop and resizing below the breakpoint forces the view back to a single platform.

### Layout
- Two virtualized columns (UD left, DK right) with header pills indicating rank source: **Saved** when user-curated, **ADP fallback** when derived from the latest ADP snapshot.
- Curve canvas in the gutter between columns — full-height SVG drawing Bézier paths from each player's UD-rank Y to their DK-rank Y.
- Curve stroke uses a horizontal linear gradient: UD purple (`var(--platform-ud)`) → DK green (`var(--platform-dk)`).
- Stroke thickness scales with rank disagreement: `1 + min(8, |Δrank| / 5)`.
- Faint dashed tick lines + `#10`, `#20`, ... labels every 10 ranks anchored to UD column scroll.

### Controls
| Control | Behavior |
|---------|----------|
| Search | Filters and highlights matching players in both columns simultaneously; if exactly one player matches, both columns auto-scroll to it. |
| Position filter | Overall · QB · RB · WR · TE — applies symmetrically to both columns and both curve sets. |
| Movers ≥ N slider | Hides players (and their curves) where `|udRank − dkRank| < N`. Default 0; range 0–50. |
| Sync-lock toggle | Locked (default) — both columns scroll together. Click to unlock for independent scroll. |

### Hover behavior
- Hovering a row in either column highlights the connecting curve at full opacity, dims other curves, highlights the counterpart row, and renders a `+N` / `−N` delta badge near the curve midpoint (positive = ranked higher on right).

### Cross-list mirror edit
- Dragging a player in either column reorders that platform's list, then proposes the equivalent move in the opposite column.
- A ghost target row appears in the opposite column at `currentOtherRank + Δrank` (clamped to list bounds), accompanied by an "Apply to UD/DK (±N)" pill in the gutter.
- Clicking the pill applies the mirrored reorder. The pill auto-dismisses after 10 s or when the user dismisses it manually.

### Off-screen edge markers
- When one endpoint of a curve falls outside the viewport, an arrow marker is drawn at the canvas edge in the opposite platform's color rather than rendering a partial curve. The active player's marker also shows the player's name and counterpart rank.

## Mobile App (native, `mobile-app/`)

The iOS app ports the tab with touch-adapted behavior (TASK-351):

### Board
- Real drag-and-drop reordering via `react-native-reorderable-list` (pinned 0.18.1): long-press the grip handle to lift a row, auto-scroll near list edges, haptic feedback on lift. The list is one flat array of players + tier rails + "+ Tier" pills; only player rows are draggable, and after a drop the tier/break state is re-derived from the physical arrangement (`boardItems.js`, node-tested via `scripts/test-rankings-board.mjs`).
- Tier rails match the web: tap a label to rename inline, ✕ removes a break, "+ Tier" pills insert one. The tier-1 rail renders as the list header and cannot be deleted.
- Tap a row body → panel with a "move to rank #" input (fast path for long moves) and a tier-break toggle.
- Drag works in Overall and position views (position drops anchor to the neighbor and reorder the full list); drag pauses while searching.
- Save writes through the same `rankingsExport.js` pipeline as the web (Supabase storage + `user_rankings`) and pushes the saved rows back into `PortfolioContext` so the ADR-030 background refresh cannot clobber a fresh save.

### Compare (interactive diff — differs from web)
- Mobile Compare is a **read-only UD-vs-DK diff**, not the web's editable dual-board: synced dual columns (lock toggle), rank-delta Bézier curves in the gutter (`react-native-svg` port of CompareCurves, including off-screen edge markers), per-column Saved / ADP-fallback source pills, position chips, shared search.
- Movers filter uses stepped chips (All / 5+ / 10+ / 25+ / 50+) instead of the web's slider.
- Tapping a player highlights them in both columns, draws their curve at full opacity with a ±Δ badge, and auto-scrolls the other column to the counterpart. Reordering happens on the single-platform board.

## Known Limitations
- No tier templates (e.g., "copy last year's rankings")
- Compare mode does not yet persist mirrored edits — applied moves are session-local until the user explicitly saves the affected platform's rankings.
- Export flow may be incomplete in some edge cases
- Mobile Compare has no in-view editing or mirror-edit proposals (deferred follow-up to TASK-351)

## Key Files
- `src/components/PlayerRankings.jsx` — main component
- `src/components/PlayerRankings/CompareView.jsx` — Compare mode top-level component
- `src/components/PlayerRankings/CompareCurves.jsx` — SVG curve canvas (gradients, edge markers, tick labels)
- `src/components/PlayerRankings/buildPlayers.js` — shared `buildPlayersFromSource()` helper
- `src/utils/rankingsExport.js` — `exportRankingsCSV()`, `getTierLabel()`, `getTierColor()`
- `mobile-app/src/screens/RankingsView.jsx` — mobile shell (platform + Board/Compare toggle)
- `mobile-app/src/screens/rankings/` — `BoardView.jsx`, `boardItems.js`, `TierRail.jsx`, `CompareView.jsx`, `CompareCurves.jsx`, `buildPlayers.js`
