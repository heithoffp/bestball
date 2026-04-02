# TASK-087: PlayerRankings: Add "Reset to ADP order" button

**Status:** Draft
**Priority:** P3

---

## Objective

Once a user manually drags and reorders players, there is no way to restore ADP order short of re-uploading the CSV. Add a "Reset" button that re-sorts `rankedPlayers` by ADP ascending, restoring the original order. Should include a confirmation step to prevent accidental resets.

## Dependencies

None

## Open Questions

- Should Reset also clear all tier breaks, or preserve them? Clearing makes more sense since tier breaks reference player IDs that may move.
- Confirmation: inline confirm (button turns red + re-click) or modal dialog?
