"""Output generation for Tier 1 frequency table and Tier 2 conditional probabilities."""

import gzip
import json
import os
from collections import defaultdict
from datetime import datetime, timezone


def generate_tier1(combo_counts: dict, combo_players: dict, min_count: int = 1) -> dict:
    """Build the Tier 1 frequency table — combos observed min_count or more times.

    Stores only the count as an integer value — the combo key itself encodes the player IDs
    (pipe-separated), so storing players separately would duplicate data and inflate asset size.

    Returns:
        Dict with "metadata" placeholder and "combos" mapping combo_key -> count (int).
    """
    filtered = {}
    for combo_key, count in combo_counts.items():
        if count >= min_count:
            filtered[combo_key] = count

    return {"combos": filtered}


def generate_tier2(pick_events: list) -> dict:
    """Build the Tier 2 conditional probability tables.

    For each (round, position_context), compute P(player | round, context).

    Args:
        pick_events: List of (round, context_key, player_id) tuples.

    Returns:
        Dict with "rounds" mapping round -> context_key -> {player_id: probability}.
    """
    # Accumulate counts: (round, context_key) -> {player_id: count}
    counts = defaultdict(lambda: defaultdict(int))
    totals = defaultdict(int)

    for rnd, context_key, player_id in pick_events:
        key = (str(rnd), context_key)
        counts[key][player_id] += 1
        totals[key] += 1

    # Normalize to probabilities
    rounds = defaultdict(dict)
    for (rnd, context_key), player_counts in counts.items():
        total = totals[(rnd, context_key)]
        probs = {pid: count / total for pid, count in player_counts.items()}
        rounds[rnd][context_key] = probs

    return {"rounds": dict(rounds)}


def generate_tier3(pick_sequences_by_name: dict, min_count: int = 1) -> dict:
    """Build Tier 3 per-player conditional probability tables for Draft Explorer.

    Unpacks 4-pick sequences into nested conditionals:
      R1: unconditional counts
      R2: counts given specific R1 player
      R3: counts given specific R1+R2 players
      R4: counts given specific R1+R2+R3 players

    Uses player_id strings as keys for direct client-side lookup.
    Stores counts — client normalizes to probabilities.

    Args:
        pick_sequences_by_name: dict mapping (p1_id, p2_id, p3_id, p4_id) -> count
        min_count: minimum count to include an entry (prunes rare paths)

    Returns:
        Dict with "r1"/"r2"/"r3"/"r4" nested count dicts.
    """
    r1_counts = defaultdict(int)
    r2_counts = defaultdict(lambda: defaultdict(int))
    r3_counts = defaultdict(lambda: defaultdict(int))
    r4_counts = defaultdict(lambda: defaultdict(int))

    for (p1, p2, p3, p4), count in pick_sequences_by_name.items():
        r1_counts[p1] += count
        r2_counts[p1][p2] += count
        r3_counts[f"{p1}|{p2}"][p3] += count
        r4_counts[f"{p1}|{p2}|{p3}"][p4] += count

    # Prune entries below min_count
    def prune(d, threshold):
        result = {}
        for key, sub in d.items():
            if isinstance(sub, dict):
                filtered = {k: v for k, v in sub.items() if v >= threshold}
                if filtered:
                    result[key] = filtered
            elif sub >= threshold:
                result[key] = sub
        return result

    return {
        "r1": {k: v for k, v in r1_counts.items() if v >= min_count},
        "r2": prune(r2_counts, min_count),
        "r3": prune(r3_counts, min_count),
        "r4": prune(r4_counts, min_count),
    }


def save_outputs(tier1_data: dict, tier2_data: dict, metadata: dict,
                 output_dir: str, tier3_data: dict = None) -> tuple:
    """Save Tier 1, Tier 2, and optionally Tier 3 outputs as JSON files.

    Returns:
        Tuple of output paths.
    """
    os.makedirs(output_dir, exist_ok=True)

    tier1_data["metadata"] = metadata
    tier2_data["metadata"] = metadata

    tier1_path = os.path.join(output_dir, "tier1_frequency.json")
    tier2_path = os.path.join(output_dir, "tier2_conditional.json")

    with open(tier1_path, "w", encoding="utf-8") as f:
        json.dump(tier1_data, f, separators=(",", ":"))

    with open(tier2_path, "w", encoding="utf-8") as f:
        json.dump(tier2_data, f, separators=(",", ":"))

    paths = [tier1_path, tier2_path]

    if tier3_data is not None:
        # Split tier3 into per-round files for progressive loading
        for rnd in ("r1", "r2", "r3", "r4"):
            rnd_data = {"metadata": metadata, rnd: tier3_data[rnd]}
            rnd_path = os.path.join(output_dir, f"tier3_{rnd}.json")
            with open(rnd_path, "w", encoding="utf-8") as f:
                json.dump(rnd_data, f, separators=(",", ":"))
            paths.append(rnd_path)

    return tuple(paths)


def generate_pilot_report(combo_counts: dict, combo_players: dict,
                          tier2_data: dict, metadata: dict,
                          tier1_path: str, tier2_path: str,
                          output_dir: str) -> dict:
    """Generate a pilot report with distribution metrics.

    Returns:
        Report dict (also saved as pilot_report.json).
    """
    import numpy as np

    all_counts = list(combo_counts.values())
    counts_ge2 = [c for c in all_counts if c >= 2]

    # File sizes
    tier1_size = os.path.getsize(tier1_path)
    tier2_size = os.path.getsize(tier2_path)

    # Gzip estimate for tier1
    with open(tier1_path, "rb") as f:
        raw = f.read()
    tier1_gzip_size = len(gzip.compress(raw))

    # Find max frequency combo
    max_key = max(combo_counts, key=combo_counts.get) if combo_counts else None
    max_count = combo_counts[max_key] if max_key else 0
    max_players = combo_players.get(max_key, [])

    # Percentiles (over all combos, not just ≥2)
    if all_counts:
        arr = np.array(all_counts)
        p50 = float(np.percentile(arr, 50))
        p90 = float(np.percentile(arr, 90))
        p99 = float(np.percentile(arr, 99))
    else:
        p50 = p90 = p99 = 0

    # Tier 2: unique position contexts per round
    contexts_per_round = {}
    for rnd, contexts in tier2_data.get("rounds", {}).items():
        contexts_per_round[rnd] = len(contexts)

    report = {
        "metadata": metadata,
        "total_unique_combos": len(all_counts),
        "combos_count_ge2": len(counts_ge2),
        "max_frequency": {
            "count": max_count,
            "players": max_players,
        },
        "frequency_percentiles": {
            "p50": p50,
            "p90": p90,
            "p99": p99,
        },
        "tier1_json_size_bytes": tier1_size,
        "tier1_gzip_size_bytes": tier1_gzip_size,
        "tier2_json_size_bytes": tier2_size,
        "tier2_contexts_per_round": contexts_per_round,
    }

    report_path = os.path.join(output_dir, "pilot_report.json")
    with open(report_path, "w", encoding="utf-8") as f:
        json.dump(report, f, indent=2)

    return report
