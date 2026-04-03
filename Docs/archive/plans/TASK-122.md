<!-- Completed: 2026-04-03 | Commit: cee9a97 -->
# TASK-122: Integrate calibration into simulation engine

**Status:** Approved
**Priority:** P3

---

## Objective

Update `simulation/engine.py` to load all fitted parameters from `simulation/calibration.json` and apply them during simulation — replacing hardcoded sigma values, adding multi-cap sigma computation, mean-shift correction, roster-state position modifiers, and team stacking multipliers. The simulation will then produce draft patterns matching real BBM 6 behavior as validated in TASK-121.

## Verification Criteria

1. Running `python simulation/simulate.py --pilot` with `calibration.json` present completes without error and prints the calibration params it loaded (sigma_slope, sigma_intercept, modifiers active).
2. Running `python simulation/simulate.py --pilot` without `calibration.json` present emits a warning to stderr and falls back to hardcoded defaults, still completing successfully.
3. The utility matrix pre-computation uses calibrated sigma values: for a player with ADP=30, position=RB, round=2, the computed sigma is `min(max(sigma_min, slope*30+intercept), sigma_max, RB_position_cap, round2_cap)` matching `validate_model.py`'s `fitted_sigma()` logic.
4. Position modifier lookup produces `[1.0, 1.0, 1.0, 1.0]` for any uncalibrated state (no KeyError).
5. Stacking multipliers are applied: a player from a team already on the roster 2+ times receives `stacking_mults_list[2]` as a utility multiplier.

## Verification Approach

1. Run `python simulation/simulate.py --pilot` from repo root and confirm:
   - Startup banner prints calibration summary (sigma params, modifiers active)
   - Completes 100K simulations without error
   - Reports total unique combos count (sanity check — number should differ from uncalibrated run due to modifiers)
2. Temporarily rename `simulation/calibration.json` to `simulation/calibration.json.bak`, run `python simulation/simulate.py --pilot`, confirm warning printed to stderr and run completes. Restore the file.
3. Print verification: add a temporary `print(calibrated_sigma(30.0, cal, rnd=2, position="RB"))` in the engine and confirm the result matches manual calculation.
4. Code review: confirm `position_modifiers_table` has entries for all 144 capped states with no missing key errors possible.

## Files to Change

| File | Action | Description |
|------|--------|-------------|
| `simulation/engine.py` | Modify | Add `load_calibration`, `calibrated_sigma`, `mu_shift` functions; rebuild utility matrix with calibrated sigmas; add per-team state tracking and modifier/stacking application in inner loop |
| `simulation/simulate.py` | Modify | Auto-load calibration before calling `run_simulation`; pass `calibration=cal`; update startup banner |

## Implementation Approach

### Step 1 — Add helper functions to `engine.py`

Add three functions near the top of `engine.py` (after imports, before `base_utility`):

**`load_calibration(path=None) -> dict | None`**
```python
def load_calibration(path=None):
    if path is None:
        path = os.path.join(os.path.dirname(__file__), "calibration.json")
    if not os.path.exists(path):
        print(f"WARNING: calibration file not found at {path} — using hardcoded defaults", file=sys.stderr)
        return None
    with open(path) as f:
        return json.load(f)
```
Add `import json`, `import os`, `import sys` at the top of the file.

**`calibrated_sigma(adp, cal, rnd=None, position=None) -> float`**
Replicates `fitted_sigma()` from `validate_model.py`:
```python
def calibrated_sigma(adp, cal, rnd=None, position=None):
    base = max(cal["sigma_min"], cal["sigma_slope"] * adp + cal["sigma_intercept"])
    if adp > cal.get("sigma_max_adp_limit", float("inf")):
        return base
    sigma_max = cal.get("sigma_max", float("inf"))
    pos_cap = cal.get("position_sigma_max", {}).get(position, sigma_max) if position else sigma_max
    rnd_cap = float(cal.get("round_sigma_max", {}).get(str(rnd), sigma_max)) if rnd else sigma_max
    return min(base, sigma_max, pos_cap, rnd_cap)
```

**`mu_shift(adp, cal) -> float`**
```python
def mu_shift(adp, cal):
    if adp >= cal.get("mu_adp_threshold", float("inf")):
        return cal.get("mu_slope", 0.0) * adp + cal.get("mu_intercept", 0.0)
    return 0.0
```

### Step 2 — Update `run_simulation` signature

Add `calibration: dict | None = None` parameter. Keep `sigma_slope` and `sigma_intercept` for backward-compat but they are only used when `calibration is None`.

### Step 3 — Rebuild utility matrix with calibrated sigma

Replace the current `adps / sigmas_arr / z_matrix` block with a calibrated 2D sigma matrix.

### Step 4 — Pre-compute modifier lookup structures

Build a 144-entry `position_modifiers_table[(qb,rb,wr,te)]` covering all capped states, `stacking_mults_list[k]`, `player_positions_int[i]`, and `player_teams_list[i]`.

### Step 5 — Update simulation loop

Add per-team QB/RB/WR/TE count arrays and `team_stack` dicts. Build `mod_utils` list per pick applying position modifiers and stacking multipliers. Update team state after each pick.

### Step 6 — Update `simulate.py`

Auto-load calibration, pass to `run_simulation`, update startup banner with calibration summary.

### Edge cases
- Players with position not in QB/RB/WR/TE: `pos_int = -1`, `pos_mod = 1.0` — no modifier applied.
- Player with empty team string: `stack_map.get("", 0)` → 0, multiplier = 1.0. Harmless.
- `sigma_matrix` division by zero: `calibrated_sigma` always returns `max(sigma_min, ...)` where `sigma_min > 0` — no division by zero possible.

## Dependencies

- TASK-119 — `simulation/calibration.json` sigma params (complete)
- TASK-120 — `simulation/calibration.json` roster modifiers and stacking multipliers (complete)
- TASK-121 — validation passed, `fitted_sigma()` logic confirmed (complete)

---
*Approved by: Patrick H-K 2026-04-03*
