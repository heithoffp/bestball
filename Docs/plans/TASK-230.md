# TASK-230: InstallPage VERSION constant should derive from latest.json (stop drifting every release)

**Status:** Draft
**Priority:** P2

---

## Objective
InstallPage.jsx hardcodes const VERSION = '1.0.5'. Drove the .zip/.xpi download URLs and visible labels. Was stale through v1.0.6 (never bumped) and the cleanup of v1.0.5 artifacts in 7266a8e turned both downloads into 404 until 9551116 hotfixed the constant. Fix: read /extension/latest.json at runtime (fetch on mount, fallback to a build-time embedded value) so install page version always matches the deployed artifact set. Bonus: add a release-script step that fails if the InstallPage VERSION doesn't match the bumped manifest version.

## Dependencies
None

## Open Questions
<!-- Unknowns or decisions to resolve before planning. Delete if none. -->
