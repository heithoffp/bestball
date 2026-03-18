"""Aggregate projections from multiple sources into consensus rankings."""

import logging
from collections import defaultdict
from typing import Dict, List

from scrapers.config import SCORING_HALF_PPR
from scrapers.models import PlayerProjection
from scrapers.name_normalizer import build_canonical_key, fuzzy_match

logger = logging.getLogger(__name__)

STAT_FIELDS = [
    "pass_yards", "pass_tds", "interceptions",
    "rush_yards", "rush_tds", "receptions",
    "rec_yards", "rec_tds", "fumbles_lost",
]


def _compute_fantasy_points(stats: dict, scoring: dict) -> float:
    """Compute fantasy points from averaged stats using scoring weights."""
    total = 0.0
    for stat, weight in scoring.items():
        total += stats.get(stat, 0.0) * weight
    return round(total, 1)


def aggregate(
    all_projections: Dict[str, List[PlayerProjection]],
    scoring: dict = None,
) -> List[dict]:
    """Aggregate projections from multiple sources.

    Groups by canonical player key, averages stats across sources that provide
    raw stats, and includes points-only sources in the final points average.

    Returns list of dicts sorted by fantasy_points descending.
    """
    if scoring is None:
        scoring = SCORING_HALF_PPR

    # Group projections by canonical player key
    grouped: Dict[str, List[PlayerProjection]] = defaultdict(list)
    player_info: Dict[str, dict] = {}  # canonical key -> {first_name, last_name, team, position}

    # Build all canonical keys first for fuzzy matching
    all_keys = set()
    for source_name, projections in all_projections.items():
        for p in projections:
            key = build_canonical_key(p.first_name, p.last_name)
            all_keys.add(key)

    for source_name, projections in all_projections.items():
        for p in projections:
            key = build_canonical_key(p.first_name, p.last_name)

            # Try fuzzy match if exact key not found in other sources
            if key not in player_info and len(all_keys) > 0:
                match = fuzzy_match(key, list(all_keys), threshold=0.90)
                if match and match != key:
                    logger.debug(f"Fuzzy matched '{key}' -> '{match}' (source: {source_name})")
                    key = match

            grouped[key].append(p)

            # Prefer Underdog metadata (current-season) over other sources
            existing = player_info.get(key)
            if existing is None:
                player_info[key] = {
                    "first_name": p.first_name,
                    "last_name": p.last_name,
                    "team": p.team,
                    "position": p.position,
                    "_source": source_name,
                }
            elif source_name == "underdog" and existing.get("_source") != "underdog":
                player_info[key] = {
                    "first_name": p.first_name,
                    "last_name": p.last_name,
                    "team": p.team,
                    "position": p.position,
                    "_source": source_name,
                }

    # Aggregate each player
    results = []
    for key, projections in grouped.items():
        info = player_info[key]

        # Separate stat-providing sources from points-only sources
        stat_sources = [p for p in projections if p.has_raw_stats]
        points_only_sources = [p for p in projections if not p.has_raw_stats]

        # Average raw stats from stat-providing sources
        avg_stats = {}
        if stat_sources:
            for field in STAT_FIELDS:
                values = [getattr(p, field) for p in stat_sources]
                avg_stats[field] = sum(values) / len(values)

        # Compute fantasy points from averaged stats
        if avg_stats:
            stat_based_points = _compute_fantasy_points(avg_stats, scoring)
        else:
            stat_based_points = None

        # Collect all fantasy points values (stat-based + points-only)
        all_points = []
        if stat_based_points is not None:
            all_points.append(stat_based_points)
        for p in points_only_sources:
            if p.fantasy_points > 0:
                all_points.append(p.fantasy_points)

        final_points = round(sum(all_points) / len(all_points), 1) if all_points else 0.0

        sources_list = sorted(set(p.source for p in projections))

        # Build per-source points breakdown
        per_source_pts = {}
        for p in projections:
            if p.has_raw_stats:
                pts = _compute_fantasy_points(
                    {f: getattr(p, f) for f in STAT_FIELDS}, scoring
                )
            else:
                pts = p.fantasy_points
            per_source_pts[p.source] = round(pts, 1)

        # Log large variance
        if len(per_source_pts) > 1:
            pts_values = list(per_source_pts.values())
            min_p, max_p = min(pts_values), max(pts_values)
            avg_p = sum(pts_values) / len(pts_values)
            if avg_p > 0 and (max_p - min_p) / avg_p > 0.20:
                detail = ', '.join(f'{s}={v:.1f}' for s, v in per_source_pts.items())
                logger.info(
                    f"High variance for {info['first_name']} {info['last_name']}: "
                    f"{detail} (spread: {(max_p - min_p) / avg_p:.0%})"
                )

        results.append({
            "first_name": info["first_name"],
            "last_name": info["last_name"],
            "team": info["team"],
            "position": info["position"],
            "fantasy_points": final_points,
            "source_count": len(sources_list),
            "sources_list": ",".join(sources_list),
            "per_source_pts": per_source_pts,
            **avg_stats,
        })

    # Sort by fantasy points descending
    results.sort(key=lambda x: x["fantasy_points"], reverse=True)

    # Log unmatched players (only in one source)
    for r in results:
        if r["source_count"] == 1 and r["fantasy_points"] > 100:
            logger.debug(
                f"Single-source player: {r['first_name']} {r['last_name']} "
                f"({r['position']}, {r['sources_list']}, {r['fantasy_points']} pts)"
            )

    return results
