# TASK-217: Audit current Web Store extension install base before cutover

**Status:** Draft
**Priority:** P3

---

## Objective
Once /install launches and we cut existing links, the old Chrome Web Store install count is frozen forever. Capture a one-time baseline before that happens: total installs, weekly active users (if available from the Web Store dashboard while the listing is still visible to the developer), and cross-reference against signed-up app users to estimate how many existing users are on the rejected extension. Output a short snapshot doc in docs/ for historical reference and as the denominator for measuring migration success in TASK-218. Related: ADR-005, TASK-213.

## Dependencies
None

## Open Questions
<!-- Unknowns or decisions to resolve before planning. Delete if none. -->
