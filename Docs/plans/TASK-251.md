# TASK-251: Admin scraper — negative-cache 404 draft IDs to stop re-fetching dead drafts

**Status:** Draft
**Priority:** P3

---

## Objective
run.js never persists draft IDs that return 404, and the candidate query re-selects any id not in draft_boards_admin — so dead/deleted draft IDs (5 observed during TASK-241 smoke test on 2026-06-09) get re-fetched on every run forever. As backfill completes, runs settle at fetched:0/errors:N instead of a silent run, wasting ~N UD requests per run and poking dead endpoints (mild ToS hygiene). Fix: persist a negative cache of 404'd ids (e.g. a draft_boards_admin row with source='not_found' or a separate tried_failed table / chrome.storage set) and exclude them from the candidate queue, ideally with an occasional re-check TTL. Discovered during TASK-241. Relates to ADR-008 rate-budget hygiene.

## Dependencies
None

## Open Questions
<!-- Unknowns or decisions to resolve before planning. Delete if none. -->
