<!-- Completed: 2026-05-07 | Commit: pending -->
# TASK-212: Generate and wire post-draft simulation data

**Status:** Approved
**Priority:** P3

---

## Objective

Produce a parallel post-draft simulation cache from the most recent ADP snapshot (which already reflects post-NFL-draft team assignments) and wire `DraftExplorer` to load `pre/` or `post/` cache files based on the mode prop. Post-draft mode becomes sim-driven again instead of roster-derived; pre-draft mode is unchanged.

## Verification Criteria

1. Two parallel cache trees exist:
   - `best-ball-manager/public/sim/pre/` containing `tier1_frequency.json`, `tier2_conditional.json`, `tier3_player_conditionals.json`, `tier3_r1.json`..`tier3_r4.json` — bit-identical to the files currently at `public/sim/`.
   - `best-ball-manager/public/sim/post/` containing the same six files generated against the latest ADP snapshot in `best-ball-manager/src/assets/adp/` (currently `2026-05-05`).
2. `metadata.adp_date` in `public/sim/pre/tier1_frequency.json` equals `2026-04-13`. `metadata.adp_date` in `public/sim/post/tier1_frequency.json` equals the snapshot the post run consumed (e.g. `2026-05-05`).
3. `DraftExplorer` exposes a `simSource` derived from its `mode` prop: `'pre'` → loads from `/sim/pre/...`, `'post'` → loads from `/sim/post/...`. Switching modes after both caches are loaded updates the grid percentages without a page reload.
4. Post-draft mode no longer renders the "Drafted in {n} of {m} rosters at this slot" copy from TASK-210; it renders the same sim-frequency line as pre-draft mode (using post-draft cache totals). The roster-derived `computeRosterDraftState` code path is removed.
5. The slate badge / `defaultMode` selection from TASK-210 still works: filtering to fully-drafted slates still defaults the toggle to "Post-Draft", but the percentages now come from the post sim.
6. `npm run lint` and `npm run build` succeed from `best-ball-manager/` after the rewire.
7. Pre-draft mode behavior on a representative tournament is unchanged versus `main` (spot-check three R1 cell percentages — they must match within 0.0001).
8. Post-draft mode renders non-zero R1 percentages for top players whose ADP shifted after 2026-04-13 (e.g. a player whose post-draft ADP rose into round 1 should now show non-zero R1 frequency, where the pre-draft cache showed zero).

## Verification Approach

1. **Sim generation (developer-run, Python):**
   - From `simulation/`, run `python simulate.py --multi-epoch --sims 1000000 --output-dir output_post` against the existing latest ADP snapshot. Confirm the run completes and produces all six JSON files.
   - Inspect `output_post/tier1_frequency.json` metadata — `adp_date` must equal the latest snapshot date, `total_simulations` must equal `1_000_000`.
   - Move the existing `best-ball-manager/public/sim/*.json` files into `best-ball-manager/public/sim/pre/` (Claude does this via filesystem rename — no content change).
   - Copy the six files from `simulation/output_post/` into `best-ball-manager/public/sim/post/`.
2. **Frontend rewire (Claude):**
   - Modify `draftModel.js` and `uniquenessEngine.js` to accept a `source: 'pre' | 'post'` argument and fetch from `/sim/${source}/...`. Maintain separate caches per source.
   - Modify `DraftExplorer.jsx` to thread the active `mode` into the loader calls and reload tier1/tier3 when `mode` changes (with a one-shot per-source cache so re-toggling is instant).
   - Remove the post-draft branch in `DraftExplorer` that uses `computeRosterDraftState`; collapse the `comboResult` / `selectionFrequency` / explainer copy to use the sim path in both modes.
   - Remove `computeRosterDraftState` from `draftModel.js` (it was added by TASK-210 and is no longer needed).
3. **Automated checks:** `npm run lint` and `npm run build` from `best-ball-manager/` — both must exit 0.
4. **Developer browser checks (manual — required for verification):**
   - `npm run dev`, open Combos tab.
   - Pre-Draft mode against a non-drafted slate: spot-check that R1 percentages match a `git stash`/diff of `main` for at least three players.
   - Post-Draft mode against a fully-drafted slate: confirm percentages render, are non-zero, and reflect the post-draft ADP world (e.g. a player who rose post-NFL-draft now shows higher R1 frequency than in the pre cache).
   - Toggle modes back and forth — instant after both caches are loaded.
   - Confirm the "Drafted in {n} of {m} rosters at this slot" line is gone.
5. Developer confirms each manual browser check before close.

## Files to Change

| File | Action | Description |
|------|--------|-------------|
| `simulation/models.py` | Modify | Add `from_date` arg to `load_epoch_snapshots` (and `load_players`) — filters `csv_files` to dates `>= from_date` before grouping. |
| `simulation/simulate.py` | Modify | Add `--adp-from YYYY-MM-DD` CLI arg; pass through to the loaders. |
| `best-ball-manager/public/sim/tier1_frequency.json` | Move | → `public/sim/pre/tier1_frequency.json` |
| `best-ball-manager/public/sim/tier2_conditional.json` | Move | → `public/sim/pre/tier2_conditional.json` |
| `best-ball-manager/public/sim/tier3_player_conditionals.json` | Move | → `public/sim/pre/tier3_player_conditionals.json` |
| `best-ball-manager/public/sim/tier3_r1.json`..`tier3_r4.json` | Move | → `public/sim/pre/tier3_rN.json` |
| `best-ball-manager/public/sim/post/tier1_frequency.json` | Create | New post-draft sim output (developer-generated) |
| `best-ball-manager/public/sim/post/tier2_conditional.json` | Create | New post-draft sim output |
| `best-ball-manager/public/sim/post/tier3_player_conditionals.json` | Create | New post-draft sim output |
| `best-ball-manager/public/sim/post/tier3_r1.json`..`tier3_r4.json` | Create | New post-draft sim output |
| `best-ball-manager/src/utils/draftModel.js` | Modify | Per-source cache; `loadTier3Initial(source)`, `ensureRound(rnd, source)`, `getTier3Cache(source)`. Remove `computeRosterDraftState`. |
| `best-ball-manager/src/utils/uniquenessEngine.js` | Modify | Per-source cache; `loadSimData(source)`. |
| `best-ball-manager/src/components/DraftExplorer.jsx` | Modify | Thread mode → source through loaders; remove roster-derived branch; collapse copy back to sim path; trigger reload effect when `mode` changes. |
| `best-ball-manager/src/components/DraftExplorer.module.css` | Modify | Remove any post-draft-only copy styles no longer needed (none expected — placeholder for cleanup). |

`ComboAnalysis.jsx` and `TournamentMultiSelect` do **not** change — the `defaultMode` / slate-badge plumbing from TASK-210 is preserved.

## Implementation Approach

### 1. Generate the post-draft sim (Python — developer runs after Claude lands the loader change)

**Loader change first.** The current `load_epoch_snapshots` reads every CSV in `best-ball-manager/src/assets/adp/`, so a multi-epoch post run would mix pre- and post-NFL-draft snapshots. Add an optional `from_date: str | None = None` parameter that filters out files whose date string is `< from_date` before ISO-week grouping. Mirror the same filter in `load_players` for symmetry (it picks the latest from the filtered set). Wire a `--adp-from` CLI flag in `simulate.py` that passes through.

Window for the post run: NFL Draft 2026 finalized late April; the user-confirmed cutoff is **2026-04-25** (first reliable post-draft snapshot date). Files dated `>= 2026-04-25` participate; earlier files are excluded entirely.

Command:
```
cd simulation
python simulate.py --multi-epoch --adp-from 2026-04-25 --sims 1000000 --output-dir output_post
```

This produces ~2 ISO-week epochs of post-draft snapshots (week of 2026-04-27 and week of 2026-05-04 given the current file set), each contributing ~500K sims.

Outputs land in `simulation/output_post/`. Claude then:
- Creates `best-ball-manager/public/sim/pre/` and moves the existing six JSON files into it (no edits — pure rename).
- Creates `best-ball-manager/public/sim/post/` and copies the six new JSONs into it.

### 2. Per-source cache in `draftModel.js`

Replace the module-level `_cache`/`_loading`/`_callbacks` singletons with a `Map<source, state>`:

```js
const _state = new Map(); // source -> { cache, loading, callbacks }
function _getState(source) {
  if (!_state.has(source)) _state.set(source, {
    cache: { r1: null, r2: null, r3: null, r4: null, metadata: null },
    loading: { r1: false, r2: false, r3: false, r4: false },
    callbacks: { r1: [], r2: [], r3: [], r4: [] },
  });
  return _state.get(source);
}
```

`_fetchRound(rnd, source)` becomes the source-aware fetcher:
```js
const data = await fetch(`/sim/${source}/tier3_${rnd}.json`).then(r => r.json());
```

Public API: `loadTier3Initial(source = 'pre')`, `ensureRound(rnd, source = 'pre')`, `getTier3Cache(source = 'pre')`. Default `'pre'` keeps any non-DraftExplorer caller working.

`computeDraftState` is unchanged — it operates on whatever `cache` object is passed in.

`computeRosterDraftState` is removed. Any call site is in `DraftExplorer` only (verified via grep before the change).

### 3. Per-source cache in `uniquenessEngine.js`

Same shape:
```js
const _tier1ByCache = new Map();
export async function loadSimData(source = 'pre') {
  if (_tier1ByCache.has(source)) return _tier1ByCache.get(source);
  // ...fetch from `/sim/${source}/tier1_frequency.json`
}
```

`buildComboKey` and `lookupTier1` are unchanged — they operate on the tier1 object passed in.

### 4. `DraftExplorer.jsx` rewiring

- Track the active source as `const source = mode === 'post' ? 'post' : 'pre';`.
- Replace the existing one-shot `useEffect` that calls `loadTier3Initial()` + `loadSimData()` with one keyed on `source`. On `source` change:
  1. Set `tier3Ready = false` and clear `tier1` (so the loading guard renders during the swap).
  2. Call `loadTier3Initial(source)` and `loadSimData(source)`. On resolution, populate `tier3Cache` and `tier1` from the appropriate per-source cache.
  3. After both caches are warm once, subsequent toggles are effectively instant — the per-source caches are still in memory.
- Pass the active source-specific cache into `computeDraftState` (this already takes the cache as an argument).
- Remove the post-draft `computeRosterDraftState` branch entirely. The mode toggle now only controls which sim cache feeds `computeDraftState`. Both modes render the same UI (sim-frequency line, tier1 combo line, sim-based explainer footer).
- Update the explainer footer copy to mention which sim is active, e.g. `Based on {totalRosters.toLocaleString()} simulated rosters using {mode === 'post' ? 'post-draft' : 'pre-draft'} ADP.`
- The TASK-210 `key={...}` remount-on-mode-change can be relaxed: with both caches handled inside the effect, the component does not need a remount to reset selections. Keep the remount only if the developer prefers selection reset on mode-change UX (recommended — preserves current UX). Either choice is documented; default is to keep the remount.

### 5. Edge cases

- **Post cache missing in dev** (developer hasn't generated it yet): `fetch` returns 404, the loader throws. Wrap the fetch in a try/catch and surface a one-line "Post-draft sim not generated for this branch — toggle Pre-Draft to use the existing cache" message in the explainer footer when `source === 'post'` and the load fails. This keeps the app usable on branches that pre-date the asset commit.
- **Browser cache during dev:** Vite serves `public/` directly; renaming files to `pre/` is a clean URL change, no stale cache concern beyond a hard reload.
- **Bundle size:** files are fetched lazily — moving them under `pre/` does not change the build output. The new `post/` files add equivalent size to the deployed `public/` tree (~20MB tier3_r4) and ship via Vercel as static assets.

### 6. Removal hygiene

Grep for `computeRosterDraftState` after the change — must be zero occurrences. Same for `pathMatchCount` / `lastPickCount` (TASK-210-only state).

## Dependencies

None. Builds on TASK-210's mode toggle and slate-status plumbing.

## Open Questions

1. **Cutoff date.** Plan uses **2026-04-25** as the post-NFL-draft floor. Confirm; adjust if the first fully reliable post-draft snapshot is a different day.
2. **Remount on mode-change.** Keep TASK-210's `key={...}` so selections reset across mode switches, or relax it now that both modes are sim-driven and cell semantics match? Proposal: keep the remount — selections reset is fine UX given the user is opting into a different cohort.
4. **Asset-commit size.** ~30MB of additional JSON in `public/sim/post/`. Acceptable for a Vercel static deploy, but flag for the developer in case bundle/CDN limits are a concern.

---
*Approved by: <!-- developer name/initials and date once approved -->*
