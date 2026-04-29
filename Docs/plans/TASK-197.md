# TASK-197: PlayerRankings — projections.csv as authoritative projection source

**Status:** Pending Approval
**Priority:** P3

---

## Objective
Make `projections.csv` the authoritative projection source displayed in PlayerRankings for both Underdog and DraftKings, replacing Underdog's default `projectedPoints` values that currently shadow it.

## Verification Criteria
- For Underdog rankings, the **Proj** column shows values from `src/assets/projections.csv` for any player that exists in that file (e.g., Josh Allen shows **367.8**, not Underdog's default).
- For DraftKings rankings, the **Proj** column continues to show `projections.csv` values (no regression — DK already gets them via the existing fallback path).
- For players present in the platform ADP CSV but absent from `projections.csv`, the Underdog row's `projectedPoints` is still shown (graceful fallback, no blanks where data exists).
- Saved-rankings CSVs (uploaded via FileUploadButton) still display the projections embedded in the saved file — saved ranks are user-curated and must round-trip unchanged.

## Verification Approach
Automated checks Claude will run:
1. `npm run lint` from `best-ball-manager/` — must pass with no new warnings.
2. `npm run build` from `best-ball-manager/` — must succeed.

Developer-confirmed checks (require running `npm run dev` and viewing the app):
3. Open the Rankings tab on the Underdog platform. Verify Josh Allen's Proj column shows **367.8** (projections.csv value) instead of his Underdog default.
4. Switch to DraftKings platform. Verify Josh Allen still shows **367.8** (no regression).
5. Confirm at least one player who is **not** in `projections.csv` but is in the Underdog ADP CSV still shows a non-empty Proj value (fallback works).
6. Confirm "Reset to ADP" button still populates Proj with `projections.csv` values, not Underdog defaults.

## Files to Change
| File | Action | Description |
|------|--------|-------------|
| `best-ball-manager/src/components/PlayerRankings.jsx` | Modify | Flip precedence in `buildRankedPlayers` — try `projMap[nameKey]` first, fall back to `row.projectedPoints` only when the projMap lookup is missing. Apply identically to the saved-rankings path so platform-ADP rows behave correctly. |

## Implementation Approach
Single-site change in `buildRankedPlayers` (`PlayerRankings.jsx:104-138`).

Current logic at lines 111-112:
```js
const projRaw = row.projectedPoints || row.projected_points || '';
const proj = projRaw || (projMap[nameKey] != null ? String(projMap[nameKey]) : '');
```

New logic:
```js
const projFromMap = projMap[nameKey] != null ? String(projMap[nameKey]) : '';
const projRaw = row.projectedPoints || row.projected_points || '';
const proj = projFromMap || projRaw;
```

**Why this is sufficient:** `dataLoader.js:184-195` already merges `projections.csv` into `projPointsMap` last, overwriting any platform-CSV values. So `projMap` already contains the authoritative projection. The only reason Underdog displayed defaults was that `buildRankedPlayers` consulted the row first. Flipping the order fixes it without touching `dataLoader`.

**Saved rankings consideration:** Saved rankings CSVs (via Save/Export) embed `projectedPoints` per row. When the active source is a saved ranking, `projMap` is still populated (it comes from `adpByPlatform[platform].projPointsMap`, independent of the source). With the flip, saved rankings will show projections.csv values rather than the embedded ones — which is the desired behavior (projections.csv is authoritative). The saved CSV's `projectedPoints` column remains as a fallback for any name that's not in projections.csv.

**Edge cases:**
- Player in saved CSV but not in projections.csv → falls back to saved CSV value (preserved behavior for hand-curated entries).
- Player in projections.csv but not in saved CSV / ADP → already handled by the fallback at line 112; behavior unchanged.
- Empty `projMap` (e.g., projections.csv missing) → `projFromMap` is empty string, falls through to `projRaw` exactly as before.

No changes needed to `dataLoader.js`, `CompareView.jsx`, or any other consumer — they already use `projPointsMap` which is correctly built.

## Dependencies
None

## Open Questions
None — change is local, low-risk, and the desired behavior is unambiguous.

---
*Approved by: <!-- developer name/initials and date once approved -->*
