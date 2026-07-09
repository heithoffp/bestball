# Combo Analysis

## Purpose
Cross-roster stacking pattern analysis. Surfaces which QB-to-teammate combinations and dual-QB pairs appear most frequently across the user's portfolio, revealing whether correlation bets are intentional or accidental.

## Current Status
**Active.** Wired in `App.jsx` at the `/combos` route via the `combo` tab key.

## User-Facing Behavior

### Tabs / Views
Sub-views are selected via a pill-style segmented switcher (mono uppercase labels: STACKS / QB PAIRS / SIMILARITY / PLAYOFFS / EXPLORER; gold-tinted active state).

- **Stacks (Stack Profiles)** — QB → teammate combinations (WR/TE/RB) with frequency counts and a "stack spectrum" segmented bar per QB. Rows expand (rotating chevron) to a per-combo breakdown with counts, percentages, and Rosters → navigation. Sortable columns (QB name / stack % / drafts), Exclude TE / Exclude RB chips, and a player autocomplete filter that highlights matching combos in gold.
- **QB Pairs** — Dual-QB pairs across rosters, ranked by frequency as a leaderboard: each row carries a background fill bar relative to the most common pairing; the #1 pair gets the gold accent.
- **Similarity (Roster Similarity)** — Most overlapping roster pairs (top 50) with shared-player chips, include/exclude player+team filters, and the same leaderboard fill-bar treatment.
- **Explorer (Draft Explorer)** — Interactive draft-board grid: pick a path of up to 4 first-round-by-round players and see the conditional distribution of what real drafters took next, plus how often the exact path occurred and which of the user's own rosters match. **Data source (2026-07-05):** real drafts only — every seat of every captured pod board in `draft_boards_admin` (participant capture ADR-009 + admin scraper ADR-008) plus the user's own synced rosters for drafts without a stored board, built client-side in `utils/realDraftData.js` (superflex + eliminator slates excluded). Pre/post classification of boards: board `slate_title` stores the platform tournament name ("The Big Board"), so boards classify via the user's own entry for that draft_id first, then a tournament/slate title→status map learned from the user's entries, then the name heuristic. The bundled Monte Carlo sim files were removed the same day; guests/demo see an empty-data prompt.
- **Playoff Stacks** — Portfolio-level NFL playoff (W15/16/17) game-stack concentration. Three week sections, each with a per-week KPI tile (% of rosters with ≥1 meaningful game stack in that week) and a grid of scoreboard-style game cards. A card renders for every playoff matchup where the portfolio holds at least one meaningful cross-team pair (QB/WR/TE pairings; RB and TE↔TE excluded — mirrors the extension overlay rule from TASK-232). Cards show distinct contributing players on each side with per-player roster counts, total rosters carrying the stack, and a `Rosters →` navigation jump. Leader card per week gets the gold accent. A naked-portfolio footer counts rosters with no playoff stack in any week. Schedule data lives at `src/data/playoff-schedule-2026.json` (mirror of the extension copy).

### Filters
- Tournament multi-select (`TournamentMultiSelect.jsx`) — restrict analysis to specific draft tournaments.
- Combined search input (`filters/CombinedSearchInput.jsx`) — filter by player name, team, or position.
- NFL team chips (`utils/nflTeams.js`) — restrict to specific teams.

### Visual Treatment
Redesigned 2026-07-09 to match the Draft Explorer's material language (styles live in `ComboAnalysis.module.css`; the old inline styles were removed):
- Each view opens with a **console band** — an atmospheric header (radial gold/violet washes + faint blueprint grid texture) carrying the view title, live portfolio stats (gold mono numerals), a one-line description, and that view's filters.
- Position palette: QB purple, RB green, WR amber, TE blue. Player badges are dark chips with a position-colored left rail.
- Distinct combo palette (10 colors) cycled by index for stack segments — not position-based, so visually adjacent combos are easy to distinguish. Segments sit in a glossy inset track (same material as the Explorer's waterfall bars); unfilled track = naked share.
- Hover tooltips on stack spectrum segments show the combo and roster count.
- Leaderboard rows (QB Pairs / Similarity) animate in with a short stagger; gold marks the #1 item. `prefers-reduced-motion` disables all entrance animation.
- Min-count control is a mono stepper (label − value +) in the toolbar; hidden on the Explorer view.
- "Rosters →" navigation buttons (ghost style, gold on hover) jump to the Roster Viewer filtered to rosters containing the selected combo.

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
- `src/components/ComboAnalysis.module.css` — scoped styles for the switcher, console bands, stack table, and leaderboards
- `src/components/DraftExplorer.jsx` — child component used for drill-down
- `src/components/PlayoffStacks.jsx` — Playoff Stacks sub-tab (W15/16/17 portfolio analysis)
- `src/components/PlayoffStacks.module.css` — scoped styles for the playoff view
- `src/utils/playoffStacks.js` — pure logic: position-pair rule, per-roster analysis, portfolio aggregation
- `src/data/playoff-schedule-2026.json` — 2026 NFL W15/16/17 schedule (mirror of the extension copy)
- `src/components/TournamentMultiSelect.jsx` — tournament filter
- `src/components/filters/CombinedSearchInput.jsx` — search input
- `src/utils/nflTeams.js` — team metadata
