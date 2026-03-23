# Dashboard

## Purpose
The user's first and most frequent screen. Answers "what does my portfolio look like?" in a single glance with headline metrics, exposure summaries, portfolio shape visualizations, and drill-down entry points to detail tabs.

## Current Status
Active — default landing tab.

## User-Facing Behavior

### Desktop
Five vertical sections, scrollable:

1. **Headline Metrics** — two stat cards side by side: total rosters and unique players drafted.
2. **Top Exposures** — four-column grid (QB/RB/WR/TE), each showing the top 5 most-drafted players with name, exposure bar, and percentage.
3. **Least Exposure by ADP Round** — two-column grid showing rounds 1-10. For each round, displays the player whose ADP falls in that round that the user drafts the least, with position-colored name, ADP value, and exposure %.
4. **Shape Visualizations** — two cards side by side:
   - *RB Archetype Distribution* — horizontal stacked bar with legend showing Hero/Zero/Hyper Fragile/Balanced counts and percentages.
   - *Draft Capital by Round* — stacked bar chart (Recharts) showing picks per round colored by position.
5. **Drill-Down Cards** — five clickable cards (Exposures, Rosters, ADP Tracker, Rankings, Draft Assistant) each with a headline stat and tab navigation on click.

### Mobile
- Headline metrics: 2-column grid (unchanged)
- Top Exposures: 2-column grid; exposure bars wrap below player name to prevent truncation
- Least Exposure by Round: single-column list
- Shape Visualizations: stack vertically (1 column)
- Drill-Down Cards: 2-column grid

### Empty State
When no roster data is loaded:
- Centered upload icon, heading "Upload your roster CSV", description text, and a `FileUploadButton` to upload rosters directly from the dashboard.

## Key Controls & Interactions

| Control | Behavior |
|---------|----------|
| Drill-Down Cards | Click navigates to the corresponding tab via `onNavigate(tabKey)` |
| Archetype Bar Segments | Hover shows tooltip with label, count, and percentage |
| Draft Capital Chart | Recharts tooltip shows per-position breakdown on hover |

## Computations & Data Dependencies

**Props received:** `rosterData`, `masterPlayers`, `adpSnapshots`, `onNavigate`, `onRosterUpload`

**Key computations (all via `useMemo`):**

| Computation | Source | Description |
|-------------|--------|-------------|
| `metrics` | `rosterData`, `masterPlayers` | Total rosters (unique entry_ids), unique players drafted (count > 0) |
| `archetypeDistribution` | `rosterData` | Calls `analyzePortfolioTree()` then extracts RB-level counts, percentages, and colors from `PROTOCOL_TREE` / `ARCHETYPE_METADATA` |
| `topExposures` | `masterPlayers` | Top 5 players per position sorted by exposure %, filtered to count > 0 |
| `leastExposureByRound` | `masterPlayers`, `metrics.totalRosters` | For ADP rounds 1-10, finds the player with lowest draft count whose ADP falls in that round |
| `draftCapitalShape` | `rosterData` | Counts picks per round (1-18) broken down by QB/RB/WR/TE |
| `drillStats` | `metrics`, `adpSnapshots` | One-line stat per drill-down card (player count, roster count, latest ADP date, etc.) |

## Design Principle Alignment

- **Mirror, Not Advisor** — all metrics are neutral facts (counts, percentages, distributions). No grades, health scores, or good/bad color coding.
- **Zero-Config** — works immediately after CSV upload with no setup.
- **Shape Over Spreadsheet** — archetype stacked bar and draft capital chart provide instant pattern recognition.
- **Layered Depth** — headline metrics for quick glance; shape visualizations and exposure details for deeper inspection; drill-down cards for full analysis.
- **Dashboard-First Navigation** — serves as the app's home base with explicit entry points to every detail tab.

## Known Limitations
- Drill-down cards do not pass filter state to destination tabs (e.g. clicking an archetype segment doesn't pre-filter Exposures)
- Least Exposure by Round shows only one player per round (the single lowest)
- No ADP freshness indicator on the dashboard

## Key Files
- `src/components/Dashboard.jsx` — main component
- `src/components/Dashboard.module.css` — scoped styles
- `src/utils/rosterArchetypes.js` — `analyzePortfolioTree()`, `PROTOCOL_TREE`, `ARCHETYPE_METADATA`
- `src/components/FileUploadButton.jsx` — reused for empty state upload
