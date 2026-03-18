"""CBS Sports projection scraper — fetches from CBS fantasy football pages."""

from typing import List

from bs4 import BeautifulSoup

from scrapers.models import PlayerProjection
from scrapers.sources.base import BaseSource

_BASE_URL = "https://www.cbssports.com/fantasy/football/stats"

def _build_positions():
    """Build position URLs, trying current year then prior year."""
    from datetime import date
    year = date.today().year
    positions = {}
    for pos in ["QB", "RB", "WR", "TE"]:
        positions[pos] = [
            f"{_BASE_URL}/{pos}/{year}/restofseason/projections/",
            f"{_BASE_URL}/{pos}/{year - 1}/restofseason/projections/",
        ]
    return positions

# CBS column header text -> our field name (varies by position)
_HEADER_MAP = {
    # Passing
    "YDS": None,  # ambiguous — resolved per position
    "TD": None,   # ambiguous
    "INT": "interceptions",
    # Rushing
    "FPTS": None,  # skip their total
    "FL": "fumbles_lost",
    "REC": "receptions",
}

# Per-position column order (CBS uses consistent ordering within position pages)
_QB_COLS = [
    ("pass_yards", "passing yds"),
    ("pass_tds", "passing td"),
    ("interceptions", "int"),
    ("rush_yards", "rushing yds"),
    ("rush_tds", "rushing td"),
    ("fumbles_lost", "fl"),
]

_RB_COLS = [
    ("rush_yards", "rushing yds"),
    ("rush_tds", "rushing td"),
    ("receptions", "rec"),
    ("rec_yards", "receiving yds"),
    ("rec_tds", "receiving td"),
    ("fumbles_lost", "fl"),
]

_WR_COLS = [
    ("receptions", "rec"),
    ("rec_yards", "receiving yds"),
    ("rec_tds", "receiving td"),
    ("rush_yards", "rushing yds"),
    ("rush_tds", "rushing td"),
    ("fumbles_lost", "fl"),
]

_TE_COLS = [
    ("receptions", "rec"),
    ("rec_yards", "receiving yds"),
    ("rec_tds", "receiving td"),
    ("fumbles_lost", "fl"),
]


def _parse_float(text: str) -> float:
    text = text.strip().replace(",", "")
    if not text or text == "-" or text == "--":
        return 0.0
    try:
        return float(text)
    except ValueError:
        return 0.0


class CBSSource(BaseSource):
    @property
    def name(self) -> str:
        return "cbs"

    def fetch_projections(self) -> List[PlayerProjection]:
        all_projections = []
        positions = _build_positions()

        for position, urls in positions.items():
            print(f"  [cbs] Fetching {position}...")
            fetched = False
            for url in urls:
                try:
                    resp = self._request_with_retry(url)
                    projections = self._parse_position_page(resp.text, position)
                    if projections:
                        all_projections.extend(projections)
                        print(f"  [cbs] {position}: {len(projections)} players")
                        fetched = True
                        break
                    else:
                        print(f"  [cbs] {position}: no data found at {url}, trying next...")
                except Exception as e:
                    print(f"  [cbs] {position} failed at {url}: {e}")

            if not fetched:
                print(f"  [cbs] {position}: no data available (CBS may require JS rendering)")

            if position != list(positions.keys())[-1]:
                self._rate_limit(2)

        return all_projections

    def _parse_position_page(self, html: str, position: str) -> List[PlayerProjection]:
        soup = BeautifulSoup(html, "lxml")

        # CBS uses a table within the main content area
        table = soup.find("table", class_="TableBase-table")
        if not table:
            # Try finding any data table
            tables = soup.find_all("table")
            table = tables[0] if tables else None
        if not table:
            print(f"  [cbs] WARNING: No table found for {position}")
            return []

        # Determine column mapping based on header row
        stat_indices = self._map_columns(table, position)

        tbody = table.find("tbody")
        if not tbody:
            return []

        projections = []
        for row in tbody.find_all("tr"):
            cells = row.find_all("td")
            if len(cells) < 3:
                continue

            # First cell has player name and team
            first_cell = cells[0]
            first_name, last_name, team = self._extract_player(first_cell)
            if not first_name:
                continue

            # Extract stats from mapped columns
            stats = {}
            for field_name, col_idx in stat_indices.items():
                if col_idx < len(cells):
                    stats[field_name] = _parse_float(cells[col_idx].get_text())

            projections.append(PlayerProjection(
                source="cbs",
                first_name=first_name,
                last_name=last_name,
                team=team,
                position=position,
                **stats,
            ))

        return projections

    def _map_columns(self, table, position: str) -> dict:
        """Map stat columns based on position and header inspection."""
        # Default column indices based on typical CBS layout
        # CBS format: Player | ATT | YDS | TD | INT | ATT | YDS | TD | FL | FPTS
        # For QBs:    Player | (passing) ATT YDS TD INT | (rushing) ATT YDS TD | FL | FPTS
        if position == "QB":
            return {
                "pass_yards": 2,
                "pass_tds": 3,
                "interceptions": 4,
                "rush_yards": 6,
                "rush_tds": 7,
                "fumbles_lost": 8,
            }
        elif position == "RB":
            return {
                "rush_yards": 2,
                "rush_tds": 3,
                "receptions": 4,
                "rec_yards": 5,
                "rec_tds": 6,
                "fumbles_lost": 7,
            }
        elif position == "WR":
            return {
                "receptions": 1,
                "rec_yards": 2,
                "rec_tds": 3,
                "rush_yards": 5,
                "rush_tds": 6,
                "fumbles_lost": 7,
            }
        else:  # TE
            return {
                "receptions": 1,
                "rec_yards": 2,
                "rec_tds": 3,
                "fumbles_lost": 4,
            }

    def _extract_player(self, cell) -> tuple:
        """Extract player name and team from CBS player cell."""
        # CBS format: <a>Player Name</a> <span class="TeamName">TEAM</span>
        anchor = cell.find("a")
        if not anchor:
            # Try getting text directly
            text = cell.get_text(strip=True)
            if not text:
                return None, None, None
            parts = text.split()
            if len(parts) < 2:
                return None, None, None
            return parts[0], " ".join(parts[1:]), ""

        full_name = anchor.get_text(strip=True)
        parts = full_name.split(None, 1)
        first_name = parts[0] if parts else ""
        last_name = parts[1] if len(parts) > 1 else ""

        # Try to find team
        team_el = cell.find("span", class_="TeamName")
        if not team_el:
            team_el = cell.find("span", class_="CellPlayerName-team")
        team = team_el.get_text(strip=True) if team_el else ""

        return first_name, last_name, team


if __name__ == "__main__":
    src = CBSSource()
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
