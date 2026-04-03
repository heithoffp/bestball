# TASK-106: Overlay confidence panel — sync progress and connectivity status

**Status:** Draft
**Priority:** P2

---

## Objective

Add sync progress and connectivity status to the overlay confidence panel (the floating logo button from TASK-100). Currently sync is completely opaque — the user has no visibility into what's happening during portfolio sync, no indication of success or failure, and no actionable feedback when connectivity drops (requiring blind refreshes). The panel should show: (a) step-by-step sync progress indicator, (b) Supabase connection health with actionable error messages (e.g., "Connection lost — tap to retry" vs "Session expired — please re-authenticate"), and (c) last sync timestamp and entry count.

This is the core of the T6 (Extension Confidence & Trust) theme from the 2026-04-03 systems model delta. Addresses findings F-010 and F-013.

## Dependencies

TASK-100 — floating logo button provides the UI surface this task builds upon.

## Open Questions

- What sync steps are worth exposing to the user? (e.g., "Authenticating...", "Fetching entries...", "Computing exposure...", "Ready")
- Should connectivity status poll on an interval, or only check on user action?
- How should the panel handle the case where the user is not authenticated at all?
