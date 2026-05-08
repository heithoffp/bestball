# TASK-214: Refactor all Chrome Web Store links to point to /install

**Status:** Draft
**Priority:** P2

---

## Objective
After TASK-213 ships /install, every existing reference to the old Chrome Web Store URL (item id cnljeadelfnabalcdongglhfhiceakaj) must be replaced site-wide. Audit and update: web app components (LandingPage, onboarding flows, locked-feature CTAs, help overlays), marketing copy, README, docs, welcome/transactional emails, and external surfaces (X bio, social profiles, any Press/About pages — flag external surfaces for manual update since they're outside the repo). Verify no dead Web Store links remain after the swap. Depends on TASK-213 — /install must exist before this can complete. Related: ADR-005.

## Dependencies
None

## Open Questions
<!-- Unknowns or decisions to resolve before planning. Delete if none. -->
