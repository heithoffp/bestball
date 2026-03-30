# TASK-039: Replace Uniqueness Lift with First 6 Pick Uniqueness metric

**Status:** Draft
**Priority:** P2

---

## Objective
Replace the current Uniqueness Lift metric in RosterViewer with a First 6 Pick Uniqueness score derived from a pre-computed Monte Carlo simulation. The simulation models the distribution of expected first-6-round draft outcomes across known roster archetypes. Each actual roster's first 6 picks are cross-compared against the simulated distribution at runtime to produce a uniqueness score. The Monte Carlo is run offline; its output is bundled as a static asset.

## Dependencies
TASK-038 — Grading system removal cleans up the existing uniqueness infrastructure first

## Open Questions
- What is the exact algorithm for the Monte Carlo simulation (archetype distribution inputs, sampling method, number of simulations)?
- What format should the pre-computed simulation output take (JSON lookup table, CDF per position/round slot)?
- How is the cross-comparison score computed (percentile rank, cosine distance, other)?
- Who runs the offline simulation and how is the output asset updated as ADP data changes?
