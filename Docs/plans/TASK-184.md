# TASK-184: Draft Capital by Round — draft position filter buttons

**Status:** Pending Approval
**Priority:** P2

---

## Objective

Add toggle buttons ("All", "1"–"12") above the Draft Capital by Round bar chart that filter by draft position (the user's seat on the draft board). Selecting positions shows only rosters drafted from those slots; the bar chart re-renders dynamically. Default shows all positions.

## Verification Criteria

1. A labeled row of 13 buttons ("All" + positions 1–12) renders above the chart inside `shapeCard`.
2. Default state: "All" active; chart shows capital aggregated across all rosters.
3. Clicking a position number deactivates "All" and toggles that position on/off.
4. The chart updates immediately to reflect only entries matching selected positions.
5. Clicking "All" resets to all positions.
6. Active button is visually distinct from inactive (background or border highlight).
7. Label "Draft Position:" precedes the buttons to make the control self-explanatory.
8. Build passes with no errors.

## Verification Approach

1. `npm run build` from `best-ball-manager/` — no errors.
2. Developer visual check in dev server: confirm buttons render, toggling updates the chart, "All" resets.

## Files to Change

| File | Action | Description |
|------|--------|-------------|
| `best-ball-manager/src/components/Dashboard.jsx` | Modify | Derive draft position per entry; add `selectedPositions` state; filter `rosterData` before aggregation; render filter button row |
| `best-ball-manager/src/components/Dashboard.module.css` | Modify | Styles for `.draftPosFilters`, `.draftPosBtn`, `.draftPosBtnActive` |

## Implementation Approach

### Derive draft position per entry

Draft position = the minimum `pick` value across all rows sharing an `entry_id`. In a 12-team snake draft, round-1 picks are 1–12, so the first pick of any entry equals their draft slot.

```js
const draftPositionByEntry = useMemo(() => {
  const map = {};
  rosterData.forEach(p => {
    const pick = Number(p.pick);
    if (!pick) return;
    if (map[p.entry_id] === undefined || pick < map[p.entry_id]) {
      map[p.entry_id] = pick;
    }
  });
  return map; // entry_id -> draft slot (1–12)
}, [rosterData]);
```

### State

```js
const [selectedPositions, setSelectedPositions] = useState(null); // null = All
```

### Toggle handler

```js
function togglePosition(pos) {
  if (pos === 'all') { setSelectedPositions(null); return; }
  setSelectedPositions(prev => {
    const all12 = new Set([1,2,3,4,5,6,7,8,9,10,11,12]);
    const next = new Set(prev ?? all12);
    next.has(pos) ? next.delete(pos) : next.add(pos);
    if (next.size === 12) return null;
    return next;
  });
}
```

### Filter roster rows for `draftCapitalShape`

In the existing `draftCapitalShape` useMemo, filter `rosterData` before the aggregation loop:

```js
const filtered = selectedPositions
  ? rosterData.filter(p => selectedPositions.has(draftPositionByEntry[p.entry_id]))
  : rosterData;
// then use `filtered` instead of `rosterData` in the forEach loop
```

Add `selectedPositions` and `draftPositionByEntry` to the dependency array.

### Render — button row

Insert directly below `<div className={styles.sectionTitle}>Draft Capital by Round</div>`:

```jsx
<div className={styles.draftPosFilters}>
  <span className={styles.draftPosLabel}>Draft Position:</span>
  {['All',1,2,3,4,5,6,7,8,9,10,11,12].map(p => {
    const isAll = p === 'All';
    const active = isAll ? !selectedPositions : selectedPositions?.has(p);
    return (
      <button
        key={p}
        className={`${styles.draftPosBtn}${active ? ` ${styles.draftPosBtnActive}` : ''}`}
        onClick={() => togglePosition(isAll ? 'all' : p)}
      >
        {p}
      </button>
    );
  })}
</div>
```

### CSS

```css
.draftPosFilters {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 4px;
  margin-bottom: 10px;
}

.draftPosLabel {
  font-family: var(--font-mono);
  font-size: 0.7rem;
  color: var(--text-secondary);
  margin-right: 4px;
  white-space: nowrap;
}

.draftPosBtn {
  font-family: var(--font-mono);
  font-size: 0.7rem;
  padding: 2px 6px;
  border-radius: 4px;
  border: 1px solid var(--border-subtle);
  background: transparent;
  color: var(--text-secondary);
  cursor: pointer;
  transition: background 0.15s, color 0.15s, border-color 0.15s;
}

.draftPosBtn:hover {
  border-color: var(--border-default);
  color: var(--text-primary);
}

.draftPosBtnActive {
  background: var(--surface-3);
  border-color: var(--border-default);
  color: var(--text-primary);
}
```

## Dependencies

None

---

*Approved by: <!-- developer name/initials and date once approved -->*
