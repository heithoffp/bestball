# TASK-307: Arena pairing sample mix after full-DB backfill

**Status:** Draft
**Priority:** P3

---

## Objective
After the ADR-016 backfill, thousands of matches=0 provisional teams dominate arena-pair's matches-ascending 200-row sample, slowing rating convergence and making most matchups unrated-vs-unrated. Consider a mixed sample (e.g. part lowest-matches, part random/Elo-stratified) or an SQL RPC. Flagged in ADR-016 consequences; measure after the backfill runs before tuning.

## Dependencies
None

## Open Questions
<!-- Unknowns or decisions to resolve before planning. Delete if none. -->
