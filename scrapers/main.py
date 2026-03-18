#!/usr/bin/env python3
"""Player Projection Aggregator — scrape, average, and output consensus projections."""

import argparse
import logging
import os
import sys
from datetime import date

from scrapers.aggregator import aggregate
from scrapers.config import OUTPUT_DIR, SCORING_PRESETS
from scrapers.output import write_debug_csv, write_projections_csv
from scrapers.sources.underdog import UnderdogSource

logger = logging.getLogger("scrapers")

# All available sources
SOURCE_REGISTRY = {
    "underdog": UnderdogSource,
}

# Lazy-import external scrapers so missing deps don't break the core
def _register_external_sources():
    try:
        from scrapers.sources.fantasypros import FantasyProsSource
        SOURCE_REGISTRY["fantasypros"] = FantasyProsSource
    except ImportError:
        pass
    try:
        from scrapers.sources.espn import ESPNSource
        SOURCE_REGISTRY["espn"] = ESPNSource
    except ImportError:
        pass
    try:
        from scrapers.sources.cbs import CBSSource
        SOURCE_REGISTRY["cbs"] = CBSSource
    except ImportError:
        pass
    try:
        from scrapers.sources.clay import ClaySource
        SOURCE_REGISTRY["clay"] = ClaySource
    except ImportError:
        pass


def main():
    _register_external_sources()

    parser = argparse.ArgumentParser(description="Aggregate fantasy football projections")
    parser.add_argument(
        "--scoring", choices=["half-ppr", "full-ppr", "standard"],
        default="half-ppr", help="Scoring format (default: half-ppr)",
    )
    parser.add_argument(
        "--sources", default=None,
        help="Comma-separated source names (default: all available)",
    )
    parser.add_argument(
        "--output", default=os.path.join(OUTPUT_DIR, "projections.csv"),
        help="Output CSV path",
    )
    parser.add_argument("--verbose", action="store_true", help="Enable debug logging")
    parser.add_argument("--dry-run", action="store_true", help="Print to stdout, don't write file")
    parser.add_argument("--use-cache", action="store_true", help="Use cached data if available")
    args = parser.parse_args()

    # Setup logging
    level = logging.DEBUG if args.verbose else logging.INFO
    logging.basicConfig(
        level=level,
        format="%(asctime)s [%(name)s] %(levelname)s: %(message)s",
        datefmt="%H:%M:%S",
    )

    scoring = SCORING_PRESETS[args.scoring]

    # Determine which sources to run
    if args.sources:
        source_names = [s.strip() for s in args.sources.split(",")]
    else:
        source_names = list(SOURCE_REGISTRY.keys())

    print(f"Scoring: {args.scoring}")
    print(f"Sources: {', '.join(source_names)}")
    print()

    # Fetch projections from each source
    all_projections = {}
    source_dates = {}  # source name -> date string
    for name in source_names:
        if name not in SOURCE_REGISTRY:
            print(f"  WARNING: Unknown source '{name}', skipping")
            continue
        source = SOURCE_REGISTRY[name]()
        try:
            # Check cache first
            if args.use_cache:
                cached = source._get_cached()
                if cached is not None:
                    projections = source._dicts_to_projections(cached)
                    print(f"  [{name}] Loaded {len(projections)} players from cache")
                    all_projections[name] = projections
                    # Extract date from cache filename
                    cache_path = source._cache_path()
                    cache_date = os.path.basename(cache_path).rsplit("_", 1)[-1].replace(".json", "")
                    source_dates[name] = cache_date
                    continue

            projections = source.fetch_projections()
            print(f"  [{name}] Fetched {len(projections)} players")
            all_projections[name] = projections

            # Record source date — some sources have their own data dates
            if hasattr(source, "get_data_date"):
                src_date = source.get_data_date()
                source_dates[name] = src_date if src_date else date.today().isoformat()
            else:
                source_dates[name] = date.today().isoformat()

            # Cache results
            source._set_cached(source._projections_to_dicts(projections))
        except Exception as e:
            logger.error(f"  [{name}] FAILED: {e}")
            if args.verbose:
                import traceback
                traceback.print_exc()

    if not all_projections:
        print("ERROR: No sources returned data. Exiting.")
        sys.exit(1)

    # Aggregate
    print(f"\nAggregating {sum(len(v) for v in all_projections.values())} projections...")
    results = aggregate(all_projections, scoring)

    # Get Underdog ID map for output matching
    underdog_id_map = {}
    if "underdog" in SOURCE_REGISTRY:
        try:
            underdog_id_map = UnderdogSource().get_player_id_map()
        except Exception:
            pass

    if args.dry_run:
        print(f"\n{'Rank':<5} {'Player':<30} {'Pos':<4} {'Team':<25} {'Pts':<8} {'Srcs'}")
        print("-" * 80)
        for i, p in enumerate(results[:30], 1):
            name = f"{p['first_name']} {p['last_name']}"
            print(f"{i:<5} {name:<30} {p['position']:<4} {p['team']:<25} {p['fantasy_points']:<8} {p['sources_list']}")
    else:
        count = write_projections_csv(results, underdog_id_map, args.output)
        print(f"\nWrote {count} players to {args.output}")

        # Write debug CSV to project root
        _root = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
        debug_path = os.path.join(_root, "projections_debug.csv")
        # Only include sources that actually returned players
        used_sources = [s for s in all_projections.keys() if len(all_projections[s]) > 0]
        used_dates = {s: d for s, d in source_dates.items() if s in used_sources}
        try:
            debug_count = write_debug_csv(results, used_sources, used_dates, debug_path)
            print(f"Wrote {debug_count} players to {debug_path}")
        except PermissionError:
            print(f"WARNING: Could not write {debug_path} (file may be open in another program)")

    # Summary
    print(f"\n{'='*60}")
    print("SUMMARY")
    print(f"{'='*60}")
    print(f"Sources used: {', '.join(all_projections.keys())}")
    print(f"Total consensus players: {len(results)}")

    # Per-source counts
    for src_name, projs in all_projections.items():
        print(f"  {src_name}: {len(projs)} players")

    # Source coverage for top 20
    print(f"\nTop 20 consensus rankings:")
    print(f"{'Rank':<5} {'Player':<30} {'Pos':<4} {'Pts':<8} {'Srcs'}")
    print("-" * 60)
    for i, p in enumerate(results[:20], 1):
        name = f"{p['first_name']} {p['last_name']}"
        print(f"{i:<5} {name:<30} {p['position']:<4} {p['fantasy_points']:<8} {p['sources_list']}")


if __name__ == "__main__":
    main()
