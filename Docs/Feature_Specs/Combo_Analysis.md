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
- **Explorer (Draft Explorer)** — Interactive draft-board grid: pick a path of up to 4 first-round-by-round players and see the conditional distribution of what real drafters took next, plus how often the exact path/combo occurred and which of the user's own rosters match. **Data source (2026-07-05):** real drafts — every seat of every captured pod board in `draft_boards_admin` (participant capture ADR-009 + admin scraper ADR-008) plus the user's own synced rosters for drafts without a stored board, built client-side in `utils/realDraftData.js` (superflex + eliminator slates excluded, pre/post split by slate title). The bundled Monte Carlo sim files (`/sim/{pre|post}/tier3_*.json`) remain only as a fail-soft fallback for guests/demo mode; UI copy switches between "real drafts" and "simulated drafts" via `metadata.data_source`.
- **Playoff Stacks** — Portfolio-level NFL playoff (W15/16/17) game-stack concentration. Three week sections, each with a per-week KPI tile (% of rosters with ≥1 meaningful game stack in that week) and a grid of scoreboard-style game cards. A card renders for every playoff matchup where the portfolio holds at least one meaningful cross-team pair (QB/WR/TE pairings; RB and TE↔TE excluded — mirrors the extension overlay rule from TASK-232). Cards show distinct contributing players on each side with per-player roster counts, total rosters carrying the stack, and a `Rosters →` navigation jump. Leader card per week gets the gold accent. A naked-portfolio footer counts rosters with no playoff stack in any week. Schedule data lives at `src/data/playoff-schedule-2026.json` (mirror of the extension copy).

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
- `src/components/PlayoffStacks.jsx` — Playoff Stacks sub-tab (W15/16/17 portfolio analysis)
- `src/components/PlayoffStacks.module.css` — scoped styles for the playoff view
- `src/utils/playoffStacks.js` — pure logic: position-pair rule, per-roster analysis, portfolio aggregation
- `src/data/playoff-schedule-2026.json` — 2026 NFL W15/16/17 schedule (mirror of the extension copy)
- `src/components/TournamentMultiSelect.jsx` — tournament filter
- `src/components/filters/CombinedSearchInput.jsx` — search input
- `src/utils/nflTeams.js` — team metadata
