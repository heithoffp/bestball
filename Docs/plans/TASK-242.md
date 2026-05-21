# TASK-242: ADR: Admin-side UD scraping pipeline for draft-board backfill

**Status:** Draft
**Priority:** P3

---

## Objective
Architectural decision for TASK-241. Should BBE operate an admin-side UD scraping pipeline (developer's account, dedicated browser extension, periodic fetch) to backfill draft boards that customers didn't self-sync? Decision must weigh: ToS posture for a commercial product, single-account-ban blast radius, dual data path (extension self-sync vs admin scrape), privacy boundary for private-draft types, customer expectations once backfill exists. Decide before TASK-241 begins implementation. Owned by hus-adr.

## Dependencies
None

## Open Questions
<!-- Unknowns or decisions to resolve before planning. Delete if none. -->
