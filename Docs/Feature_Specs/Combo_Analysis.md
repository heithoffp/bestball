# Combo Analysis

## Purpose
Cross-roster stacking pattern analysis. Surfaces which QB-to-teammate combinations and dual-QB pairs appear most frequently across the user's portfolio, revealing whether correlation bets are intentional or accidental.

## Current Status
**Active.** Wired in `App.jsx` at the `/combos` route via the `combo` tab key.

## User-Facing Behavior

### Tabs / Views
- **Stacks** — QB → teammate combinations (WR/TE/RB) with frequency counts and stack-diversity bars per QB.
- **QBQB** — Dual-QB pairs across rosters with co-occurrence rates.
- **Starts** — Stack patterns segmented by team / starting roster slot.

### Filters
- Tournament multi-select (`TournamentMultiSelect.jsx`) — restrict analysis to specific draft tournaments.
- Combined search input (`filters/CombinedSearchInput.jsx`) — filter by player name, team, or position.
- NFL team chips (`utils/nflTeams.js`) — restrict to specific teams.

### Visual Treatment
- Position palette: QB purple, RB green, WR amber, TE blue.
- Distinct combo palette (10 colors) cycled by index for stack segments — not position-based, so visually adjacent combos are easy to distinguish.
- Hover tooltips on stack diversity bar segments show segment label.
- "Rosters →" navigation buttons jump to the Roster Viewer filtered to rosters containing the selected combo.

### Empty State
Falls back to `EmptyState` with a `FolderSync` icon when no roster data is loaded.

## Computations & Data Dependencies

**Props:** `rosterData`, `masterPlayers`, `onNavigateToRosters`

**Key computations:**
- Groups rosters by `entry_id`, identifies same-team player pairs.
- Counts QB-teammate co-occurrences across all rosters.
- Counts dual-QB pair frequencies.
- Position-aware grouping for stack diversity visualization.

## Performance Notes
The component was previously disabled for performance (see `docs/archive/notes/OPTIMIZATION_PLAN.md`). It has since been re-enabled. If the QB pair matrix or stack rendering becomes a bottleneck on large portfolios, profile before further optimization work.

## Key Files
- `src/components/ComboAnalysis.jsx` — main component
- `src/components/DraftExplorer.jsx` — child component used for drill-down
- `src/components/TournamentMultiSelect.jsx` — tournament filter
- `src/components/filters/CombinedSearchInput.jsx` — search input
- `src/utils/nflTeams.js` — team metadata
