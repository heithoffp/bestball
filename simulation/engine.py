"""Conditional Logit (Plackett-Luce) draft simulation engine."""

import json
import os
import sys

import numpy as np
from collections import defaultdict
from models import Player, DraftState


# ---------------------------------------------------------------------------
# Calibration helpers
# ---------------------------------------------------------------------------

def load_calibration(path=None):
    """Load calibration parameters from JSON file.

    Args:
        path: Path to calibration.json. Defaults to calibration.json next to this file.

    Returns:
        dict of calibration params, or None if file is not found.
    """
    if path is None:
        path = os.path.join(os.path.dirname(os.path.abspath(__file__)), "calibration.json")
    if not os.path.exists(path):
        print(
            f"WARNING: calibration file not found at {path} — using hardcoded defaults",
            file=sys.stderr,
        )
        return None
    with open(path) as f:
        return json.load(f)


def calibrated_sigma(adp, cal, rnd=None, position=None):
    """Compute calibrated sigma(ADP) with all refinement caps applied.

    Replicates fitted_sigma() from validate_model.py:
      base = max(sigma_min, slope * ADP + intercept)
      If ADP > sigma_max_adp_limit: return base (uncapped beyond plateau region)
      Otherwise: apply global, round, and position-specific caps.

    Args:
        adp: Player ADP value.
        cal: Calibration dict from load_calibration().
        rnd: Draft round (1-6), used for per-round sigma cap.
        position: Player position string, used for per-position sigma cap.

    Returns:
        Calibrated sigma value (float > 0).
    """
    base = max(cal["sigma_min"], cal["sigma_slope"] * adp + cal["sigma_intercept"])
    if adp > cal.get("sigma_max_adp_limit", float("inf")):
        return base
    sigma_max = cal.get("sigma_max", float("inf"))
    pos_cap = cal.get("position_sigma_max", {}).get(position, sigma_max) if position else sigma_max
    rnd_cap = float(cal.get("round_sigma_max", {}).get(str(rnd), sigma_max)) if rnd else sigma_max
    return min(base, sigma_max, pos_cap, rnd_cap)


def mu_shift(adp, cal):
    """Mean-shift correction for high-ADP systematic bias.

    Replicates fitted_mu() from validate_model.py.

    Args:
        adp: Player ADP value.
        cal: Calibration dict from load_calibration().

    Returns:
        Mean shift to add to effective ADP (float).
    """
    if adp >= cal.get("mu_adp_threshold", float("inf")):
        return cal.get("mu_slope", 0.0) * adp + cal.get("mu_intercept", 0.0)
    return 0.0


# ---------------------------------------------------------------------------
# Core engine (reference implementation — kept for single-draft use)
# ---------------------------------------------------------------------------

def base_utility(adp: float, pick: int, sigma_slope: float, sigma_intercept: float) -> float:
    """Gaussian base utility for a player at a given pick.

    sigma(ADP) = sigma_slope * ADP + sigma_intercept
    U(ADP, pick) = exp(-0.5 * ((pick - ADP) / sigma(ADP))^2)
    """
    sigma = sigma_slope * adp + sigma_intercept
    z = (pick - adp) / sigma
    return np.exp(-0.5 * z * z)


def compute_utilities(players: list[Player], pick: int,
                      sigma_slope: float, sigma_intercept: float) -> np.ndarray:
    """Vectorized utility computation for all available players at a pick."""
    adps = np.array([p.adp for p in players])
    sigmas = sigma_slope * adps + sigma_intercept
    z = (pick - adps) / sigmas
    return np.exp(-0.5 * z * z)


def simulate_draft(players: list[Player], rng: np.random.Generator,
                   sigma_slope: float = 0.1, sigma_intercept: float = 1.5,
                   num_teams: int = 12, num_rounds: int = 6):
    """Run one simulated snake draft (original implementation, kept for reference).

    Args:
        players: List of draftable players.
        rng: numpy random generator instance.
        sigma_slope: Slope for ADP-dependent sigma.
        sigma_intercept: Intercept for ADP-dependent sigma.
        num_teams: Number of teams in the draft.
        num_rounds: Number of rounds to simulate.

    Returns:
        team_rosters: dict mapping team_index -> list of Player (sorted by player_id)
        pick_events: list of (round_1indexed, position_context_key, player_id) tuples
    """
    state = DraftState(num_teams=num_teams, num_rounds=num_rounds)
    available = list(players)  # copy — we'll remove from this
    available_set = set(range(len(players)))  # track indices for fast removal
    pick_events = []

    for pick_num, team_idx in state.pick_order():
        if not available_set:
            break

        # Build arrays for available players only
        avail_indices = sorted(available_set)
        avail_players = [players[i] for i in avail_indices]

        utilities = compute_utilities(avail_players, pick_num, sigma_slope, sigma_intercept)

        # Utilities are already exp(-0.5 * z²) — normalize directly (NOT softmax)
        total = utilities.sum()
        if total == 0:
            probs = np.ones(len(avail_players)) / len(avail_players)
        else:
            probs = utilities / total

        # Sample one player
        local_idx = rng.choice(len(avail_players), p=probs)
        chosen_player = avail_players[local_idx]
        global_idx = avail_indices[local_idx]

        # Record pick
        state.team_rosters[team_idx].append(chosen_player)
        available_set.remove(global_idx)

        # Record pick event for Tier 2 conditional probabilities
        current_round = (pick_num - 1) // num_teams + 1
        positions_on_team = sorted(p.position for p in state.team_rosters[team_idx][:-1])
        context_key = ",".join(positions_on_team)
        pick_events.append((current_round, context_key, chosen_player.player_id))

    # Sort each team's roster by player_id for deterministic combo keys
    for team_idx in state.team_rosters:
        state.team_rosters[team_idx].sort(key=lambda p: p.player_id)

    return state.team_rosters, pick_events


# ---------------------------------------------------------------------------
# High-performance bulk simulation
# ---------------------------------------------------------------------------

_POSITIONS = ["QB", "RB", "WR", "TE"]
_POS_INT = {"QB": 0, "RB": 1, "WR": 2, "TE": 3}
_QB_CAP, _RB_CAP, _WR_CAP, _TE_CAP = 2, 3, 3, 2


def _precompute_pick_order(num_teams: int, num_rounds: int) -> list[tuple[int, int]]:
    """Pre-compute snake draft pick order as a flat list."""
    order = []
    pick = 1
    for rnd in range(num_rounds):
        teams = range(num_teams) if rnd % 2 == 0 else range(num_teams - 1, -1, -1)
        for team_idx in teams:
            order.append((pick, team_idx))
            pick += 1
    return order


def run_simulation(players: list[Player], num_simulations: int,
                   sigma_slope: float = 0.1, sigma_intercept: float = 1.5,
                   num_teams: int = 12, num_rounds: int = 6,
                   seed: int = 42, progress_interval: int = 10000,
                   calibration: dict = None):
    """Run multiple draft simulations, collecting combo counts and pick events.

    Uses pre-computed utility matrix (as Python lists for zero-overhead access)
    and pure Python inner loop to avoid numpy dispatch overhead on small arrays.

    When calibration is provided, the utility matrix incorporates:
      - Calibrated sigma(ADP) with sigma_min floor, global/round/position caps
      - Mean-shift correction for high-ADP systematic bias
    Position modifiers and team stacking multipliers are applied per-pick at runtime
    since they depend on each team's evolving roster state.

    Args:
        players: List of draftable players.
        num_simulations: Number of drafts to simulate.
        sigma_slope: Slope for ADP-dependent sigma (used only when calibration is None).
        sigma_intercept: Intercept for ADP-dependent sigma (used only when calibration is None).
        num_teams: Number of teams per draft.
        num_rounds: Number of rounds per draft.
        seed: Random seed for reproducibility.
        progress_interval: Print progress every N simulations.
        calibration: Calibration dict from load_calibration(). When provided, replaces
            sigma_slope/sigma_intercept and activates position modifiers and stacking.

    Returns:
        combo_counts: dict mapping combo_key (str) -> count (int)
        combo_players: dict mapping combo_key (str) -> list of player_ids
        all_pick_events: list of (round, context_key, player_id) tuples
    """
    rng = np.random.default_rng(seed)
    n_players = len(players)

    # Pre-compute player data
    player_ids = [p.player_id for p in players]
    positions = [p.position for p in players]

    # Pre-compute pick order
    pick_order = _precompute_pick_order(num_teams, num_rounds)
    n_picks = len(pick_order)

    # Pre-compute round numbers and team indices as flat lists
    pick_rounds = [(pick_num - 1) // num_teams + 1 for pick_num, _ in pick_order]
    pick_teams = [team_idx for _, team_idx in pick_order]

    # -----------------------------------------------------------------
    # Build utility matrix — calibrated or fallback
    # -----------------------------------------------------------------
    adps = np.array([p.adp for p in players])

    if calibration is not None:
        cal = calibration
        # Mean-shift: per-player effective ADP adjustment for high-ADP systematic bias
        eff_adps = adps + np.array([mu_shift(float(a), cal) for a in adps.tolist()])
        # Calibrated sigma per (pick, player) — round and position known ahead of time
        sigma_matrix = np.empty((n_picks, n_players))
        for pick_idx in range(n_picks):
            rnd = pick_rounds[pick_idx]
            for j, p in enumerate(players):
                sigma_matrix[pick_idx, j] = calibrated_sigma(p.adp, cal, rnd=rnd, position=p.position)
    else:
        eff_adps = adps
        sigmas_arr = sigma_slope * adps + sigma_intercept
        sigma_matrix = np.tile(sigmas_arr, (n_picks, 1))

    pick_numbers = np.array([p for p, _ in pick_order])
    z_matrix = (pick_numbers[:, None] - eff_adps[None, :]) / sigma_matrix
    utility_matrix = np.exp(-0.5 * z_matrix * z_matrix)
    # Convert to nested Python lists — eliminates numpy indexing overhead
    util_rows = utility_matrix.tolist()  # list[list[float]]

    # -----------------------------------------------------------------
    # Pre-compute modifier lookup structures
    # -----------------------------------------------------------------
    # player_positions_int[i]: int index into [QB, RB, WR, TE], or -1 for other positions
    player_positions_int = [_POS_INT.get(p, -1) for p in positions]
    # player_teams_list[i]: NFL team string for player i (used for stacking)
    player_teams_list = [p.team for p in players]

    # Stacking multipliers: list[k] for k = 0, 1, 2+
    if calibration is not None and calibration.get("stacking_multipliers"):
        sm = calibration["stacking_multipliers"]
        stacking_mults_list = [
            float(sm.get("0", 1.0)),
            float(sm.get("1", 1.0)),
            float(sm.get("2", 1.0)),
        ]
    else:
        stacking_mults_list = [1.0, 1.0, 1.0]

    # Position modifier table: {(qb_capped, rb_capped, wr_capped, te_capped): [4 floats]}
    # Pre-populate all 3×4×4×3 = 144 possible capped states so the inner loop never misses.
    _default_mods = [1.0, 1.0, 1.0, 1.0]
    raw_pm = calibration.get("position_modifiers", {}) if calibration else {}
    position_modifiers_table = {}
    for qb in range(_QB_CAP + 1):
        for rb in range(_RB_CAP + 1):
            for wr in range(_WR_CAP + 1):
                for te in range(_TE_CAP + 1):
                    sk = f"QB{qb}RB{rb}WR{wr}TE{te}"
                    pm = raw_pm.get(sk)
                    if pm:
                        position_modifiers_table[(qb, rb, wr, te)] = [
                            float(pm.get("QB", 1.0)),
                            float(pm.get("RB", 1.0)),
                            float(pm.get("WR", 1.0)),
                            float(pm.get("TE", 1.0)),
                        ]
                    else:
                        position_modifiers_table[(qb, rb, wr, te)] = _default_mods

    # -----------------------------------------------------------------
    # Main simulation loop
    # -----------------------------------------------------------------
    combo_counts = defaultdict(int)
    combo_players = {}
    all_pick_events = []
    all_pick_events_append = all_pick_events.append  # avoid attribute lookup in loop

    for sim in range(num_simulations):
        if progress_interval and (sim + 1) % progress_interval == 0:
            print(f"  Simulation {sim + 1:,} / {num_simulations:,}")

        # Available player indices — Python list, always sorted ascending
        avail = list(range(n_players))

        # Team rosters as lists of global indices
        team_roster_indices = [[] for _ in range(num_teams)]

        # Per-team position counts for position modifier lookup
        team_qb = [0] * num_teams
        team_rb = [0] * num_teams
        team_wr = [0] * num_teams
        team_te = [0] * num_teams
        # Per-team NFL team counts for stacking multiplier lookup
        team_stack = [{} for _ in range(num_teams)]
        # Per-team position lists for context_key generation (Tier 2)
        team_positions = [[] for _ in range(num_teams)]

        for pick_idx in range(n_picks):
            n_avail = len(avail)
            if n_avail == 0:
                break

            team_idx = pick_teams[pick_idx]
            row = util_rows[pick_idx]

            # Position modifier for this team's current (capped) roster state
            pos_mods = position_modifiers_table[(
                min(team_qb[team_idx], _QB_CAP),
                min(team_rb[team_idx], _RB_CAP),
                min(team_wr[team_idx], _WR_CAP),
                min(team_te[team_idx], _TE_CAP),
            )]
            stack_map = team_stack[team_idx]

            # Build modifier-applied utility list and total in a single pass
            total = 0.0
            mod_utils = []
            for i in range(n_avail):
                gidx = avail[i]
                pos_int = player_positions_int[gidx]
                pos_mod = pos_mods[pos_int] if pos_int >= 0 else 1.0
                stack_k = min(stack_map.get(player_teams_list[gidx], 0), 2)
                u = row[gidx] * pos_mod * stacking_mults_list[stack_k]
                mod_utils.append(u)
                total += u

            if total == 0.0:
                # Uniform fallback — extremely rare
                chosen_local = int(rng.integers(n_avail))
            else:
                # Sample: cumulative sum search with early exit
                r = float(rng.random()) * total
                cumsum = 0.0
                chosen_local = n_avail - 1  # fallback to last
                for i in range(n_avail):
                    cumsum += mod_utils[i]
                    if cumsum >= r:
                        chosen_local = i
                        break

            global_idx = avail[chosen_local]

            # Record pick
            team_roster_indices[team_idx].append(global_idx)

            # Remove from available (list.pop preserves sorted order)
            avail.pop(chosen_local)

            # Record pick event for Tier 2 conditional probabilities
            current_round = pick_rounds[pick_idx]
            tp = team_positions[team_idx]
            context_key = ",".join(sorted(tp))
            all_pick_events_append((current_round, context_key, player_ids[global_idx]))

            # Update team state after the pick
            tp.append(positions[global_idx])
            pos_int = player_positions_int[global_idx]
            if pos_int == 0:
                team_qb[team_idx] += 1
            elif pos_int == 1:
                team_rb[team_idx] += 1
            elif pos_int == 2:
                team_wr[team_idx] += 1
            elif pos_int == 3:
                team_te[team_idx] += 1
            nfl_team = player_teams_list[global_idx]
            stack_map[nfl_team] = stack_map.get(nfl_team, 0) + 1

        # Build combo keys — first 4 picks by ADP (roster identity inflection point),
        # then sort those 4 by player_id for order independence
        for team_idx in range(num_teams):
            indices = team_roster_indices[team_idx]
            indices_by_adp = sorted(indices, key=lambda i: adps[i])[:4]
            indices_by_adp.sort(key=lambda i: player_ids[i])
            ids = [player_ids[i] for i in indices_by_adp]
            combo_key = "|".join(ids)
            combo_counts[combo_key] += 1
            if combo_key not in combo_players:
                combo_players[combo_key] = ids

    return dict(combo_counts), combo_players, all_pick_events
