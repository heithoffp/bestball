<!-- Completed: 2026-04-02 | Commit: 26c7181 -->
# TASK-083: Roster Viewer: Support full team name search in combined filter

**Status:** Approved
**Priority:** P3

---

## Objective

Extend the `CombinedSearchInput` team suggestion logic so that users can find a team by typing its full name (e.g. "Kansas City" or "Chiefs") in addition to its abbreviation ("KC"). The selected chip and all downstream filter logic continue to use abbreviations — only the suggestion matching is widened.

## Files Changed

| File | Action |
|------|--------|
| `best-ball-manager/src/utils/nflTeams.js` | Created — static `{ abbrev: fullName }` map for all 32 NFL teams |
| `best-ball-manager/src/components/RosterViewer.jsx` | Modified — `teamSuggestions` memo matches on full name; `NFL_TEAMS` passed to component |
| `best-ball-manager/src/components/filters/CombinedSearchInput.jsx` | Modified — `teamNames` prop added; dropdown shows `KC · Kansas City Chiefs` |

## Dependencies

TASK-080 (completed)

---
*Approved by: PH 2026-04-02*
