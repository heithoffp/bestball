# TASK-039: Replace Uniqueness Lift with First 6 Pick Uniqueness metric (Parent)

**Status:** Draft — Broken into sub-tasks
**Priority:** P2

---

## Objective
Replace the current Uniqueness Lift metric in RosterViewer with a First 6 Pick Uniqueness score derived from a pre-computed Monte Carlo simulation. The simulation models the distribution of expected first-6-round draft outcomes using a Conditional Logit (Plackett-Luce) utility function. Each actual roster's first 6 picks are cross-compared against the simulated distribution at runtime to produce a uniqueness score. The Monte Carlo runs offline in Python; its output is bundled as a static JSON asset.

Per ADR-003, the output uses a two-tier hybrid model: exact frequency table for common combinations, conditional probability fallback for rare/unseen combinations.

## Sub-Tasks
| ID | Title | Status |
|----|-------|--------|
| TASK-112 | Uniqueness simulation engine MVP — Python Conditional Logit draft simulator | Todo |
| TASK-113 | Uniqueness simulation — behavioral multipliers (ω_struct, ω_stack) | Todo |
| TASK-114 | Uniqueness simulation — temporal weighting across ADP epochs | Todo |
| TASK-115 | Uniqueness engine JS integration + UI in RosterViewer | Todo |

## Dependencies
- TASK-038 (Done) — Grading system removal cleans up the existing uniqueness infrastructure
- ADR-003 (Accepted) — Defines the two-tier hybrid output model

## Design Reference
- `docs/Uniqueness_Model.md` — Full algorithm specification
- `docs/adr/adr-003-uniqueness-engine-output-model.md` — Output model decision
