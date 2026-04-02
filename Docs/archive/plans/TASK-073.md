<!-- Completed: 2026-04-01 -->
# TASK-073: Add fadeSlideIn entry animation to all tab components

**Status:** Approved
**Priority:** P3

---

## Objective
Only Dashboard had the staggered `fadeSlideIn` entry animation. UI/UX Guide section 6 specifies this animation should be applied to tab content on switch. Add consistent entry animations to all tab components.

## Dependencies
None

## Verification Criteria
- All tab components animate in with fadeSlideIn when switching tabs
- Build passes with no errors
- Lint passes with no new warnings

## Verification Approach
1. Run `npm run build` — must succeed
2. Run `npm run lint` — must pass clean
3. Visual check: each tab animates in when selected

## Files Changed
- `AdpTimeSeries.module.css` — added fadeSlideIn keyframes + animation on `.root`
- `DraftFlowAnalysis.module.css` — added fadeSlideIn keyframes + animation on `.root`
- `PlayerRankings.module.css` — added fadeSlideIn keyframes + animation on `.root`
- `RosterViewer.module.css` — added fadeSlideIn keyframes + animation on `.root`
- `index.css` — added animation on `.help-guide`

## Implementation Approach
Added `animation: fadeSlideIn var(--duration-normal) var(--ease-default) both` to each tab's root class, with `@keyframes fadeSlideIn` defined locally in each CSS module. Dashboard and TabLayout (used by ExposureTable, ComboAnalysis) already had the animation.
