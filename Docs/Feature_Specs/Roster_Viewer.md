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
- No rosters: prompts user to upload CSV

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
- `src/utils/rosterArchetypes.js` — `classifyRosterPath()`
- `src/utils/stackAnalysis.js` — `analyzeRosterStacks()`, `scoreRosterStacks()`
- `src/utils/spikeWeekProjection.js` — `calculateSpikeWeekProjection()`
- `src/hooks/useSpikeWorker.js` — web worker integration
- `src/utils/draftScorer.js` — CLV power-law calculation
