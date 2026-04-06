# TASK-148: Overlay — consume platform-specific saved rankings for tier breaks

**Status:** Draft
**Priority:** P2

---

## Objective
The Chrome extension overlay (both Underdog and DraftKings flavors) should read the user's
saved rankings from `user_rankings` (scoped by `platform`) so that tier breaks created in
the Rankings tab are surfaced during live drafts on the correct platform. TASK-144 establishes
the per-platform storage schema that this task depends on.

## Dependencies
- TASK-144 — per-platform rankings storage in `user_rankings` (`platform` column + PK)

## Open Questions
- How does the overlay currently query `user_rankings`? Does it read via Supabase JS client
  directly from the extension's content script, or through a background service worker?
- Are tier breaks already partially used in the overlay, or is this net-new overlay behavior?
- Should the overlay show tier labels inline on player rows, or only use them for visual
  grouping on a side panel?
