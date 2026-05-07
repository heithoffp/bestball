<!-- Completed: 2026-05-07 | Commit: 998e6e3 -->
# TASK-210: DraftExplorer — Pre-Draft / Post-Draft mode toggle

**Status:** Approved
**Priority:** P3

---

## Objective

Add a Pre-Draft / Post-Draft mode toggle to `DraftExplorer` so the component remains useful now that the simulation cache (built from pre-draft ADP) is stale for completed tournaments. In Pre-Draft mode the existing sim-driven probabilities and copy are unchanged; in Post-Draft mode probabilities and "next-round" extensions are derived entirely from the user's actual rosters, and sim-frequency copy is suppressed. Surface slate draft-status in the tournament filter so users can scope cleanly to one cohort.

## Verification Criteria

1. A segmented toggle ("Pre-Draft" / "Post-Draft") renders inside `DraftExplorer` above the path bar; default is auto-selected from the filtered roster set (see Implementation §2).
2. **Pre-Draft mode** behavior is identical to current `main`:
   - `probMap` comes from `computeDraftState(...)` (sim cache).
   - The "Seen X times in YM simulated rosters" line and tier1 combo line render unchanged.
3. **Post-Draft mode** behavior:
   - `probMap` for round R is computed from the in-scope rosters: for each grid player, `count(rosters whose round-R pick matches that grid player AND whose rounds 1..R-1 match the selection path) / count(rosters whose rounds 1..R-1 match the path)`. With zero selections, R=1 and the denominator is the in-scope roster count.
   - The sim-frequency line is replaced with `Drafted in {n} of {m} rosters at this slot` (where `m` is the path-matching denominator and `n` is the count for the most recent selection). Hidden until 1+ selections, matching today's UX.
   - The combo-result tier1 line is hidden.
   - The explainer footer reads "Based on {totalRosterCount} of your rosters in the selected slate(s). Percentages show actual draft frequency in that round given your prior selections."
4. **TournamentMultiSelect slate-status badges**: each slate group header shows a small "Pre-Draft" / "Post-Draft" / "Mixed" badge derived from whether the slate's rosters appear drafted (see §4).
5. Mode toggling is instant (no sim re-load).
6. Zero matching rosters in Post-Draft mode → grid renders all-zero, "No rosters match this path" replaces the comboResults frequency line, roster-extension badges disappear naturally.
7. `npm run lint` and `npm run build` succeed from `best-ball-manager/`.

## Verification Approach

1. Run `npm run lint` from `best-ball-manager/` — must exit 0.
2. Run `npm run build` from `best-ball-manager/` — clean build.
3. **Developer browser checks** (require manual confirmation):
   - `npm run dev`, open Combo tab. Toggle renders; default mode is sensible.
   - Pre-Draft mode: select a few cells, percentages and the "Seen X times in YM" line match `main` (compare against a `git stash` of the file or a separate tab/branch).
   - Post-Draft mode: select cells, percentages reflect actual roster frequencies. Sanity-check one cell by counting the matching rosters in the Rosters tab.
   - Filter to a fully drafted tournament: slate badge reads "Post-Draft", default mode is Post-Draft.
   - Filter to a tournament still drafting: badge "Pre-Draft", default Pre-Draft.
   - Mixed selection: badge "Mixed", default Pre-Draft (sim still useful for the pre-draft subset).
4. Developer confirms each manual browser check before close.

## Files to Change

| File | Action | Description |
|------|--------|-------------|
| `best-ball-manager/src/components/DraftExplorer.jsx` | Modify | Add `mode` state + toggle UI; branch `probMap`, `selectionFrequency`, `comboResult`, copy, and explainer on mode |
| `best-ball-manager/src/components/DraftExplorer.module.css` | Modify | Styles for the segmented mode toggle |
| `best-ball-manager/src/utils/draftModel.js` | Modify | Export `computeRosterDraftState({ selections, gridPlayers, playerIdToGrid, rostersByEntry })` mirroring `computeDraftState`'s shape but sourcing counts from rosters |
| `best-ball-manager/src/components/ComboAnalysis.jsx` | Modify | Compute per-slate `slateStatus` and pass to `TournamentMultiSelect`; pass `defaultMode` to `DraftExplorer` based on selected tournaments |
| `best-ball-manager/src/components/TournamentMultiSelect.jsx` | Modify | Render a status chip next to each slate header when `slateStatus` is provided |
| `best-ball-manager/src/components/TournamentMultiSelect.module.css` | Modify | Chip styles |

No changes to `uniquenessEngine.js` — tier1 lookups are simply hidden in Post-Draft mode.

## Implementation Approach

### 1. Roster-derived probability helper (`draftModel.js`)

Add and export `computeRosterDraftState(selections, gridPlayers, playerIdToGrid, rostersByEntry)`:

- Build a per-roster `Map<round, gridIndex>` once per call. For each player in each roster, look up `gridIndex` via `canonicalName`-matched lookup against `gridPlayers` (use `helpers.canonicalName`, same approach as the existing `matchingRosters` block in `DraftExplorer`). Skip players not on the grid.
- `R = selections.length + 1` (the round we're computing probabilities for). `pathMatchingEntries` = entries whose `byRound[i+1] === selections[i].gridIndex` for all `i < selections.length`. With zero selections, this is all entries.
- For each pathMatchingEntry, take its round-R `gridIndex` and increment a count map. `probMap[gridIndex] = count / pathMatchingEntries.size`.
- Return `{ probMap, selectedSet: new Set(selections.map(s => s.gridIndex)), currentRound: R, pathMatchCount: pathMatchingEntries.size, lastPickCount }` where `lastPickCount` is the count for `selections[selections.length-1].gridIndex` at round `R-1` against the path of length `R-2` (used to render "Drafted in {n} of {m} rosters at this slot"). Compute it inline as a side product.

### 2. `DraftExplorer.jsx` mode wiring

- Add `mode` state (`'pre' | 'post'`) initialised from a new `defaultMode` prop (default `'pre'`).
- Branch the `{ probMap, selectedSet, currentRound }` `useMemo`:
  - `'pre'` → existing `computeDraftState(...)` (unchanged).
  - `'post'` → `computeRosterDraftState(...)`.
- `selectionFrequency` → `null` in `'post'`. `comboResult` → `null` in `'post'`.
- `comboResults` JSX:
  - `'pre'` → today's lines.
  - `'post'` with 1+ selections → `Drafted in {lastPickCount} of {pathMatchCount} rosters at this slot.` If `pathMatchCount === 0`, render `No rosters match this path.` instead.
- Explainer footer copy branches as in Verification Criteria §3.
- The existing `rosterExtensions` block is mode-agnostic and stays unchanged — it already reads from rosters.

### 3. Mode toggle UI

Two-button segmented control on the left of the existing `pathBar` row:
`[Pre-Draft | Post-Draft]   R1: ... → R2: ...   [Undo] [Reset]`.
CSS additions: `.modeToggle`, `.modeToggleBtn`, `.modeToggleBtnActive`. Reuse the existing `pathActionBtn` aesthetic where possible.

### 4. Slate-status classification (`ComboAnalysis.jsx`)

Heuristic for "is this roster fully drafted":
- A best-ball roster has 18 picks. If `roster.length >= 18`, treat as drafted.
- Else if every player in the roster has a non-null `pickedAt`, treat as drafted.
- Else not drafted.

Per slate, classify across all rosters in that slate:
- All drafted → `'post'`
- None drafted → `'pre'`
- Mixed → `'mixed'`

Augment `slateGroups` entries with `slateStatus`. Pass through `TournamentMultiSelect`.

`defaultDraftExplorerMode` from the current selection:
- If `selectedTournaments.length === 0` → `'pre'` (default preserves today's behavior).
- Else: collect `slateStatus` of each selected tournament's slate; if **all** are `'post'`, default to `'post'`; otherwise `'pre'`.

Pass `defaultMode={defaultDraftExplorerMode}` to `DraftExplorer`. The component reads it once on mount; changing the filter remounts via `key={selectedTournaments.join('|') + ':' + defaultDraftExplorerMode}` so the default re-applies when the user re-scopes — this is intentional so the mode always matches the cohort, and the user's in-flight selections reset (which is also the safer UX since cell semantics differ between modes).

### 5. `TournamentMultiSelect` badge rendering

Each slate header gets an optional chip next to the label:
- `'pre'` → "Pre-Draft" (neutral grey)
- `'post'` → "Post-Draft" (subtle green)
- `'mixed'` → "Mixed" (subtle amber)

If `slateStatus` is absent, render nothing (backward compatible).

### Edge cases

- **No rosters match path in Post-Draft mode:** `pathMatchCount === 0`; render zero-fill cells, "No rosters match this path" copy, badges disappear (extensions map empty by construction).
- **Empty `rosterData` while in Post-Draft mode:** show "Sync rosters to use Post-Draft mode" alongside the toggle (preserves the existing `emptyPrompt` semantics for the no-grid case).
- **Sim cache loading:** Post-Draft mode does not depend on sim cache; allow it to render before tier3 finishes loading. Pre-Draft mode keeps the existing `!tier3Ready` loading guard.
- **Mixed slates selected:** Default `'pre'`; user can override via toggle.

## Dependencies

None. Builds on the existing tournament-filter primitive shipped in TASK-204 and TASK-206.

## Open Questions

1. **Slate-status heuristic accuracy.** Roster-size + `pickedAt` is reliable for completed best-ball drafts but may misclassify partially drafted slow drafts as "pre". Acceptable for now; revisit if reported.
2. **Default mode when no tournaments are selected.** Proposal: `'pre'` (preserves today's behavior across all rosters). Confirm.
3. **Should mode persist across remounts (e.g., remember user's last manual override)?** Proposal: no — let the filter-driven default win. Simpler, fewer surprises.

---
*Approved by: <!-- developer name/initials and date once approved -->*
