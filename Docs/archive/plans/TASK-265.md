<!-- Completed: 2026-06-15 | Commit: (this commit) -->
# TASK-265: Hide archive lock icon for users who can read the post (Pro/author)

**Status:** Draft
**Priority:** P3

---

## Objective
BlogIndex archive rows render the Lock icon on every older post regardless of subscription tier. Pro subscribers (and the author) can read these posts, so the lock is a misleading visual artifact. Show the per-row lock only when the post is actually locked for the current viewer (use canReadPost). Visual-only; reported during TASK-263 verification.

## Dependencies
None

## Open Questions
<!-- Unknowns or decisions to resolve before planning. Delete if none. -->
