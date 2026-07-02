<!-- Completed: 2026-07-02 | Commit: f5bb972 (verified shipped in 2026-07-02 launch review) -->
# TASK-299: Wire Eliminator ADP into roster enrichment (eliminator_adp.csv for Eliminator slate)

**Status:** Pending Approval
**Priority:** P2

---

## Objective
Rosters drafted on the Underdog Eliminator slate (slate title `UD 2026 Eliminator Season`)
should resolve their ADP against the new `eliminator_adp.csv` rather than the global/underdog
pool. Mirror the existing `superflex` wiring in exactly two spots so the Eliminator pool
becomes its own platform (`adpByPlatform.eliminator`) and Eliminator-slate roster players
enrich against it.

This also fixes a **latent bug** introduced by adding the file: `eliminator_adp.csv` has no
date in its filename and is not superflex, so `loadBundledAdp()` currently falls through to
`dateStr = fileName` (`"eliminator_adp.csv"`). That string sorts *after* every dated snapshot
under `localeCompare` (letters sort after digits), making the Eliminator pool the global
`latest` snapshot — which drives the global `localAdpMap`, `teamLookup`, `projPointsMap`, and
the ADP universe used as the fallback for any slate that doesn't resolve to a platform. The
fix assigns the `'1900-01-01'` sentinel date (same approach superflex already uses) so it can
never win the global `latest`.

## Verification Criteria
1. `npm run build` succeeds (no syntax/import errors).
2. `npm run lint` passes with no new errors in the two touched files.
3. After load, `adpByPlatform.eliminator` exists with `snapshots.length === 1`,
   a non-empty `latestAdpMap`, and `latestRows` from `eliminator_adp.csv`.
4. The global `latest` snapshot is the most-recent **dated** DK/UD file (e.g.
   `2026-06-29`), **not** `eliminator_adp.csv` — confirming the sentinel-date fix.
5. A roster row whose `slateTitle` contains `"eliminator"` (e.g. `UD 2026 Eliminator
   Season`) enriches with `adpPlatform === 'eliminator'` and its `latestADP` / `latestADPDisplay`
   come from the Eliminator map (not the underdog map). A non-Eliminator UD roster still
   resolves to `adpPlatform === 'underdog'`.

## Verification Approach
- **Automated:** Run `npm run build` and `npm run lint` from `best-ball-manager/`; report
  full output. Both must pass.
- **Logic check (automated, scratchpad):** Write a tiny Node script in the scratchpad that
  imports nothing app-specific but reproduces `detectPlatformFromSlate`'s branch order against
  the strings `"UD 2026 Eliminator Season"`, `"UD 2026 Superflex Season"`, `"UD 2026 Season"`,
  and `"DK Pre-Draft Best Ball"` — asserting they map to `eliminator`, `superflex`, `underdog`,
  `draftkings` respectively. Confirms the ordering fix (Eliminator before UD).
- **Manual (developer, in browser):** With Eliminator rosters synced, open the app and
  confirm an Eliminator-slate roster shows ADP values consistent with `eliminator_adp.csv`
  (the Eliminator pool ADP differs from the season-long UD pool). Confirm a Best Ball Mania
  (non-Eliminator) UD roster is unchanged. This is the only step requiring the developer —
  it needs live synced Eliminator entries.

## Files to Change
| File | Change |
|------|--------|
| `best-ball-manager/src/App.jsx` | In `loadBundledAdp()`: add `isEliminator` detection on the filename; include it (with `isSuperflex`) in the sentinel-date branch; assign `platform = 'eliminator'`. |
| `best-ball-manager/src/utils/dataLoader.js` | In `detectPlatformFromSlate()`: add `if (t.includes('eliminator')) return 'eliminator';` as the **first** branch (before `superflex`/`ud`); update the JSDoc return list. |

No new files. The `eliminator_adp.csv` asset already exists and is already matched by the
`import.meta.glob('./assets/adp/*.csv')` in `App.jsx`. No read-only paths are modified.

## Implementation Approach

**1. `App.jsx` — `loadBundledAdp()`** (around lines 88–95). Current:
```js
const isSuperflex = /^superflex_adp/.test(fileName);
// Superflex has different scoring; never let it win the global "latest" fallback
// used for slates that don't resolve to a specific platform.
const dateStr = dateMatch ? dateMatch[1] : (isSuperflex ? '1900-01-01' : fileName);
const platformMatch = fileName.match(/^(underdog|draftking)_adp_/);
let platform = 'unknown';
if (isSuperflex) platform = 'superflex';
else if (platformMatch) platform = platformMatch[1] === 'draftking' ? 'draftkings' : platformMatch[1];
```
Becomes:
```js
const isSuperflex = /^superflex_adp/.test(fileName);
const isEliminator = /^eliminator_adp/.test(fileName);
// Superflex and Eliminator have different scoring / player pools; never let them win
// the global "latest" fallback used for slates that don't resolve to a specific platform.
const dateStr = dateMatch ? dateMatch[1] : ((isSuperflex || isEliminator) ? '1900-01-01' : fileName);
const platformMatch = fileName.match(/^(underdog|draftking)_adp_/);
let platform = 'unknown';
if (isSuperflex) platform = 'superflex';
else if (isEliminator) platform = 'eliminator';
else if (platformMatch) platform = platformMatch[1] === 'draftking' ? 'draftkings' : platformMatch[1];
```

**2. `dataLoader.js` — `detectPlatformFromSlate()`** (lines 42–49). Add the Eliminator branch
first (because the UD Eliminator slate title also contains `"ud"`, which the existing
`t.includes('ud')` branch would otherwise claim), and update the JSDoc:
```js
/** Infer draft platform from slate title string. Returns 'eliminator', 'superflex', 'underdog', 'draftkings', or null. */
function detectPlatformFromSlate(slateTitle) {
  const t = (slateTitle || '').toLowerCase();
  if (t.includes('eliminator')) return 'eliminator';
  if (t.includes('superflex')) return 'superflex';
  if (t.includes('draftkings') || t.startsWith('dk ') || t === 'dk') return 'draftkings';
  if (t.includes('ud')) return 'underdog';
  return null;
}
```

No changes needed downstream: the existing enrichment at `dataLoader.js:230-232` already does
`adpByPlatform[detectedPlatform]?.latestAdpMap` with a fallback to `localAdpMap`, and the
per-platform grouping at lines 199–210 builds `adpByPlatform.eliminator` automatically once the
snapshot carries `platform: 'eliminator'`. The CSV's column shape (`firstName`/`lastName`/`adp`/
`projectedPoints`/`teamName`) is already handled by `buildLookupsFromRows`.

## Notes / Out of Scope (flagged, not included)
- The new `eliminator` platform will automatically appear as a selectable platform in the
  ADP Tracker (`AdpTimeSeries`) and Player Rankings (`PlayerRankings`) tabs, exactly as
  `superflex` already does, since both iterate `Object.keys(adpByPlatform)`. This is
  consistent existing behavior; if undesired it would be a separate task.
- `ComboAnalysis.jsx:1122` filters superflex rosters out of combo analysis but does **not**
  filter Eliminator. Whether Eliminator rosters belong in QB-stack combo analysis (a weekly
  survival format where playoff stacking is irrelevant) is a separate product question — not
  in scope here.

## Dependencies
None

## Open Questions
None
