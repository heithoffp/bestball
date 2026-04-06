# TASK-160: Fix DraftKings roster ingestion — draft pick order and player positions

**Status:** Draft
**Priority:** P2

---

## Objective
The Chrome extension's DraftKings roster scraping has two bugs that produce incorrect data. First, draft pick numbers are assigned sequentially by roster slot order (QB, RB, RB, WR, WR, etc.) rather than reflecting the actual order players were drafted — picks show as 1, 2, 3... based on position listing instead of true draft position. Second, players are assigned lineup slot labels (FLEX, BN) instead of their real football position (QB, RB, WR, TE). Both issues corrupt downstream analytics that depend on accurate draft pick numbers and player positions (e.g., draft flow analysis, CLV calculations, archetype classification).

## Dependencies
None

## Open Questions
- Does the DraftKings completed-entry page expose actual draft pick order anywhere in the DOM, or is only the roster slot layout available? If draft order isn't in the DOM, an alternative data source or heuristic may be needed.
- Does DraftKings expose true position (QB/RB/WR/TE) in the player row DOM, or only the lineup slot (FLEX/BN)? If only slot labels are available, position may need to be inferred from a lookup or the ADP data.
