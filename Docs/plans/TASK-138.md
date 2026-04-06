<!-- Completed: 2026-04-05 | Commit: pending -->
# TASK-138: DraftKings overlay — improve abbreviated name matching for ambiguous players

**Status:** Done
**Priority:** P2

---

## Objective

Disambiguate abbreviated player names on the DraftKings draft board (e.g., "K. Williams") so that players with colliding abbreviations get correct exposure and correlation data instead of showing nothing.

## Verification Criteria

1. When `abbreviatedNameMap` encounters two portfolio players sharing an abbreviation (e.g., "Kyren Williams" RB and "Kyle Williams" TE), the map stores an array of candidates instead of `null`.
2. `resolvePlayerKey("K. Williams", row)` returns the correct full name when the DK row's position/team element distinguishes the candidates (e.g., "RB - LAR" → "kyren williams").
3. `resolvePlayerKey("K. Williams", row)` returns `null` (existing behavior) when no row context is provided or when position+team still doesn't disambiguate.
4. Unambiguous abbreviations continue to resolve correctly (no regression).
5. Direct full-name matches continue to resolve correctly (no regression).
6. The Underdog adapter is unaffected (it has no `getPlayerContext` method; `resolvePlayerKey` falls back gracefully).

## Verification Approach

1. `npm run build` from `chrome-extension/` — must succeed with no errors. Check output for unexpected warnings.
2. Code review of the three changed functions:
   - `abbreviatedNameMap` build loop: confirm unambiguous entries remain strings, ambiguous entries become arrays of `{fullName, position, team}`.
   - `resolvePlayerKey`: confirm it checks `typeof resolved === 'string'` vs `Array.isArray(resolved)`, uses adapter context for disambiguation, and returns `null` on failure.
   - `getPlayerContext`: confirm it parses `"RB - LAR"` into `{position: "RB", team: "LAR"}` and returns nulls on missing/unparseable elements.
3. Manual test on a live DraftKings draft page (developer) — confirm that a player whose abbreviated name was previously ambiguous now shows Exp/Corr values.

Steps 1-2 can be run by Claude. Step 3 requires the developer.

## Files to Change

| File | Action | Description |
|------|--------|-------------|
| `chrome-extension/src/adapters/draftkings.js` | Modify | Add `getPlayerContext(row)` method and `playerContextSelector` to selectors |
| `chrome-extension/src/content/draft-overlay.js` | Modify | Enrich abbreviatedNameMap for ambiguous entries, update `resolvePlayerKey` to accept optional `row` and disambiguate, resolve player key early in `processRow`/`updateRowMetrics` |

## Implementation Approach

### Step 1: DK adapter — `getPlayerContext(row)`

Add a method to `draftkingsAdapter` that extracts position and team from a row's DOM:

```js
getPlayerContext(row) {
  const el = row.querySelector('.PlayerCell_player-position-and-team');
  if (!el) return { position: null, team: null };
  const text = el.textContent?.trim();  // e.g. "RB - LAR"
  const match = text?.match(/^(\w+)\s*-\s*(\w+)$/);
  return match
    ? { position: match[1].toUpperCase(), team: match[2].toUpperCase() }
    : { position: null, team: null };
}
```

Add `playerContextSelector: '.PlayerCell_player-position-and-team'` to the `selectors` object (for documentation/consistency, though the method uses it directly).

### Step 2: Enrich `abbreviatedNameMap` in `applyPortfolioFilter()`

Change the ambiguous branch from setting `null` to collecting candidates:

```js
// Current: abbreviatedNameMap.set(abbrev, null)
// New: collect as array of candidates
if (abbreviatedNameMap.has(abbrev)) {
  const existing = abbreviatedNameMap.get(abbrev);
  if (typeof existing === 'string') {
    // Convert first entry to array, add second candidate
    abbreviatedNameMap.set(abbrev, [
      { fullName: existing, position: playerPositionMap.get(existing)?.toUpperCase() ?? null, team: playerTeamMap.get(existing)?.toUpperCase() ?? null },
      { fullName: fullName, position: playerPositionMap.get(fullName)?.toUpperCase() ?? null, team: playerTeamMap.get(fullName)?.toUpperCase() ?? null },
    ]);
  } else if (Array.isArray(existing)) {
    // Third+ collision — append
    existing.push({ fullName: fullName, position: playerPositionMap.get(fullName)?.toUpperCase() ?? null, team: playerTeamMap.get(fullName)?.toUpperCase() ?? null });
  }
} else {
  abbreviatedNameMap.set(abbrev, fullName);  // unambiguous — unchanged
}
```

Note: `fullName` here is the `key` variable (already lowercased). Position/team are uppercased for case-insensitive comparison with DOM values.

### Step 3: Update `resolvePlayerKey(displayName, row?)`

Add optional `row` parameter. When the map returns an array:

```js
function resolvePlayerKey(displayName, row) {
  if (!displayName) return null;
  const key = displayName.trim().toLowerCase();
  if (playerIndexMap.has(key)) return key;
  
  const resolved = abbreviatedNameMap.get(key);
  if (typeof resolved === 'string') return resolved;
  
  // Ambiguous — try to disambiguate with DOM context
  if (Array.isArray(resolved) && row && adapter.getPlayerContext) {
    const ctx = adapter.getPlayerContext(row);
    let candidates = resolved;
    if (ctx.position) {
      const byPos = candidates.filter(c => c.position === ctx.position);
      if (byPos.length === 1) return byPos[0].fullName;
      if (byPos.length > 1) candidates = byPos;  // narrow, try team next
    }
    if (ctx.team) {
      const byTeam = candidates.filter(c => c.team === ctx.team);
      if (byTeam.length === 1) return byTeam[0].fullName;
    }
  }
  
  return null;
}
```

### Step 4: Thread `row` through call sites

In `processRow(row)` and `updateRowMetrics(row)`, resolve the player key once at the top level (where `row` is available) and pass the resolved full name to downstream functions. The downstream functions (`computeExposure`, `computeCorrelation`, `applyStackBadge`, `applyTierBreak`) already call `resolvePlayerKey` internally — passing the resolved full name means they'll match directly on `playerIndexMap.has(key)` without needing the abbreviation path.

```js
// In processRow, after getPlayerNameFromRow:
const playerName = getPlayerNameFromRow(row);
const resolvedName = resolvePlayerKey(playerName, row) ?? playerName;
// Use resolvedName for computeExposure, computeCorrelation, applyStackBadge, applyTierBreak
```

Same pattern in `updateRowMetrics`.

### Edge Cases

- **No row context (called without row):** Falls through to `return null` — same as current behavior for ambiguous names.
- **DOM element missing:** `getPlayerContext` returns `{position: null, team: null}`, disambiguation skipped, returns `null`.
- **3+ collisions:** Array grows; position+team should still narrow to 1 in practice (NFL players on different teams).
- **Underdog adapter:** Has no `getPlayerContext`, so the `adapter.getPlayerContext` guard prevents any call. Underdog uses full names anyway.

## Dependencies

- TASK-137 (DraftKings draft overlay) — must be functional first.

## Open Questions

- The exact CSS class `PlayerCell_player-position-and-team` needs confirmation on a live DK page. If the class name differs, step 1 adjusts trivially.

---
*Approved by: PH — 2026-04-05*
