"""Validate fitted sigma(ADP) parameters against held-out BBM6 draft data.

Holds out 10% of draft_ids (seed=42), computes empirical sigma per ADP band
on the test set, and compares against calibration.json predictions.

Applies all calibration refinements from TASK-123:
  - sigma_max plateau cap
  - per-round sigma_max
  - mean-shift correction mu(ADP)
  - position-specific sigma_max

Run from repo root:
    python simulation/validate_model.py
"""

import json
import math

import numpy as np
import pandas as pd
from scipy.stats import norm

BASELINE = {"mae": 1.5196, "rmse": 1.9011, "weighted_mae": 1.0293, "mean_kl_div": 0.9154}

# ---------------------------------------------------------------------------
# Step 1 — Load data and calibration
# ---------------------------------------------------------------------------

df = pd.read_csv("simulation/Historical_Data/bbm6_picks_rd1_6.csv")
df = df[df["projection_adp"] > 0].copy()

cal = json.load(open("simulation/calibration.json"))
sigma_slope      = cal["sigma_slope"]
sigma_intercept  = cal["sigma_intercept"]
sigma_min        = cal.get("sigma_min", 0.0)
sigma_max           = cal.get("sigma_max", float("inf"))
sigma_max_adp_limit = cal.get("sigma_max_adp_limit", float("inf"))
round_sigma_max     = cal.get("round_sigma_max", {})
mu_slope            = cal.get("mu_slope", 0.0)
mu_intercept        = cal.get("mu_intercept", 0.0)
mu_adp_threshold    = cal.get("mu_adp_threshold", 9999.0)
position_sigma_max  = cal.get("position_sigma_max", {})


def fitted_sigma(adp: float, rnd: int = None, position: str = None) -> float:
    """Compute fitted sigma with all refinement caps applied.

    Caps only apply within the normal draft range (adp <= sigma_max_adp_limit).
    Beyond that, the linear fit runs uncapped — empirical sigma rises again there
    due to high-ADP players being reached for or going undrafted.
    """
    base = max(sigma_min, sigma_slope * adp + sigma_intercept)
    if adp > sigma_max_adp_limit:
        return base  # uncapped beyond the plateau region
    pos_cap = position_sigma_max.get(position, sigma_max) if position else sigma_max
    rnd_cap = float(round_sigma_max.get(str(rnd), sigma_max)) if rnd else sigma_max
    return min(base, sigma_max, pos_cap, rnd_cap)


def fitted_mu(adp: float) -> float:
    """Mean-shift correction for high-ADP systematic bias."""
    if adp >= mu_adp_threshold:
        return mu_slope * adp + mu_intercept
    return 0.0


# ---------------------------------------------------------------------------
# Step 2 — Train/test split
# ---------------------------------------------------------------------------

draft_ids = sorted(df["draft_id"].unique())
rng = np.random.default_rng(42)
shuffled = draft_ids.copy()
rng.shuffle(shuffled)

n_test  = max(1, int(len(shuffled) * 0.10))
test_ids = set(shuffled[-n_test:])

test_df  = df[df["draft_id"].isin(test_ids)].copy()
n_train  = len(draft_ids) - n_test

print(
    f"Total drafts : {len(draft_ids):>8,}\n"
    f"Train drafts : {n_train:>8,}\n"
    f"Test  drafts : {n_test:>8,}\n"
    f"Test  picks  : {len(test_df):>8,}\n"
)

# ---------------------------------------------------------------------------
# Step 3 — Empirical sigma per ADP band on test set
# ---------------------------------------------------------------------------

test_df["residual"] = test_df["overall_pick_number"] - test_df["projection_adp"]

max_adp = int(np.ceil(test_df["projection_adp"].max()))
bins = list(range(0, max_adp + 12, 12))
mids = [(bins[i] + bins[i + 1]) / 2 for i in range(len(bins) - 1)]

test_df["band_mid"] = pd.cut(
    test_df["projection_adp"], bins=bins, labels=mids
).astype(float)

band_stats = (
    test_df.groupby("band_mid")["residual"]
    .agg(["std", "mean", "count"])
    .reset_index()
)
band_stats.columns = ["adp_midpoint", "empirical_sigma", "mean_residual", "n_obs"]
band_stats = band_stats[band_stats["n_obs"] >= 200].reset_index(drop=True)

# Dominant position per band (for position_sigma_max lookup)
pos_by_band = (
    test_df.groupby(["band_mid", "position_name"])
    .size()
    .reset_index(name="cnt")
)
pos_by_band = pos_by_band.sort_values("cnt", ascending=False).drop_duplicates("band_mid")
pos_by_band = pos_by_band.rename(columns={"band_mid": "adp_midpoint", "position_name": "dominant_pos"})
band_stats = band_stats.merge(pos_by_band[["adp_midpoint", "dominant_pos"]], on="adp_midpoint", how="left")

# ---------------------------------------------------------------------------
# Step 4 — Fitted sigma and error metrics (refined model)
# ---------------------------------------------------------------------------

band_stats["fitted_sigma"] = band_stats.apply(
    lambda r: fitted_sigma(r["adp_midpoint"], position=r["dominant_pos"]), axis=1
)
band_stats["fitted_mu"]   = band_stats["adp_midpoint"].apply(fitted_mu)
band_stats["signed_error"] = band_stats["empirical_sigma"] - band_stats["fitted_sigma"]
band_stats["abs_error"]    = band_stats["signed_error"].abs()
band_stats["rel_error_pct"] = (band_stats["signed_error"] / band_stats["empirical_sigma"]) * 100

mae          = float(band_stats["abs_error"].mean())
rmse         = float(math.sqrt((band_stats["abs_error"] ** 2).mean()))
weighted_mae = float(np.average(band_stats["abs_error"], weights=band_stats["n_obs"]))

# ---------------------------------------------------------------------------
# Step 5 — KL divergence per ADP band (with mean-shift correction)
# ---------------------------------------------------------------------------

BIN_EDGES = list(range(-30, 32))


def kl_divergence(f_sigma: float, f_mu: float, residuals: np.ndarray) -> float:
    """KL divergence of actual residuals vs N(f_mu, f_sigma)."""
    counts, _ = np.histogram(residuals, bins=BIN_EDGES)
    total = counts.sum()
    if total == 0:
        return float("nan")
    actual = counts / total
    bin_centers = [(-30 + i + 0.5) for i in range(len(BIN_EDGES) - 1)]
    predicted = np.array([norm.pdf(c, f_mu, f_sigma) for c in bin_centers])
    predicted_sum = predicted.sum()
    if predicted_sum == 0:
        return float("nan")
    predicted /= predicted_sum
    kl = 0.0
    for a, p in zip(actual, predicted):
        if a > 0 and p > 0:
            kl += a * math.log(a / p)
    return kl


kl_values = []
for row in band_stats.itertuples():
    band_residuals = test_df[test_df["band_mid"] == row.adp_midpoint]["residual"].values
    kl = kl_divergence(row.fitted_sigma, row.fitted_mu, band_residuals)
    kl_values.append(kl)

band_stats["kl_div"] = kl_values
mean_kl = float(np.nanmean(kl_values))

# ---------------------------------------------------------------------------
# Step 6 — Per-round breakdown (using round-specific sigma_max)
# ---------------------------------------------------------------------------

per_round = {}
for rnd in range(1, 7):
    rnd_df = test_df[test_df["team_pick_number"] == rnd].copy()
    rnd_df["band_mid"] = pd.cut(
        rnd_df["projection_adp"], bins=bins, labels=mids
    ).astype(float)
    rnd_stats = (
        rnd_df.groupby("band_mid")["residual"]
        .agg(["std", "count"])
        .reset_index()
    )
    rnd_stats.columns = ["adp_midpoint", "empirical_sigma", "n_obs"]
    rnd_stats = rnd_stats[rnd_stats["n_obs"] >= 50].reset_index(drop=True)
    rnd_stats["fitted_sigma"] = rnd_stats["adp_midpoint"].apply(
        lambda adp: fitted_sigma(adp, rnd=rnd)
    )
    rnd_stats["abs_error"] = (
        rnd_stats["empirical_sigma"] - rnd_stats["fitted_sigma"]
    ).abs()
    per_round[str(rnd)] = rnd_stats.to_dict(orient="records")

# ---------------------------------------------------------------------------
# Step 7 — Print report
# ---------------------------------------------------------------------------

header = (
    f"{'ADP Band':>9} | {'N obs':>7} | {'Emp Sig':>7} | {'Fit Sig':>7} | "
    f"{'Abs Err':>7} | {'Rel Err':>8} | {'KL Div':>7} | {'Dom Pos':>7}"
)
sep = "-" * len(header)

print(header)
print(sep)
for row in band_stats.itertuples():
    kl_str  = f"{row.kl_div:7.4f}" if not math.isnan(row.kl_div) else "    nan"
    pos_str = str(row.dominant_pos) if pd.notna(row.dominant_pos) else "   n/a"
    print(
        f"{row.adp_midpoint:>9.1f} | {int(row.n_obs):>7,} | {row.empirical_sigma:>7.3f} | "
        f"{row.fitted_sigma:>7.3f} | {row.abs_error:>7.3f} | {row.rel_error_pct:>7.1f}% | "
        f"{kl_str} | {pos_str:>7}"
    )
print(sep)

print(f"\nRefined   -- MAE: {mae:.4f}  RMSE: {rmse:.4f}  Weighted MAE: {weighted_mae:.4f}  Mean KL: {mean_kl:.4f}")
print(f"Baseline  -- MAE: {BASELINE['mae']:.4f}  RMSE: {BASELINE['rmse']:.4f}  Weighted MAE: {BASELINE['weighted_mae']:.4f}  Mean KL: {BASELINE['mean_kl_div']:.4f}")
mae_delta = mae - BASELINE["mae"]
mae_pct   = mae_delta / BASELINE["mae"] * 100
print(f"Delta MAE : {mae_delta:+.4f} ({mae_pct:+.1f}%)")

print(f"\nBands in report: {len(band_stats)}")

# Per-round summary
print("\nPer-round MAE (refined):")
for rnd_str, rows in per_round.items():
    if rows:
        rnd_mae = float(np.mean([r["abs_error"] for r in rows]))
        print(f"  Round {rnd_str}: MAE={rnd_mae:.4f}  ({len(rows)} bands)")
    else:
        print(f"  Round {rnd_str}: no bands with >=50 obs")

# ---------------------------------------------------------------------------
# Step 8 — Write validation_report.json
# ---------------------------------------------------------------------------

report = {
    "split": {
        "train_drafts": n_train,
        "test_drafts":  n_test,
        "test_picks":   len(test_df),
        "seed":         42,
    },
    "overall": {
        "mae":          mae,
        "rmse":         rmse,
        "weighted_mae": weighted_mae,
        "mean_kl_div":  mean_kl,
    },
    "baseline": BASELINE,
    "improvement": {
        "mae_delta":        mae_delta,
        "mae_pct_change":   mae_pct,
    },
    "per_band":  band_stats.to_dict(orient="records"),
    "per_round": per_round,
}

output_path = "simulation/validation_report.json"
with open(output_path, "w") as f:
    json.dump(report, f, indent=2)

print(f"\nReport written to {output_path}")
