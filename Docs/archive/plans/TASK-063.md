# TASK-063: Fix surface layer violations — cards should use surface-1 not surface-2

**Status:** Draft
**Priority:** P2

---

## Objective
Dashboard `metricCard`, `shapeCard`, and `exposureSection` in `Dashboard.module.css` use `var(--surface-2)` for card backgrounds, but these cards sit directly on `surface-0` (the app background). Per the UI/UX Guide's surface hierarchy, cards should use `surface-1` ("Cards, elevated containers"), and `surface-2` is reserved for "Hover states, interactive surfaces." The guide explicitly states "never skip layers." Fix all surface-layer violations across the app.

## Dependencies
None
