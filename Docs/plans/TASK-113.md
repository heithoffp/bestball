# TASK-113: Uniqueness simulation — behavioral multipliers (ω_struct, ω_stack)

**Status:** Draft
**Priority:** P2

---

## Objective
Enhance the simulation utility function with two behavioral multipliers that model real drafting psychology: ω_struct (archetype constraints — penalize structurally implausible roster builds, e.g. 4th RB after 3 in rounds 1-3) and ω_stack (team correlation boost — increase utility for teammates of already-drafted players, modeling intentional stacking behavior). Defer ω_corr (Week 17 correlation) as low-signal, high-complexity. Multiplier values should be calibrated against the archetype distribution percentages in `rosterArchetypes.js` PROTOCOL_TREE.

## Dependencies
- TASK-112 — base simulation engine must exist first
- `best-ball-manager/src/utils/rosterArchetypes.js` — PROTOCOL_TREE defines archetype paths and their expected distribution percentages (calibration target)

## Open Questions
- What are the ω_stack multiplier values? The Uniqueness_Model.md suggests 1.2x–2.0x range — needs calibration or literature reference.
- How to validate multiplier calibration? Compare simulated archetype distribution against PROTOCOL_TREE percentages?
- Should ω_struct be binary (hard block impossible builds) or continuous (soft penalty)?
