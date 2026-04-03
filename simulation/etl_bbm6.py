"""ETL — Stream BBM 6 picks into clean intermediate format.

Reads the 4.9GB best_ball_mania_vi_rd1.csv in chunks, filters to human picks
in rounds 1-6, and writes a compact CSV for downstream calibration tasks.

Usage:
    python simulation/etl_bbm6.py

Output:
    simulation/Historical_Data/bbm6_picks_rd1_6.csv
"""

import os
import pandas as pd

INPUT_PATH = os.path.join(os.path.dirname(__file__), "Historical_Data", "best_ball_mania_vi_rd1.csv")
OUTPUT_PATH = os.path.join(os.path.dirname(__file__), "Historical_Data", "bbm6_picks_rd1_6.csv")
CHUNK_SIZE = 200_000

KEEP_COLS = [
    "draft_id",
    "pick_order",
    "overall_pick_number",
    "team_pick_number",
    "player_name",
    "player_id",
    "position_name",
    "projection_adp",
]


def main():
    print(f"Reading: {INPUT_PATH}")
    print(f"Writing: {OUTPUT_PATH}")

    total_rows = 0
    first_chunk = True

    reader = pd.read_csv(
        INPUT_PATH,
        chunksize=CHUNK_SIZE,
        usecols=KEEP_COLS,
        dtype={
            "draft_id": str,
            "player_id": str,
            "player_name": str,
            "position_name": str,
        },
    )

    for i, chunk in enumerate(reader):
        # Filter: rounds 1-6 only (all pick sources included)
        filtered = chunk[chunk["team_pick_number"] <= 6].copy()

        # Cast ADP to float, drop rows where it is missing
        filtered["projection_adp"] = pd.to_numeric(
            filtered["projection_adp"], errors="coerce"
        )
        filtered = filtered.dropna(subset=["projection_adp"])

        if filtered.empty:
            continue

        filtered.to_csv(
            OUTPUT_PATH,
            mode="w" if first_chunk else "a",
            header=first_chunk,
            index=False,
        )
        first_chunk = False
        total_rows += len(filtered)

        if i % 10 == 0:
            print(f"  chunk {i} processed — {total_rows:,} rows written so far...")

    # Final summary
    if total_rows == 0:
        print("No rows written — check filters or input file.")
        return

    result = pd.read_csv(OUTPUT_PATH, usecols=["draft_id"])
    unique_drafts = result["draft_id"].nunique()
    print(f"Done. Wrote {total_rows:,} rows from {unique_drafts:,} drafts.")


if __name__ == "__main__":
    main()
