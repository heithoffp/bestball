# TASK-332: Roster-panel roster intake: harvest drafter roster views as a first-class pick-ledger source

**Status:** Draft
**Priority:** P2

---

## Objective
The drafter-card roster panel (tap any card) lists that drafter's picks grouped by position with per-pick ADP and the OVERALL pick number ('57 Pick / 9 Pick', see debug3.txt 2026-07-15 frames t=875/876) - a much cleaner OCR surface than the Board tab, whose side-by-side columns interleave under the y-sort and required geometric cell association (TASK-328). Today the parser deliberately treats roster panels as inert (TASK-329 guard: kind='roster', no availability, no mark-clearing). Extend it to HARVEST them: pair each roster row's player with its overall pick number and append board-grade ledger entries, keyed to the panel's username card. For slow drafts this becomes a directed intake flow - the user (or onboarding copy in the confidence hub) flips through each drafter's roster once and the full ledger reconstructs cleanly; it also backfills the user's own picks without a Board visit, likely superseding or simplifying TASK-330. Scope: parser row+overall+username association, ledger append path with snake-math validation, fixture/tests from debug3 frames, and a docs/UX note on directing users to the flow.

## Dependencies
None

## Open Questions
<!-- Unknowns or decisions to resolve before planning. Delete if none. -->
