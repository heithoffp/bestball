# TASK-220: Fix release script changelog-gate flow (placeholder vs pre-flight order)

**Status:** Draft
**Priority:** P3

---

## Objective
TASK-215 release script writes the CHANGELOG placeholder *after* doing build/bump/sign, then bails. User must manually finish commit+tag because re-running fails pre-flight on the now-dirty tree. Fix: either (a) require the user to add a `## [<version>]` entry to CHANGELOG.md before running, and check for it in pre-flight; or (b) make the script idempotent on re-run when manifest.version already matches target. Real flow currently does not match RELEASE.md.

## Dependencies
None

## Open Questions
<!-- Unknowns or decisions to resolve before planning. Delete if none. -->
