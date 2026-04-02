# TASK-053: Inter-roster similarity score — portfolio diversity metric

**Status:** Draft
**Priority:** P3

---

## Objective

Compute and display a portfolio diversity score that measures how correlated or similar rosters are to each other. A portfolio of very similar rosters concentrates risk even if individual per-player exposures look diversified. This fills the "am I actually differentiated?" question that no current feature answers — giving drafters a single number or visual that reflects how unique their book is as a whole.

## Dependencies

None

## Open Questions

- What similarity metric to use: Jaccard overlap on player sets, shared pick overlap by round, or something else?
- Where should this surface — Dashboard headline metric, Roster Viewer, or a new widget?
- Is a single portfolio-level score sufficient or do we want a pairwise matrix view?
