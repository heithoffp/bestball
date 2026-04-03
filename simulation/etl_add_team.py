"""ETL — Add player NFL team to bbm6_picks_rd1_6.csv.

Joins the earliest ADP snapshot (pre-free-agency) to the picks dataset by
normalized player name. Adds a `player_team` column in-place.

Usage (from repo root):
    python simulation/etl_add_team.py
"""

import csv
import os
import re

ADP_DIR = os.path.join(os.path.dirname(__file__), "..", "best-ball-manager", "src", "assets", "adp")
PICKS_PATH = os.path.join(os.path.dirname(__file__), "Historical_Data", "bbm6_picks_rd1_6.csv")
OUTPUT_PATH = PICKS_PATH  # in-place update


def normalize_name(name: str) -> str:
    """Lowercase, strip punctuation (. and -), collapse whitespace."""
    name = name.lower()
    name = re.sub(r"[.\-']", "", name)
    name = re.sub(r"\s+", " ", name).strip()
    return name


def load_earliest_adp_team_lookup(adp_dir: str) -> dict[str, str]:
    """Build name -> teamName lookup from the earliest ADP snapshot."""
    csv_files = sorted(
        f for f in os.listdir(adp_dir)
        if f.startswith("underdog_adp_") and f.endswith(".csv")
    )
    if not csv_files:
        raise FileNotFoundError(f"No ADP CSV files found in {adp_dir}")

    earliest_file = csv_files[0]
    earliest_path = os.path.join(adp_dir, earliest_file)
    print(f"Using ADP snapshot: {earliest_file}")

    lookup = {}
    with open(earliest_path, newline="", encoding="utf-8") as f:
        reader = csv.DictReader(f)
        for row in reader:
            first = (row.get("firstName") or "").strip()
            last = (row.get("lastName") or "").strip()
            team = (row.get("teamName") or "").strip()
            if not first or not last:
                continue
            full_name = f"{first} {last}"
            key = normalize_name(full_name)
            lookup[key] = team

    print(f"  Loaded {len(lookup)} players from ADP snapshot.")
    return lookup


def main():
    lookup = load_earliest_adp_team_lookup(ADP_DIR)

    # Read all picks into memory (file is compact post-ETL, should be fine)
    print(f"Reading picks: {PICKS_PATH}")
    with open(PICKS_PATH, newline="", encoding="utf-8") as f:
        reader = csv.DictReader(f)
        fieldnames = reader.fieldnames[:]
        rows = list(reader)

    print(f"  Loaded {len(rows):,} rows.")

    # Add player_team column
    if "player_team" not in fieldnames:
        fieldnames = fieldnames + ["player_team"]

    matched = 0
    unmatched_names = set()

    for row in rows:
        raw_name = row.get("player_name", "")
        key = normalize_name(raw_name)
        team = lookup.get(key, "")
        if team:
            matched += 1
        else:
            unmatched_names.add(raw_name)
        row["player_team"] = team

    # Write back in-place
    with open(OUTPUT_PATH, "w", newline="", encoding="utf-8") as f:
        writer = csv.DictWriter(f, fieldnames=fieldnames)
        writer.writeheader()
        writer.writerows(rows)

    total = len(rows)
    pct = 100.0 * matched / total if total else 0.0
    print(f"\nDone. Matched {matched:,}/{total:,} rows ({pct:.1f}%).")
    if unmatched_names:
        print(f"Unmatched ({len(unmatched_names)} unique names):")
        for name in sorted(unmatched_names):
            print(f"  {name}")
    else:
        print("All names matched.")


if __name__ == "__main__":
    main()
