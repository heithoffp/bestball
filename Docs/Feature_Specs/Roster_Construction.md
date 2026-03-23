# Roster Construction

## Purpose
Hierarchical tree view of portfolio archetype distribution. Lets users see how their rosters break down across the 36-node strategy tree (4 RB paths x 3 QB paths x 3 TE paths) and drill into specific combinations.

## Current Status
**Disabled** — commented out in `App.jsx` due to performance concerns.

## User-Facing Behavior (When Enabled)

### Core Workflow
1. Top level shows RB archetype distribution (Hero, Zero, Hyper Fragile, Balanced) with roster counts
2. Click an RB archetype to drill into QB sub-paths (Elite, Core, Late)
3. Click a QB path to see TE leaf nodes with entry counts
4. Player search: type a player name to see which archetype paths contain them

### Navigation
Breadcrumb-style drill-down: Portfolio → RB Path → QB Path → TE Path → Individual Rosters

## Computations & Data Dependencies

**Props:** `rosterData`, `allRosters`

**Key computations:**
- `analyzePortfolioTree()` from `utils/rosterArchetypes.js` — groups all rosters by entry_id, classifies each via `classifyRosterPath()`, builds hierarchical count tree
- Tree structure mirrors `PROTOCOL_TREE` with actual counts at each node
- Player search scans across all classified rosters

## Known Limitations
- Disabled for performance — tree construction over large portfolios needs optimization
- No visual chart representation (text/count only)
- No comparison against `PROTOCOL_TREE` target percentages

## Key Files
- `src/components/RosterConstruction.jsx` — main component (disabled)
- `src/utils/rosterArchetypes.js` — `analyzePortfolioTree()`, `classifyRosterPath()`, `PROTOCOL_TREE`
