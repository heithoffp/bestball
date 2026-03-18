"""Underdog local ADP source — reads from on-disk CSV files."""

import csv
import glob
import os
from typing import Dict, List

from scrapers.config import ADP_DIR
from scrapers.models import PlayerProjection
from scrapers.name_normalizer import build_canonical_key
from scrapers.sources.base import BaseSource


class UnderdogSource(BaseSource):
    @property
    def name(self) -> str:
        return "underdog"

    def _find_latest_csv(self) -> str:
        """Find the most recent ADP CSV by filename date."""
        pattern = os.path.join(ADP_DIR, "underdog_adp_*.csv")
        files = sorted(glob.glob(pattern))
        if not files:
            raise FileNotFoundError(f"No ADP CSVs found in {ADP_DIR}")
        return files[-1]

    def get_data_date(self) -> str:
        """Extract the date from the latest ADP filename (YYYY-MM-DD)."""
        path = self._find_latest_csv()
        # Filename: underdog_adp_2026-03-18.csv
        basename = os.path.basename(path).replace(".csv", "")
        return basename.replace("underdog_adp_", "")

    def fetch_projections(self) -> List[PlayerProjection]:
        path = self._find_latest_csv()
        print(f"  [underdog] Reading {os.path.basename(path)}")
        projections = []
        with open(path, "r", encoding="utf-8") as f:
            reader = csv.DictReader(f)
            for row in reader:
                pts = float(row.get("projectedPoints", 0) or 0)
                if pts <= 0:
                    continue
                projections.append(PlayerProjection(
                    source="underdog",
                    first_name=row.get("firstName", ""),
                    last_name=row.get("lastName", ""),
                    team=row.get("teamName", ""),
                    position=row.get("slotName", ""),
                    fantasy_points=pts,
                ))
        return projections

    def get_player_id_map(self) -> Dict[str, str]:
        """Return dict of canonical name -> Underdog UUID."""
        path = self._find_latest_csv()
        id_map = {}
        with open(path, "r", encoding="utf-8") as f:
            reader = csv.DictReader(f)
            for row in reader:
                first = row.get("firstName", "")
                last = row.get("lastName", "")
                uid = row.get("id", "")
                if first and last and uid:
                    key = build_canonical_key(first, last)
                    id_map[key] = uid
        return id_map


if __name__ == "__main__":
    src = UnderdogSource()
    projections = src.fetch_projections()
    print(f"\nTotal players: {len(projections)}")
    print("\nTop 10 by projected points:")
    for p in sorted(projections, key=lambda x: x.fantasy_points, reverse=True)[:10]:
        print(f"  {p.first_name} {p.last_name} ({p.position}, {p.team}): {p.fantasy_points}")
