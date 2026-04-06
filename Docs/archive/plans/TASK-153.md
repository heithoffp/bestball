# TASK-153: Contextual Help — Exposures annotations + global Help button

**Status:** Approved
**Priority:** P3

---

## Objective
Move the per-tab help `?` button to a global "Help" button in the tab bar (in line with tab names), and implement contextual help annotations for the Exposures tab. This consolidates help access into a single, discoverable location and adds the second set of tab annotations.

## Verification Criteria
- The "Help" button appears at the end of the tab bar, styled consistently with other tab buttons
- Clicking "Help" toggles the help overlay for the currently active tab
- The standalone Help Guide tab is removed from the tab bar
- Dashboard help still works via the global button (no local helpOpen state)
- Exposures tab shows annotation callouts for: search/filter controls, archetype filters, Show 0% toggle, sortable column headers, ADP trend sparklines
- Tabs without annotations show no overlay when Help is clicked
- ESC dismisses the help overlay

## Verification Approach
- Run `npm run build` from `best-ball-manager/` — clean build, no errors
- Visual check: tab bar shows "Help" as last button, not a tab
- Visual check: clicking Help on Dashboard shows Dashboard annotations
- Visual check: clicking Help on Exposures shows Exposures annotations
- Visual check: switching tabs while help is open shows new tab's annotations (or nothing if no annotations)

## Files to Change
| File | Action | Description |
|------|--------|-------------|
| `best-ball-manager/src/App.jsx` | Modify | Add global helpOpen state, remove help tab, add Help button to tab bar, pass helpOpen/onHelpToggle to active tabs |
| `best-ball-manager/src/components/TabLayout.jsx` | Modify | Remove help button from toolbar, keep HelpOverlay rendering |
| `best-ball-manager/src/components/TabLayout.module.css` | Modify | Remove help button styles (now in App global styles) |
| `best-ball-manager/src/components/Dashboard.jsx` | Modify | Remove local helpOpen state, accept helpOpen/onHelpToggle as props |
| `best-ball-manager/src/components/ExposureTable.jsx` | Modify | Add HELP_ANNOTATIONS array, data-help-id attributes, pass help props to TabLayout |

## Implementation Approach
1. **App.jsx:** Add `helpOpen` state + toggle handler. Remove `{ key: 'help', ... }` from tabs array. Add a styled "Help" button after the tab map in the tab bar. Pass `helpOpen`/`onHelpToggle` as props to Dashboard and ExposureTable. Reset helpOpen to false on tab change.
2. **TabLayout:** Remove the `?` button from toolbar. Keep accepting helpAnnotations/helpOpen/onHelpToggle for overlay rendering only.
3. **Dashboard:** Remove `const [helpOpen, setHelpOpen] = useState(false)` — receive helpOpen/onHelpToggle from props instead.
4. **ExposureTable:** Define `HELP_ANNOTATIONS` array targeting key UI elements. Add `data-help-id` attributes to: control panel wrapper, archetype filter row, Show 0% toggle, table header row, trend column. Pass annotations + help props to TabLayout.

## Dependencies
TASK-151 — Complete (shared HelpOverlay component).
TASK-152 — Complete (Dashboard annotations pattern to follow).

---
*Approved by: developer, 2026-04-06*
