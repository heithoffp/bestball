<!-- Completed: 2026-04-03 | Commit: cee9a97 -->
# TASK-109: Stack Profiles — Excludes TE / Excludes RB position filters

**Status:** Approved
**Priority:** P3

---

## Objective

Add "Excludes TE" and "Excludes RB" toggle buttons to the Stack Profiles view so users can scope QB stack combos to only the remaining positions (e.g., WR-only stacks when both are active).

## Verification Criteria

1. Two toggle buttons — "Excl. TE" and "Excl. RB" — appear in the Stack Profiles filter row, visible only when `activeTab === 'stacks'`.
2. When "Excl. TE" is active, TE players are excluded from teammate lists when building combo keys. Stacks that previously showed a TE now show a different combo key (or NAKED if no WR/RB remain).
3. When "Excl. RB" is active, RB players are excluded analogously.
4. Both toggles can be active simultaneously (pure WR stacks only).
5. Toggling does not clear the player search — filters are independent.
6. Toggles reset to off when switching away from the Stack Profiles tab (consistent with how `expandedQBs` and `playerSearch` reset on tab switch).
7. Toggle state is wired into the `stackProfilesData` useMemo dependency array so the table recomputes when toggled.
8. `npm run lint` passes with no new errors.

## Verification Approach

1. Run `npm run lint` from `best-ball-manager/` — confirm clean.
2. Load app, navigate to Combo Analysis → Stack Profiles.
3. Enable "Excl. TE": verify any QB row previously showing a TE in a combo no longer shows that TE. Verify NAKED count may increase for QBs whose only stacks included a TE.
4. Enable "Excl. RB": same check for RB players.
5. Enable both: verify only WR stacks remain (and NAKED where applicable).
6. Type a player name in the search box, then toggle a position filter — confirm search text persists.
7. Switch to QB Pairs tab and back — confirm both toggles are reset to off.

## Files to Change

| File | Action | Description |
|------|--------|-------------|
| `best-ball-manager/src/components/ComboAnalysis.jsx` | Modify | Add two boolean state values, wire into useMemo, render toggle buttons |

## Implementation Approach

### State

Add two boolean state values alongside existing state:

```jsx
const [excludeTE, setExcludeTE] = useState(false);
const [excludeRB, setExcludeRB] = useState(false);
```

Reset both in `handleTabClick`:

```jsx
const handleTabClick = (tab) => {
  setActiveTab(tab);
  setExpandedQBs(new Set());
  setPlayerSearch('');
  setSelectedPlayer('');
  setExcludeTE(false);
  setExcludeRB(false);
};
```

### Computation

In `stackProfilesData` useMemo, build the allowed positions list dynamically before filtering teammates:

```jsx
const allowedPositions = ['WR', 'TE', 'RB'].filter(pos => {
  if (pos === 'TE' && excludeTE) return false;
  if (pos === 'RB' && excludeRB) return false;
  return true;
});
```

Replace the hardcoded `['WR', 'TE', 'RB'].includes(p.position)` check with `allowedPositions.includes(p.position)`.

Add `excludeTE` and `excludeRB` to the dependency array: `[rosters, activeTab, excludeTE, excludeRB]`.

### UI

Add the toggle buttons in the Stack Profiles filter row (the `<div>` containing the player search input), just to the right of the search box:

```jsx
{activeTab === 'stacks' && (
  <div style={{ display: 'flex', gap: 6 }}>
    <button
      className={`filter-btn-group__item${excludeTE ? ' filter-btn-group__item--active' : ''}`}
      onClick={() => setExcludeTE(v => !v)}
    >
      Excl. TE
    </button>
    <button
      className={`filter-btn-group__item${excludeRB ? ' filter-btn-group__item--active' : ''}`}
      onClick={() => setExcludeRB(v => !v)}
    >
      Excl. RB
    </button>
  </div>
)}
```

The existing `filter-btn-group__item--active` class handles the active visual state — no new CSS needed.

### Edge case

When both toggles are on and no WR stacks exist for a QB, that QB will show zero qualifying bar segments and be filtered out by the existing `qualifying.length === 0` check — correct behavior, no special handling needed.

## Dependencies

None.

---
*Approved by: <!-- developer name/initials and date once approved -->*
