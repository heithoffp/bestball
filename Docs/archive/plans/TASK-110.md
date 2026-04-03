<!-- Completed: 2026-04-03 | Commit: cee9a97 -->
# TASK-110: Stack Profiles — Stack % column, default sort, and full button labels

**Status:** Approved
**Priority:** P3

---

## Objective

Add a "Stack %" column to the Stack Profiles table (% of QB's rosters with at least one stacked teammate, respecting position exclusion filters), sort the table by this value descending by default, and rename the position exclusion toggle labels to "Exclude TE" / "Exclude RB".

## Verification Criteria

1. A "STACK %" column appears as the third column in the Stack Profiles table header, between "STACK DIVERSITY" and "DRAFTS".
2. Each QB row shows stack % = `(totalDrafts - nakedCount) / totalDrafts * 100` formatted to one decimal place (e.g. `74.3%`). The nakedCount reflects the active Exclude TE / Exclude RB filters.
3. The table is sorted by stack % descending by default; ties broken by `totalDrafts` descending.
4. The existing DRAFTS column remains unchanged.
5. Toggle button labels read "Exclude TE" and "Exclude RB".
6. `npm run lint` passes with no new errors.

## Verification Approach

1. Run `npm run lint` — confirm clean.
2. Load app, navigate to Combo Analysis → Stack Profiles.
3. Verify "STACK %" column header appears between STACK DIVERSITY and DRAFTS.
4. Verify rows are sorted highest stack % first.
5. Enable "Exclude TE" — verify stack % values recalculate (QBs who only stacked with TEs should drop to 0%).
6. Check button labels read "Exclude TE" and "Exclude RB".

## Files to Change

| File | Action | Description |
|------|--------|-------------|
| `best-ball-manager/src/components/ComboAnalysis.jsx` | Modify | Compute stackPct, add column, change sort, rename buttons |

## Implementation Approach

In `stackProfilesData` useMemo, when mapping `qbGroups` to the output array:
- Compute `nakedCount` from combos where `players.length === 0`
- Compute `stackPct = ((totalDrafts - nakedCount) / totalDrafts) * 100`
- Change `.sort()` to `b.stackPct - a.stackPct || b.totalDrafts - a.totalDrafts`

Add `<th>` for `STACK %` in table header (~80px). Add `<td>` in QB row rendering `{group.stackPct.toFixed(1)}%`.

Rename button labels: `"Excl. TE"` → `"Exclude TE"`, `"Excl. RB"` → `"Exclude RB"`.

## Dependencies

None.

---
*Approved by: developer*
