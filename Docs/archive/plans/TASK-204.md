<!-- Completed: 2026-05-06 | Commit: pending -->
# TASK-204: Global Tournament filter on Combos tab

**Status:** Done
**Priority:** P3

---

## Objective
Add a Tournament multi-select filter to the Combos tab that applies to all four sub-tabs (Stack Profiles, QB Pairs, Roster Similarity, Draft Explorer). Selection persists when switching sub-tabs and is applied once at the top of `ComboAnalysis` so all downstream memos and the embedded `DraftExplorer` operate on the filtered roster set.

## Verification Criteria
1. A "Tournament" multi-select control appears in the Combos toolbar, alongside the sub-tab selector, visually scoped to the whole tab (not a per-sub-tab control).
2. Selecting one or more tournaments filters the data on every sub-tab: Stack Profiles QB rows, QB Pairs leaderboard, Roster Similarity pairs, and Draft Explorer combo lookups all reflect only rosters whose `tournamentTitle` is in the selected set.
3. Switching between the four sub-tabs does NOT clear the tournament selection.
4. Other per-tab filters (player search, exclude TE/RB, include/exclude pickers, min count) continue to reset on tab switch as they do today.
5. With zero tournaments selected, behavior matches current ("All Tournaments").
6. The slate-grouped popover (slate header with indeterminate state, "Clear all") works the same as on the Exposures tab.
7. If the filter excludes every roster, sub-tabs render their existing empty/zero-state rather than crashing.

## Verification Approach
1. `npm run lint` passes.
2. `npm run build` succeeds.
3. Manual (developer): start `npm run dev`, navigate to Combos. Confirm:
   - Tournament selector visible in toolbar; defaults to "All Tournaments".
   - Pick a single tournament; counts on Stack Profiles drop accordingly. Switch to QB Pairs, Roster Similarity, Draft Explorer — selection still applied, data scoped.
   - Switch between sub-tabs — tournament selection persists; other filters (e.g. player search on Stacks) reset as before.
   - Clear all — full portfolio reappears.
   - Pick a tournament with very few rosters; confirm empty states render cleanly across sub-tabs.

## Files to Change
| File | Change |
|------|--------|
| `best-ball-manager/src/components/ComboAnalysis.jsx` | Import `TournamentMultiSelect`. Add `selectedTournaments` state. Compute `slateGroups` from `rosterData`. Compute `filteredRosterData` (rosterData scoped by selectedTournaments). Replace internal use of `rosterData` with `filteredRosterData` for both the `rosters` memo and the `DraftExplorer` prop. Add the `TournamentMultiSelect` to the toolbar. Exclude `selectedTournaments` from `handleTabClick`'s reset block. |

## Implementation Approach

1. **Import** `TournamentMultiSelect` from `./TournamentMultiSelect`.

2. **State:** add `const [selectedTournaments, setSelectedTournaments] = useState([]);` near the other useState declarations.

3. **`slateGroups` memo** — port verbatim from `ExposureTable.jsx:171-182`:
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

4. **`filteredRosterData` memo** — single source-of-truth filter applied before everything else:
   ```js
   const filteredRosterData = useMemo(() => {
     if (selectedTournaments.length === 0) return rosterData;
     const set = new Set(selectedTournaments);
     return rosterData.filter(p => set.has(p.tournamentTitle));
   }, [rosterData, selectedTournaments]);
   ```

5. **Rewire downstream consumers** to use `filteredRosterData` instead of `rosterData`:
   - The `rosters` memo (currently `rosterData.forEach(...)` at line 152).
   - The `allPlayerNames` and `allTeamNames` memos (lines 163, 169) — so include/exclude suggestions on Similarity reflect the filtered scope.
   - The `DraftExplorer` prop (line 1030): `rosterData={filteredRosterData}`.
   - Leave the empty-state guard `totalRosters === 0` alone — it already reads from `rosters` which now derives from `filteredRosterData`.

6. **Toolbar placement:** in `toolbarControls`, render `TournamentMultiSelect` between the sub-tab `filter-btn-group` and the existing `Min stacks/overlap` group. Render it unconditionally (visible on all four sub-tabs, including Draft Explorer):
   ```jsx
   <TournamentMultiSelect
     slateGroups={slateGroups}
     selected={selectedTournaments}
     onChange={setSelectedTournaments}
   />
   ```
   Wrap the right-hand side (Tournament + Min count) in a single flex container so they stay grouped on the right.

7. **`handleTabClick`** — leave `selectedTournaments` untouched. Continue clearing the per-tab state (player search, exclude TE/RB, include/exclude lists, sort key/dir).

8. **No changes** to `TournamentMultiSelect.jsx`, `ExposureTable.jsx`, or `DraftExplorer.jsx`. The filter is applied upstream so `DraftExplorer` needs no awareness of it.

## Risks & Notes
- `DraftExplorer` does its own internal computations on the rosterData it receives; passing the filtered set is the cleanest scope-control. If a sub-feature there relied on the unfiltered set, this changes its behavior — visual check during verification covers this.
- `allPlayerNames`/`allTeamNames` switch to filtered scope, meaning Similarity's include/exclude autocomplete only suggests players/teams present in selected tournaments. This is the desired behavior (matches the "scope to selection" mental model).
