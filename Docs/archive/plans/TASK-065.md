# TASK-065: Fix mobile tab bar grid — 8 tabs with repeat(7, 1fr) clips the last tab

**Status:** Draft
**Priority:** P2

---

## Objective
The mobile tab bar CSS uses `grid-template-columns: repeat(7, 1fr)` but there are 8 tabs (Dashboard, Exposures, Rosters, ADP Tracker, Rankings, Draft Asst, Combos, Help). The 8th tab either wraps awkwardly or is clipped. Update to accommodate all 8 tabs — either `repeat(8, 1fr)` or implement horizontal scroll per the UI/UX Guide's mobile-specific rule: "Tab bar: Horizontally scrollable if tabs overflow."

## Dependencies
None
