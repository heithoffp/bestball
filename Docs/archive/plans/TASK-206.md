<!-- Completed: 2026-05-06 | Commit: 2685413 -->
# TASK-206: Global Tournament filter on Dashboard tab

**Status:** Done
**Priority:** P3

---

## Objective
Add a Tournament multi-select filter to the Dashboard tab that scopes all dashboard sections to the selected tournaments. Mirrors the pattern established by TASK-204 for Combos, but with the added wrinkle that Dashboard mixes `rosterData`-derived metrics with `masterPlayers`-derived metrics (top exposures, exposure-by-round, draft-capital market series). The filter must re-derive per-player counts/exposures from the filtered roster set while reusing the upstream ADP join that lives on `masterPlayers`.

## Verification Criteria
1. A "Tournament" multi-select control appears in the Dashboard, visually scoped to the whole tab (placed in the metrics row at the top so it reads as a global control).
2. With zero tournaments selected, every section renders identically to today (the "All Tournaments" no-op case).
3. Selecting one or more tournaments updates:
   - **Headline metrics** (Rosters count, Players Drafted) to reflect only the filtered roster set.
   - **Top Exposures by position** — counts/exposure recomputed from the filtered roster set; ADP values still come from the upstream `masterPlayers` join.
   - **Exposure by ADP Round** — highest, lowest, and blind-spot rows reflect filtered counts.
   - **Top Team Stacks** — QB+teammate counts and percentages reflect filtered rosters.
   - **Archetype Distribution** (RB/QB/TE) — distribution computed from filtered rosters.
   - **Draft Capital by Round (user side)** — solid bars reflect filtered rosters; market (faded) bars unchanged.
4. The Draft Position filter (1–12 / All) on Draft Capital continues to work and composes with the Tournament filter.
5. The slate-grouped popover (slate header with indeterminate state, "Clear all", outside-click to close) works the same as on Exposures and Combos.
6. If the filter excludes every roster, sections render their existing zero/empty state rather than crashing — including the case where archetype distributions are all-zero, top-exposures lists collapse to dashes, and exposure-by-round produces no rows.
7. Drill-down stat lines on the navigation cards reflect filtered counts (Exposures: "N players tracked", Rosters: "N rosters"). ADP Tracker "Latest" date is unchanged.
8. Navigation handlers (`onNavigateToRosters`, `onNavigate`) continue to work and pass their existing context — no Tournament context is added to the nav payload (out of scope; cross-tab tournament sync would be a separate task).

## Verification Approach
1. `npm run lint` passes.
2. `npm run build` succeeds.
3. Manual (developer): start `npm run dev`, navigate to the Dashboard. Confirm:
   - Tournament selector visible in the metrics row; defaults to "All Tournaments".
   - Pick a single tournament with a known smaller roster count. Confirm:
     - Headline Rosters count drops to that tournament's roster count.
     - Top Exposures percentages re-rank against the new denominator.
     - Exposure by ADP Round highest/lowest/blind-spot players update.
     - Team Stacks list shrinks accordingly.
     - Archetype bars re-segment (some segments may disappear).
     - Draft Capital solid bars change shape; faded market bars do not.
   - Toggle Draft Position buttons (1, 5, 12, All) while a tournament is selected — both filters apply.
   - "Clear all" in the Tournament popover restores full portfolio.
   - Pick a tournament with very few rosters (or every tournament unchecked from a single-tournament selection) and confirm clean empty/zero states across all sections.
   - Click an archetype segment and a top-exposure player name — Roster Viewer navigation still works.

## Files to Change
| File | Change |
|------|--------|
| `best-ball-manager/src/components/Dashboard.jsx` | Import `TournamentMultiSelect`. Add `selectedTournaments` state, `slateGroups` memo, `filteredRosterData` memo, and a `filteredMasterPlayers` memo that recomputes per-player count/exposure from the filtered roster set while preserving ADP fields from the original. Rewire all existing memos to consume the filtered values. Add the selector to the metrics row. |
| `best-ball-manager/src/components/Dashboard.module.css` | Add minor layout rule so the Tournament selector sits cleanly alongside the two metric cards (e.g., flex layout for the metrics row with the selector right-aligned). |

## Implementation Approach

1. **Import** `TournamentMultiSelect` from `./TournamentMultiSelect`.

2. **State:** add `const [selectedTournaments, setSelectedTournaments] = useState([]);` near the other `useState` declarations.

3. **`slateGroups` memo** — port verbatim from `ExposureTable.jsx` / `ComboAnalysis.jsx`:
   ```js
   const slateGroups = useMemo(() => {
     const map = new Map();
     rosterData.forEach(p => {
       if (!p.tournamentTitle) return;
       const slate = p.slateTitle || 'Other';
       if (!map.has(slate)) map.set(slate, new Set());
       map.get(slate).add(p.tournamentTitle);
     });
     return [...map.entries()]
       .sort(([a], [b]) => a.localeCompare(b))
       .map(([slate, tourns]) => ({ slate, tournaments: [...tourns].sort() }));
   }, [rosterData]);
   ```

4. **`filteredRosterData` memo** — single source-of-truth filter:
   ```js
   const filteredRosterData = useMemo(() => {
     if (selectedTournaments.length === 0) return rosterData;
     const set = new Set(selectedTournaments);
     return rosterData.filter(p => set.has(p.tournamentTitle));
   }, [rosterData, selectedTournaments]);
   ```

5. **`filteredMasterPlayers` memo** — recomputes per-player `count` and `exposure` from `filteredRosterData`, while keeping `name`, `position`, `adpPick`, `adpDisplay`, etc. from `masterPlayers`. Uses `stableId()` for player matching (same join key as the upstream pipeline).
   ```js
   const filteredMasterPlayers = useMemo(() => {
     if (selectedTournaments.length === 0) return masterPlayers;
     const entryIds = new Set(filteredRosterData.map(p => p.entry_id));
     const totalRosters = entryIds.size;
     // Count per stableId across filtered rosters
     const countById = new Map();
     filteredRosterData.forEach(p => {
       const id = stableId(p.name);
       countById.set(id, (countById.get(id) || 0) + 1);
     });
     return masterPlayers.map(mp => {
       const id = stableId(mp.name);
       const count = countById.get(id) || 0;
       const exposure = totalRosters > 0
         ? ((count / totalRosters) * 100).toFixed(1)
         : '0.0';
       return { ...mp, count, exposure };
     });
   }, [masterPlayers, filteredRosterData, selectedTournaments]);
   ```
   Note: this assumes a player's `count` in `masterPlayers` is the number of rosters containing them at least once — i.e., one roster ≠ multiple counts even if the player appears multiple times. Verify against `processMasterList` during implementation; if `count` is "draft slots" (sum of duplicates), keep that semantics. Adjust the count-loop accordingly.

6. **Rewire memos to use filtered data:**
   - `metrics` → derive `totalRosters` from `filteredRosterData` entry IDs; `uniquePlayers` from `filteredMasterPlayers.filter(p => p.count > 0).length`.
   - `rbDistribution / qbDistribution / teDistribution` → call `analyzePortfolioTree(filteredRosterData)`.
   - `topExposures` → iterate `filteredMasterPlayers`.
   - `exposureByRound` → iterate `filteredMasterPlayers`; uses the same `metrics.totalRosters` (now filtered).
   - `topTeamStacks` → iterate `filteredRosterData`.
   - `draftPositionByEntry` → derive from `filteredRosterData` (so the 1–12 buttons are scoped to the filtered set).
   - `draftCapitalShape` → user-side from `filteredRosterData`; market-side keeps `masterPlayers` (unfiltered) — represents the market, not the user.
   - `drillStats` → use the recomputed `metrics`.

7. **Toolbar placement:** wrap the metrics row in a flex container that places the two metric cards on the left and the `TournamentMultiSelect` on the right:
   ```jsx
   <div className={styles.metricsRow} data-help-id="metrics-row">
     <div className={styles.metricCard}>…Rosters…</div>
     <div className={styles.metricCard}>…Players Drafted…</div>
     <div className={styles.metricsRowSpacer} />
     <TournamentMultiSelect
       slateGroups={slateGroups}
       selected={selectedTournaments}
       onChange={setSelectedTournaments}
     />
   </div>
   ```
   Add a `metricsRowSpacer` (or use `margin-left: auto` on the selector wrapper) in `Dashboard.module.css` so the selector right-aligns.

8. **Empty-state guard:** the existing `rosterData.length === 0` early return stays — it gates on the unfiltered prop, which is the right behavior (no rosters at all = onboarding screen). Within the filtered path, the existing per-section guards (`exposureByRound.length > 0`, `topTeamStacks.length > 0`, etc.) handle the "filter excludes everything" case.

9. **No changes** to `TournamentMultiSelect.jsx`, `App.jsx`, or `utils/helpers.js`. The filter is applied entirely inside Dashboard.

## Risks & Notes
- **Recomputing exposures locally duplicates a slice of `processMasterList`.** Mitigation: keep the local recompute minimal (count + exposure only); reuse all other fields verbatim. If `processMasterList` semantics change, this duplication is a known maintenance risk — flagged for a possible follow-up to extract a shared helper.
- **`stableId` matching:** the local count loop must use the exact same canonicalization as `processMasterList`. Using `stableId(p.name)` from `utils/helpers` (already imported elsewhere) ensures parity.
- **Cross-tab tournament sync is out of scope.** Selecting tournaments on Dashboard does not propagate to Combos / Exposures and vice versa. A separate task can lift selection to App-level state if desired.
- **Market-side draft capital intentionally stays unfiltered.** The "market" is the ADP universe, not the user's selection — filtering it would defeat the comparison.
