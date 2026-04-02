<!-- Completed: 2026-04-02 | Commit: 26c7181 -->
# TASK-086: PlayerRankings: Improve tier break affordance

**Status:** Approved
**Priority:** P3

---

## Objective

Replace the invisible `tierToggleZone` hit target (6px-high hidden row) with a visible insert affordance — a hover-revealed dashed line + "+" button on desktop, and a persistent muted "+" line on mobile — so users can discover and use tier breaks without prior knowledge of the hidden click zone.

## Verification Criteria

1. On desktop, hovering between any two player rows (where no tier break exists) reveals a thin horizontal line with a centered "+" circle.
2. Clicking that affordance inserts a tier break above the hovered player (existing behavior preserved).
3. When a tier break exists above a player, the insert affordance does **not** render — the delete button on the tier divider handles removal.
4. On mobile (≤599px), a persistent muted "+" line is visible between every player row (where no tier break exists). Tapping it inserts a tier break.
5. `npm run build` produces no new errors.
6. `npm run lint` produces no new warnings.

## Verification Approach

1. Run `npm run lint` from `best-ball-manager/` — expect no new warnings.
2. Run `npm run build` from `best-ball-manager/` — expect clean build.
3. Developer verifies in browser (dev server):
   - Desktop: hover between two rows → insert line + "+" appears → click → tier break is added.
   - Desktop: verify no insert affordance between rows that already have a tier divider above them.
   - Mobile: confirm persistent "+" lines are visible between rows without tier breaks; tap adds a break.

## Files to Change

| File | Action | Description |
|------|--------|-------------|
| `best-ball-manager/src/components/PlayerRankings.jsx` | Modify | Replace `tierToggleZone`/`tierToggleZoneMobile` render with new affordance, conditioned on `!hasTierAbove` |
| `best-ball-manager/src/components/PlayerRankings.module.css` | Modify | Remove old tier zone styles; add new insert zone styles |

## Implementation Approach

**1. Desktop — `SortableRow`:** Replace the always-present `tierToggleZone` `<tr>` with a conditional `tierInsertZone` row only rendered when `!hasTierAbove`. Contains an `tierInsertIndicator` div (hidden by default, revealed on `tr:hover` via CSS) with a line and "+" circle.

**2. Mobile — `SortableCard`:** Replace `tierToggleZoneMobile` with a conditional persistent `tierInsertZoneMobile` div (always visible at low contrast) only rendered when `!hasTierAbove`.

**3. CSS:** Remove `.tierToggleZone`, `.tierToggleZoneMobile`, and their media query overrides. Add desktop and mobile insert zone classes.

## Dependencies

None

---

*Approved by: Patrick — 2026-04-02*
