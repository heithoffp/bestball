"""Write aggregated projections to CSV in the format the app expects."""

import csv
import uuid
from datetime import date
from typing import Dict, List

from scrapers.name_normalizer import build_canonical_key


CSV_COLUMNS = [
    "id", "firstName", "lastName", "adp", "projectedPoints",
    "positionRank", "slotName", "teamName", "lineupStatus",
    "byeWeek", "tier", "tierNum",
]


def write_projections_csv(
    players: List[dict],
    underdog_id_map: Dict[str, str],
    output_path: str,
):
    """Write projections CSV compatible with the app's rankings format.

    Args:
        players: List of player dicts from aggregator (sorted by fantasy_points desc)
        underdog_id_map: Dict of canonical name -> Underdog UUID
        output_path: Where to write the CSV
    """
    position_counters: Dict[str, int] = {}
    rows = []

    for rank, player in enumerate(players, start=1):
        key = build_canonical_key(player["first_name"], player["last_name"])

        # Match to Underdog UUID or generate a deterministic one
        if key in underdog_id_map:
            player_id = underdog_id_map[key]
        else:
            player_id = str(uuid.uuid5(uuid.NAMESPACE_DNS, key))

        pos = player.get("position", "")
        position_counters[pos] = position_counters.get(pos, 0) + 1
        position_rank = f"{pos}{position_counters[pos]}"

        rows.append({
            "id": player_id,
            "firstName": player["first_name"],
            "lastName": player["last_name"],
            "adp": str(rank),
            "projectedPoints": str(player["fantasy_points"]),
            "positionRank": position_rank,
            "slotName": pos,
            "teamName": player.get("team", ""),
            "lineupStatus": "",
            "byeWeek": "",
            "tier": "",
            "tierNum": "",
        })

    with open(output_path, "w", newline="", encoding="utf-8") as f:
        writer = csv.DictWriter(f, fieldnames=CSV_COLUMNS, quoting=csv.QUOTE_ALL)
        writer.writeheader()
        writer.writerows(rows)

    return len(rows)


def write_debug_csv(
    players: List[dict],
    source_names: List[str],
    source_dates: Dict[str, str],
    output_path: str,
):
    """Write a debug CSV showing per-source projections for each player.

    Args:
        players: List of player dicts from aggregator (must include 'per_source_pts')
        source_names: Ordered list of source names that were used
        source_dates: Dict of source name -> date string when data was fetched
        output_path: Where to write the debug CSV
    """
    # Build dynamic columns: fixed cols + one pts column per source + metadata
    fixed_cols = ["rank", "firstName", "lastName", "position", "team", "consensus_pts", "source_count"]
    source_pts_cols = [f"{s}_pts" for s in source_names]
    source_date_cols = [f"{s}_date" for s in source_names]
    stat_cols = [
        "avg_pass_yards", "avg_pass_tds", "avg_interceptions",
        "avg_rush_yards", "avg_rush_tds", "avg_receptions",
        "avg_rec_yards", "avg_rec_tds", "avg_fumbles_lost",
    ]
    all_cols = fixed_cols + source_pts_cols + ["spread_pct"] + stat_cols + source_date_cols

    rows = []
    for rank, player in enumerate(players, start=1):
        per_source = player.get("per_source_pts", {})

        # Compute spread percentage
        pts_values = [v for v in per_source.values() if v > 0]
        if len(pts_values) > 1:
            avg_p = sum(pts_values) / len(pts_values)
            spread = round((max(pts_values) - min(pts_values)) / avg_p * 100, 1) if avg_p > 0 else 0
        else:
            spread = 0

        row = {
            "rank": rank,
            "firstName": player["first_name"],
            "lastName": player["last_name"],
            "position": player["position"],
            "team": player.get("team", ""),
            "consensus_pts": player["fantasy_points"],
            "source_count": player["source_count"],
            "spread_pct": spread,
        }

        # Per-source points
        for s in source_names:
            col = f"{s}_pts"
            row[col] = per_source.get(s, "")

        # Per-source dates
        for s in source_names:
            col = f"{s}_date"
            row[col] = source_dates.get(s, "")

        # Averaged stats
        stat_field_names = [
            "pass_yards", "pass_tds", "interceptions",
            "rush_yards", "rush_tds", "receptions",
            "rec_yards", "rec_tds", "fumbles_lost",
        ]
        for field in stat_field_names:
            val = player.get(field)
            row[f"avg_{field}"] = round(val, 1) if val else ""

        rows.append(row)

    with open(output_path, "w", newline="", encoding="utf-8") as f:
        writer = csv.DictWriter(f, fieldnames=all_cols, quoting=csv.QUOTE_MINIMAL)
        writer.writeheader()
        writer.writerows(rows)

    return len(rows)
