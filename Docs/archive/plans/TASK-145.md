<!-- Completed: 2026-04-06 | Verified: No — code confirmed present in helpers.js, dataLoader.js, AdpTimeSeries.jsx, ExposureTable.jsx, RosterViewer.jsx; developer visual check pending -->
# TASK-145: Cross-platform player name normalization — UD / DK alignment

**Status:** Done
**Priority:** P1

---

## Objective

Player names are inconsistent between Underdog and DraftKings ADP sources (e.g. "Aaron Jones" on UD vs "Aaron Jones Sr." on DK, "D.J. Moore" vs "DJ Moore"). This causes `platStats` and the ADP tracker table to show null DK ADP for players who exist on DK under a slightly different name. Fix by exporting a single `canonicalName()` function from `helpers.js` and applying it everywhere name matching occurs.

## Verification Criteria

1. A player who appears as "Aaron Jones" in UD data and "Aaron Jones Sr." in DK data resolves to the same canonical key — their DK ADP column in the ADP Tracker table is no longer null.
2. A player whose name contains initials with periods (e.g. "D.J. Moore" / "DJ Moore") resolves to the same canonical key.
3. Players with Roman numeral suffixes (Patrick Mahomes II, Kenneth Walker III) match their UD equivalents.
4. No player merges that weren't merged before (no regression — two distinct players with similar names are not collapsed into one).
5. `platStats` in AdpTimeSeries correctly shows both UD and DK ADP values for all matching players.

## Verification Approach

Steps Claude can run:
1. Search for any test files and run them if present: `cd best-ball-manager && npm test 2>&1 | head -50` (expect no new failures).
2. Run `npm run build` from `best-ball-manager/` — expect zero errors.

Steps requiring the developer:
3. Load the app with DK + UD ADP data loaded. Open ADP Tracker → check that players like "Aaron Jones Sr." (DK) now show a populated DK ADP column rather than null.
4. Confirm no obviously wrong merges — e.g., "Justin Jefferson" still appears as one entry, not two.

## Files to Change

| File | Action | Description |
|------|--------|-------------|
| `best-ball-manager/src/utils/helpers.js` | Modify | Export `canonicalName()` function; replace inline `normalize()` in `processMasterList` with it |
| `best-ball-manager/src/utils/dataLoader.js` | Modify | Use `canonicalName()` as key in `buildLookupsFromRows()` and name lookups |
| `best-ball-manager/src/components/AdpTimeSeries.jsx` | Modify | Replace inline `norm()` in `platStats` and name comparison in `richPlayerList` with `canonicalName()` |

## Implementation Approach

### 1. Add `canonicalName()` to `helpers.js`

Export a single normalization function. All name comparison across the pipeline must use this.

```js
/**
 * Canonical player name key for cross-platform matching.
 * Strips generational suffixes, removes periods from initials,
 * normalizes whitespace, and lowercases.
 * Use for map keys and comparisons — NOT for display.
 */
const SUFFIX_RE = /\s+(jr\.?|sr\.?|ii|iii|iv|v)\s*$/i;

export function canonicalName(name = '') {
  return String(name)
    .trim()
    .replace(/^"|"$/g, '')     // strip surrounding quotes
    .replace(SUFFIX_RE, '')    // strip generational suffix
    .replace(/\./g, '')        // remove periods (D.J. → DJ)
    .replace(/\s+/g, ' ')     // normalize whitespace
    .trim()
    .toLowerCase();
}
```

The `SUFFIX_RE` strips only a trailing suffix word — it won't match "Jr" in the middle of a name.

**No static alias map for now.** The suffix + period normalization handles the vast majority of UD/DK divergence. If specific players are still mismatched after this, a `PLAYER_ALIASES` map can be added in a follow-up.

### 2. Update `processMasterList()` in `helpers.js`

Replace the inline `normalize` function with `canonicalName`:

```js
// Before:
const normalize = (s = '') =>
  String(s || '').trim().replace(/^"|"$/g, '').replace(/\s+/g, ' ').toLowerCase();

// After: just use canonicalName directly (it does the same + more)
```

Replace every call to `normalize(...)` within `processMasterList` with `canonicalName(...)`. Display names (`displayNameFor`, `displayName`) remain unchanged — `canonicalName` is only used as the key, never for display.

### 3. Update `buildLookupsFromRows()` in `dataLoader.js`

Import `canonicalName` and use it when keying the maps:

```js
import { processMasterList, parseAdpString, canonicalName } from './helpers';

// In buildLookupsFromRows:
const name = rowName(row);
if (!name) return;
const key = canonicalName(name);   // ← was: use name directly as key

teamLookup[key] = teamVal;
adpMap[key] = parsed ? parsed : { display: String(rawAdp), pick: NaN };
if (!isNaN(projVal) && projVal > 0) projPointsMap[key] = projVal;
```

Also update all downstream lookups that use `localAdpMap[player.name]` or `teamLookup[player.name]` to use `localAdpMap[canonicalName(player.name)]` etc.

Specific lookup sites in `dataLoader.js` to update:
- `enrichedRosters` map: `teamLookup[player.name]` → `teamLookup[canonicalName(player.name)]`
- `enrichedRosters` map: `localAdpMap[player.name]` → `localAdpMap[canonicalName(player.name)]`
- `projPointsMap[player.name]` references → `projPointsMap[canonicalName(player.name)]`

### 4. Update `platStats` in `AdpTimeSeries.jsx`

Replace the inline `norm()` with `canonicalName`:

```js
import { parseAdpString, canonicalName } from '../utils/helpers';

// In platStats useMemo:
// Before:
const norm = s => String(s || '').trim().replace(/^"|"$/g, '').replace(/\s+/g, ' ').toLowerCase();
// After: remove norm, use canonicalName directly

// When keying:
const name = canonicalName(extractName(row));   // ← was: norm(extractName(row))
```

And where `platStats` is consumed (the `.filter` and `.map` in the `tableRows` useMemo):
```js
const ps = platStats[canonicalName(p.name)] ?? {};   // ← was: platStats[norm(p.name)]
```

### 5. Update name matching in `richPlayerList` in `AdpTimeSeries.jsx`

The current match loop does exact string comparison:
```js
if (pData.name === normalizedName) { matchedId = pid; break; }
```

Update to canonical comparison:
```js
if (canonicalName(pData.name) === canonicalName(normalizedName)) { matchedId = pid; break; }
```

## Dependencies

- TASK-141 (multi-platform ADP foundation) — complete.
- TASK-142 (ADP TimeSeries platform selector) — complete.
