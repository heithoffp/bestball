# TASK-317: Boards IO follow-ups: artifact refresh cadence + client cache for user boards

**Status:** Draft
**Priority:** P3

---

## Objective
Two residual items from the TASK-315/316 disk-IO remediation: (1) combo-boards-v1.json is rebuilt manually via scripts/build-combo-boards.mjs — decide a refresh cadence or automate it (e.g. alongside the weekly digest) so Early Combo tables track new boards; (2) fetchUserBoardsOnce still downloads the user's own full boards (~40KB each) from draft_boards_admin every session for Roster Viewer / pod Adv % — boards are immutable once drafted, so an IndexedDB cache keyed by draft_id would cut repeat reads for heavy portfolios.

## Dependencies
None

## Open Questions
<!-- Unknowns or decisions to resolve before planning. Delete if none. -->
