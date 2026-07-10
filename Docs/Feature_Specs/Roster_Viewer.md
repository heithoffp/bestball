# Roster Viewer

## Purpose
Individual roster deep-dive with composite grading, archetype classification, stack analysis, and CLV breakdown. The place for evaluating specific completed builds — computed grades are appropriate here because the user is assessing a single roster, not their portfolio strategy.

## Current Status
Active

## User-Facing Behavior

### Desktop
- Sortable table of all rosters with columns: Entry, Draft Date, Snapshot, Actual Pts (in-season only), Proj Pts, Adv %, RB/QB/TE Archetypes, Early Combo %, Avg CLV%
- Click row to expand: draft capital map, per-player detail (pick, ADP, Proj, Actual Pts in-season, CLV)
- Color-coded CLV % ranges (>5% green → <-2.5% red)
- Adv % color-coded against the tournament's own pod baseline — 16.7% (2/12) classic, 25% (3/12) Big/Little Board, 50% (6/12) Eliminator Week 1 — green above, red below, muted em-dash when not modeled. Modeled **only** for rosters with a captured draft board (pod-exact); the em-dash tooltip tells the user to re-sync the draft to capture its board

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
- **Per-column context:** lineup-aware projected points and Expected Advance % (the
  shared pod model in `utils/podAdvance.js` — the same computation that drives the
  roster table's Adv % column, so both views show the identical number), Avg CLV%
  (same power-law as the table), and RB/QB/TE archetype pills — for every team in the
  pod, enriched via the Underdog ADP map and projections (`adpByPlatform` prop, passed
  from App). Pod Adv % is **pod-exact** (`podAdvanceProbabilities`): every seat is a
  known opponent, the beat-count is Poisson-binomial, and odds sum to ~advanceSpots
  across the pod (2, or 3 on Big/Little Board, or 6 on Eliminator Week 1 —
  `advanceStructureFor`). Seats where under half the picks resolve a projection are
  unmodeled (em-dash) and stand in as pod-average opponents. Eliminator boards score
  the Week-1 cut from a week-1-only outlook while the displayed Proj stays season-long;
  Superflex boards simulate the extra QB slot.
  Weekly actuals (when loaded) flow in via the `actuals` prop, so pod odds shift with
  banked points in-season.
- **Board availability is paginated** (2026-07-06): `fetchAvailableBoardIds` pages
  through `draft_boards_admin` in 1000-row ranges. PostgREST caps un-ranged selects at
  1000 rows, and once the table grew past that, newer boards silently lost their Board
  buttons.
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

### Early Combo % (frequency across real drafts)
The share of **other** tracked real drafts that start with each roster's **first-3-pick** combo (e.g. "0.09%", "<0.01%"). The roster's own occurrence is excluded from both count and pool, so **0% = truly unique** — no other tracked draft opens this way. Tooltips stay deliberately vague about pool size (no roster counts exposed). **Data source (2026-07-05):** real drafts only — every seat of every captured pod board in `draft_boards_admin` plus the user's own synced rosters for drafts without a board (`utils/realDraftData.js`); the combo key is the roster's first `COMBO_PICKS` (3) picks in draft order, sorted by `player_id`. **Delivery (2026-07-09, TASK-315):** board seats arrive via the precomputed artifact `app-data/combo-boards-v1.json` (Supabase Storage, private bucket, built by `scripts/build-combo-boards.mjs`) instead of a full-table `draft_boards_admin` download. Three picks (not four) is deliberate: a 2026-07-05 evaluation against ~14K tracked rosters showed 64% of first-4 combos are one-of-one (flat "unique" everywhere), while first-3 combos spread 1×–47× with mean ~7. The old bundled Monte Carlo sim tables were removed the same day; guests/demo see an em-dash. Superflex/Eliminator rosters and broken syncs show "—" (not comparable / unscoreable). Pre-draft rosters score against the pre table, post-draft against post.

### Projected Points & Expected Advance % (2026-07-06, `utils/advanceModel.js`)

**Proj Pts** is a *startable-lineup* expectation over the 14-week tournament regular
season, not a raw sum of season projections (a raw sum let 4-QB rosters project
highest simply because QBs score most, even though only one QB starts):

- Each player's weekly mean = season projection ÷ 17 games; a seeded Monte Carlo
  (deterministic per entry id) draws weekly scores with position-specific volatility
  (QB steadiest → TE spikiest, CVs 0.40–0.72) and scores the optimal lineup —
  1 QB / 2 RB / 3 WR / 1 TE / 1 FLEX, plus a QB-eligible slot on Superflex slates.
  Bench depth earns value through variance; surplus QBs don't.
- **Byes use the real 2026 schedule** (`src/data/byeWeeks.js`, re-exported from
  `eliminator-2026.json`): remaining weeks are grouped by which players sit out and
  each distinct group is simulated with those players zeroed, so clustered byes
  crater one simulated week instead of being smeared uniformly, and a roster whose
  byes are behind it gets a cleaner rest-of-season outlook. Players whose team can't
  be resolved fall back to a uniform 1/17 missed-week chance.
- **Dynamic in-season:** Proj Pts = banked Actual Pts + remaining weeks × expected
  weekly lineup score, where each player's rest-of-season weekly mean is a Bayesian
  blend of the preseason projection (worth ~6 weeks of evidence) and observed actuals.

**Actual Pts** = sum over completed weeks of the optimal lineup on that week's real
player scores (best ball's own scoring rule). Players absent from a week's file score 0.

**Adv %** = P(finish in the advancing spots of the 12-team pod) over the tournament's
own advancement window (`advanceStructureFor`, 2026-07-06):

| Tournament | Structure | Window |
|---|---|---|
| Classic UD/DK (default) | top 2 of 12 | weeks 1–14 |
| The Big Board / The Little Board | top 3 of 12 | weeks 1–14 |
| Superflex slates | top 2 of 12, superflex lineup in the sim | weeks 1–14 |
| The Eliminator | top 6 of 12 (first survival cut) | **Week 1 only** |

**Pod-exact only (2026-07-06):** Adv % is computed exclusively from the roster's
captured draft board via the shared pod model (`utils/podAdvance.js` —
`derivePodModel`/`userPodAdvance`, the exact engine the Draft Board modal renders, so
the column and the Board view always show the identical number). Every seat is a known
opponent simulated from its real picks; the beat-count is Poisson-binomial
(`podAdvanceProbabilities`) and odds sum to ~advanceSpots across the pod. Boards are
bulk-fetched (`fetchDraftBoards`) for all rosters with availability, and pod models are
computed in chunks off the render path (12 seat simulations per board), filling the
column progressively. Rosters **without** a captured board show a muted em-dash whose
tooltip prompts the user to re-sync the draft with the extension. Eliminator advance
inputs come from a week-1-only outlook (week-1 actuals decide the cut once loaded);
the Proj Pts column keeps the season-long view for all formats.

The earlier portfolio field model (`buildFieldModel`/`advanceProbability`, i.i.d.
opponents drawn from the user's own portfolio cohort) was retired from this column the
same day: two models for the same stat meant the table and the Draft Board modal
disagreed on the same roster (e.g. 58.8% vs 65.7%). The functions remain in
`advanceModel.js` (pure, Node-exercisable) but have no UI consumer.

**Demo mode** (2026-07-06): guests can't read `draft_boards_admin`, which would leave
the demo's Adv % column all dashes. Instead, `utils/demoBoards.js` synthesizes a
deterministic 12-team board around each demo roster — the user's seat replays their
real picks, the other 11 seats draft near-ADP from the bundled Underdog snapshot with
seeded jitter plus positional minimums/caps (≥2 QB / 4 RB / 5 WR / 2 TE, capped at
3/9/10/3) so every synthetic team fields a startable lineup. Seeds derive from the
entry id, so the column, the Board modal, and every demo visit agree. RosterViewer
receives `demoMode` from App (`isUsingDemoData`) and swaps board availability + board
objects to the synthetic source; the Board modal gets the synthetic board via its
`boardOverride` prop (no Supabase call).

**Weekly actuals input** (developer workflow, mirrors ADP snapshots): drop
`{halfppr|fullppr}_week_{N}.csv` files into `src/assets/actuals/` — e.g.
`halfppr_week_01.csv`. Columns: player name (`Name`, or `firstName`/`lastName`) and a
points column (`points`/`FPTS`/`fantasy_points`/`score`). Underdog/Superflex/Eliminator
rosters read half-PPR files; DraftKings rosters read full-PPR. Until the first file
lands, the tab stays in pure-projection mode and Actual Pts columns stay hidden.

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
- `src/utils/advanceModel.js` — lineup-aware projection, weekly actuals ingestion, pod advance math
- `src/utils/podAdvance.js` — shared pod-exact model over a captured board (drives both the Adv % column and the Board modal)
- `src/utils/demoBoards.js` — deterministic synthetic boards for demo mode (guests can't read `draft_boards_admin`)
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
