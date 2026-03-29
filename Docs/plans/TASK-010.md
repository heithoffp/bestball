# TASK-010: Add feature-level usage analytics

**Status:** Draft
**Priority:** P2
**Feature:** FEAT-003

---

## Objective
Instrument key user flows with custom analytics events beyond basic page views. Track tab visits, CSV uploads, draft sessions started, roster views, and other feature interactions via Vercel Analytics custom events. This data is essential for validating assumptions about which features drive retention and which are underused — critical for informed pricing tier decisions and product prioritization.

## Dependencies
None — Vercel Analytics is already integrated

## Open Questions
- Vercel Analytics custom events vs a dedicated product analytics tool (Posthog, Mixpanel)?
- What specific events should be tracked at launch? Need a defined event taxonomy.
- Privacy considerations: do we need a cookie consent banner for analytics?
