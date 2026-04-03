<!-- Completed: 2026-04-03 | Commit: cee9a97 -->
# TASK-123: Refine sigma calibration — plateau cap, round stratification, mean shift, position sigma_max

**Status:** Done
**Priority:** P3

---

## Objective

Improve the σ(ADP) calibration to reduce held-out MAE from 1.52 to < 1.0 by adding four refinements to `fit_sigma.py`: a global σ plateau cap (`sigma_max`), per-round sigma caps (`round_sigma_max`), a mean-shift correction for high-ADP systematic bias (`mu_slope`, `mu_intercept`, `mu_adp_threshold`), and per-position sigma caps (`position_sigma_max`). All new parameters are written to `calibration.json` and validated using the existing `validate_model.py` framework.

## Verification Criteria

1. `python simulation/fit_sigma.py` runs without error and prints: fitted `sigma_max`, a per-round `sigma_max` table (6 rows), mu(ADP) params (`mu_slope`, `mu_intercept`, `mu_adp_threshold`), and a per-position `sigma_max` table (4 rows).
2. `simulation/calibration.json` contains all new keys: `sigma_max` (float), `round_sigma_max` (dict, keys `"1"`–`"6"`, float values), `mu_slope` (float), `mu_intercept` (float), `mu_adp_threshold` (float), `position_sigma_max` (dict, keys `"QB"`, `"RB"`, `"WR"`, `"TE"`, float values).
3. `python simulation/validate_model.py` runs without error and reports overall MAE < 1.0 (baseline: 1.52) using the updated model.
4. Existing keys in `calibration.json` (`sigma_slope`, `sigma_intercept`, `sigma_min`, `position_modifiers`, `stacking_multipliers`, etc.) are preserved unchanged.
5. `simulation/engine.py` is **not modified** — this task is calibration only.

## Verification Approach

1. Run `python simulation/fit_sigma.py` from repo root. Confirm it prints the four output blocks (global sigma_max, per-round table, mu params, per-position table) and exits cleanly.
2. Run a Python check:
   ```python
   import json
   cal = json.load(open('simulation/calibration.json'))
   assert 'sigma_max' in cal and isinstance(cal['sigma_max'], float)
   assert 'round_sigma_max' in cal and set(cal['round_sigma_max'].keys()) == {'1','2','3','4','5','6'}
   assert all(k in cal for k in ['mu_slope','mu_intercept','mu_adp_threshold'])
   assert 'position_sigma_max' in cal and set(cal['position_sigma_max'].keys()) == {'QB','RB','WR','TE'}
   # Existing keys preserved
   assert 'sigma_slope' in cal and 'position_modifiers' in cal and 'stacking_multipliers' in cal
   print('All checks passed')
   print('sigma_max:', cal['sigma_max'])
   print('round_sigma_max:', cal['round_sigma_max'])
   print('mu params:', cal['mu_slope'], cal['mu_intercept'], cal['mu_adp_threshold'])
   print('position_sigma_max:', cal['position_sigma_max'])
   ```
3. Run `python simulation/validate_model.py`. Confirm overall MAE < 1.0 is printed in the summary line.
4. Run `git diff simulation/engine.py` — confirm no output (file unchanged).

## Files to Change

| File | Action | Description |
|------|--------|-------------|
| `simulation/fit_sigma.py` | Modify | Add four fitting steps at the end; merge new params into calibration.json |
| `simulation/calibration.json` | Modify (output) | Gains `sigma_max`, `round_sigma_max`, `mu_slope`, `mu_intercept`, `mu_adp_threshold`, `position_sigma_max` |
| `simulation/validate_model.py` | Modify | Update `fitted_sigma()` to apply sigma_max, round_sigma_max, mean shift, position_sigma_max; print comparison vs baseline |

## Implementation Approach

### Step 1 — Global sigma_max (plateau cap)

After the existing per-band σ fitting in `fit_sigma.py`, add:

```python
# Fit sigma_max as the empirical plateau:
# Use the median of the top-N empirical sigma values where the curve has flattened.
# "Flattened" = bands where ADP >= the midpoint where the linear fit first exceeds empirical.
crossover_bands = band_stats[band_stats['fitted_sigma'] > band_stats['empirical_sigma']]
if len(crossover_bands) >= 2:
    sigma_max = float(crossover_bands['empirical_sigma'].median())
else:
    sigma_max = float(band_stats['empirical_sigma'].max())

print(f"sigma_max (plateau cap): {sigma_max:.4f}")
```

This identifies the ADP range where the linear fit overshoots the data, and uses the median of that region's empirical σ as the ceiling.

### Step 2 — Per-round sigma_max

Group picks by `team_pick_number` (1–6). For each round, compute per-band empirical σ (same 12-pick ADP bands, min 200 obs). Derive round sigma_max using the same crossover logic:

```python
round_sigma_max = {}
for rnd in range(1, 7):
    rnd_df = df[df['team_pick_number'] == rnd]
    rnd_df = rnd_df.assign(band_mid=pd.cut(rnd_df['projection_adp'], bins=bins, labels=mids).astype(float))
    rnd_stats = rnd_df.groupby('band_mid')['residual'].agg(['std','count']).reset_index()
    rnd_stats.columns = ['adp_midpoint','empirical_sigma','n_obs']
    rnd_stats = rnd_stats[rnd_stats['n_obs'] >= 200]
    if len(rnd_stats) == 0:
        round_sigma_max[str(rnd)] = sigma_max  # fallback to global
        continue
    rnd_stats['fitted_sigma'] = rnd_stats['adp_midpoint'].apply(
        lambda x: max(sigma_min, sigma_slope * x + sigma_intercept)
    )
    crossover = rnd_stats[rnd_stats['fitted_sigma'] > rnd_stats['empirical_sigma']]
    if len(crossover) >= 2:
        round_sigma_max[str(rnd)] = float(crossover['empirical_sigma'].median())
    else:
        round_sigma_max[str(rnd)] = sigma_max  # fallback to global

print("\nPer-round sigma_max:")
for rnd, val in round_sigma_max.items():
    print(f"  Round {rnd}: {val:.4f}")
```

### Step 3 — Mean-shift μ(ADP)

Fit a linear function to the `mean_residual` values in bands where the systematic bias is meaningful (|mean_residual| > 1.0). For bands below the threshold ADP, μ = 0 (no correction):

```python
from scipy import stats as scipy_stats

# band_stats already has mean_residual column from the existing fit_sigma.py logic
bias_bands = band_stats[band_stats['mean_residual'].abs() > 1.0]

if len(bias_bands) >= 2:
    mu_slope, mu_intercept, _, _, _ = scipy_stats.linregress(
        bias_bands['adp_midpoint'], bias_bands['mean_residual']
    )
    mu_adp_threshold = float(bias_bands['adp_midpoint'].min())
else:
    mu_slope, mu_intercept, mu_adp_threshold = 0.0, 0.0, 999.0  # no correction

print(f"\nMean shift mu(ADP): slope={mu_slope:.4f}, intercept={mu_intercept:.4f}, threshold_ADP={mu_adp_threshold:.1f}")
```

Engine usage (documented here for TASK-122): `mu = mu_slope * ADP + mu_intercept if ADP >= mu_adp_threshold else 0.0`

### Step 4 — Position-specific sigma_max

Group picks by `position_name` (QB, RB, WR, TE only — skip K/DEF). Same crossover logic per position:

```python
position_sigma_max = {}
for pos in ['QB', 'RB', 'WR', 'TE']:
    pos_df = df[df['position_name'] == pos]
    if len(pos_df) < 1000:
        position_sigma_max[pos] = sigma_max
        continue
    pos_df = pos_df.assign(band_mid=pd.cut(pos_df['projection_adp'], bins=bins, labels=mids).astype(float))
    pos_stats = pos_df.groupby('band_mid')['residual'].agg(['std','count']).reset_index()
    pos_stats.columns = ['adp_midpoint','empirical_sigma','n_obs']
    pos_stats = pos_stats[pos_stats['n_obs'] >= 500]
    if len(pos_stats) == 0:
        position_sigma_max[pos] = sigma_max
        continue
    pos_stats['fitted_sigma'] = pos_stats['adp_midpoint'].apply(
        lambda x: max(sigma_min, sigma_slope * x + sigma_intercept)
    )
    crossover = pos_stats[pos_stats['fitted_sigma'] > pos_stats['empirical_sigma']]
    if len(crossover) >= 2:
        position_sigma_max[pos] = float(crossover['empirical_sigma'].median())
    else:
        position_sigma_max[pos] = sigma_max

print("\nPer-position sigma_max:")
for pos, val in position_sigma_max.items():
    print(f"  {pos}: {val:.4f}")
```

### Step 5 — Merge into calibration.json

Read the existing file, add new keys, write back (preserving all existing keys):

```python
cal = json.load(open('simulation/calibration.json'))
cal['sigma_max'] = sigma_max
cal['round_sigma_max'] = round_sigma_max
cal['mu_slope'] = float(mu_slope)
cal['mu_intercept'] = float(mu_intercept)
cal['mu_adp_threshold'] = float(mu_adp_threshold)
cal['position_sigma_max'] = position_sigma_max
with open('simulation/calibration.json', 'w') as f:
    json.dump(cal, f, indent=2)
```

### Step 6 — Update validate_model.py

Update `fitted_sigma()` and add mean-shift to the comparison:

```python
# Load new params alongside existing
sigma_max       = cal.get('sigma_max', float('inf'))
round_sigma_max = cal.get('round_sigma_max', {})
mu_slope        = cal.get('mu_slope', 0.0)
mu_intercept    = cal.get('mu_intercept', 0.0)
mu_adp_threshold = cal.get('mu_adp_threshold', 999.0)
position_sigma_max = cal.get('position_sigma_max', {})

def fitted_sigma(adp_midpoint, rnd=None, position=None):
    base = max(sigma_min, sigma_slope * adp_midpoint + sigma_intercept)
    # Apply position cap if available
    pos_cap = position_sigma_max.get(position, sigma_max) if position else sigma_max
    # Apply round cap if available
    rnd_cap = round_sigma_max.get(str(rnd), sigma_max) if rnd else sigma_max
    # Use the most restrictive (smallest) cap
    effective_cap = min(sigma_max, pos_cap, rnd_cap)
    return min(base, effective_cap)

def fitted_mu(adp_midpoint):
    if adp_midpoint >= mu_adp_threshold:
        return mu_slope * adp_midpoint + mu_intercept
    return 0.0
```

Pass `rnd` and `position` when calling `fitted_sigma()` in the per-band loop (join band_stats to test_df by band_mid to get position mode per band; use `team_pick_number` median for round).

Add a baseline comparison block to the printed summary:
```
Baseline  -- MAE: 1.5196  RMSE: 1.9011  Weighted MAE: 1.0293
Refined   -- MAE: X.XXXX  RMSE: X.XXXX  Weighted MAE: X.XXXX
Improvement: -X.XX MAE (-XX%)
```

### Edge cases

- Rounds with no bands ≥ 200 obs: fall back to global `sigma_max`.
- Positions with < 1000 total picks: fall back to global `sigma_max`.
- `bias_bands` fewer than 2 points for mu fit: set mu params to zero (no correction) — this means the data doesn't support a reliable fit.
- When all three caps apply (global, round, position), use the minimum — be conservative.
- Preserve `functional_form`, `r_squared`, `n_bands`, `diagnostics` keys untouched.

## Dependencies

- TASK-119 — `calibration.json` with `sigma_slope`, `sigma_intercept`, `sigma_min`
- TASK-120 — `calibration.json` merged with `position_modifiers` and `stacking_multipliers`
- TASK-121 — `validate_model.py` baseline (MAE=1.52) for comparison

---
*Approved by: <!-- developer name/initials and date once approved -->*
