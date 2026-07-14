# TASK-328: Draft parser: pin slot from the user's username on the board; harden screen classification + picks-until countdown

**Status:** Draft
**Priority:** P2

---

## Objective
Live capture works on device but (1) the parser confuses screen types (the Board grid vs the user's own roster/column) and (2) the picks-until-turn countdown intermittently drops because picksUntil depends on OCR of the flaky 'UP IN N PICKS' ticker, and slot inference depends on picksUntil. Real captures show the user's username (e.g. BIRDENTHUSIAST) appears on the board next to their upcoming card ('3.9 | 33'), so the draft slot can be pinned deterministically from the username instead of inferred from the ticker; once slot is known, picksUntil derives from snake math and survives ticker OCR failures. Add explicit handling for the user's roster view and harden Board/Players/Queue classification. Develop and regression-test against real capture data (mobile-app/docs/underdog_draft_screen_recording.mp4, task-318 IMG_2787-2790 + OCR dump, plus any new recording the developer supplies).

## Dependencies
None

## Open Questions
<!-- Unknowns or decisions to resolve before planning. Delete if none. -->
