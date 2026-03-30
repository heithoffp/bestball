# TASK-027: Clean up lint warnings across codebase

**Status:** Draft
**Priority:** P3

---

## Objective
Pre-existing lint errors and warnings have accumulated across the codebase. `npm run lint` currently reports errors in multiple files — unused imports, setState in effects, static components created during render, missing hook dependencies, and fast-refresh export violations. This task resolves all lint issues to get `npm run lint` to a clean zero-error, zero-warning state.

Known files with issues:
- `SubscriptionContext.jsx` — setState in effect, unused eslint-disable directive, fast-refresh export warning
- `App.jsx` — unused imports (`saveFile`, `Icon`), missing hook dependencies
- `AdpTimeSeries.jsx` — unused vars, setState in effect
- `ComboAnalysis.jsx` — static components created during render (SortHeader defined inside render)
- Various other components with similar patterns

## Dependencies
None

## Open Questions
- Some `setState` in effect warnings may require restructuring component logic (e.g., moving to derived state or event handlers). Should we suppress with eslint-disable comments where the pattern is intentional, or always refactor?
