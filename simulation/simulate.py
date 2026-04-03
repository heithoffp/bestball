"""Main entry point for the uniqueness simulation engine.

Usage:
    python simulate.py --pilot              # 100K simulations (validation run)
    python simulate.py --sims 1000000       # 1M full run
    python simulate.py --help               # Show all options
"""

import argparse
import os
import sys
import time
from datetime import datetime, timezone

# Ensure this script can find sibling modules when run directly
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))

from collections import defaultdict

from models import load_players, load_epoch_snapshots
from engine import load_calibration, run_simulation
from output_gen import generate_tier1, generate_tier2, save_outputs, generate_pilot_report


def main():
    parser = argparse.ArgumentParser(description="Best Ball Uniqueness Simulation Engine")
    parser.add_argument("--pilot", action="store_true",
                        help="Run 100K pilot simulation for validation")
    parser.add_argument("--sims", type=int, default=None,
                        help="Number of simulations (overrides --pilot)")
    parser.add_argument("--sigma-slope", type=float, default=0.1,
                        help="Slope for ADP-dependent sigma (default: 0.1)")
    parser.add_argument("--sigma-intercept", type=float, default=1.5,
                        help="Intercept for ADP-dependent sigma (default: 1.5)")
    parser.add_argument("--adp-cutoff", type=float, default=120.0,
                        help="Maximum ADP to include (default: 120.0)")
    parser.add_argument("--seed", type=int, default=42,
                        help="Random seed (default: 42)")
    parser.add_argument("--teams", type=int, default=12,
                        help="Number of teams per draft (default: 12)")
    parser.add_argument("--rounds", type=int, default=6,
                        help="Number of rounds to simulate (default: 6)")
    parser.add_argument("--output-dir", type=str, default=None,
                        help="Output directory (default: simulation/output/)")
    parser.add_argument("--multi-epoch", action="store_true",
                        help="Run simulation across one epoch per ISO week (equal weight)")

    args = parser.parse_args()

    # Determine simulation count
    if args.sims is not None:
        num_sims = args.sims
    elif args.pilot:
        num_sims = 100_000
    else:
        parser.error("Specify --pilot or --sims N")
        return

    # Paths
    script_dir = os.path.dirname(os.path.abspath(__file__))
    adp_dir = os.path.join(script_dir, "..", "best-ball-manager", "src", "assets", "adp")
    adp_dir = os.path.normpath(adp_dir)
    output_dir = args.output_dir or os.path.join(script_dir, "output")

    # Load calibration (falls back to None with a warning if file is missing)
    cal = load_calibration()

    print(f"=== Best Ball Uniqueness Simulation ===")
    print(f"  Simulations: {num_sims:,}")
    print(f"  Teams: {args.teams}, Rounds: {args.rounds}")
    if cal:
        print(f"  Calibration: sigma_slope={cal['sigma_slope']:.5f}  sigma_intercept={cal['sigma_intercept']:.5f}")
        print(f"               sigma_min={cal['sigma_min']:.4f}  sigma_max={cal['sigma_max']:.4f}")
        has_modifiers = len(cal.get("position_modifiers", {})) > 0
        has_stacking = cal.get("stacking_multipliers") is not None
        print(f"               position_modifiers={has_modifiers}  stacking={has_stacking}")
    else:
        print(f"  Calibration: NOT FOUND — sigma={args.sigma_slope} * ADP + {args.sigma_intercept} (hardcoded)")
    print(f"  ADP cutoff: {args.adp_cutoff}")
    print(f"  Seed: {args.seed}")
    print()

    # Step 1: Load players and run simulation
    print("Running simulation...")
    start_time = time.time()

    if args.multi_epoch:
        # Multi-epoch: one ISO-week representative snapshot per week, equal weight
        epochs = load_epoch_snapshots(adp_dir, adp_cutoff=args.adp_cutoff)
        n_epochs = len(epochs)
        base_sims = num_sims // n_epochs
        remainder = num_sims - base_sims * n_epochs
        print(f"  Multi-epoch mode: {n_epochs} epochs (one per ISO week)")
        print()

        merged_combo_counts = defaultdict(int)
        merged_combo_players = {}
        merged_pick_events = []

        for epoch_idx, (adp_date, players) in enumerate(epochs):
            epoch_sims = base_sims + (remainder if epoch_idx == n_epochs - 1 else 0)
            epoch_seed = args.seed + epoch_idx
            print(f"  Epoch {epoch_idx + 1}/{n_epochs}: {adp_date}  "
                  f"({epoch_sims:,} sims, seed={epoch_seed}, "
                  f"{len(players)} players)")
            cc, cp, pe = run_simulation(
                players,
                num_simulations=epoch_sims,
                sigma_slope=args.sigma_slope,
                sigma_intercept=args.sigma_intercept,
                num_teams=args.teams,
                num_rounds=args.rounds,
                seed=epoch_seed,
                progress_interval=max(1, epoch_sims // 5),
                calibration=cal,
            )
            for k, v in cc.items():
                merged_combo_counts[k] += v
                if k not in merged_combo_players:
                    merged_combo_players[k] = cp[k]
            merged_pick_events.extend(pe)

        combo_counts = dict(merged_combo_counts)
        combo_players = merged_combo_players
        pick_events = merged_pick_events
        adp_date = epochs[-1][0]
        multi_epoch_meta = {
            "multi_epoch": True,
            "epochs": [date for date, _ in epochs],
            "sims_per_epoch": base_sims,
        }
    else:
        # Single-epoch: latest snapshot only
        players, adp_date = load_players(adp_dir, adp_cutoff=args.adp_cutoff)
        print(f"  Loaded {len(players)} players from ADP snapshot {adp_date}")
        print(f"  ADP range: {players[0].adp:.1f} - {players[-1].adp:.1f}")
        print(f"  Positions: {', '.join(sorted(set(p.position for p in players)))}")
        print()
        combo_counts, combo_players, pick_events = run_simulation(
            players,
            num_simulations=num_sims,
            sigma_slope=args.sigma_slope,
            sigma_intercept=args.sigma_intercept,
            num_teams=args.teams,
            num_rounds=args.rounds,
            seed=args.seed,
            progress_interval=max(1, num_sims // 10),
            calibration=cal,
        )
        multi_epoch_meta = {}

    elapsed = time.time() - start_time
    print()
    print(f"  Completed in {elapsed:.1f}s")
    print(f"  Total rosters: {num_sims * args.teams:,}")
    print(f"  Total unique combos: {len(combo_counts):,}")
    print()

    # Step 2: Generate outputs
    print("Generating outputs...")
    metadata = {
        "total_simulations": num_sims,
        "total_rosters": num_sims * args.teams,
        "sigma_slope": cal["sigma_slope"] if cal else args.sigma_slope,
        "sigma_intercept": cal["sigma_intercept"] if cal else args.sigma_intercept,
        "calibration_active": cal is not None,
        "adp_cutoff": args.adp_cutoff,
        "adp_date": adp_date,
        "num_teams": args.teams,
        "num_rounds": args.rounds,
        "seed": args.seed,
        "generated": datetime.now(timezone.utc).isoformat(),
        **multi_epoch_meta,
    }

    tier1_data = generate_tier1(combo_counts, combo_players)
    tier2_data = generate_tier2(pick_events)
    tier1_path, tier2_path = save_outputs(tier1_data, tier2_data, metadata, output_dir)
    print(f"  Tier 1: {tier1_path}")
    print(f"  Tier 2: {tier2_path}")
    print()

    # Step 3: Pilot report
    if args.pilot or num_sims <= 200_000:
        print("Generating pilot report...")
        report = generate_pilot_report(
            combo_counts, combo_players, tier2_data, metadata,
            tier1_path, tier2_path, output_dir
        )
        print()
        print("=== Pilot Report ===")
        print(f"  Total unique combos: {report['total_unique_combos']:,}")
        print(f"  Combos with count >= 2: {report['combos_count_ge2']:,}")
        print(f"  Max frequency combo: {report['max_frequency']['count']} occurrences")
        for pid in report["max_frequency"]["players"]:
            print(f"    - {pid}")
        print(f"  Frequency percentiles: p50={report['frequency_percentiles']['p50']:.1f}, "
              f"p90={report['frequency_percentiles']['p90']:.1f}, "
              f"p99={report['frequency_percentiles']['p99']:.1f}")
        print(f"  Tier 1 JSON: {report['tier1_json_size_bytes']:,} bytes "
              f"({report['tier1_gzip_size_bytes']:,} gzipped)")
        print(f"  Tier 2 JSON: {report['tier2_json_size_bytes']:,} bytes")
        print(f"  Tier 2 contexts per round: {report['tier2_contexts_per_round']}")
        print()
        print(f"  Full report: {os.path.join(output_dir, 'pilot_report.json')}")

    print()
    print("Done.")


if __name__ == "__main__":
    main()
