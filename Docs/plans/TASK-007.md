# TASK-007: User profile and account settings page

**Status:** Draft
**Priority:** P3
**Feature:** FEAT-001

---

## Objective
Build a basic account settings page where authenticated users can view and manage their profile: display name, email address, sign-out, and account deletion. This is a standard SaaS hygiene feature — users expect to be able to manage their account. Not blocking for launch but needed before public release.

## Dependencies
- TASK-004 — Auth system must support the account operations this page exposes
- TASK-005 — Auth modal provides the authentication entry point

## Open Questions
- Standalone page or modal/drawer accessible from the header?
- Account deletion: soft delete (mark inactive) or hard delete (remove all Supabase data)?
- Should this page also show subscription status once FEAT-002 is implemented?
