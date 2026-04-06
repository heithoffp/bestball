<!-- Completed: 2026-04-06 | Commit: 32d52a6 -->
# TASK-146: Platform-aware Cur ADP in Rosters tab + 1-decimal formatting

**Status:** Done
**Priority:** P1

---

## Objective

Fix the "Cur ADP" column in the Rosters tab so it shows ADP from the platform the entry was drafted on (Underdog vs DraftKings), and format all ADP display values to 1 decimal place.

## Verification Criteria

1. DraftKings ADP raw value "1.3765014" displays as "1.4" in the Cur ADP column.
2. Underdog ADP raw value "1.4" still displays as "1.4".
3. An entry whose `slateTitle` contains "UD" shows Underdog ADP; one containing "Draftkings" shows DraftKings ADP.
4. An entry with no tournament title (CSV import) still shows ADP — falls back to global latest snapshot.
5. `npm run build` from `best-ball-manager/` produces zero errors.

## Verification Approach

Steps Claude can run:
1. `cd best-ball-manager && npm run build 2>&1 | tail -20` — expect zero errors.

Steps requiring the developer:
2. Load the app with both UD and DK ADP files loaded. Open the Rosters tab, drill into a roster. Confirm "Cur ADP" values show one decimal place (e.g. "1.4", not "1.3765014").
3. If entries from multiple platforms are present, confirm Underdog entries show UD ADP and DraftKings entries show DK ADP.

## Files to Change

| File | Action | Description |
|------|--------|-------------|
| `best-ball-manager/src/utils/helpers.js` | Modify | `parseAdpString` — format numeric `display` to `value.toFixed(1)` |
| `best-ball-manager/src/utils/dataLoader.js` | Modify | Add `detectPlatformFromSlate` helper; use platform-specific ADP map in `enrichedRosters` lookup |

## Implementation Approach

### 1. `helpers.js` — `parseAdpString` decimal formatting

Change the numeric return from preserving the raw string to 1 decimal place:

```js
return {
  pick: value,
  display: value.toFixed(1)
};
```

### 2. `dataLoader.js` — platform-aware ADP enrichment

Added `detectPlatformFromSlate` before `processLoadedData`:

```js
function detectPlatformFromSlate(slateTitle) {
  const t = (slateTitle || '').toLowerCase();
  if (t.includes('ud')) return 'underdog';
  if (t.includes('draftkings')) return 'draftkings';
  return null;
}
```

In `enrichedRosters` map, replaced `localAdpMap[key]` with platform-aware lookup with fallback.

## Dependencies

- TASK-145 (cross-platform name normalization) — not a hard dependency, but normalizing names will make the platform-specific lookup more accurate when it is merged.

---
*Approved by: developer, 2026-04-06*
