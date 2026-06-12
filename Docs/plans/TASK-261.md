# TASK-261: Harden getBoards/getEntries against a stale in-page bridge (fail fast, no 300s hang)

**Status:** Draft
**Priority:** P4

---

## Objective
TASK-260 surfaced this: if the extension is reloaded but the Underdog tab is not hard-reloaded, the page runs an older injected bridge with no BBM_BOARDS_REQUEST handler, so adapter.getBoards() hangs on its 300s timeout and the sync progress bar freezes. Add a lightweight liveness handshake or short initial-ack timeout so a non-responding/stale bridge fails fast with a clear 'reload the page' message instead of hanging. Applies to getEntries too. Production-rare (extension update + navigation reloads the bridge) but a real dev/test and edge-case UX gap.

## Dependencies
None

## Open Questions
<!-- Unknowns or decisions to resolve before planning. Delete if none. -->
