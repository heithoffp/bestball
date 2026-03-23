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

## Known Limitations
- No tier templates (e.g., "copy last year's rankings")
- No comparison mode (your tiers vs. expert consensus or ADP)
- Export flow may be incomplete in some edge cases

## Key Files
- `src/components/PlayerRankings.jsx` — main component
- `src/utils/rankingsExport.js` — `exportRankingsCSV()`, `getTierLabel()`, `getTierColor()`
