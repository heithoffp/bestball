# Exposure Analysis

## Purpose
The foundational "what do I own?" view. Shows what percentage of the user's portfolio contains each player, enabling quick identification of concentration risk and portfolio gaps.

## Current Status
Active

## User-Facing Behavior

### Desktop
- Full-width sortable table with columns: Player Name, Position, Team, Exposure %, Count, ADP, 2-Week Trend
- Inline ADP sparkline per row showing historical ADP movement
- Strategy filter chips for RB (Zero/Hero/Hyper Fragile/Balanced), QB (Elite/Core/Late), TE (Elite/Anchor/Late)
- Search bar with 250ms debounce for player name, team, or position

### Mobile
- Vertical chip filters replace horizontal filter bar
- Stacked search input
- Card-based layout with expandable rows — tap to reveal ADP sparkline and 2-week trend
- Row height: 50px (vs 51px desktop)

### Empty States
- No rosters synced: *"No exposure data. Sync your rosters from the Chrome extension to see exposure data."*
- ADP data but no rosters: Info banner — *"No roster data — showing all ADP players. Sync your rosters from the Chrome extension for exposure data."*
- No players match filters: *"No players match"*

## Key Controls & Interactions

| Control | Behavior |
|---------|----------|
| Sort | 5 options: Exposure %, ADP, Name, Count, ADP Trend (2-week) |
| Position/Strategy Filters | RB/QB/TE strategy archetype chips; dynamically updates roster count |
| Search | Fuzzy match on name, team, position (250ms debounce) |
| Show 0% Toggle | Include players with 0% exposure; auto-enabled when no roster data |
| Virtual Scrolling | react-virtual for high-performance rendering of large player lists |

## Computations & Data Dependencies

**Props received:** `masterPlayers`, `rosterData`, `allRosters`

**Key computations (all via `useMemo`):**
- Exposure aggregation: counts player appearances across filtered roster set, computes `count / totalEntries * 100`
- 2-week trend: compares baseline ADP from 14+ days ago against latest ADP value
- Player identity: normalized via `stableId()` from `utils/helpers.js`
- Orphaned players (not in any roster) rendered at 0.5 opacity

**Performance:** Virtual scrolling handles 1000+ players without lag.

## Known Limitations
- No percentile ranking view (only raw exposure %)
- Cannot export exposure data to CSV
- No player notes or annotations
- Filters recalculate on every change (no caching of intermediate results)

## Key Files
- `src/components/ExposureTable.jsx` — main component
- `src/components/AdpSparkline.jsx` — inline sparkline chart
- `src/utils/helpers.js` — `stableId()`, `processMasterList()`
