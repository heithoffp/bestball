# TASK-090: Exposure Table: Compact 2-row filter bar matching Roster Viewer pattern

**Status:** Approved
**Priority:** P3

---

## Objective

Replace the ExposureTable's two disconnected filter zones (toolbar with search/checkbox + a separate filter panel with 3 dropdown selects) with a single unified control panel card — the same 2-row compact pattern used in the Roster Viewer after TASK-081. Row 1 holds search input, Show 0% toggle, and result count. Row 2 holds RB/QB/TE archetype chips inline with separators.

## Verification Criteria

1. On desktop/tablet (≥600px), the filter UI is a single card (surface-1, border, radius 12px) with 2 rows — no separate toolbar controls for search/checkbox, no separate filter panel section.
2. Row 1 contains: the search input (flex:1), the "Show 0%" checkbox label, and a result count badge when any archetype filter is active.
3. Row 2 contains: RB archetype chips + separator + QB archetype chips + separator + TE archetype chips, all inline. Position label precedes each group.
4. The 3 dropdown selects (RB Strategy, QB Strategy, TE Strategy) are gone on desktop.
5. The "Filter by Strategy:" section label is gone.
6. Chips use archetype-specific colors (matching RosterViewer's ARCHETYPE_COLORS), not just position colors.
7. The `TabLayout` title "Exposures" is still visible. The toolbar row is clean (title only, no extra controls on desktop).
8. On mobile (<600px), the existing chip strip (horizontal scroll) and sort bar are unchanged.
9. All filter logic unchanged: archetype, search, and show-0% filters all work correctly.
10. `npm run build` passes with no errors.

## Verification Approach

1. Run `npm run build` from `best-ball-manager/` — zero errors.
2. Developer: confirm the Exposures tab now shows a single 2-row card for filters on desktop.
3. Developer: apply RB, QB, TE archetype filters via chips and confirm the table narrows correctly.
4. Developer: type in the search box and confirm filtering still works.
5. Developer: toggle "Show 0%" and confirm undrafted players appear/disappear.
6. Developer: on mobile, confirm existing chip strip and sort bar are unchanged.

## Files to Change

| File | Action | Description |
|------|--------|-------------|
| `best-ball-manager/src/components/ExposureTable.jsx` | Modify | Replace `renderFilters()` desktop path and toolbar controls with unified 2-row control panel |
| `best-ball-manager/src/components/ExposureTable.module.css` | Modify | Remove `.filterPanel`, `.filterLabel`, `.filterColumn`, `.filterResults`, `.filterBadgeRow`; add `.controlPanel`, `.filterRow1`, `.filterRow2`, `.filterSep` |

## Implementation Approach

### 1. Add archetype color map to ExposureTable.jsx

RosterViewer has `ARCHETYPE_COLORS` locally. Redefine it at the top of ExposureTable:

```js
const ARCHETYPE_COLORS = {
  RB_HERO: '#10B981', RB_BALANCED: '#84cc16', RB_ZERO: '#06b6d4', RB_HYPER_FRAGILE: '#eab308',
  QB_ELITE: '#BF44EF', QB_CORE: '#ec4899', QB_LATE: '#fb7185',
  TE_ELITE: '#3B82F6', TE_ANCHOR: '#818cf8', TE_LATE: '#38bdf8',
};
const archetypeColor = (key) => ARCHETYPE_COLORS[key] || '#6b7280';
```

### 2. Add local `FilterGroup` helper

Inline chip-group component (mirrors RosterViewer's FilterGroup without the distribution bar):

```jsx
function FilterGroup({ label, options, value, onChange, posColor }) {
  return (
    <div className={styles.filterGroupInner}>
      <span className={styles.filterGroupLabel} style={{ color: posColor }}>{label}</span>
      <div style={{ display: 'flex', gap: 5, flexWrap: 'wrap' }}>
        {options.map(opt => {
          const isActive = value === opt;
          const color = opt === 'Any' ? '#E8BF4A' : archetypeColor(opt);
          const name = opt === 'Any' ? 'All' : (ARCHETYPE_METADATA[opt]?.name || opt);
          return (
            <button
              key={opt}
              title={ARCHETYPE_METADATA[opt]?.desc}
              className={`filter-chip ${isActive ? 'filter-chip--active' : ''}`}
              style={opt === 'Any'
                ? (isActive ? { background: color + '1a', borderColor: color, color } : {})
                : {
                    background: isActive ? color + '30' : color + '12',
                    borderColor: isActive ? color : color + '44',
                    color: isActive ? color : color + 'cc',
                  }}
              onClick={() => onChange(opt)}
            >
              {name}
            </button>
          );
        })}
      </div>
    </div>
  );
}
```

### 3. Replace `renderFilters()` desktop path

Replace the existing desktop branch (which renders `.filterPanel` with 3 selects) with the 2-row layout:

```jsx
const renderDesktopFilters = () => (
  <div className={styles.controlPanel}>
    {/* Row 1: Search + Show 0% + Result count */}
    <div className={styles.filterRow1}>
      <div style={{ flex: 1, minWidth: 200 }}>
        <SearchInput value={search} onChange={setSearch} placeholder="Search name, team, pos..." />
      </div>
      <label className="filter-checkbox">
        <input type="checkbox" checked={showUndrafted} onChange={e => setShowUndrafted(e.target.checked)} />
        Show 0%
      </label>
      {hasActiveFilter && (
        <span className="filter-count" style={{ marginLeft: 0 }}>
          <strong style={{ color: 'var(--positive)' }}>{totalFilteredEntries}</strong>
          {' '}roster{totalFilteredEntries !== 1 ? 's' : ''} match
        </span>
      )}
    </div>
    {/* Row 2: Archetype chips */}
    <div className={styles.filterRow2}>
      <FilterGroup label="RB" options={RB_OPTIONS} value={rbFilter} onChange={setRbFilter} posColor={getPosColor('RB')} />
      <div className={styles.filterSep} />
      <FilterGroup label="QB" options={QB_OPTIONS} value={qbFilter} onChange={setQbFilter} posColor={getPosColor('QB')} />
      <div className={styles.filterSep} />
      <FilterGroup label="TE" options={TE_OPTIONS} value={teFilter} onChange={setTeFilter} posColor={getPosColor('TE')} />
    </div>
  </div>
);
```

### 4. Update `renderFilters()` to branch on isMobile

```jsx
const renderFilters = () => {
  if (isMobile) { /* existing mobile chip strip — unchanged */ }
  return renderDesktopFilters();
};
```

### 5. Remove search/checkbox from `toolbarControls` on desktop

The desktop toolbar should only render nothing (or a clear-all button if desired) — search and checkbox have moved into the control panel. Update:

```jsx
const toolbarControls = isMobile ? (
  <>
    <SearchInput ... />
    <label className="filter-checkbox">...</label>
  </>
) : null;
```

TabLayout still receives `title="Exposures"` and will render the title row. With `toolbar={null}`, the toolbar renders only the title — a clean, minimal header.

### 6. Update CSS

Remove old rules: `.filterPanel`, `.filterLabel`, `.filterColumn`, `.filterResults`, `.filterBadgeRow`.

Add new rules (same values as RosterViewer):

```css
.controlPanel {
  background: var(--surface-1);
  border: 1px solid var(--border-subtle);
  border-radius: 12px;
  padding: 14px 16px;
  display: flex;
  flex-direction: column;
  gap: var(--space-sm);
  margin-bottom: 0;
  flex-shrink: 0;
}

.filterRow1 { display: flex; align-items: flex-start; gap: var(--space-sm); flex-wrap: wrap; }
.filterRow2 { display: flex; align-items: center; gap: var(--space-xs); flex-wrap: wrap; padding-top: 10px; border-top: 1px solid var(--border-subtle); }
.filterSep { width: 1px; height: 18px; background: var(--border-subtle); flex-shrink: 0; margin: 0 var(--space-xs); align-self: center; }
.filterGroupInner { display: flex; align-items: center; gap: 8px; }
.filterGroupLabel { font-family: var(--font-mono); font-size: 11px; letter-spacing: 1.5px; text-transform: uppercase; color: var(--text-primary); }
```

### 7. Adjust TabLayout `filters` slot padding

Currently TabLayout's `.filters` class adds `padding: 0 16px 12px`. The control panel card already has its own padding, so this is fine — the card sits in the filters slot with consistent outer padding.

## Dependencies

None.

---
*Approved by: <!-- developer name/initials and date once approved -->*
