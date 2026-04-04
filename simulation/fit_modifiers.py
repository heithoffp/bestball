"""Fit roster-state position modifiers and team stacking multipliers from BBM6 picks.

Reads simulation/Historical_Data/bbm6_picks_rd1_6.csv (must have player_team column
from etl_add_team.py), reconstructs roster state at each pick, computes:

  1. Position modifiers: P(position | roster_state) / P(position)
     Encoded as a dict keyed by "QB{n}RB{n}WR{n}TE{n}" strings.

  2. Team stacking multipliers: stacking_lift[k] for k = 0, 1, 2+
     How much more likely a drafter is to pick a player from a team already
     represented k times on their roster, relative to a null baseline.

Outputs are merged into simulation/calibration.json.

Usage (from repo root):
    python simulation/fit_modifiers.py
"""

import csv
import json
import os
from collections import defaultdict

PICKS_PATH = os.path.join(os.path.dirname(__file__), "Historical_Data", "bbm6_picks_rd1_6.csv")
ADP_PATH = os.path.join(
    os.path.dirname(__file__), "..", "best-ball-manager", "src", "assets", "adp",
    "underdog_adp_2026-02-04.csv"
)
CALIBRATION_PATH = os.path.join(os.path.dirname(__file__), "calibration.json")

MIN_STATE_OBS = 500
MODELED_POSITIONS = {"QB", "RB", "WR", "TE"}

# Caps for roster state encoding
QB_CAP = 2
RB_CAP = 3
WR_CAP = 3
TE_CAP = 2


def state_key(qb: int, rb: int, wr: int, te: int) -> str:
    return f"QB{min(qb, QB_CAP)}RB{min(rb, RB_CAP)}WR{min(wr, WR_CAP)}TE{min(te, TE_CAP)}"


def load_picks(path: str) -> list[dict]:
    print(f"Loading picks from {path} ...")
    rows = []
    with open(path, newline="", encoding="utf-8") as f:
        reader = csv.DictReader(f)
        for row in reader:
            rows.append(row)
    print(f"  Loaded {len(rows):,} rows.")
    return rows


def reconstruct_roster_states(rows: list[dict]):
    """For each pick row, compute the roster state of that team just before the pick.

    Returns a list of dicts augmenting each row with:
      - roster_qb, roster_rb, roster_wr, roster_te: counts before this pick
      - n_same_team: how many roster players share the same player_team as this pick
    """
    # Group by draft_id, then sort by overall_pick_number within each draft
    drafts = defaultdict(list)
    for row in rows:
        drafts[row["draft_id"]].append(row)

    augmented = []
    total_drafts = len(drafts)
    print(f"  Reconstructing roster states across {total_drafts:,} drafts...")

    for draft_idx, (draft_id, picks) in enumerate(drafts.items()):
        if draft_idx % 100_000 == 0 and draft_idx > 0:
            print(f"    draft {draft_idx:,} / {total_drafts:,} ...")

        # Sort all picks in this draft by overall pick number
        picks_sorted = sorted(picks, key=lambda r: int(r["overall_pick_number"]))

        # Track per-team (pick_order slot) roster state
        # pick_order is the team's draft slot (1-12)
        team_pos_counts = defaultdict(lambda: {"QB": 0, "RB": 0, "WR": 0, "TE": 0})
        team_team_counts = defaultdict(lambda: defaultdict(int))  # slot -> nfl_team -> count

        for pick in picks_sorted:
            slot = pick["pick_order"]
            pos = pick["position_name"]
            nfl_team = pick.get("player_team", "")

            # Capture state BEFORE this pick
            pc = team_pos_counts[slot]
            n_same_team = team_team_counts[slot].get(nfl_team, 0) if nfl_team else -1

            augmented.append({
                **pick,
                "roster_qb": pc["QB"],
                "roster_rb": pc["RB"],
                "roster_wr": pc["WR"],
                "roster_te": pc["TE"],
                "n_same_team": n_same_team,
            })

            # Update state AFTER this pick
            if pos in MODELED_POSITIONS:
                team_pos_counts[slot][pos] += 1
            if nfl_team:
                team_team_counts[slot][nfl_team] += 1

    print(f"  Done. {len(augmented):,} picks augmented.")
    return augmented


def fit_position_modifiers(augmented: list[dict]) -> dict:
    """Compute position multipliers conditioned on roster state."""
    print("\nFitting position modifiers...")

    # Count (state_key, position) pairs — only model QB/RB/WR/TE picks
    state_pos_counts = defaultdict(lambda: defaultdict(int))
    marginal_pos_counts = defaultdict(int)
    total_modeled = 0

    for row in augmented:
        pos = row["position_name"]
        if pos not in MODELED_POSITIONS:
            continue
        sk = state_key(row["roster_qb"], row["roster_rb"], row["roster_wr"], row["roster_te"])
        state_pos_counts[sk][pos] += 1
        marginal_pos_counts[pos] += 1
        total_modeled += 1

    # Marginal probabilities
    marginal_prob = {p: marginal_pos_counts[p] / total_modeled for p in MODELED_POSITIONS}
    print(f"  Marginal position probs: {', '.join(f'{p}={marginal_prob[p]:.3f}' for p in sorted(MODELED_POSITIONS))}")

    # Compute multipliers for states with enough observations
    position_modifiers = {}
    skipped_thin = 0

    for sk, pos_counts in state_pos_counts.items():
        total_in_state = sum(pos_counts.values())
        if total_in_state < MIN_STATE_OBS:
            skipped_thin += 1
            continue
        modifiers = {}
        for pos in MODELED_POSITIONS:
            cond_prob = pos_counts.get(pos, 0) / total_in_state
            mult = cond_prob / marginal_prob[pos] if marginal_prob[pos] > 0 else 1.0
            modifiers[pos] = round(mult, 4)
        position_modifiers[sk] = modifiers

    print(f"  States with >= {MIN_STATE_OBS} obs: {len(position_modifiers)} (dropped {skipped_thin} thin states)")

    # Print a sample of the most common states
    top_states = sorted(
        position_modifiers.items(),
        key=lambda kv: sum(state_pos_counts[kv[0]].values()),
        reverse=True
    )[:8]
    print(f"\n  Top states by observation count:")
    print(f"  {'State':<20} {'N obs':>8}  {'QB':>6}  {'RB':>6}  {'WR':>6}  {'TE':>6}")
    print("  " + "-" * 58)
    for sk, mods in top_states:
        n = sum(state_pos_counts[sk].values())
        print(f"  {sk:<20} {n:>8,}  {mods.get('QB',0):>6.3f}  {mods.get('RB',0):>6.3f}  {mods.get('WR',0):>6.3f}  {mods.get('TE',0):>6.3f}")

    return position_modifiers


def load_adp_team_density(adp_path: str, adp_cutoff: float = 120.0) -> dict[str, int]:
    """Count players per NFL team in the earliest ADP snapshot up to adp_cutoff."""
    team_counts = defaultdict(int)
    with open(adp_path, newline="", encoding="utf-8") as f:
        reader = csv.DictReader(f)
        for row in reader:
            try:
                adp = float(row.get("adp", 0) or 0)
            except ValueError:
                continue
            if adp <= 0 or adp > adp_cutoff:
                continue
            team = (row.get("teamName") or "").strip()
            if team:
                team_counts[team] += 1
    return dict(team_counts)


def fit_stacking_multipliers(augmented: list[dict], adp_path: str) -> dict:
    """Compute team stacking multipliers relative to null baseline."""
    print("\nFitting team stacking multipliers...")

    team_density = load_adp_team_density(adp_path)
    total_draftable = sum(team_density.values())
    n_teams = len(team_density)
    avg_team_size = total_draftable / n_teams if n_teams else 4.0
    print(f"  ADP snapshot: {n_teams} teams, {total_draftable} players, avg team size = {avg_team_size:.2f}")

    # Buckets: n_same_team = 0, 1, 2+
    observed_counts = defaultdict(int)  # k -> count of picks with n_same_team = k
    total_with_team = 0

    for row in augmented:
        n = row["n_same_team"]
        if n < 0:  # no team data
            continue
        k = min(n, 2)
        observed_counts[k] += 1
        total_with_team += 1

    if total_with_team == 0:
        print("  WARNING: no picks with team data — stacking multipliers cannot be computed.")
        return {"0": 1.0, "1": 1.0, "2": 1.0}

    print(f"  Picks with team data: {total_with_team:,}")
    for k in range(3):
        pct = 100.0 * observed_counts[k] / total_with_team
        print(f"    n_same_team={k}: {observed_counts[k]:,} ({pct:.2f}%)")

    # Null rate computation:
    # At pick t (0-indexed within a 6-pick roster), the roster has t players already.
    # Expected fraction of available players sharing team with a slot that has k members:
    #   null_rate(k) = k * (avg_team_size - k) / (total_draftable - t)
    # We need to weight this over all picks that had n_same_team = k.
    # Simpler: use overall mean roster size weighted by the picks in each bucket.

    # Compute mean team_pick_number for each k bucket (proxy for roster size at time of pick)
    mean_tpn = defaultdict(float)
    for row in augmented:
        n = row["n_same_team"]
        if n < 0:
            continue
        k = min(n, 2)
        mean_tpn[k] += int(row["team_pick_number"])

    for k in range(3):
        if observed_counts[k] > 0:
            mean_tpn[k] /= observed_counts[k]

    # Null rate for k=0: fraction of available pool NOT from any team already on roster
    # null_rate(k) = k * max(avg_team_size - k, 1) / (total_draftable - mean_roster_size)
    # For k=0: the fraction of available players whose team has 0 members on roster.
    # This is most of the pool, so null_rate(0) ≈ 1 - null_rate(1+).
    # We compute null_rate for k=1 and k=2 relative to k=0 to get the lift.

    def null_rate(k: int, mean_roster_size: float) -> float:
        """Expected fraction of picks with n_same_team = k under random-from-pool."""
        pool_size = max(total_draftable - mean_roster_size, 1.0)
        # Number of teams with exactly k players on a mean-sized roster:
        # roster of size r across n_teams: expected teams with k players ~ n_teams * C(avg_team_size, k) * (r/total)^k * ((1-r/total)^(avg_team_size-k))
        # Simplified: teams_with_k ≈ r/avg_team_size  (for k=1: each person on roster represents one team with 1)
        # More directly: expected picks from teams with k roster members:
        #   n_teams_with_k = mean_roster_size / avg_team_size * (correction by binomial)
        # Use direct estimate: each unique team already on roster has avg_team_size players in pool.
        # Picks with n_same_team=0: from teams with 0 on roster
        # Picks with n_same_team=1: from teams with exactly 1 on roster
        if k == 0:
            teams_with_k = n_teams - (mean_roster_size / avg_team_size)
        else:
            # Expected teams with exactly k members on roster (Poisson approx)
            import math
            lam = mean_roster_size / n_teams  # avg players per team on roster
            # P(exactly k) ~ Poisson(lam, k) * n_teams
            poisson_k = (lam ** k) * math.exp(-lam) / math.factorial(k)
            teams_with_k = n_teams * poisson_k
        pool_from_k_teams = teams_with_k * max(avg_team_size - k, 1.0)
        return pool_from_k_teams / pool_size

    observed_rate = {k: observed_counts[k] / total_with_team for k in range(3)}
    null_rates = {k: null_rate(k, mean_tpn.get(k, 3.0)) for k in range(3)}

    print(f"\n  {'k':>4}  {'Observed rate':>14}  {'Null rate':>10}  {'Lift':>6}")
    print("  " + "-" * 40)
    multipliers = {}
    for k in range(3):
        obs = observed_rate[k]
        null = null_rates[k]
        if k == 0:
            lift = 1.0
        else:
            lift = obs / null if null > 0 else 1.0
        multipliers[str(k)] = round(lift, 4)
        print(f"  {k:>4}  {obs:>14.4f}  {null:>10.4f}  {lift:>6.3f}")

    # Force baseline
    multipliers["0"] = 1.0

    if float(multipliers.get("1", 0)) <= 1.0:
        print("\n  WARNING: stacking multiplier for k=1 is <= 1.0 — review null rate model.")

    return multipliers


def main():
    rows = load_picks(PICKS_PATH)

    # Filter to rounds 1-4 only — combo key scope; round 5-6 behavior is irrelevant noise
    rows = [r for r in rows if int(r["team_pick_number"]) <= 4]
    print(f"  After round filter (<=4): {len(rows):,} rows.")

    augmented = reconstruct_roster_states(rows)

    position_modifiers = fit_position_modifiers(augmented)
    stacking_multipliers = fit_stacking_multipliers(augmented, ADP_PATH)

    print(f"\nStacking multipliers: {stacking_multipliers}")
    print(f"Position modifier states: {len(position_modifiers)}")

    # Read existing calibration.json and merge
    with open(CALIBRATION_PATH, "r") as f:
        calibration = json.load(f)

    calibration["position_modifiers"] = position_modifiers
    calibration["stacking_multipliers"] = stacking_multipliers

    with open(CALIBRATION_PATH, "w") as f:
        json.dump(calibration, f, indent=2)

    print(f"\nWrote updated calibration to {CALIBRATION_PATH}")
    print("Done.")


if __name__ == "__main__":
    main()
