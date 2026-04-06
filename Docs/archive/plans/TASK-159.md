<!-- Completed: 2026-04-06 | Commit: pending -->
# TASK-159: Contextual Help — Combo Analysis annotations

**Status:** Done
**Priority:** P3

---

## Objective
Implement annotation overlay for the Combo Analysis tab. Add `data-help-id` attributes to key elements and define a `HELP_ANNOTATIONS` array covering position exclusion filters, player search, stack diversity bar, stack percentage column, and the click-to-expand row behavior.

## Dependencies
TASK-151 — Complete.

## Verification Criteria
- Help button activates overlay on the Combo tab
- 5 annotation steps appear in sequence: position-toggles, player-filter, diversity-col, stack-pct-col, qb-col
- Gold highlight ring appears on each annotated element
- Callout cards position correctly relative to each element
- Keyboard navigation (arrow keys, Escape) works

## Verification Approach
Manual: open Combo tab, activate help, step through all 5 annotations.

## Files Changed
- `best-ball-manager/src/components/ComboAnalysis.jsx` — added `HELP_ANNOTATIONS`, `helpOpen`/`onHelpToggle` props, `data-help-id` attributes, `helpId` prop on `SortHeader`, wired into `TabLayout`
- `best-ball-manager/src/App.jsx` — pass `helpOpen` and `onHelpToggle` to `ComboAnalysis`

## Implementation Approach
Followed the established pattern from TASK-152–156:
- `HELP_ANNOTATIONS` array at module level (5 steps)
- `data-help-id` on: position exclusion `.filter-btn-group`, player filter container, STACK DIVERSITY `<th>`, STACK % `<th>` (via `helpId` prop on `SortHeader`), QB `<th>` (via `helpId` prop)
- `SortHeader` updated to accept and forward `helpId` as `data-help-id`
- `TabLayout` receives `helpAnnotations`, `helpOpen`, `onHelpToggle`
- App.jsx wires `helpOpen` and `toggleHelp` into `<ComboAnalysis>`
