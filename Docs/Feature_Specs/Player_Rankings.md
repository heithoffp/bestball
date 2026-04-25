# Player Rankings

## Purpose
The user's personal draft board for pre-draft preparation. Tier-based ranking system with drag-and-drop reordering, enabling users to establish their own player valuations before entering drafts.

## Current Status
Active

## User-Facing Behavior

### Desktop
- Fixed table layout with grip handles on left for drag reordering
- Alternating row backgrounds for readability
- Tier dividers between groups with editable inline labels

### Mobile
- Vertical card layout with touch-friendly drag handles
- Icons + compact display
- Search bar in top section

### Tier System
14 tiers: S, A+, A, A-, B+, B, B-, C+, C, C-, D+, D, D-, F. Each tier has a distinct background + text color (S = gold, A+ = red, F = gray).

## Key Controls & Interactions

| Control | Behavior |
|---------|----------|
| Drag & Drop | @dnd-kit with PointerSensor + TouchSensor for mobile-friendly reordering |
| Position Views | Overall, QB, RB, WR, TE tabs — filters player list by position |
| Tier Breaks | Click between players to insert tier dividers |
| Inline Label Editing | Click tier label to edit; Enter to save, Escape to cancel |
| Search | Filter players by name (250ms debounce) |
| Export to CSV | Download rankings as CSV file via `rankingsExport.js` |

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
- Selectable via the **Compare** button in the platform toggle row alongside Underdog Rankings / DraftKings Rankings.
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

## Known Limitations
- No tier templates (e.g., "copy last year's rankings")
- Compare mode does not yet persist mirrored edits — applied moves are session-local until the user explicitly saves the affected platform's rankings.
- Export flow may be incomplete in some edge cases

## Key Files
- `src/components/PlayerRankings.jsx` — main component
- `src/components/PlayerRankings/CompareView.jsx` — Compare mode top-level component
- `src/components/PlayerRankings/CompareCurves.jsx` — SVG curve canvas (gradients, edge markers, tick labels)
- `src/components/PlayerRankings/buildPlayers.js` — shared `buildPlayersFromSource()` helper
- `src/utils/rankingsExport.js` — `exportRankingsCSV()`, `getTierLabel()`, `getTierColor()`
