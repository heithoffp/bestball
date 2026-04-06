<!-- Completed: 2026-04-06 | Commit: pending -->
# TASK-157: Contextual Help — Draft Assistant annotations

**Status:** Approved
**Priority:** P3

---

## Objective
Implement annotation overlay for the Draft Assistant tab. Add `data-help-id` attributes to key elements and define a `HELP_ANNOTATIONS` array covering draft slot selector, candidate list, exposure columns, correlation, strategy indicators, and search.

## Verification Criteria
- Draft Assistant tab renders HelpOverlay when global help button is clicked
- All annotated elements receive gold highlight rings and callout cards
- Annotations are concise (one sentence each), matching the established tone
- Navigation through annotations works (arrows, keyboard)
- Tab still functions normally when help is closed

## Verification Approach
1. Run `npm run build` from `best-ball-manager/` — expect clean build with no errors.
2. Run `npm run lint` — expect no new lint warnings/errors.
3. Visual check (developer): open Draft Assistant tab, click help button, verify annotations appear on key elements and navigation works.

## Files to Change
| File | Action | Description |
|------|--------|-------------|
| `best-ball-manager/src/App.jsx` | Modify | Pass `helpOpen` and `onHelpToggle` props to DraftFlowAnalysis |
| `best-ball-manager/src/components/DraftFlowAnalysis.jsx` | Modify | Add TabLayout wrapper, `data-help-id` attributes, and `HELP_ANNOTATIONS` array |

## Implementation Approach
1. In `App.jsx`, add `helpOpen={helpOpen} onHelpToggle={toggleHelp}` to the `<DraftFlowAnalysis>` render.
2. In `DraftFlowAnalysis.jsx`:
   a. Import `TabLayout` component.
   b. Accept `helpOpen` and `onHelpToggle` props.
   c. Define `HELP_ANNOTATIONS` array (~6-8 entries) covering: draft slot selector, strategy cards, player list, search, exposure columns, correlation column.
   d. Wrap component content in `<TabLayout helpAnnotations={HELP_ANNOTATIONS} helpOpen={helpOpen} onHelpToggle={onHelpToggle} flush>`.
   e. Add `data-help-id` attributes to target elements matching annotation IDs.

## Dependencies
TASK-151 — Complete (HelpOverlay infrastructure).

---
*Approved by: developer, 2026-04-06*
