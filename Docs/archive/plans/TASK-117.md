<!-- Completed: 2026-04-03 | Commit: pending -->
# TASK-117: Optimize simulation engine performance — target < 300s for 100K sims

**Status:** Approved
**Priority:** P3

---

## Objective
Optimize the uniqueness simulation engine (`simulation/engine.py`) to complete 100K simulations in under 300 seconds (stretch goal: under 120s). The current implementation takes ~716s due to Python-level overhead in the per-pick inner loop.

## Verification Criteria
1. `python simulate.py --pilot --seed 42` completes in under 300 seconds (measured by the engine's own timer).
2. Output files (`tier1_frequency.json`, `tier2_conditional.json`) are **byte-identical** to the pre-optimization baseline when run with the same seed, confirming no behavioral regression.
3. All existing functionality preserved: combo counting, pick events for Tier 2, and pilot report generation work correctly.

## Verification Approach
1. **Baseline capture:** Before any changes, run `python simulate.py --pilot --seed 42` and save the output JSON files as baseline. Record elapsed time.
2. **Post-optimization run:** Run the same command after changes. Compare elapsed time to the 300s target.
3. **Regression check:** Diff the output JSON files against baseline — must be identical (same seed, same RNG sequence → same results).
4. **Stretch validation:** If under 120s, note this in the reflection.

Steps 1–3 can all be run by Claude.

## Files to Change
| File | Action | Description |
|------|--------|-------------|
| `simulation/engine.py` | Modify | Replace Python-loop inner draft logic with numpy-vectorized array operations |
| `simulation/models.py` | Modify | Add pre-computed numpy ADP array export from `load_players` |

## Implementation Approach

### Root Cause
The inner loop in `simulate_draft` runs 72 times per simulation (12 teams × 6 rounds). For 100K sims, that's 7.2M iterations. Each iteration:
1. `sorted(available_set)` — O(n log n) Python sort of remaining indices
2. List comprehension to build `avail_players` — O(n) Python object access
3. `np.array([p.adp for p in players])` inside `compute_utilities` — O(n) array rebuild from Python objects
4. Normalize + sample — O(n)

Steps 1–3 are pure Python overhead that can be eliminated.

### Optimization Strategy: Pre-computed Arrays + Boolean Masking

1. **Pre-compute ADP array once** before simulation loop:
   - Extract `adps = np.array([p.adp for p in players])` once
   - Pre-compute `sigmas = sigma_slope * adps + sigma_intercept` once
   - Store player indices as a simple arange

2. **Replace `available_set` with numpy boolean mask:**
   - `available = np.ones(len(players), dtype=bool)` — True = still available
   - Instead of `sorted(available_set)` + list comprehension, use `adps[available]` to slice
   - This eliminates the Python sort and list building entirely

3. **Vectorized utility computation on masked arrays:**
   - Compute `z = (pick - adps[available]) / sigmas[available]` — single numpy operation
   - Compute `utilities = np.exp(-0.5 * z * z)` — single numpy operation
   - No function call overhead, no array reconstruction

4. **Efficient sampling with index mapping:**
   - After sampling a local index within the available subset, map back to global index using `np.flatnonzero(available)[local_idx]`
   - Mark `available[global_idx] = False` — O(1) removal

5. **Minimize Python object access in hot path:**
   - Pre-extract `player_ids` and `positions` as plain lists
   - Access by index instead of through Player objects during the draft loop
   - Build team rosters as lists of indices, convert to Player objects only at the end

6. **Pre-compute pick order** as a list instead of generator, avoiding generator overhead per pick.

### What this does NOT change
- The simulation logic and probability model remain identical
- Same RNG sequence → same results (deterministic with same seed)
- Output format unchanged
- `models.py` changes are additive (existing `load_players` return signature unchanged)

## Dependencies
- TASK-112 (Done) — base engine exists

## Open Questions
- If numpy vectorization alone doesn't reach the target, numba `@njit` on the inner loop would be the next step — but that adds a dependency and JIT warmup time. Deferring unless needed.

---
*Approved by: PH — 2026-04-03*
