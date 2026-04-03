# ADR-003: Uniqueness Engine Output Model — Frequency Table vs. Conditional Probabilities

**Date:** 2026-04-03
**Status:** Accepted

---

## Context

TASK-039 introduces a Monte Carlo simulation engine that models best-ball drafts as sequential, state-dependent decision processes using a Conditional Logit (Plackett-Luce) utility function. The simulation runs offline in Python and its output is bundled as a static asset for the client-side React app (no server, no Redis — per Vision & Scope constraint "no server-side processing").

The core architectural question is: **how should the simulation output be structured for runtime uniqueness lookups?**

Two fundamentally different approaches exist, each with distinct trade-offs for storage size, query capability, and user-facing transparency.

### Key constraint: ADP variance is tight

Player ADP standard deviation is approximately 4 pick positions (6σ ≈ 24 players). This means the realistic candidate pool at any draft pick is ~30-50 players, not the full ~450 draftable field. This dramatically reduces the effective combinatorial space and makes exact-match approaches more viable than naive C(450,6) ≈ 10^13 analysis would suggest.

### Scale

Each simulation models a 12-team snake draft through 6 rounds, producing 12 roster observations per run. At 1M simulations, that yields 12M roster samples. With temporal weighting across ~8 monthly ADP epochs, that's ~1.5M simulations per epoch × 8 = 12M simulations total, producing ~144M roster observations.

## Decision

**Use a two-tier hybrid model: exact frequency table for common combinations (Tier 1) plus a conditional probability fallback for rare/unseen combinations (Tier 2).**

Tier 1 (primary): Store all 6-pick combinations observed 2+ times as a hashed frequency table. This covers the "head" of the distribution — the chalk and near-chalk rosters that appear frequently. Lookup is O(1) and output is concrete ("14.2 copies per million").

Tier 2 (fallback): For combinations not found in the frequency table (truly rare rosters), compute an estimated frequency using stored per-round conditional pick probabilities. This avoids returning "0 matches" for unusual-but-valid rosters, while honestly communicating that the estimate is modeled rather than observed.

The UI distinguishes between the two: observed frequencies are presented as exact counts; fallback estimates are presented as approximate ranges (e.g., "< 1 per million, estimated").

## Alternatives Considered

### Option A: Exact Frequency Table Only

Hash each simulated roster's sorted first-6-pick player IDs, store occurrence counts in a JSON lookup table.

- **Pros:** Simplest implementation; O(1) lookup; output is concrete and intuitive ("X copies per million"); disruption analysis (n-1 subset lookups) works directly; fully transparent — "we simulated N drafts, your combo appeared K times"
- **Cons:** Returns 0 for unseen combinations — a legitimately rare roster gets no score, which is uninformative and could feel broken; static asset size depends on distribution density (could be 5-50 MB depending on how many unique combos appear); no graceful degradation for tail combinations

### Option B: Conditional Probability Model Only

Store per-pick conditional probabilities: P(pick_k | picks_1..k-1, round, archetype_context). Compute combo probability at runtime as the product of sequential conditionals.

- **Pros:** Compact output (~hundreds of KB); always produces a value for any combination; richer per-pick granularity ("pick 4 was the rare one"); no sparsity problem
- **Cons:** Product-of-conditionals assumes conditional independence between non-adjacent picks, which ignores real interactions (e.g., stacking a QB in round 4 changes WR utility in round 5); output is an abstract probability ("0.0014%"), less intuitive than concrete counts; disruption analysis requires full recomputation for each n-1 subset; harder to explain to users — violates "Transparency Builds Trust" principle; the conditional probability tables themselves are complex to structure (keyed by prior-pick context, which grows combinatorially)

### Option C: Two-Tier Hybrid (chosen)

Exact frequency table for observed combinations + conditional probability fallback for unseen ones.

- **Pros:** Concrete counts for common rosters (best UX); graceful fallback for rare rosters (no "0 matches" dead end); disruption analysis works directly on Tier 1 data; asset size is bounded — only store combos with count ≥ 2, plus a compact conditional table; transparent distinction between "observed" and "estimated"
- **Cons:** Two code paths to maintain; requires both the frequency table and the conditional table to be generated and bundled; the Tier 1/Tier 2 boundary is visible to users, which could be confusing if not communicated well

## Consequences

### Positive
- Most user rosters (the "head" of the distribution) get exact, intuitive, transparent scores
- Truly unique rosters still get a meaningful score rather than a dead-end zero
- Disruption analysis ("your lineup disruptor is Montgomery") works naturally on Tier 1 data
- The two-tier distinction actually reinforces the product message: if your roster falls to Tier 2, *that itself communicates how rare it is*
- Asset size is manageable — Tier 1 table only stores combos with count ≥ 2 (the long tail of singletons is discarded), and the Tier 2 conditional table is compact

### Negative
- Two generation pipelines in the Python simulation (frequency counting + conditional probability extraction)
- Two lookup paths in the JS client code
- Users see two different output formats depending on rarity — needs clear UX to avoid confusion
- The Tier 2 conditional product is an approximation that may not match what a larger simulation would observe

### Risks
- **Asset size uncertainty:** Until the simulation runs, we don't know how many combos appear 2+ times. If the distribution is very flat (few repeats), Tier 1 may be sparse and most lookups fall to Tier 2, undermining the value of the hybrid. **Mitigation:** Run a small-scale pilot (100K sims) early in Phase 1 to measure the distribution shape before committing to the full pipeline.
- **Tier boundary confusion:** Users might not understand why some rosters get "14 copies per million" and others get "< 1 per million (estimated)." **Mitigation:** Help Guide explanation + tooltip on the score.
- **Conditional independence assumption in Tier 2:** The product-of-conditionals can over- or under-estimate true rarity for combos with strong pick interactions. **Mitigation:** Accept this as a known limitation for the tail; the exact scores in Tier 1 are the primary value.

## Related
- Tasks: TASK-039
- ADRs: ADR-002 (Mirror-Not-Advisor — uniqueness scores are appropriate in Roster Viewer as individual roster evaluation, not portfolio-level prescription)

---
*Approved by: PH — 2026-04-03*
