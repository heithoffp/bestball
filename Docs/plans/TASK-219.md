# TASK-219: Add install-funnel analytics for /install page

**Status:** Draft
**Priority:** P4

---

## Objective
Deferred from TASK-213 because at current ~20-user scale the data would be statistically meaningless. When new-signup volume grows enough that step-by-step drop-off becomes measurable (rough trigger: 100+ install attempts/month), instrument the /install page: page view, browser detected, .crx downloaded, install confirmed (Chrome guided steps each tracked separately, Edge/Firefox tracked as single-step). Use existing Vercel Analytics or add a lightweight events table in Supabase. Related: ADR-005, TASK-213.

## Dependencies
None

## Open Questions
<!-- Unknowns or decisions to resolve before planning. Delete if none. -->
