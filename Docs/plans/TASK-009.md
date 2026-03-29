# TASK-009: Add error monitoring with Sentry

**Status:** Draft
**Priority:** P2
**Feature:** FEAT-003

---

## Objective
Install and configure Sentry for React error tracking so production errors are captured, reported, and actionable. Includes React error boundary integration, source map upload during build, and basic alert configuration. A commercial product needs visibility into runtime errors — currently there is no error monitoring and failures are invisible.

## Dependencies
- TASK-008 — Vercel config should be in place for source map upload integration

## Open Questions
- Sentry plan: free tier sufficient for initial launch, or need a paid plan?
- Should Sentry capture performance traces in addition to errors?
- Integration with Vercel: use Vercel's Sentry integration or configure independently?
