# ADP Tracker

## Purpose
Visualizes how player ADP has moved over time across date-stamped snapshots. Answers "is the market agreeing or disagreeing with my drafts?" by showing price trends relative to what the user paid.

## Current Status
Active

## User-Facing Behavior

Two stacked panes, each owning its controls (no global control bar):

### Chart pane (hero, top)
- Header: "ADP over time" eyebrow + "lower = drafted earlier" caption; platform toggle (Both / Underdog / DraftKings, two-platform accounts only), time window (1W / 1M / All), and a "My pick ranges" toggle chip (hidden in Both mode, replaced by a solid-UD / dashed-DK line key)
- **Watchlist chips row** — doubles as the chart legend. One chip per selected player: color dot (matches line color), name, current ADP, windowed trend. Hovering a chip spotlights its line (others dim); × removes the player. "+ Top 5" replaces the selection with the table's top 5 rows; "Clear" empties it; an `n/10` counter shows capacity
- Multi-player line chart (Recharts) filling the pane: 2px lines, validated 10-color CVD-safe palette assigned by selection order (never cycled — selection hard-capped at 10)
- **Round-ruler y-axis** — ticks anchor to draft-round boundaries, showing pick number with the round beneath (e.g. `37 / R4`); horizontal gridlines mark rounds
- Tooltip: entries sorted by ADP, each with color dot, value, round annotation, and the user's pick stats (avg · range) in single-platform mode
- Both mode overlays UD (solid) vs DK (dashed) per player; color follows the player

### Table pane (bottom, fills remaining height)
- Toolbar: search (player/team/position), "Trend" calc-mode toggle (% / Spots), player count
- Virtualized table; clicking a row toggles the player on the chart. Selection shown as a color-filled swatch (hollow ring when unselected) plus a colored left edge
- Player cell: position badge + name + compact team code (team merged into the cell — no separate column)
- Sort indicator only on the active column (gold); "Rosters →" link revealed on row hover (always visible on touch devices)

### Mobile
- Chart body fixed at 220px, compact y ticks (pick number only), platform labels shortened (UD / DK)
- Watchlist chips collapse to one horizontally scrollable strip
- Table shows ADP + Trend columns (platform-aware when filtered); team code hidden

### Empty States
- If no ADP snapshots exist, chart area is empty with no crash (graceful degradation)
- Zero selection shows an inline prompt with an "Add top 5" action
- Players in rosters but not in ADP snapshots remain visible in the selection table

## Key Controls & Interactions

| Control | Behavior |
|---------|----------|
| Row click / swatch | Toggle a player's line on the chart (max 10; further adds are no-ops with an explanatory tooltip) |
| Watchlist chip | Hover spotlights the line; × removes the player |
| Top 5 | Replaces selection with the top 5 rows of the current table sort |
| Search | Filter player table by name/team/position |
| Platform | Both / Underdog / DraftKings — scopes chart snapshots; Both overlays solid (UD) vs dashed (DK) |
| Time Scale | 1w / 1m / All — clips chart data to window and scopes trend calculations |
| Trend mode | % / Spots — shows Trend and Δ UD-DK columns (and chip trends) as percentage change (default) or raw ADP spots. The chart always plots absolute ADP |
| My pick ranges | Toggle chip overlaying quartile box plots from user's draft picks (single-platform modes only) |
| Sort | Click column headers; active column highlighted with direction arrow. ADP columns sink platform-missing players to the tail |

## Computations & Data Dependencies

**Props received:** `masterPlayers` (with `history` array), `rosterData`

**Key computations:**
- Box plot statistics: quartiles, median, mean from user's pick distribution per player
- Value metric: `ADP - userAvgPick` (positive = user got value relative to market)
- Time window filtering: clips history array to last 7/30 days or shows all
- Trend (spots mode): `lastAdpInWindow - firstAdpInWindow` (negative trend = player being drafted earlier = rising)
- Trend (% mode, default): `(lastAdpInWindow - firstAdpInWindow) / firstAdpInWindow × 100` — a fixed spot move registers larger in early rounds than late
- Δ UD-DK (spots mode): `udAdp - min(dkAdp, 216)` (DK clamped to Underdog's 18-round depth)
- Δ UD-DK (% mode, default): `(udAdp - dkClamped) / ((udAdp + dkClamped) / 2) × 100` — mean-relative, symmetric across platforms (`dkClamped = min(dkAdp, 216)`)
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
