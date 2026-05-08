# TASK-226: Fix DK name-matching: strip generational suffixes in extension overlay

**Status:** Approved
**Priority:** P2

---

## Objective

DK roster sync (lineup API) returns names without suffixes (`"Aaron Jones"`, `"Kenneth Walker"`), while the DK draft-page DOM and DK ADP feed render suffixed names (`"Aaron Jones Sr."`, `"Kenneth Walker III"`). The extension overlay keys `playerIndexMap` via simple `.trim().toLowerCase()` (`draft-overlay.js:267`) rather than the web app's `canonicalName`, so live-draft lookups miss these players — exposure and correlation render as zero / blank. Underdog is unaffected because both UD sources use a single consistent spelling.

Fix: introduce a `canonicalName` helper in the extension and use it at every player-name keying site in `draft-overlay.js`. Do not normalize at sync time — keep raw display names for the web app UI.

## Verification Criteria

1. On a DK live draft page, players whose ADP feed name carries a suffix (e.g. Aaron Jones Sr., Kenneth Walker III) display correct non-zero `Exp` and `Corr` values when present in the user's synced rosters.
2. Underdog overlay continues to display correct `Exp` / `Corr` for a suffix player (e.g. Marvin Jones Jr., Brian Thomas Jr.) — no regression.
3. Stack pill / `analyzeStackOverlay` resolves the same player on DK regardless of which side has the suffix.
4. `npm run lint` (or extension equivalent) passes.

## Verification Approach

Automated:
- Run the extension's lint/build (`npm run build` in `chrome-extension/`) to ensure the new helper imports cleanly and there are no syntax errors.

Manual (requires the developer):
1. Reload the unpacked extension in Chrome.
2. Visit DK My Contests, sync rosters that contain Aaron Jones Sr. and/or Kenneth Walker III.
3. Open a DK best-ball draft page and confirm the overlay shows non-zero Exp and Corr columns for those players.
4. Open a UD best-ball draft page and confirm a suffix player (Marvin Jones Jr. / Brian Thomas Jr.) still resolves with correct Exp/Corr — regression check.
5. Confirm hovering the Corr cell shows the breakdown popup with current picks resolving correctly even when a current pick name carries a suffix.

## Files to Change

| Path | Change |
|---|---|
| `chrome-extension/src/utils/canonicalName.js` | **New.** Exports `canonicalName(name)` mirroring `best-ball-manager/src/utils/helpers.js:21` — strips trailing `Jr./Sr./II–V`, removes periods, collapses whitespace, lowercases. |
| `chrome-extension/src/content/draft-overlay.js` | Import `canonicalName`. Replace `.trim().toLowerCase()` keying at: `playerIndexMap` build (~:267), `playerTeamMap` / `playerPositionMap` (~:270–271), `abbreviatedNameMap` build (~:278 — build abbreviation from canonical first-initial + canonical last-name so `"k. walker"` exists regardless of suffix presence), `resolvePlayerKey` direct-match (~:690), `computeCorrelation` pick lookup (~:750), `analyzeStackOverlay` team lookup (~:878). |

No changes to:
- `chrome-extension/src/adapters/draftkings.js` (adapter keeps returning raw names)
- `chrome-extension/src/adapters/underdog.js`
- `best-ball-manager/**` (web app already canonicalizes correctly)
- Sync layer / Supabase persistence (raw display names preserved)

## Implementation Approach

1. **Create the helper.** Copy the exact regex and steps from `best-ball-manager/src/utils/helpers.js` into a new ES module `chrome-extension/src/utils/canonicalName.js`. Self-contained — no cross-package import.
2. **Import in draft-overlay.js.** Add `import { canonicalName } from '../utils/canonicalName.js';` near the top of the file.
3. **Replace key construction.** Every place that currently does `name.trim().toLowerCase()` (or the equivalent) for the purpose of looking up / inserting into `playerIndexMap`, `playerTeamMap`, `playerPositionMap`, or `abbreviatedNameMap` must use `canonicalName(name)` instead. Do not change places that use `.toLowerCase()` for string-display purposes (e.g., search-filter input matching).
4. **Abbreviated name map.** When building the `"j. jefferson"` style key at line ~278, derive both first-initial and last-name from the canonical key (which already has suffix stripped). This means abbreviations on DK like `"K. Walker"` resolve to the same canonical as `"Kenneth Walker III"`.
5. **Sanity-check call sites.** After edits, search the file for any remaining `\.toLowerCase\(\)` on a player name and confirm each is intentional (display / search filter only).
6. **Build + manual smoke test** per Verification Approach.

## Rollback Approach

Revert the commit. Extension-only change with no schema or persisted-data effect — no migration needed.
