# TASK-108: Overlay confidence panel — setup verification and settings

**Status:** Draft
**Priority:** P3

---

## Objective

Add a summary view to the confidence panel that shows the user's current configuration state at a glance: authenticated user, selected tournaments, sync status, overlay enabled/disabled. The mental model is: open icon → see everything is green → close → draft with confidence. This is the capstone of the confidence hub concept — it ties together TASK-106 (sync/connectivity) and TASK-107 (tournament selection) into a coherent "am I ready to draft?" experience.

Addresses findings F-010 and F-012 from the 2026-04-03 systems model delta. F-012 specifically notes the tension between the popup and overlay icon as competing UX surfaces — this task resolves that by making the overlay icon the single authority during drafts.

## Dependencies

TASK-106 — sync progress and connectivity status must exist first.
TASK-107 — tournament selection must exist first.

## Open Questions

- What settings beyond tournament selection should be configurable from the panel? (e.g., overlay visibility toggle, column visibility for exposure/correlation)
- Should the panel show a simple "Ready" / "Not Ready" summary, or a checklist of individual status items?
- Should any settings from the popup be duplicated here, or should the popup link to the overlay panel for draft-time settings?
