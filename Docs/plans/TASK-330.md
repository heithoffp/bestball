# TASK-330: Record the user's own pick while parked on the Players tab (confirm-card/queue-diff inference)

**Status:** Draft
**Priority:** P3

---

## Objective
fastdraft.txt (2026-07-15) shows myPicks stuck at 11 entries with currentPick 138: the user's round-12 pick (overall 136) was made from the Players tab and never entered the ledger until a Board visit. The pick-confirmation-card path (sessionEngine confirmCard -> event ledger append) read null on every frame around the pick. The roster bar and my-picks count undercount whenever the user drafts without visiting the Board. Investigate stronger own-pick attribution: confirm-card OCR reliability on fast drafts, queue-row disappearance diffing, or the wasOnClock->notOnClock myPickEvent paired with the next board-grade evidence. Discovered during TASK-329 investigation; kept out of its scope.

## Dependencies
None

## Open Questions
- TASK-332 (roster-panel intake) may supersede this: tapping your own drafter card
  yields every pick with its overall number — a cleaner own-pick backfill than
  confirm-card/queue-diff inference, though it needs a user action while this task
  targets fully passive attribution. Re-evaluate scope once TASK-332 lands.

## Scope Items

### Harvest slow-draft completed carousel cards (pick label + abbreviated player name) as ledger entries
- **Added:** 2026-07-15
- **Verification:** Fixture from frames-1784120786 #14/#23 ('6.4 | 64' + 'J. Tyson' under BIRDENTHUSIAST): ingest appends ledger entry overall 64 = Jordyn Tyson attributed to the card's username; replaying the recording yields myPicks containing the round-6 pick and rosterBar QB/RB/WR/TE counts reflecting it
