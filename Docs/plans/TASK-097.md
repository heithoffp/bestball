# TASK-097: Draft overlay — stack and ADP riser badges on player rows

**Status:** Draft
**Priority:** P3

---

## Objective

Add inline badges to overlay player rows that mirror the stack and ADP riser indicators already present in the web app (DraftFlowAnalysis / ExposureTable). During a live draft, a user should be able to glance at a row and immediately see if a player is a QB stack with one of their current picks, or if their ADP is rising — without leaving the Underdog draft board.

## Dependencies

TASK-096 (portfolio data + playerIndexMap must be loaded in overlay — Done)

## Open Questions

- Which badges exactly: QB stack only, or also skill-position stacks (WR/TE with same team)?
- ADP riser source: the web app uses `masterPlayers[].history` from ADP snapshot CSVs — the extension doesn't have access to this data. Need to decide whether to read ADP history from Supabase (requires web app to write it there) or skip ADP risers for now.
- Badge placement: inline after the player name, or as a small icon in the Exp/Corr area?
