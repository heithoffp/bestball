<!-- Completed: 2026-04-02 | Commit: pending -->
# TASK-088: PlayerRankings: Fix mobile Save button feedback ambiguity

**Status:** Done
**Priority:** P4

---

## Objective

On mobile, the Save button shows '...' while saving, then '!' for both success and error states. Success and error are visually identical, making it impossible to tell if the save succeeded. Use distinct icons or short text to differentiate: checkmark icon for success, X icon for error (or text like 'OK' vs 'Err').

## Solution

Changed mobile save status text: saved → '✓', error → 'Err'. Desktop text unchanged (Saved! / Error).

## Dependencies

None

## Open Questions

None
