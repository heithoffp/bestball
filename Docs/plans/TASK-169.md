# TASK-169: First-run experience — sample data load button and empty state guidance

**Status:** Draft
**Priority:** P1

---

## Objective
Add a "Try with sample data" button visible to new users who haven't uploaded any data. When clicked, loads the sample data bundle (TASK-168) into the app so users can immediately explore all analytics tabs. Implement meaningful empty states on tabs that currently show blank/broken UI when no data is loaded — each empty state should explain what the tab does and prompt the user to either upload their own data or try sample data. The goal: a new user sees real analytical value within 60 seconds of arriving. Addresses finding F-018 and EPIC-04 verification criteria.

## Dependencies
TASK-168 (sample data bundle must exist)

## Open Questions
- Persist sample data to IndexedDB or keep in-memory only?
- Show a visual indicator distinguishing sample data from real data?
- Where to place the "Try sample data" button — Dashboard empty state, header, or modal?
