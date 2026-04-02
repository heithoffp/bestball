<!-- Completed: 2026-04-02 | Commit: pending -->
# TASK-089: PlayerRankings: Remove dead per-position tier break state

**Status:** Done
**Priority:** P4

---

## Objective

The `tierBreaks` state object initializes keys for QB, RB, WR, and TE (e.g., `{ overall: new Set(), QB: new Set(), RB: new Set(), WR: new Set(), TE: new Set() }`), but only `tierBreaks.overall` is ever read or mutated. The positional keys are dead state — they add confusion and false expectation that position-specific tier breaks are supported. Clean up by replacing the state shape with just `overallTierBreaks: new Set()` and updating all references.

## Solution

Replaced `tierBreaks` object with `overallTierBreaks: new Set()`. Updated all references in `handleTierToggle`, `handleDragEnd`, the useEffect CSV restore path, and the `overallTierSet` derivation.

## Dependencies

None

## Open Questions

None
