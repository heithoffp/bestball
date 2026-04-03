# TASK-107: Overlay confidence panel — tournament selection filter

**Status:** Draft
**Priority:** P2

---

## Objective

Add a tournament type filter to the overlay confidence panel so users can scope which tournaments feed the exposure and correlation data shown during a live draft. Currently portfolio context is all-or-nothing across all synced entries. Users need to select specific tournament types (e.g., "Best Ball Mania only" or "Puppy 2 only") to get exposure percentages relevant to the draft they're currently in. This gives users control over the analytical context without leaving the draft page.

Addresses finding F-011 from the 2026-04-03 systems model delta.

## Dependencies

TASK-100 — floating logo button provides the UI surface.
TASK-106 — sync/connectivity status should be in place so the panel structure exists.

## Open Questions

- Should tournaments auto-detect based on the current draft's tournament type, or always require manual selection?
- Should the filter persist across drafts (chrome.storage) or reset each session?
- How does this interact with the web app's tournament multi-select (TASK-105)? Should they share state via Supabase or be independent?
