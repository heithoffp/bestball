<!-- Completed: 2026-04-03 | Commit: cee9a97 -->
# TASK-121: Validate fitted model against held-out historical data

**Status:** Done
**Priority:** P3

---

## Objective

Validate that the fitted σ(ADP) parameters from TASK-119 generalize beyond the training data by holding out 10% of BBM6 drafts, computing empirical σ per ADP band on the held-out set, and comparing against the calibration.json predictions using RMSE, MAE, and per-band KL divergence. Produces `simulation/validation_report.json` for downstream reference.

## Verification Criteria

1. `python simulation/validate_model.py` runs from the repo root without error.
2. Script prints a per-band table with columns: ADP Band, N obs, Empirical σ, Fitted σ, Abs Err, Rel Err %, KL Div.
3. Test set contains at least 5 ADP bands with ≥ 200 observations each.
4. Overall MAE < 2.0 (empirical σ values range from ~1.4 to ~17; MAE < 2.0 is consistent with the training R²=0.87).
5. `simulation/validation_report.json` exists and contains top-level keys: `split`, `overall`, `per_band`, `per_round`.
6. `simulation/engine.py` is **not modified** (this task is analytics only).

## Verification Approach

1. Run `python simulation/validate_model.py` from repo root. Confirm it completes without exception and prints the per-band table.
2. Check the printed summary line for overall MAE — confirm it is < 2.0.
3. Count the rows in the per-band table — confirm ≥ 5 rows (each row = one band with ≥ 200 obs).
4. Run a quick Python check:
   ```python
   import json
   r = json.load(open('simulation/validation_report.json'))
   print(r.keys())            # should have split, overall, per_band, per_round
   print(r['overall'])        # mae, rmse, weighted_mae, mean_kl_div
   print(r['split'])          # train_drafts, test_drafts, test_picks, seed
   print('bands:', len(r['per_band']))  # should be >= 5
   ```
5. Confirm `engine.py` is unmodified: `git diff simulation/engine.py` shows no changes.

## Files to Change

| File | Action | Description |
|------|--------|-------------|
| `simulation/validate_model.py` | Create | Validation script: train/test split, per-band σ comparison, KL divergence, per-round breakdown |
| `simulation/validation_report.json` | Create (output) | JSON report with split metadata, aggregate metrics, and per-band/per-round tables |

## Implementation Approach

### Step 1 — Train/test split

```python
import pandas as pd, numpy as np, json, math

df = pd.read_csv('simulation/Historical_Data/bbm6_picks_rd1_6.csv')
df = df[df['projection_adp'] > 0].copy()  # drop K/DEF with ADP=0

draft_ids = sorted(df['draft_id'].unique())
rng = np.random.default_rng(42)
rng.shuffle(draft_ids)
n_test = max(1, int(len(draft_ids) * 0.10))
test_ids = set(draft_ids[-n_test:])

test_df = df[df['draft_id'].isin(test_ids)].copy()
print(f"Total drafts: {len(draft_ids):,} | Train: {len(draft_ids)-n_test:,} | Test: {n_test:,} | Test picks: {len(test_df):,}")
```

### Step 2 — Load calibration parameters

```python
cal = json.load(open('simulation/calibration.json'))
sigma_slope     = cal['sigma_slope']
sigma_intercept = cal['sigma_intercept']
sigma_min       = cal.get('sigma_min', 0.0)

def fitted_sigma(adp_midpoint):
    return max(sigma_min, sigma_slope * adp_midpoint + sigma_intercept)
```

### Step 3 — Compute empirical σ per ADP band on test set

Use the same 12-pick band boundaries as `fit_sigma.py`:

```python
test_df['residual'] = test_df['overall_pick_number'] - test_df['projection_adp']

max_adp = int(np.ceil(test_df['projection_adp'].max()))
bins = list(range(0, max_adp + 12, 12))
mids = [(bins[i] + bins[i+1]) / 2 for i in range(len(bins)-1)]
test_df['band_mid'] = pd.cut(test_df['projection_adp'], bins=bins, labels=mids).astype(float)

band_stats = (test_df.groupby('band_mid')['residual']
              .agg(['std', 'mean', 'count'])
              .reset_index())
band_stats.columns = ['adp_midpoint', 'empirical_sigma', 'mean_residual', 'n_obs']
band_stats = band_stats[band_stats['n_obs'] >= 200]
```

### Step 4 — Compute fitted σ and per-band error metrics

```python
band_stats['fitted_sigma']   = band_stats['adp_midpoint'].apply(fitted_sigma)
band_stats['abs_error']      = (band_stats['empirical_sigma'] - band_stats['fitted_sigma']).abs()
band_stats['signed_error']   = band_stats['empirical_sigma'] - band_stats['fitted_sigma']
band_stats['rel_error_pct']  = (band_stats['signed_error'] / band_stats['empirical_sigma']) * 100

mae          = band_stats['abs_error'].mean()
rmse         = math.sqrt((band_stats['abs_error'] ** 2).mean())
weighted_mae = np.average(band_stats['abs_error'], weights=band_stats['n_obs'])
```

### Step 5 — KL divergence per ADP band

For each band, build a residual histogram and compare against the theoretical Gaussian PMF:

```python
from scipy.stats import norm

BIN_RANGE = range(-30, 31)  # residual bins −30 to +30

def kl_divergence(empirical_sigma, residuals_in_band):
    counts, edges = np.histogram(residuals_in_band, bins=list(BIN_RANGE) + [31])
    total = counts.sum()
    if total == 0:
        return float('nan')
    actual = counts / total  # empirical PMF
    bin_centers = [(edges[i] + edges[i+1]) / 2 for i in range(len(edges)-1)]
    predicted = np.array([norm.pdf(c, 0, empirical_sigma) for c in bin_centers])
    predicted /= predicted.sum()  # normalize to PMF
    # KL(actual || predicted), skip bins where actual=0
    kl = 0.0
    for a, p in zip(actual, predicted):
        if a > 0 and p > 0:
            kl += a * math.log(a / p)
    return kl

kl_values = []
for row in band_stats.itertuples():
    band_residuals = test_df[test_df['band_mid'] == row.adp_midpoint]['residual'].values
    kl = kl_divergence(row.fitted_sigma, band_residuals)
    kl_values.append(kl)
band_stats['kl_div'] = kl_values
mean_kl = float(np.nanmean(kl_values))
```

### Step 6 — Per-round breakdown

```python
per_round = {}
for rnd in range(1, 7):
    rnd_df = test_df[test_df['team_pick_number'] == rnd].copy()
    rnd_df['band_mid'] = pd.cut(rnd_df['projection_adp'], bins=bins, labels=mids).astype(float)
    rnd_stats = (rnd_df.groupby('band_mid')['residual']
                 .agg(['std', 'count'])
                 .reset_index())
    rnd_stats.columns = ['adp_midpoint', 'empirical_sigma', 'n_obs']
    rnd_stats = rnd_stats[rnd_stats['n_obs'] >= 50]
    rnd_stats['fitted_sigma'] = rnd_stats['adp_midpoint'].apply(fitted_sigma)
    rnd_stats['abs_error']    = (rnd_stats['empirical_sigma'] - rnd_stats['fitted_sigma']).abs()
    per_round[str(rnd)] = rnd_stats.to_dict(orient='records')
```

### Step 7 — Print report and write JSON

Print the per-band table (formatted with f-strings, aligned columns), then:

```python
report = {
    "split": {
        "train_drafts": len(draft_ids) - n_test,
        "test_drafts":  n_test,
        "test_picks":   len(test_df),
        "seed":         42
    },
    "overall": {
        "mae":          float(mae),
        "rmse":         float(rmse),
        "weighted_mae": float(weighted_mae),
        "mean_kl_div":  mean_kl
    },
    "per_band":  band_stats.to_dict(orient='records'),
    "per_round": per_round
}
with open('simulation/validation_report.json', 'w') as f:
    json.dump(report, f, indent=2)
print(f"\nDone. MAE={mae:.4f}  RMSE={rmse:.4f}  Weighted MAE={weighted_mae:.4f}  Mean KL={mean_kl:.4f}")
```

### Edge cases

- ADP bands with < 200 test observations are excluded from aggregate metrics (same rule as TASK-119).
- Any band where the histogram total is 0 (shouldn't happen given the 200-obs threshold, but guard with `float('nan')`).
- `sigma_min` may not be present in older calibration.json files — default to 0.0 so `max(0, fitted)` is always non-negative.
- `team_pick_number` is used for round stratification (1–6 for a 6-round draft); rows with out-of-range values are silently excluded by the `range(1,7)` loop.

## Dependencies

- TASK-119 — `simulation/calibration.json` must contain `sigma_slope`, `sigma_intercept`.
- TASK-120 — `simulation/calibration.json` must be the fully merged file (with `position_modifiers` and `stacking_multipliers` present, though not used here).
- Both are confirmed Done as of 2026-04-03.

---
*Approved by: <!-- developer name/initials and date once approved -->*
