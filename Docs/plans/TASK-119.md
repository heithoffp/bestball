# TASK-119: Fit σ(ADP) from extracted picks

**Status:** Done
**Priority:** P2

---

## Objective

Using the clean intermediate dataset produced by TASK-118 (`simulation/Historical_Data/bbm6_picks_rd1_6.csv`), compute the empirical standard deviation of pick position relative to ADP across 12-pick ADP bands, then fit a linear functional form σ(ADP) = a·ADP + b. Output the fitted parameters as `simulation/calibration.json` to replace the hardcoded `sigma_slope=0.1, sigma_intercept=1.5` in `simulation/engine.py`.

## Verification Criteria

1. `simulation/fit_sigma.py` runs to completion without error.
2. `simulation/calibration.json` exists and contains top-level keys: `sigma_slope`, `sigma_intercept`, `functional_form`, `r_squared`, `n_bands`, and `diagnostics`.
3. Fitted `sigma_slope > 0` and `sigma_intercept > 0` (both parameters are plausible positives).
4. Script prints a per-band table: ADP band | N obs | empirical σ | fitted σ | residual.
5. R² of the winning fit is printed to stdout and is ≥ 0.7.
6. `simulation/engine.py` is **not modified** — this task only produces the JSON.

## Verification Approach

1. Run `python simulation/fit_sigma.py` from the repo root. Confirm it completes with no exceptions and prints a per-band table plus a final summary including R².
2. Run a Python snippet to inspect the output:
   ```python
   import json
   with open('simulation/calibration.json') as f:
       cal = json.load(f)
   print(cal.keys())
   print('sigma_slope:', cal['sigma_slope'])
   print('sigma_intercept:', cal['sigma_intercept'])
   print('R²:', cal['r_squared'])
   print('n_bands:', cal['n_bands'])
   ```
   Confirm: all required keys present, both sigma params > 0, R² ≥ 0.7.
3. Spot-check one band in `diagnostics` — verify `n_obs`, `empirical_sigma`, `fitted_sigma`, `adp_midpoint` fields are present and numeric.

## Files to Change

| File | Action | Description |
|------|--------|-------------|
| `simulation/fit_sigma.py` | Create | Script that reads the picks CSV, computes per-band σ, fits linear + log-linear, selects the better fit, and writes calibration.json |
| `simulation/calibration.json` | Create (output) | Calibration parameters for the simulation engine |

## Implementation Approach

### 1. Load the picks dataset

```python
import pandas as pd
import numpy as np

df = pd.read_csv('simulation/Historical_Data/bbm6_picks_rd1_6.csv')
```

### 2. Compute residuals

Residual = actual pick position (`overall_pick_number`) minus player's ADP (`projection_adp`).
Positive = picked later than ADP (fell); negative = picked earlier (reached).

```python
df['residual'] = df['overall_pick_number'] - df['projection_adp']
```

### 3. Bin by 12-pick ADP bands

Assign each pick to a band by its `projection_adp`:
- Band boundaries: 0–12, 13–24, 25–36, … up to the max observed ADP.
- Use `pd.cut` with `bins=range(0, max_adp_ceil, 12)`.
- Band midpoint = lower + 6 (e.g., band 1–12 → midpoint 6.5).
- Drop any band with fewer than 500 observations (merge into the adjacent band with more observations).

```python
max_adp = int(np.ceil(df['projection_adp'].max()))
bins = list(range(0, max_adp + 12, 12))
labels = [(bins[i] + bins[i+1]) / 2 for i in range(len(bins)-1)]
df['adp_band_mid'] = pd.cut(df['projection_adp'], bins=bins, labels=labels).astype(float)
```

### 4. Per-band empirical σ

For each band, compute `std(residual)` — this is the symmetric empirical sigma.
Also record `mean(residual)` as a diagnostic (reveals systematic reach/fall bias).

```python
band_stats = df.groupby('adp_band_mid')['residual'].agg(['std', 'mean', 'count']).reset_index()
band_stats.columns = ['adp_midpoint', 'empirical_sigma', 'mean_residual', 'n_obs']
band_stats = band_stats[band_stats['n_obs'] >= 500]
```

### 5. Fit linear form σ = a·ADP + b

Use `numpy.polyfit` degree=1:
```python
x = band_stats['adp_midpoint'].values
y = band_stats['empirical_sigma'].values
coeffs_lin = np.polyfit(x, y, deg=1)  # [slope, intercept]
y_hat_lin = np.polyval(coeffs_lin, x)
ss_res = np.sum((y - y_hat_lin) ** 2)
ss_tot = np.sum((y - y.mean()) ** 2)
r2_lin = 1 - ss_res / ss_tot
```

### 6. Fit log-linear form σ = exp(a·ln(ADP) + b)

Fit in log space: `ln(σ) = a·ln(ADP) + b`, then back-transform:
```python
log_x = np.log(x)
log_y = np.log(y)
coeffs_log = np.polyfit(log_x, log_y, deg=1)
y_hat_log = np.exp(np.polyval(coeffs_log, log_x))
ss_res_log = np.sum((y - y_hat_log) ** 2)
r2_log = 1 - ss_res_log / ss_tot
```

### 7. Select the better fit

Whichever form produces a higher R² wins. Convert the winning params to `sigma_slope` and `sigma_intercept` (the keys the engine uses). For log-linear, store the raw `a` and `b` coefficients in `diagnostics` and note that the engine integration in TASK-122 may need to adapt.

For the linear form: `sigma_slope = coeffs_lin[0]`, `sigma_intercept = coeffs_lin[1]`.

If log-linear wins, set `functional_form = "log-linear"` and note in diagnostics that TASK-122 must use `exp(a*ln(ADP) + b)` — but still emit `sigma_slope` and `sigma_intercept` as the closest linear approximation so downstream tasks have a usable starting value.

### 8. Print per-band table

```
ADP Band    N obs   Empirical σ   Fitted σ   Residual
  6.5       12345      4.21         4.18       0.03
 18.5       11200      6.34         6.31       0.03
...
```

### 9. Write calibration.json

```python
import json
output = {
    "sigma_slope": float(sigma_slope),
    "sigma_intercept": float(sigma_intercept),
    "functional_form": "linear",   # or "log-linear"
    "r_squared": float(r2_winner),
    "n_bands": int(len(band_stats)),
    "diagnostics": {
        "bands": [
            {
                "adp_midpoint": float(row.adp_midpoint),
                "n_obs": int(row.n_obs),
                "empirical_sigma": float(row.empirical_sigma),
                "fitted_sigma": float(fitted),
                "mean_residual": float(row.mean_residual)
            }
            for row, fitted in zip(band_stats.itertuples(), y_hat_winner)
        ],
        "linear_r2": float(r2_lin),
        "log_linear_r2": float(r2_log)
    }
}
with open('simulation/calibration.json', 'w') as f:
    json.dump(output, f, indent=2)
print(f"Done. sigma_slope={sigma_slope:.4f}, sigma_intercept={sigma_intercept:.4f}, R²={r2_winner:.4f}")
```

### Edge cases

- ADP values near 0 (e.g., DEF/K with ADP = 0 or null) — drop rows where `projection_adp <= 0` before binning.
- Bands under 500 observations (e.g., ADP > 144 in a 6-round draft) — merge into the previous band.
- `ss_tot == 0` (all empirical sigmas identical) — fall back to linear, log a warning.

## Dependencies

TASK-118 — `simulation/Historical_Data/bbm6_picks_rd1_6.csv` must exist (confirmed: file is present).

---
*Approved by: <!-- developer name/initials and date once approved -->*
