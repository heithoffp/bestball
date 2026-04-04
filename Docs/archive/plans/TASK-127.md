<!-- Completed: 2026-04-04 | Commit: c17767c -->
# TASK-127: Refit simulation model to first-4-round data only

**Status:** Done
**Priority:** P2

---

## Objective

Filter the fitting input to `team_pick_number <= 4` in `fit_sigma.py` and `fit_modifiers.py`,
then re-run both scripts to regenerate `calibration.json` with parameters fitted exclusively
on round 1–4 pick behavior. This removes round 5–6 noise that is irrelevant to the combo key
(which is defined by picks 1–4 only).

## Verification Criteria

1. `calibration.json` contains a `"training_rounds": 4` metadata field confirming the scope.
2. `calibration.json` `diagnostics.bands` contain only observations from rounds 1–4 (verified
   by checking that `n_bands` and total `n_obs` are materially lower than the current values).
3. `fit_sigma.py` and `fit_modifiers.py` each contain a visible `team_pick_number <= 4` filter
   applied immediately after loading the picks data.
4. The per-round `round_sigma_max` loop in `fit_sigma.py` iterates rounds 1–4 only (not 1–6).
5. `calibration.json` R² remains >= 0.7 after the refit (same quality gate as before).

## Verification Approach

1. Inspect `simulation/fit_sigma.py` and `simulation/fit_modifiers.py` for the `<= 4` filter
   — confirm it is applied immediately after loading the CSV.
2. Run `python simulation/fit_sigma.py` from repo root. Capture output — verify:
   - No Python error
   - Printed R² >= 0.7
   - Band table shows round 4 as the highest `round_sigma_max` key
3. Run `python simulation/fit_modifiers.py` from repo root. Capture output — verify:
   - No Python error
   - "Loaded N rows" count is materially smaller than the round-1-6 equivalent
4. Read `simulation/calibration.json` and confirm:
   - `"training_rounds": 4` key present
   - `round_sigma_max` has keys "1"–"4" only (no "5" or "6")
   - `r_squared` >= 0.7

## Files to Change

| File | Action | Description |
|------|--------|-------------|
| `simulation/fit_sigma.py` | Modify | Add `df = df[df["team_pick_number"] <= 4]` filter after loading CSV; change per-round loop from `range(1, 7)` to `range(1, 5)`; add `"training_rounds": 4` to calibration output |
| `simulation/fit_modifiers.py` | Modify | Add round filter to exclude `team_pick_number > 4` picks before roster state reconstruction |
| `simulation/calibration.json` | Regenerate | Re-run both fitting scripts; output is updated in place |

## Implementation Approach

### fit_sigma.py

1. After `df = pd.read_csv(INPUT_PATH)` and the `projection_adp > 0` filter, add:
   ```python
   df = df[df["team_pick_number"] <= 4].copy()
   print(f"  Filtered to rounds 1-4: {len(df):,} rows remaining.")
   ```
2. Change the per-round `round_sigma_max` loop from `for rnd in range(1, 7):` to
   `for rnd in range(1, 5):`.
3. In the `existing.update({...})` block, add `"training_rounds": 4` as a top-level key.

**ADP > 48 handling:** No special cap needed. Rounds 1–4 pickers do reach for players with
ADP > 48, so training observations exist in that range (just fewer). The existing
`merge_thin_bands` mechanism automatically pools sparse high-ADP bands. The linear/log-linear
fit extrapolates gracefully beyond the training range, and the existing `sigma_min` floor
already prevents degenerate values. The engine only simulates rounds 1–4 anyway.

### fit_modifiers.py

1. In `load_picks()`, after the rows loop completes (or in `main()` before calling
   `reconstruct_roster_states`), filter rows to rounds 1–4:
   ```python
   rows = [r for r in rows if int(r["team_pick_number"]) <= 4]
   print(f"  After round filter (<=4): {len(rows):,} rows.")
   ```
   Filtering *before* `reconstruct_roster_states` ensures that roster state counts only
   reflect rounds 1–4 picks, matching the product's combo key scope.

### Re-run scripts

Run in order:
```
python simulation/fit_sigma.py
python simulation/fit_modifiers.py
```

Both scripts merge into the existing `calibration.json`, so running them in sequence
produces the final updated file.

## Dependencies

TASK-115 — uniqueness engine integration complete; simulation output format is stable.

---
*Approved by: <!-- developer name/initials and date once approved -->*
