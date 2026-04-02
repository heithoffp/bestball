<!-- Completed: 2026-04-02 | Commit: 26c7181 -->
# TASK-081: Roster Viewer: Compact 2-row filter bar — remove collapsible and distribution bars on desktop

**Status:** Done
**Priority:** P4

---

## Objective

Redesign the Roster Viewer filter panel on desktop/tablet from a tall, collapsible 3-section stack into a compact 2-row always-visible bar that requires no toggle. Row 1 holds search + tournament dropdown + CLV chips inline. Row 2 holds RB, QB, and TE archetype chips on a single horizontal line with vertical separators between position groups. Distribution bars (`.filterBar`) are removed entirely. The mobile experience keeps its existing collapsible pattern unchanged.

## Verification Criteria

1. On desktop/tablet (≥600px), the control panel is always visible — no toggle header, no chevron, no expand/collapse behavior.
2. Row 1 contains: the combined search input (flex: 1), the tournament select, and the CLV chip group — all on one horizontal line.
3. Row 2 contains: RB chips, a separator, QB chips, a separator, and TE chips — all on one horizontal line. The position label (RB / QB / TE) precedes each group.
4. No distribution bar (`.filterBar`) is rendered anywhere on desktop/tablet.
5. No section labels (SEARCH / ARCHETYPE FILTERS / ADDITIONAL FILTERS) are rendered on desktop/tablet.
6. A result count badge ("N rosters match") appears when any filter is active (any archetype, CLV, tournament, or search filter).
7. On mobile (<600px), the collapsible toggle still works — tap to expand/collapse, active filter pills show in collapsed state.
8. All filter logic is unchanged: archetype, CLV, tournament, and player/team search filters all narrow the roster list correctly.
9. `npm run build` completes with no errors.

## Verification Approach

1. Run `npm run build` from `best-ball-manager/` — confirm zero errors.
2. Developer: open the app on desktop and confirm the filter panel renders as 2 compact rows with no chevron or toggle.
3. Developer: apply each filter type (player search, team search, RB archetype, QB archetype, TE archetype, CLV, tournament) and confirm the table narrows correctly.
4. Developer: confirm the result count badge appears when any filter is active and disappears when all filters are cleared.
5. Developer: on mobile, confirm the collapsible toggle still expands/collapses, and that active filter pills appear in the collapsed summary row.

## Files to Change

| File | Action | Description |
|------|--------|-------------|
| `best-ball-manager/src/components/RosterViewer.jsx` | Modify | Restructure control panel render — new 2-row desktop layout, remove `filtersOpen` for desktop path, update `FilterGroup` to remove bar |
| `best-ball-manager/src/components/RosterViewer.module.css` | Modify | Add `.filterRow1`, `.filterRow2`, `.filterSep`; remove `.filterBar` rule (or leave as dead CSS); remove section divider overhead from desktop path |

## Implementation Approach

### 1. Update `FilterGroup` — remove the distribution bar

In `FilterGroup`, the current structure is:
```
.filterGroupRow
  .filterGroupInner   (label + chips)
  .filterBar          (distribution bar)
```

Remove `.filterGroupRow` as the wrapper — `FilterGroup` now returns just `.filterGroupInner` (label + chips). Delete the `<div className={css.filterBar}>` block and the total/segment calculation entirely. The `FilterGroup` component shrinks to just the label + chip row, making it composable inline on Row 2.

### 2. Add desktop render function `renderDesktopFilters()`

Replace the current `renderFilterBody()` desktop path with a dedicated `renderDesktopFilters()` that returns the 2-row layout directly:

```jsx
const renderDesktopFilters = () => (
  <>
    {/* Row 1: Search + Tournament + CLV + Result Count */}
    <div className={css.filterRow1}>
      <div style={{ flex: 1, minWidth: 200 }}>
        <CombinedSearchInput ... />
      </div>
      <select value={tournamentFilter} onChange={...} className="filter-select">
        {allTournaments.map(...)}
      </select>
      <div className="filter-chip-group">
        {[['all','All'],['positive','+CLV'],['negative','-CLV']].map(([v,lbl]) => (
          <button key={v} className={`filter-chip ${clvFilter === v ? 'filter-chip--active' : ''}`} onClick={() => setClvFilter(v)}>
            {lbl}
          </button>
        ))}
      </div>
      {activeFilterPills.length > 0 && (
        <span className="filter-count">
          <strong style={{ color: 'var(--positive)' }}>{displayed.length}</strong>
          {' '}roster{displayed.length !== 1 ? 's' : ''} match
        </span>
      )}
    </div>

    {/* Row 2: Archetype chips — RB | QB | TE */}
    <div className={css.filterRow2}>
      <FilterGroup label="RB" options={RB_OPTIONS} value={rbFilter} onChange={setRbFilter} counts={rbCounts} />
      <div className={css.filterSep} />
      <FilterGroup label="QB" options={QB_OPTIONS} value={qbFilter} onChange={setQbFilter} counts={qbCounts} />
      <div className={css.filterSep} />
      <FilterGroup label="TE" options={TE_OPTIONS} value={teFilter} onChange={setTeFilter} counts={teCounts} />
    </div>
  </>
);
```

### 3. Update `renderControlPanel()`

```jsx
const renderControlPanel = () => (
  <div className={css.controlPanel}>
    {isMobile ? (
      <>
        {renderFilterToggleHeader()}
        {renderFilterBody()}  {/* existing mobile path unchanged */}
      </>
    ) : (
      renderDesktopFilters()
    )}
  </div>
);
```

The `filtersOpen` state and all `renderFilterToggleHeader()` / collapsible logic remain intact — they're just only invoked on mobile now. No state removal required.

### 4. Update `renderFilterBody()` — mobile path only

The existing `renderFilterBody()` is kept as-is for the mobile path. The desktop branch inside it can be removed since it is no longer called on desktop. This cleans up dead code.

### 5. Add CSS classes

```css
/* Filter row layout — desktop/tablet */
.filterRow1 {
  display: flex;
  align-items: flex-start;
  gap: var(--space-sm);
  flex-wrap: wrap;
}

.filterRow2 {
  display: flex;
  align-items: center;
  gap: var(--space-xs);
  flex-wrap: wrap;
  padding-top: 4px;
  border-top: 1px solid var(--border-subtle);
}

.filterSep {
  width: 1px;
  height: 18px;
  background: var(--border-subtle);
  flex-shrink: 0;
  margin: 0 var(--space-xs);
  align-self: center;
}
```

Tighten `controlPanel` padding to `14px 16px` for desktop (from `20px`) since there's no section hierarchy to visually separate.

### 6. Clean up unused CSS

The `.filterGroupRow`, `.filterBar`, and `.sectionDivider` rules can be removed or left as dead CSS — they won't cause any visible effect. Remove for cleanliness.

### Edge cases

- **Tournament select only shows if >1 tournament exists**: this is already handled by `allTournaments` including 'all'. No change needed.
- **CombinedSearchInput height**: it can grow taller when selections are made (selected player/team pills inside the input). `align-items: flex-start` on `.filterRow1` keeps the row from stretching awkwardly.
- **Archetype chip wrap**: on a narrower desktop or tablet, Row 2 may wrap. `flex-wrap: wrap` handles this gracefully — each FilterGroup stays together as a unit.

## Dependencies

None. TASK-083 (combined search) and TASK-082 (archetype colors) are both complete.

---
*Approved by: <!-- developer name/initials and date once approved -->*
