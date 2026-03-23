# ADP Tracker

## Purpose
Visualizes how player ADP has moved over time across date-stamped snapshots. Answers "is the market agreeing or disagreeing with my drafts?" by showing price trends relative to what the user paid.

## Current Status
Active

## User-Facing Behavior

### Desktop
- Multi-player line chart (Recharts) at 585px height with legend
- Player selection panel with checkboxes to toggle chart visibility
- "Select Top 5" button auto-populates highest-exposure players
- Time scale buttons: 1 week, 1 month, All
- Pick Range toggle shows quartile box plots (min/Q1/median/Q3/max) from user's actual picks
- Tooltip shows both ADP value and pick statistics on hover

### Mobile
- Chart height reduced to 280px
- Font size 11px
- Some table columns hidden for space
- Search bar for player filtering

### Tablet
- Chart height 460px (intermediate)

### Empty States
- If no ADP snapshots exist, chart area is empty with no crash (graceful degradation)
- Players in rosters but not in ADP snapshots remain visible in the selection panel

## Key Controls & Interactions

| Control | Behavior |
|---------|----------|
| Player Checkboxes | Toggle individual player lines on/off |
| Select Top 5 | Auto-selects 5 highest-exposure players |
| Search | Filter player list by name/team/position |
| Time Scale | 1w / 1m / All — clips chart data to window |
| Pick Range | Checkbox to overlay quartile box plots from user's draft picks |
| Sort | Name, Exposure %, ADP, Value (ADP - avg pick), Trend |

## Computations & Data Dependencies

**Props received:** `masterPlayers` (with `history` array), `rosterData`

**Key computations:**
- Box plot statistics: quartiles, median, mean from user's pick distribution per player
- Value metric: `ADP - userAvgPick` (positive = user got value relative to market)
- Time window filtering: clips history array to last 7/30 days or shows all
- Trend: `lastAdpInWindow - firstAdpInWindow` (negative trend = player being drafted earlier = rising)
- Custom domain padding on chart axes

**Data source:** ADP snapshots are date-stamped CSV files bundled at build time (`src/assets/adp/underdog_adp_YYYY-MM-DD.csv`), parsed into `masterPlayers[].history[]` by `processMasterList()`.

## Known Limitations
- No ability to export chart as image
- Cannot manually set player line colors
- ADP data is static (bundled at build time) — no user-uploadable ADP snapshots
- No "last updated" date indicator showing ADP freshness
- No forward-looking predictions

## Key Files
- `src/components/AdpTimeSeries.jsx` — main component
- `src/utils/helpers.js` — `processMasterList()` builds history timeline
- `src/assets/adp/*.csv` — date-stamped ADP snapshots
