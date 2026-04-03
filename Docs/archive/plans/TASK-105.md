# TASK-105: Tournament filter — multi-select with slate-grouped checklist

**Status:** Approved
**Priority:** P3

---

## Objective

Replace the single-value tournament dropdown in ExposureTable and RosterViewer with a multi-select checklist popover, so users can filter to any combination of tournaments (e.g., 2 of 3). Selections are grouped by slate.

## Verification Criteria

1. The tournament control in Exposure and Rosters tabs shows a button trigger labeled "All Tournaments" when nothing is selected, and "N selected" when 1 or more tournaments are chosen.
2. Clicking the trigger opens a popover checklist with tournaments grouped by slate label, each with a checkbox.
3. Each slate group has a "Select all" toggle that checks/unchecks all tournaments in that group.
4. Selecting 1+ tournaments filters the data to only those tournaments.
5. Deselecting all returns to "All Tournaments" (unfiltered).
6. Clicking outside the popover closes it.
7. The existing `slateGroups` data structure is reused — no regression on slate grouping.
8. Build passes with no errors.

## Verification Approach

Developer confirms visually in `npm run dev`:
1. Exposure tab: open tournament control, verify checklist with slate groups renders.
2. Select 2 tournaments from different slates — verify exposure data filters to only those tournaments.
3. Check "Select all" in a slate group — verify all tournaments in that group become checked.
4. Uncheck all — verify "All Tournaments" label returns and data is unfiltered.
5. Click outside popover — verify it closes.
6. Repeat checks in Rosters tab.
7. Run `npm run build` — confirm clean.

## Files to Change

| File | Action | Description |
|------|--------|-------------|
| `best-ball-manager/src/components/TournamentMultiSelect.jsx` | Create | Shared checklist-popover component |
| `best-ball-manager/src/components/TournamentMultiSelect.module.css` | Create | Styles for the trigger button and popover panel |
| `best-ball-manager/src/components/ExposureTable.jsx` | Modify | Replace `tournamentFilter` string state + `<select>` with multi-select component; update filter predicate |
| `best-ball-manager/src/components/RosterViewer.jsx` | Modify | Same replacement as ExposureTable (two render locations; one shared filter state) |

## Implementation Approach

### State change

In ExposureTable and RosterViewer, replace:
```js
const [tournamentFilter, setTournamentFilter] = useState('all');
```
with:
```js
const [selectedTournaments, setSelectedTournaments] = useState([]); // empty = all
```

### Filter predicate

ExposureTable (`playerExposures` useMemo, currently line ~126):
```js
// Before:
const tournamentMatch = tournamentFilter === 'all'
  || (tournamentFilter.startsWith('slate:') && ...)
  || rosterTournament === tournamentFilter;

// After:
const tournamentMatch = selectedTournaments.length === 0
  || selectedTournaments.includes(rosterTournament);
```

RosterViewer (`baseFiltered` useMemo, currently two locations with `tournamentFilter !== 'all'` checks):
```js
// Before:
if (tournamentFilter !== 'all') {
  if (tournamentFilter.startsWith('slate:')) { ... }
  else { list = list.filter(r => r.tournamentTitle === tournamentFilter); }
}

// After:
if (selectedTournaments.length > 0) {
  list = list.filter(r => selectedTournaments.includes(r.tournamentTitle));
}
```

Remove `tournamentFilter` from all `useMemo` dependency arrays; replace with `selectedTournaments`.

### TournamentMultiSelect component

**Props:** `slateGroups` (array of `{ slate, tournaments[] }`), `selected` (string[]), `onChange` (fn receiving new string[])

**Behavior:**
- Button trigger: shows "All Tournaments" if `selected.length === 0`, otherwise `${selected.length} selected`
- Click trigger → toggle `isOpen` state
- `useEffect` with a `mousedown` listener on `document` to close when clicking outside (use a `ref` on the container div)
- Popover panel:
  - "Clear all" link at top-right (visible when `selected.length > 0`)
  - Per slate group: slate label + "all" checkbox (indeterminate if partial), then indented tournament checkboxes
  - Toggle individual tournament: add/remove from `selected` array
  - Toggle slate "all": if all tournaments in slate are selected → deselect all; else select all in slate

**Slate group checkbox state:**
```js
const slateSelected = tournaments.filter(t => selected.includes(t));
const allChecked = slateSelected.length === tournaments.length;
const someChecked = slateSelected.length > 0 && !allChecked;
// Set checkboxRef.current.indeterminate = someChecked
```

**Styling (TournamentMultiSelect.module.css):**
- `.container` — `position: relative; display: inline-block`
- `.trigger` — matches `filter-select` appearance (same border, radius, bg, font)
- `.popover` — `position: absolute`, `z-index: 200`, `background: var(--surface-2)`, `border: 1px solid var(--border-subtle)`, `border-radius: var(--radius-md)`, `min-width: 220px`, `max-height: 320px`, `overflow-y: auto`, `box-shadow: var(--shadow-md)`
- `.slateLabel` — bold, small, muted color, uppercase, padded
- `.tournamentRow` — flex, gap, padded left for indent
- `.clearAll` — small text link aligned right

### Usage

Replace the `<select>` elements in ExposureTable (1 instance) and RosterViewer (2 instances — desktop + mobile) with:
```jsx
<TournamentMultiSelect
  slateGroups={slateGroups}
  selected={selectedTournaments}
  onChange={setSelectedTournaments}
/>
```

### Active filter pill (RosterViewer — optional)

If `selectedTournaments.length > 0`, add a pill "Tournament: N selected" with a clear action to the existing `activeFilterPills` system. Implement only if straightforward given existing pill infrastructure.

## Dependencies

TASK-104 (completed — slate grouping already in place)

---

*Approved by: <!-- developer name/initials and date once approved -->*
