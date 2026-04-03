<!-- Completed: 2026-04-03 | Commit: cee9a97 -->
# TASK-111: Stack Profiles — Sortable table columns (QB, Stack %, Drafts)

**Status:** Approved
**Priority:** P3

---

## Objective

Make the QB, STACK %, and DRAFTS column headers in the Stack Profiles table clickable to sort. Clicking the active column toggles direction; clicking a different column sorts by that column descending. Default sort remains Stack % descending.

## Verification Criteria

1. Clicking "QB" sorts alphabetically by QB name (asc first click, desc second).
2. Clicking "STACK %" toggles between desc and asc. Default on load is desc.
3. Clicking "DRAFTS" sorts by totalDrafts desc/asc.
4. The active column header shows a directional indicator (↑ asc, ↓ desc). Inactive headers show no indicator.
5. Clicking a different column always starts at desc.
6. Sort is applied at render time — does not re-trigger the `stackProfilesData` useMemo.
7. `npm run lint` passes with no new errors.

## Verification Approach

1. Run `npm run lint` — confirm clean.
2. Load app, navigate to Combo Analysis → Stack Profiles.
3. Verify table loads sorted by Stack % desc with ↓ on that header.
4. Click "STACK %" — verify sort flips to asc with ↑.
5. Click "DRAFTS" — verify sort by totalDrafts desc, ↓ on DRAFTS, no indicator on STACK %.
6. Click "QB" — verify alphabetical sort asc, ↑ on QB.
7. Click "QB" again — verify desc, ↓.

## Files to Change

| File | Action | Description |
|------|--------|-------------|
| `best-ball-manager/src/components/ComboAnalysis.jsx` | Modify | Add sortKey/sortDir state, sortable header clicks, sort at render |

## Implementation Approach

Added `sortKey`/`sortDir` state (defaults: `'stackPct'`/`'desc'`). `handleSort` flips direction on same key, resets to desc on new key. Both reset in `handleTabClick`. Sort applied in a tbody IIFE after the filter step. `SortHeader` inline helper renders clickable `<th>` with ↑/↓ indicator, defined inside a thead IIFE to close over sort state without prop-drilling.

## Dependencies

None.

---
*Approved by: developer*
