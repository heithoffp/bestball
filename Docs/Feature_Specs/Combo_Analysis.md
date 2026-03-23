# Combo Analysis

## Purpose
Analyzes QB stacking patterns and multi-QB portfolio construction. Surfaces which QB-to-teammate combinations and QB pairs appear most frequently across rosters.

## Current Status
**Disabled** — commented out in `App.jsx` due to performance concerns.

## User-Facing Behavior (When Enabled)

### Tabs
- **Stacks:** QB → teammate combinations (WR/TE/RB) with frequency counts
- **QBQB:** Dual-QB pairs across rosters with co-occurrence rates
- **Starts:** (Incomplete in current implementation)

### Core Workflow
Shows which stacking patterns emerge naturally from the user's drafts. Helps identify whether correlation bets are intentional or accidental.

## Computations & Data Dependencies

**Props:** `rosterData`, `allRosters`

**Key computations:**
- Groups rosters by entry_id, identifies same-team player pairs
- Counts QB-teammate co-occurrences across all rosters
- Computes naked QB percentage (QBs without same-team pass catchers)
- Uses stack classification from `utils/stackAnalysis.js`

## Known Limitations
- Disabled for performance — needs optimization before re-enabling
- "Starts" tab incomplete
- No visual heatmap (future feature: player correlation heatmap)

## Key Files
- `src/components/ComboAnalysis.jsx` — main component (disabled)
- `src/utils/stackAnalysis.js` — `analyzeRosterStacks()`, stack type classification
