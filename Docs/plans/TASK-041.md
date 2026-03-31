# TASK-041: Side-by-side layout for Top Exposures and Exposure by ADP Round

**Status:** Approved
**Priority:** P3

---

## Objective

Place the "Top Exposures" and "Exposure by ADP Round" dashboard sections side by side in a two-column layout instead of stacking them vertically, making better use of horizontal space.

## Verification Criteria

- Both sections appear on the same row (two columns) on desktop/tablet viewports.
- The layout collapses to a single column on mobile (≤599px).
- No existing logic, data, or content inside either section is changed.

## Verification Approach

1. Run `npm run build` from `best-ball-manager/` — confirm clean build with no errors.
2. Run `npm run dev` and visually inspect the Dashboard with roster data loaded:
   - At full desktop width: both sections appear side by side on one row.
   - At ≤599px (mobile): sections stack vertically.
3. Confirm no lint errors via `npm run lint`.

## Files to Change

| File | Action | Description |
|------|--------|-------------|
| `best-ball-manager/src/components/Dashboard.jsx` | Modify | Wrap the two `exposureSection` divs in a new container div with class `exposureRow` |
| `best-ball-manager/src/components/Dashboard.module.css` | Modify | Add `.exposureRow` — two-column grid layout, collapsing to single column at ≤599px |

## Implementation Approach

1. **Dashboard.jsx** — wrap sections 2 and 3 in a single `<div className={styles.exposureRow}>`:
   ```jsx
   <div className={styles.exposureRow}>
     {/* Section 2: Top Exposures */}
     <div className={styles.exposureSection}>…</div>
     {/* Section 3: Exposure by ADP Round (conditional render preserved) */}
     {exposureByRound.length > 0 && (
       <div className={styles.exposureSection}>…</div>
     )}
   </div>
   ```
   Note: the conditional render for section 3 moves inside the wrapper, not around it, so the row always renders (section 2 alone fills full width when section 3 is absent — acceptable).

2. **Dashboard.module.css** — add after the `exposureSection` block:
   ```css
   .exposureRow {
     display: grid;
     grid-template-columns: 1fr 1fr;
     gap: 16px;
   }
   ```
   Inside the existing `@media (max-width: 599px)` block, add:
   ```css
   .exposureRow {
     grid-template-columns: 1fr;
   }
   ```

## Dependencies

None

---
*Approved by: <!-- developer name/initials and date once approved -->*
