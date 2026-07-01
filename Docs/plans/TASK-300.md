# TASK-300: Arena: fix pairing pool starvation (own-team exclusion at query level)

**Status:** Draft
**Priority:** P1

---

## Objective
arena-pair samples 200 lowest-match teams then drops the caller's own teams in memory; a caller who owns most low-match teams gets insufficient_pool ('No matchups yet'). Exclude own teams in the SQL query (or(user_id.is.null,user_id.neq.voter)) so the sample is entirely votable.

## Dependencies
None

## Open Questions
<!-- Unknowns or decisions to resolve before planning. Delete if none. -->
