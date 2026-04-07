<!-- Completed: 2026-04-07 | Commit: e669b5f -->
# TASK-178: RosterViewer — compact long tournament name display in roster rows

**Status:** Approved
**Priority:** P2

---

## Objective
Long DK `ContestName` values (e.g., "DraftKings $7.7M Best Ball Mania IV Presented by DraftKings Sportsbook") stretch the first column of the Roster table. Add a `compactTournamentName()` display helper that strips the "DraftKings " prefix and " Presented by …" suffix, and apply it to the tournament title span in RosterViewer.

## Verification Criteria
- The tournament title shown in roster rows is noticeably shorter for typical DK contest names
- The full name is accessible via the element's `title` attribute (hover tooltip)
- Underdog entries are unchanged
- No regression to the TournamentMultiSelect filter dropdown (compaction is display-only; filter logic still matches on `tournamentTitle`)

## Verification Approach
1. `npm run build` from `best-ball-manager/` — clean build, no errors
2. Load app with DK roster data; verify Rosters tab first column shows compacted names
3. Hover over a compacted name and confirm the tooltip shows the full original name
4. Confirm TournamentMultiSelect filter still works (filtering by a DK tournament still applies correctly)
5. Check Underdog roster rows — `tournamentTitle` unchanged

## Files to Change

| File | Action | Description |
|------|--------|-------------|
| `best-ball-manager/src/utils/helpers.js` | Modify | Add `compactTournamentName(name)` export |
| `best-ball-manager/src/components/RosterViewer.jsx` | Modify | Apply `compactTournamentName()` to tournament title span; add `title` attribute |

## Implementation Approach

### 1. `compactTournamentName(name)` in `helpers.js`

```js
export function compactTournamentName(name) {
  if (!name) return name;
  let compact = name
    .replace(/^DraftKings\s+/i, '')           // strip "DraftKings " prefix
    .replace(/\s+Presented by\b.*/i, '');     // strip " Presented by ..." suffix
  if (compact.length > 40) compact = compact.slice(0, 38) + '…';
  return compact;
}
```

### 2. `RosterViewer.jsx` — tournament title span (line ~855–860)

Import `compactTournamentName` from helpers, then change:
```jsx
{roster.tournamentTitle && (
  <span style={{
    fontFamily: "'JetBrains Mono', monospace", fontSize: 11,
    color: '#666', whiteSpace: 'nowrap',
  }}>{roster.tournamentTitle}</span>
)}
```
to:
```jsx
{roster.tournamentTitle && (
  <span
    style={{ fontFamily: "'JetBrains Mono', monospace", fontSize: 11, color: '#666', whiteSpace: 'nowrap' }}
    title={roster.tournamentTitle}
  >{compactTournamentName(roster.tournamentTitle)}</span>
)}
```

Filter logic (`selectedTournaments.includes(r.tournamentTitle)`) is untouched — filtering still uses the raw `tournamentTitle` value.

## Dependencies
None

---
*Approved by: <!-- developer name/initials and date once approved -->*
