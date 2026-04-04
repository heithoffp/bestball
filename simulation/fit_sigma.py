"""Fit sigma(ADP) from BBM 6 extracted picks.

Reads simulation/Historical_Data/bbm6_picks_rd1_6.csv, computes empirical standard
deviation of pick residuals across 12-pick ADP bands, fits linear and log-linear
functional forms, and writes the better fit to simulation/calibration.json.

Usage (from repo root):
    python simulation/fit_sigma.py
"""

import json
import numpy as np
import pandas as pd

INPUT_PATH = "simulation/Historical_Data/bbm6_picks_rd1_6.csv"
OUTPUT_PATH = "simulation/calibration.json"

MIN_BAND_OBS = 500   # merge bands below this threshold into the adjacent band
BAND_WIDTH = 12      # 12-pick bands align with snake draft rounds


def merge_thin_bands(band_stats: pd.DataFrame, min_obs: int) -> pd.DataFrame:
    """Merge bands with fewer than min_obs into their neighbour with more observations."""
    rows = band_stats.reset_index(drop=True).to_dict("records")
    merged = True
    while merged:
        merged = False
        i = 0
        while i < len(rows):
            if rows[i]["n_obs"] < min_obs:
                if len(rows) == 1:
                    break  # only one band left — can't merge
                # pick the neighbour with more observations
                if i == 0:
                    partner = 1
                elif i == len(rows) - 1:
                    partner = len(rows) - 2
                else:
                    partner = i - 1 if rows[i - 1]["n_obs"] >= rows[i + 1]["n_obs"] else i + 1
                # merge into partner (weighted midpoint, combined obs, pooled residuals)
                # We only have summary stats, so re-weight by n_obs
                n_a, n_b = rows[i]["n_obs"], rows[partner]["n_obs"]
                n_total = n_a + n_b
                new_mid = (rows[i]["adp_midpoint"] * n_a + rows[partner]["adp_midpoint"] * n_b) / n_total
                # Combined std via pooled variance (unbiased approx)
                var_a = rows[i]["empirical_sigma"] ** 2
                var_b = rows[partner]["empirical_sigma"] ** 2
                pooled_var = ((n_a - 1) * var_a + (n_b - 1) * var_b) / (n_total - 1)
                mean_a, mean_b = rows[i]["mean_residual"], rows[partner]["mean_residual"]
                new_mean = (mean_a * n_a + mean_b * n_b) / n_total
                merged_row = {
                    "adp_midpoint": new_mid,
                    "empirical_sigma": float(np.sqrt(pooled_var)),
                    "mean_residual": new_mean,
                    "n_obs": n_total,
                }
                keep = min(i, partner)
                rows[keep] = merged_row
                del rows[max(i, partner)]
                merged = True
                break
            i += 1
    return pd.DataFrame(rows)


def r_squared(y_true: np.ndarray, y_pred: np.ndarray) -> float:
    ss_res = np.sum((y_true - y_pred) ** 2)
    ss_tot = np.sum((y_true - y_true.mean()) ** 2)
    if ss_tot == 0:
        return 0.0
    return float(1.0 - ss_res / ss_tot)


def main():
    print(f"Loading {INPUT_PATH} ...")
    df = pd.read_csv(INPUT_PATH)
    print(f"  Loaded {len(df):,} rows.")

    # Filter to rounds 1-4 only — combo key scope; round 5-6 behavior is irrelevant noise
    df = df[df["team_pick_number"] <= 4].copy()
    print(f"  Filtered to rounds 1-4: {len(df):,} rows remaining.")

    # Drop rows with invalid ADP (DEF/K sometimes have ADP=0 or very small)
    before = len(df)
    df = df[df["projection_adp"] > 0].copy()
    dropped = before - len(df)
    if dropped:
        print(f"  Dropped {dropped:,} rows with projection_adp <= 0.")

    # Residual: positive = picked later than ADP (fell), negative = picked earlier (reached)
    df["residual"] = df["overall_pick_number"] - df["projection_adp"]

    # Bin by 12-pick ADP bands
    max_adp = int(np.ceil(df["projection_adp"].max()))
    bins = list(range(0, max_adp + BAND_WIDTH, BAND_WIDTH))
    midpoints = [(bins[i] + bins[i + 1]) / 2.0 for i in range(len(bins) - 1)]
    df["adp_band_mid"] = pd.cut(
        df["projection_adp"], bins=bins, labels=midpoints, right=True
    ).astype(float)

    band_stats = (
        df.groupby("adp_band_mid")["residual"]
        .agg(empirical_sigma="std", mean_residual="mean", n_obs="count")
        .reset_index()
        .rename(columns={"adp_band_mid": "adp_midpoint"})
    )

    print(f"  {len(band_stats)} ADP bands before thin-band merging.")
    band_stats = merge_thin_bands(band_stats, MIN_BAND_OBS)
    band_stats = band_stats.sort_values("adp_midpoint").reset_index(drop=True)
    print(f"  {len(band_stats)} ADP bands after merging bands with < {MIN_BAND_OBS} obs.")

    x = band_stats["adp_midpoint"].values
    y = band_stats["empirical_sigma"].values

    # --- Fit 1: linear  σ = a·ADP + b ---
    coeffs_lin = np.polyfit(x, y, deg=1)
    y_hat_lin = np.polyval(coeffs_lin, x)
    r2_lin = r_squared(y, y_hat_lin)
    sigma_slope_lin = float(coeffs_lin[0])
    sigma_intercept_lin = float(coeffs_lin[1])

    # --- Fit 2: log-linear  ln(σ) = a·ln(ADP) + b ---
    # Guard against non-positive empirical sigmas
    valid_log = (x > 0) & (y > 0)
    if valid_log.sum() >= 3:
        log_x = np.log(x[valid_log])
        log_y = np.log(y[valid_log])
        coeffs_log = np.polyfit(log_x, log_y, deg=1)
        y_hat_log = np.exp(np.polyval(coeffs_log, np.log(x)))
        r2_log = r_squared(y, y_hat_log)
    else:
        coeffs_log = [0.0, 0.0]
        y_hat_log = y_hat_lin.copy()
        r2_log = -1.0
        print("  Warning: not enough valid log-domain points — log-linear fit skipped.")

    print(f"\n  Linear fit:      s = {sigma_slope_lin:.5f}*ADP + {sigma_intercept_lin:.5f}  (R2 = {r2_lin:.4f})")
    print(f"  Log-linear fit:  ln(s) = {coeffs_log[0]:.5f}*ln(ADP) + {coeffs_log[1]:.5f}  (R2 = {r2_log:.4f})")

    # --- Select winner ---
    if r2_lin >= r2_log:
        functional_form = "linear"
        sigma_slope = sigma_slope_lin
        sigma_intercept = sigma_intercept_lin
        r2_winner = r2_lin
        y_hat_winner = y_hat_lin
    else:
        functional_form = "log-linear"
        # Express best-linear-approximation for the engine's current interface
        # (TASK-122 will adapt the engine to use the log-linear form)
        sigma_slope = sigma_slope_lin
        sigma_intercept = sigma_intercept_lin
        r2_winner = r2_log
        y_hat_winner = y_hat_log
        print("  Note: log-linear wins — sigma_slope/intercept are the linear approximation.")
        print("        TASK-122 must update the engine to use exp(a·ln(ADP)+b) directly.")

    print(f"\n  Winner: {functional_form}  s_slope={sigma_slope:.5f}  s_intercept={sigma_intercept:.5f}  R2={r2_winner:.4f}")

    # --- Per-band table ---
    print(f"\n{'ADP Band':>10}  {'N obs':>8}  {'Emp s':>8}  {'Fit s':>8}  {'Residual':>9}")
    print("-" * 52)
    for _, row in band_stats.iterrows():
        idx = band_stats.index.get_loc(_)
        fitted = float(y_hat_winner[idx])
        resid = float(row["empirical_sigma"]) - fitted
        print(
            f"{row['adp_midpoint']:>10.1f}  {int(row['n_obs']):>8,}  "
            f"{row['empirical_sigma']:>8.4f}  {fitted:>8.4f}  {resid:>+9.4f}"
        )

    if r2_winner < 0.7:
        print(f"\n  WARNING: R2 = {r2_winner:.4f} is below the 0.7 threshold -- inspect band table above.")

    # --- Write calibration.json ---
    diagnostics_bands = []
    for i, row in band_stats.iterrows():
        diagnostics_bands.append({
            "adp_midpoint": float(row["adp_midpoint"]),
            "n_obs": int(row["n_obs"]),
            "empirical_sigma": float(row["empirical_sigma"]),
            "fitted_sigma": float(y_hat_winner[i]),
            "mean_residual": float(row["mean_residual"]),
        })

    # Sigma floor: the fitted linear form can go negative for very low ADP values.
    # Compute the minimum empirical sigma observed across all bands so TASK-122 can
    # apply: sigma = max(sigma_min, sigma_slope * ADP + sigma_intercept).
    sigma_min = float(band_stats["empirical_sigma"].min())

    # --- Refinement 1: Global sigma_max (plateau cap) ---
    # Find the ADP crossover where the linear fit first overshoots empirical sigma.
    # Use the median of empirical sigmas in that overshoot region as the ceiling.
    # Only apply the cap up to sigma_max_adp_limit (last band where linear overshoots);
    # beyond that ADP the linear fit undershoots and should run uncapped.
    base_sigma = lambda adp: max(sigma_min, sigma_slope * adp + sigma_intercept)
    band_stats["base_fitted"] = band_stats["adp_midpoint"].apply(base_sigma)
    crossover = band_stats[band_stats["base_fitted"] > band_stats["empirical_sigma"]]
    if len(crossover) >= 2:
        sigma_max = float(crossover["empirical_sigma"].median())
        sigma_max_adp_limit = float(crossover["adp_midpoint"].max())
    else:
        sigma_max = float(band_stats["empirical_sigma"].max())
        sigma_max_adp_limit = float(band_stats["adp_midpoint"].max())
    print(f"\nRefinement 1 -- Global sigma_max (plateau cap): {sigma_max:.4f}  (applied for ADP <= {sigma_max_adp_limit:.1f})")

    # --- Refinement 2: Per-round sigma_max ---
    print("\nRefinement 2 -- Per-round sigma_max:")
    print(f"  {'Round':>6}  {'Bands':>6}  {'sigma_max':>10}")
    print("  " + "-" * 28)
    round_sigma_max = {}
    for rnd in range(1, 5):
        rnd_df = df[df["team_pick_number"] == rnd].copy()
        rnd_df["adp_band_mid"] = pd.cut(
            rnd_df["projection_adp"], bins=bins, labels=midpoints, right=True
        ).astype(float)
        rnd_stats = (
            rnd_df.groupby("adp_band_mid")["residual"]
            .agg(empirical_sigma="std", n_obs="count")
            .reset_index()
            .rename(columns={"adp_band_mid": "adp_midpoint"})
        )
        rnd_stats = rnd_stats[rnd_stats["n_obs"] >= 200].reset_index(drop=True)
        if len(rnd_stats) < 2:
            round_sigma_max[str(rnd)] = sigma_max
            print(f"  {rnd:>6}  {'<2':>6}  {sigma_max:>10.4f}  (fallback to global)")
            continue
        rnd_stats["base_fitted"] = rnd_stats["adp_midpoint"].apply(base_sigma)
        rnd_crossover = rnd_stats[rnd_stats["base_fitted"] > rnd_stats["empirical_sigma"]]
        if len(rnd_crossover) >= 2:
            rnd_cap = float(rnd_crossover["empirical_sigma"].median())
        else:
            rnd_cap = sigma_max
        round_sigma_max[str(rnd)] = rnd_cap
        print(f"  {rnd:>6}  {len(rnd_stats):>6}  {rnd_cap:>10.4f}")

    # --- Refinement 3: Mean-shift mu(ADP) ---
    from scipy import stats as scipy_stats
    bias_bands = band_stats[band_stats["mean_residual"].abs() > 1.0]
    if len(bias_bands) >= 2:
        mu_slope, mu_intercept, _, _, _ = scipy_stats.linregress(
            bias_bands["adp_midpoint"].values, bias_bands["mean_residual"].values
        )
        mu_adp_threshold = float(bias_bands["adp_midpoint"].min())
    else:
        mu_slope, mu_intercept, mu_adp_threshold = 0.0, 0.0, 9999.0
        print("\nRefinement 3 -- Mean shift: insufficient bias bands (<2), no correction applied.")
    print(
        f"\nRefinement 3 -- Mean shift mu(ADP):"
        f"  mu_slope={float(mu_slope):.5f}  mu_intercept={float(mu_intercept):.5f}"
        f"  threshold_ADP={mu_adp_threshold:.1f}  (n bias bands={len(bias_bands)})"
    )

    # --- Refinement 4: Position-specific sigma_max ---
    print("\nRefinement 4 -- Per-position sigma_max:")
    print(f"  {'Pos':>4}  {'Bands':>6}  {'sigma_max':>10}")
    print("  " + "-" * 26)
    position_sigma_max = {}
    for pos in ["QB", "RB", "WR", "TE"]:
        pos_df = df[df["position_name"] == pos].copy()
        if len(pos_df) < 1000:
            position_sigma_max[pos] = sigma_max
            print(f"  {pos:>4}  {'<1K':>6}  {sigma_max:>10.4f}  (fallback, insufficient data)")
            continue
        pos_df["adp_band_mid"] = pd.cut(
            pos_df["projection_adp"], bins=bins, labels=midpoints, right=True
        ).astype(float)
        pos_stats = (
            pos_df.groupby("adp_band_mid")["residual"]
            .agg(empirical_sigma="std", n_obs="count")
            .reset_index()
            .rename(columns={"adp_band_mid": "adp_midpoint"})
        )
        pos_stats = pos_stats[pos_stats["n_obs"] >= 500].reset_index(drop=True)
        if len(pos_stats) < 2:
            position_sigma_max[pos] = sigma_max
            print(f"  {pos:>4}  {'<2':>6}  {sigma_max:>10.4f}  (fallback, <2 bands)")
            continue
        pos_stats["base_fitted"] = pos_stats["adp_midpoint"].apply(base_sigma)
        pos_crossover = pos_stats[pos_stats["base_fitted"] > pos_stats["empirical_sigma"]]
        if len(pos_crossover) >= 2:
            pos_cap = float(pos_crossover["empirical_sigma"].median())
        else:
            pos_cap = sigma_max
        position_sigma_max[pos] = pos_cap
        print(f"  {pos:>4}  {len(pos_stats):>6}  {pos_cap:>10.4f}")

    # --- Merge all params into existing calibration.json (preserve other keys) ---
    import os
    if os.path.exists(OUTPUT_PATH):
        with open(OUTPUT_PATH) as f:
            existing = json.load(f)
    else:
        existing = {}

    existing.update({
        "training_rounds": 4,
        "sigma_slope": sigma_slope,
        "sigma_intercept": sigma_intercept,
        "sigma_min": sigma_min,
        "sigma_max": sigma_max,
        "sigma_max_adp_limit": sigma_max_adp_limit,
        "round_sigma_max": round_sigma_max,
        "mu_slope": float(mu_slope),
        "mu_intercept": float(mu_intercept),
        "mu_adp_threshold": float(mu_adp_threshold),
        "position_sigma_max": position_sigma_max,
        "functional_form": functional_form,
        "r_squared": r2_winner,
        "n_bands": int(len(band_stats)),
        "note": (
            "sigma_intercept may be negative for a linear fit. "
            "Apply: sigma = max(sigma_min, min(sigma_max, sigma_slope * ADP + sigma_intercept))."
        ),
        "diagnostics": {
            "linear_r2": r2_lin,
            "log_linear_r2": r2_log,
            "log_linear_coeffs": {"a": float(coeffs_log[0]), "b": float(coeffs_log[1])},
            "bands": diagnostics_bands,
        },
    })

    with open(OUTPUT_PATH, "w") as f:
        json.dump(existing, f, indent=2)

    print(f"\nWrote {OUTPUT_PATH}")
    print(
        f"Done. sigma_slope={sigma_slope:.5f}, sigma_intercept={sigma_intercept:.5f}, "
        f"sigma_min={sigma_min:.5f}, sigma_max={sigma_max:.5f}, R2={r2_winner:.4f}"
    )


if __name__ == "__main__":
    main()
