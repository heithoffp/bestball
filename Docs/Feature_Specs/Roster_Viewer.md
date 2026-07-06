# Roster Viewer

## Purpose
Individual roster deep-dive with composite grading, archetype classification, stack analysis, and CLV breakdown. The place for evaluating specific completed builds — computed grades are appropriate here because the user is assessing a single roster, not their portfolio strategy.

## Current Status
Active

## User-Facing Behavior

### Desktop
- Sortable table of all rosters with columns: Grade, Draft Date, Avg CLV, Spike Points, Uniqueness Lift
- Click row to expand: grade component breakdown, stack summary, per-player detail
- Color-coded CLV % ranges (>5% green → <-2.5% red)
- Uniqueness Lift scale: 0 (chalk) → 1 (unique)

### Mobile
- Card-based layout with collapsible sections
- Same data, vertical stacking

### Empty States
- No rosters: prompts user to sync via Chrome extension

## Key Controls & Interactions

| Control | Behavior |
|---------|----------|
| Sort | Grade, Draft Date, Avg CLV, Spike Points, Uniqueness Lift |
| Archetype Filters | RB/QB/TE strategy path |
| CLV Band Filter | All / Positive CLV / Negative CLV |
| Search | Find rosters containing a specific player name or team |
| Multi-Select Player Filter | Dropdown to filter rosters by player combination |
| Expandable Rows | Click to view full breakdown per roster |
| Virtual Scrolling | For large portfolios (100+ rosters) |
| Board Button | On UD rosters with a captured board: opens the full Draft Board modal |

## Draft Board Modal (TASK-240)

Full pod board view for synced Underdog drafts. A "Board" button renders on a roster row
(desktop: actions cell; mobile: expanded card actions) only when that draft's board exists
in the `draft_boards_admin` Supabase table — no disabled buttons for rosters without one.

- **Grid:** `entry_count` columns × `rounds` rows; cells show pick number, player name,
  position (shared `positionColors.js` palette, position-tinted cell), team. Round labels
  carry snake-direction arrows. Sticky header row and round column; horizontal scroll on
  mobile (<900px full-screen panel).
- **Your column:** identified by name-overlap between the clicked roster's players and
  board slots (requires >50% match); highlighted with the accent color and a "YOU" label.
- **Per-column context:** projected points (sum), Avg CLV% (same power-law as the table),
  and RB/QB/TE archetype pills — for every team in the pod, enriched via the Underdog
  ADP map and projections (`adpByPlatform` prop, passed from App).
- **Data source (interim):** developer-scraped boards in `draft_boards_admin`
  (admin-extension, TASK-241), read via `utils/draftBoards.js` with an authenticated-only
  RLS policy (migration 009). Reads fail soft — guests see no board affordances. Boards
  whose picks lack player names (pre-repair scrapes) are excluded from availability.
  Participant-authorized capture at sync time (ADR-009) is the planned replacement;
  `draft_boards_admin` retirement (TASK-252) is blocked until then.

## Computations & Data Dependencies

**Props received:** `rosterData`, `allRosters`, `masterPlayers`

### Composite Grade (A+ to F)
Weighted combination of 4 factors:
1. **Projected Points** — percentile rank within portfolio
2. **CLV (Closing Line Value)** — power-law curve: `V(pick) = 1 / pick^0.5`, then `CLV% = (vNow - vDraft) / vDraft * 100`
3. **Composite Rarity** — reach deviations + archetype rarity boost, normalized with `sqrt(N)` for small portfolios
4. **Spike Week Projection** — ceiling week score estimate (via web worker)

### Uniqueness Lift
Normalized surprisal score comparing roster composition to portfolio baseline. Higher = more unique archetype/player combination.

### Early Combo Rate / Count (Tier 1 frequency)
How often each roster's first-4-pick combo appears across the field. **Data source (2026-07-05):** real drafts — every seat of every captured pod board in `draft_boards_admin` plus the user's own synced rosters for drafts without a board (`utils/realDraftData.js`); the combo key is the roster's first 4 picks in draft order, sorted by `player_id` (`metadata.key_basis = 'picks'`). Column shows a raw occurrence count ("2×"; 1× = only this roster) and is labeled "Early Combo Count". When no real data is reachable (guests/demo), the bundled Monte Carlo tier1 table is the fallback (`key_basis = 'adp'`, per-1M display, "Early Combo Rate / 1M"). Pre-draft rosters score against the pre table, post-draft against post.

### Stack Analysis
Uses `analyzeRosterStacks()` from `utils/stackAnalysis.js` to identify and score team correlations within each roster.

### Archetype Classification
Via `classifyRosterPath()` from `utils/rosterArchetypes.js` — classifies each roster into RB/QB/TE strategy path.

**Performance:** Web worker (`useSpikeWorker`) offloads spike week calculations to avoid blocking main thread.

## Known Limitations
- Spike week calculation depends on embedded schedule data (not real-time injury-adjusted)
- No export individual roster as PDF
- No historical trend tracking across portfolio changes over time
- Missing ADP values fall back to draft pick position

## Key Files
- `src/components/RosterViewer.jsx` — main component
- `src/components/DraftBoardModal.jsx` — full draft-board modal (TASK-240)
- `src/utils/draftBoards.js` — board availability + board fetch from `draft_boards_admin`
- `src/utils/realDraftData.js` — real-draft frequency tables (boards + own rosters)
- `src/utils/uniquenessEngine.js` — Tier 1 combo lookup (real data first, sim fallback)
- `src/utils/positionColors.js` — shared position color palette
- `src/utils/rosterArchetypes.js` — `classifyRosterPath()`
- `src/utils/stackAnalysis.js` — `analyzeRosterStacks()`, `scoreRosterStacks()`
- `src/utils/spikeWeekProjection.js` — `calculateSpikeWeekProjection()`
- `src/hooks/useSpikeWorker.js` — web worker integration
- `src/utils/draftScorer.js` — CLV power-law calculation
