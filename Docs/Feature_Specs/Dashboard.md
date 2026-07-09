# Dashboard

## Purpose
The user's first and most frequent screen. Answers "what does my portfolio look like?" in a single glance with headline metrics, exposure summaries, market movement, portfolio shape visualizations, and drill-down entry points to detail tabs.

## Current Status
Active — default landing tab. Overhauled 2026-07-09: KPI hero row, Closing Line Value card, ADP Movers card, Draft Slot Distribution, and Playoff Stacks coverage added; drill-down row gained Combos.

## User-Facing Behavior

### Desktop
Seven vertical sections, scrollable:

1. **Tournament Filter** — multi-select (grouped by slate) that scopes every section below it.
2. **KPI Hero Row** — up to six stat tiles: Rosters (with tournament count), Players Drafted, Portfolio CLV (average closing line value across all picks, colored by sign), Stacked Rosters (% of rosters with ≥1 QB stack), Playoff Stacked (% of rosters with ≥1 Week 15–17 game stack), and Highest Exposure (top player with exposure % and roster count). Conditional tiles hide when their inputs are unavailable (no ADP join → no CLV tile).
3. **Exposure Trio** — three cards side by side:
   - *Top Exposures* — four-column grid (QB/RB/WR/TE), top 5 most-drafted players each with exposure bar and %.
   - *Exposure by ADP Round* — rounds 1–10; highest-exposure player per round plus either up to three 0% "blind spots" or the lowest-exposure player.
   - *Top Team Stacks* — up to 15 NFL teams ranked by rosters carrying a QB + pass-catcher/RB stack.
4. **Market Movement** — two cards side by side:
   - *Closing Line Value* — hero average CLV %, a positive/flat/negative pick-share meter, and best/worst value picks (per-player average CLV across the user's picks). Uses the same `calcCLV` power-law curve and `clvLabel` coloring as the Roster Viewer, so the number reads identically across tabs.
   - *ADP Movers You Hold* — top 5 risers and fallers over the trailing ~2 weeks among players the user actually drafted, with position dot, exposure %, magnitude bar, and signed pick delta. Built from `masterPlayers[].history` (per-platform snapshot timelines); a player's freshest platform series is used.
5. **Shape Visualizations** — two cards side by side:
   - *Archetype Distribution* — RB/QB/TE stacked bars with hover highlight; clicking a segment navigates to Rosters pre-filtered to that archetype.
   - *Draft Capital by Round* — Recharts stacked bars, user vs market (faded), normalized to %; filterable by round-1 draft slot.
6. **Structure Row** — two cards side by side:
   - *Draft Slot Distribution* — 12-column histogram of entries per round-1 draft slot (accent gold, modal slot emphasized, count labels on caps).
   - *Playoff Stacks · W15–17* — per-week coverage meters (% of rosters with ≥1 playoff game stack that week) plus the six most-stacked playoff games with roster counts. Uses `playoffStacks.js` + `playoff-schedule-2026.json`.
7. **Drill-Down Cards** — six clickable cards (Exposures, Rosters, ADP Tracker, Combos, Rankings, Draft Assistant) each with a headline stat and tab navigation on click.

### Mobile (≤599px)
- KPI row: 2-column grid
- Exposure trio, market, shape, and structure rows: single column
- CLV lists and mover columns: single column
- Drill-Down Cards: 2-column grid

At 600–899px the market/structure rows collapse to one column and team stacks span full width under the exposure pair.

### Empty State
When no roster data is loaded: centered sync icon and a numbered getting-started walkthrough (install extension → open entries page → sync) with an "Add to Chrome" CTA.

## Key Controls & Interactions

| Control | Behavior |
|---------|----------|
| Tournament Filter | Scopes all sections; per-player exposure recomputed against the filtered entry set |
| Player names (exposures, CLV lists, movers, by-round) | Click navigates to Rosters filtered to that player |
| Archetype bar segments | Hover highlights + dims siblings; click navigates to Rosters filtered to that archetype |
| Draft Capital chart | Slot filter buttons (All, 1–12); Recharts tooltip with user vs market breakdown |
| Draft Slot histogram | Per-bar tooltip with entry count |
| CLV meter | Title tooltip with positive/flat/negative pick shares |
| Drill-Down Cards | Click navigates to the corresponding tab via `onNavigate(tabKey)` |
| Help overlay | Per-section annotations via `TabLayout` `helpAnnotations` |

## Computations & Data Dependencies

**Props received:** `rosterData`, `masterPlayers`, `adpSnapshots`, `onNavigate`, `onNavigateToRosters`, `helpOpen`, `onHelpToggle`

**Key computations (all via `useMemo`, all downstream of the tournament filter):**

| Computation | Source | Description |
|-------------|--------|-------------|
| `rosterGroups` | `filteredRosterData` | entry_id → players map shared by stacks/playoff/metrics sections |
| `metrics` | `rosterGroups`, `filteredMasterPlayers` | Roster count, unique players, tournament count, highest-exposure player |
| `clvStats` | `filteredRosterData` | Per-pick `calcCLV(pick, latestADP)`; portfolio average, positive/flat/negative shares (±0.5% threshold), best/worst players by mean CLV |
| `adpMovers` | `filteredMasterPlayers[].history` | Per player: freshest platform series, baseline snapshot ≥12 days back, delta in ADP picks; top 5 risers/fallers with \|Δ\| ≥ 1 |
| `teamStacks` | `rosterGroups` | Per-team QB-stack roster counts + count of rosters with ≥1 stack |
| `playoffCoverage` | `rosterGroups`, `playoff-schedule-2026.json` | `aggregatePortfolioPlayoffStacks()`; per-week coverage, naked-roster count, most-stacked playoff games |
| `topExposures` | `filteredMasterPlayers` | Top 5 per position by exposure % |
| `exposureByRound` | `filteredMasterPlayers` | Highest + lowest/blind-spot players per ADP round 1–10 |
| `draftPositionByEntry` / `draftSlots` | `filteredRosterData` | Min pick per entry → entries per round-1 slot histogram |
| `draftCapitalShape` | `filteredRosterData`, `masterPlayers` | % position mix per round 1–18, user vs market |
| `drillStats` | `metrics`, `adpSnapshots`, `teamStacks` | One-line stat per drill-down card |

## Design Principle Alignment

- **Mirror, Not Advisor** — every section reports state: counts, percentages, distributions, and market movement. CLV and ADP-mover coloring encodes *direction of market movement relative to the user's picks* (a fact), not a recommendation; there are no grades or suggested actions. CLV reuses the Roster Viewer's exact formula/labeling for cross-tab consistency.
- **Zero-Config** — every card renders immediately after sync; conditional cards (CLV, movers, playoff) simply hide when their inputs are absent rather than asking for setup.
- **Shape Over Spreadsheet** — stacked archetype bars, capital chart, slot histogram, and coverage meters give pattern recognition before numbers.
- **Layered Depth** — KPI glance → exposure/market detail → shape/structure → drill-down tabs.
- **Dashboard-First Navigation** — player names, archetype segments, and drill cards all deep-link into detail tabs.

## Known Limitations
- ADP movers use the freshest platform series per player; a player rostered on both platforms shows one platform's move.
- CLV positive/flat/negative threshold (±0.5%) is fixed.
- Playoff stack coverage counts *meaningful pairs* (QB/WR/TE rules from `playoffStacks.js`); it does not weight by stack size.
- No ADP freshness indicator on the dashboard (latest snapshot date appears only on the ADP Tracker drill card).

## Key Files
- `src/components/Dashboard.jsx` — main component
- `src/components/Dashboard.module.css` — scoped styles
- `src/utils/rosterArchetypes.js` — `analyzePortfolioTree()`, `ARCHETYPE_METADATA`
- `src/utils/clvHelpers.js` — `calcCLV()`, `clvLabel()` (shared with Roster Viewer)
- `src/utils/playoffStacks.js` — `aggregatePortfolioPlayoffStacks()`
- `src/data/playoff-schedule-2026.json` — W15–17 NFL schedule
