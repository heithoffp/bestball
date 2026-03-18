"""FantasyPros projection scraper — fetches raw stat projections from HTML tables."""

from typing import List

from bs4 import BeautifulSoup

from scrapers.models import PlayerProjection
from scrapers.sources.base import BaseSource


# Position page URLs
_BASE_URL = "https://www.fantasypros.com/nfl/projections"
_POSITIONS = {
    "QB": f"{_BASE_URL}/qb.php?week=draft&scoring=HALF",
    "RB": f"{_BASE_URL}/rb.php?week=draft&scoring=HALF",
    "WR": f"{_BASE_URL}/wr.php?week=draft&scoring=HALF",
    "TE": f"{_BASE_URL}/te.php?week=draft&scoring=HALF",
}

# Column indices (0-based, after player name column) per position
# These map the stat table columns to our model fields
# Column indices (0-based within data cells, AFTER player name cell)
# QB:  ATT CMP YDS TDS INTS | ATT YDS TDS | FL FPTS
# RB:  ATT YDS TDS | REC YDS TDS | FL FPTS
# WR:  REC YDS TDS | ATT YDS TDS | FL FPTS
# TE:  REC YDS TDS | FL FPTS
_COLUMN_MAP = {
    "QB": [
        ("pass_yards", 2),    # Passing YDS  (cell[3])
        ("pass_tds", 3),      # Passing TDS  (cell[4])
        ("interceptions", 4), # INTS         (cell[5])
        ("rush_yards", 6),    # Rushing YDS  (cell[7])
        ("rush_tds", 7),      # Rushing TDS  (cell[8])
        ("fumbles_lost", 8),  # FL           (cell[9])
    ],
    "RB": [
        ("rush_yards", 1),    # Rushing YDS  (cell[2])
        ("rush_tds", 2),      # Rushing TDS  (cell[3])
        ("receptions", 3),    # REC          (cell[4])
        ("rec_yards", 4),     # Receiving YDS(cell[5])
        ("rec_tds", 5),       # Receiving TDS(cell[6])
        ("fumbles_lost", 6),  # FL           (cell[7])
    ],
    "WR": [
        ("receptions", 0),    # REC          (cell[1])
        ("rec_yards", 1),     # Receiving YDS(cell[2])
        ("rec_tds", 2),       # Receiving TDS(cell[3])
        # cell[4] = rush ATT (skip)
        ("rush_yards", 4),    # Rushing YDS  (cell[5])
        ("rush_tds", 5),      # Rushing TDS  (cell[6])
        ("fumbles_lost", 6),  # FL           (cell[7])
    ],
    "TE": [
        ("receptions", 0),    # REC          (cell[1])
        ("rec_yards", 1),     # Receiving YDS(cell[2])
        ("rec_tds", 2),       # Receiving TDS(cell[3])
        ("fumbles_lost", 3),  # FL           (cell[4])
    ],
}


def _parse_float(text: str) -> float:
    """Parse a float from a table cell, handling commas and dashes."""
    text = text.strip().replace(",", "")
    if not text or text == "-":
        return 0.0
    try:
        return float(text)
    except ValueError:
        return 0.0


def _extract_player_info(cell) -> tuple:
    """Extract player name and team from the first cell of a row.

    FantasyPros format: <a>Player Name</a> <small>TEAM</small>
    """
    # Try to get name from the anchor tag
    anchor = cell.find("a", class_="player-name")
    if not anchor:
        anchor = cell.find("a")
    if not anchor:
        return None, None, None

    full_name = anchor.get_text(strip=True)

    # Split into first/last
    parts = full_name.split(None, 1)
    first_name = parts[0] if parts else ""
    last_name = parts[1] if len(parts) > 1 else ""

    # Team abbreviation — may be in <small> tag or as loose text after the anchor
    team_el = cell.find("small")
    if team_el:
        team = team_el.get_text(strip=True)
    else:
        # Get remaining text in cell after the anchor
        full_text = cell.get_text(strip=True)
        team = full_text.replace(full_name, "").strip()

    return first_name, last_name, team


class FantasyProsSource(BaseSource):
    @property
    def name(self) -> str:
        return "fantasypros"

    def fetch_projections(self) -> List[PlayerProjection]:
        # Check cache
        cached = self._get_cached()
        if cached is not None:
            return self._dicts_to_projections(cached)

        all_projections = []

        for position, url in _POSITIONS.items():
            print(f"  [fantasypros] Fetching {position}...")
            try:
                resp = self._request_with_retry(url)
                projections = self._parse_position_page(resp.text, position)
                all_projections.extend(projections)
                print(f"  [fantasypros] {position}: {len(projections)} players")
            except Exception as e:
                print(f"  [fantasypros] {position} FAILED: {e}")

            if position != list(_POSITIONS.keys())[-1]:
                self._rate_limit(2)

        return all_projections

    def _parse_position_page(self, html: str, position: str) -> List[PlayerProjection]:
        """Parse a FantasyPros projections page for a single position."""
        soup = BeautifulSoup(html, "lxml")

        # Find the data table
        table = soup.find("table", id="data")
        if not table:
            # Try alternative table selectors
            table = soup.find("table", class_="table")
        if not table:
            print(f"  [fantasypros] WARNING: No table found for {position}")
            return []

        tbody = table.find("tbody")
        if not tbody:
            return []

        col_map = _COLUMN_MAP.get(position, [])
        projections = []

        for row in tbody.find_all("tr"):
            cells = row.find_all("td")
            if len(cells) < 2:
                continue

            first_name, last_name, team = _extract_player_info(cells[0])
            if not first_name:
                continue

            # Extract stats from mapped columns
            stats = {}
            for field_name, col_idx in col_map:
                # +1 because col indices are after the player name column
                actual_idx = col_idx + 1
                if actual_idx < len(cells):
                    stats[field_name] = _parse_float(cells[actual_idx].get_text())

            projections.append(PlayerProjection(
                source="fantasypros",
                first_name=first_name,
                last_name=last_name,
                team=team,
                position=position,
                **stats,
            ))

        return projections


if __name__ == "__main__":
    src = FantasyProsSource()
    projections = src.fetch_projections()
    print(f"\nTotal: {len(projections)} players")

    from scrapers.config import SCORING_HALF_PPR
    def calc_pts(p):
        total = 0
        for stat, weight in SCORING_HALF_PPR.items():
            total += getattr(p, stat, 0) * weight
        return total

    for pos in ["QB", "RB", "WR", "TE"]:
        pos_players = [p for p in projections if p.position == pos]
        pos_players.sort(key=calc_pts, reverse=True)
        print(f"\nTop 5 {pos}:")
        for p in pos_players[:5]:
            pts = calc_pts(p)
            print(f"  {p.first_name} {p.last_name} ({p.team}): {pts:.1f}")
