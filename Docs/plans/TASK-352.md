# TASK-352: DraftKings live capture follow-ups: auto new-draft detection + lobby/pre-draft screen grammar

**Status:** Draft
**Priority:** P3

---

## Objective
TASK-350 shipped DK parity but deferred two items. (1) Auto new-draft detection: UD's uses roster-panel overalls, which DK's Rosters tab doesn't render — DK needs another contradiction signal (e.g. the user's Board column showing a different player at a held overall) before back-to-back DK slow drafts reset hands-free; manual reset + board evidence cover it today. (2) DK lobby/pre-draft screens: no frame corpus captured yet, so the parser has no lobby grammar — record a DK draft from lobby entry and extend parseDraftKingsScreen. Corpus to extend: mobile-app/docs/draftkings_debug/.

## Dependencies
None

## Open Questions
<!-- Unknowns or decisions to resolve before planning. Delete if none. -->
