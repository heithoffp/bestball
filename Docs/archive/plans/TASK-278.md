<!-- Completed: 2026-06-25 | Commit: PENDING -->
# TASK-278: Robust ADP snapshot date parsing + fix underscore-dated 06-25 files and scraper output

**Status:** Approved
**Priority:** P2

---

## Objective
Make the ADP snapshot loader resilient so every dated snapshot resolves to a real `YYYY-MM-DD` date regardless of whether the filename uses dashes or underscores, and correct the two malformed 06-25 files so the timeline/history pipeline stops being fed a garbage date string.

## Verification Criteria
- No underscore-dated ADP files remain in `best-ball-manager/src/assets/adp/` — the two 06-25 files are renamed to the dash convention (`underdog_adp_2026-06-25.csv`, `draftking_adp_2026-06-25.csv`) and git records them as renames (history preserved).
- `loadBundledAdp()` produces `date === '2026-06-25'` for the 06-25 files (a real date), and never falls back to a raw filename string for any `*_adp_*` file that contains a date in either separator form.
- After processing, the per-platform "latest" snapshot for Underdog and DraftKings is the 06-25 snapshot, selected because its date sorts correctly as a date — not because a filename string happened to sort last.
- In `AdpTimeSeries.jsx`, `new Date(snap.date)` returns a valid Date (not `Invalid Date`) for the 06-25 snapshot, so the 1w/1m time-window filter and chart x-axis behave correctly.
- `npm run build` exits 0 and `npm run lint` is clean for touched files.

## Verification Approach
1. **Rename check** — `ls best-ball-manager/src/assets/adp/ | grep -E '_adp_[0-9]{4}_'` returns nothing (no underscore-dated files). `git status` shows the two files as renames (R), not delete+add.
2. **Parser unit check** — throwaway node snippet exercising the extraction logic: assert it returns `2026-06-25` for both `underdog_adp_2026_06_25.csv` and `underdog_adp_2026-06-25.csv`, and still returns `1900-01-01` for `superflex_adp.csv`. Report output.
3. **Build/lint** — run `npm run build` (expect exit 0) and `npm run lint` on the touched files (expect clean).
4. **Manual (developer)** — load the app in demo mode, open the ADP Tracker tab, confirm the latest plotted point is labeled `2026-06-25` (a date, not a filename) and the 1-week/1-month filters include it. *(Note: Kenneth Gainwell's missing ADP is the separate driver tracked in TASK-279 and is not expected to be resolved by this task.)*

## Files to Change
| File | Action | Description |
|------|--------|-------------|
| `best-ball-manager/src/assets/adp/underdog_adp_2026_06_25.csv` | Rename | `git mv` to `underdog_adp_2026-06-25.csv` (corrects a malformed artifact; see Open Questions re: read-only convention) |
| `best-ball-manager/src/assets/adp/draftking_adp_2026_06_25.csv` | Rename | `git mv` to `draftking_adp_2026-06-25.csv` |
| `best-ball-manager/src/App.jsx` | Modify | Normalize underscore date separators before the date regex in `loadBundledAdp()` (~line 79) so any `\d{4}[-_]\d{2}[-_]\d{2}` filename yields a real dashed date |
| `scripts/lib/digest/loadAdp.mjs` | Modify | Apply the same separator normalization to the digest-email ADP loader's filename regex (~line 20) for consistency |

## Implementation Approach
1. **Rename the two files** with `git mv` so history is preserved:
   - `git mv best-ball-manager/src/assets/adp/underdog_adp_2026_06_25.csv best-ball-manager/src/assets/adp/underdog_adp_2026-06-25.csv`
   - same for the `draftking_` file.
   This alone restores correct sorting and a real date for the current snapshot.
2. **Harden the loader** in `App.jsx` `loadBundledAdp()`. Minimal, low-risk change — normalize before matching:
   ```js
   const normalized = fileName.replace(/(\d{4})_(\d{2})_(\d{2})/, '$1-$2-$3');
   const dateMatch = normalized.match(/(\d{4}-\d{2}-\d{2})/);
   ```
   Everything downstream (`dateStr`, superflex `1900-01-01` fallback, platform detection) is unchanged. This makes the app resilient to the malformed-filename class even if a future manual update reintroduces underscores.
3. **Mirror the same normalization** in `scripts/lib/digest/loadAdp.mjs` (line ~20), which has its own filename-date regex used by the weekly-digest email path — so the digest doesn't silently mis-date the same snapshot.
4. Run build + lint; execute the verification steps above.

## Dependencies
None. (Independent of TASK-279, though both stem from the same Gainwell report.)

## Open Questions
- **Read-only path:** `best-ball-manager/src/assets/` is documented as read-only ("never modify"). Renaming a malformed data artifact is corrective, not a content edit, and the parser hardening is the durable defense — but flagging for explicit sign-off since it touches that tree.
- **Origin of the underscore files:** the Python scraper (`scrape_adp_enhanced.py:139`) correctly uses `strftime('%Y-%m-%d')`, so it is *not* the source. The two files entered via commit `bcebee1` ("updated adp") — likely a manual export or a separate DK pull path. The parser hardening defends regardless; if a specific tool is identified as emitting underscores, fixing it at the source is a worthwhile follow-up task (not in this scope).

---
*Approved by: PH — 2026-06-25*
