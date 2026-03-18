"""Mike Clay (ESPN) projection scraper — parses the Clay Projections PDF."""

import os
import re
import tempfile
from typing import List

from scrapers.config import CACHE_DIR
from scrapers.models import PlayerProjection
from scrapers.sources.base import BaseSource

_PDF_URL = (
    "https://g.espncdn.com/s/ffldraftkit/26/"
    "NFLDK2026_CS_ClayProjections2026.pdf"
)

# Pages (0-indexed) for each position section
_POSITION_PAGES = {
    "QB": [34],
    "RB": [35, 36, 37],
    "WR": [38, 39, 40, 41, 42],
    "TE": [43, 44],
}

_HEADER_LINE_COUNT = 13  # header lines before player data starts on each page
_FIELDS_PER_PLAYER = 14  # name + 13 stat fields

# Clay uses some non-standard team abbreviations
_TEAM_REMAP = {
    "ARZ": "ARI",
    "HST": "HOU",
    "JAC": "JAX",
    "LVR": "LV",
    "NOR": "NO",
    "SFO": "SF",
    "TBB": "TB",
    "GBP": "GB",
    "NEP": "NE",
    "KCC": "KC",
    "LAC": "LAC",
    "LAR": "LAR",
}

# Map Clay abbreviation -> full team name
_ABBREV_TO_FULL = {
    "ARI": "Arizona Cardinals", "ARZ": "Arizona Cardinals",
    "ATL": "Atlanta Falcons",
    "BAL": "Baltimore Ravens", "BLT": "Baltimore Ravens",
    "BUF": "Buffalo Bills",
    "CAR": "Carolina Panthers",
    "CHI": "Chicago Bears",
    "CIN": "Cincinnati Bengals",
    "CLE": "Cleveland Browns", "CLV": "Cleveland Browns",
    "DAL": "Dallas Cowboys",
    "DEN": "Denver Broncos",
    "DET": "Detroit Lions",
    "GB": "Green Bay Packers", "GBP": "Green Bay Packers",
    "HOU": "Houston Texans", "HST": "Houston Texans",
    "IND": "Indianapolis Colts",
    "JAX": "Jacksonville Jaguars", "JAC": "Jacksonville Jaguars",
    "KC": "Kansas City Chiefs", "KCC": "Kansas City Chiefs",
    "LV": "Las Vegas Raiders", "LVR": "Las Vegas Raiders",
    "LAC": "Los Angeles Chargers",
    "LAR": "Los Angeles Rams",
    "MIA": "Miami Dolphins",
    "MIN": "Minnesota Vikings",
    "NE": "New England Patriots", "NEP": "New England Patriots",
    "NO": "New Orleans Saints", "NOR": "New Orleans Saints",
    "NYG": "New York Giants",
    "NYJ": "New York Jets",
    "PHI": "Philadelphia Eagles",
    "PIT": "Pittsburgh Steelers",
    "SF": "San Francisco 49ers", "SFO": "San Francisco 49ers",
    "SEA": "Seattle Seahawks",
    "TB": "Tampa Bay Buccaneers", "TBB": "Tampa Bay Buccaneers",
    "TEN": "Tennessee Titans",
    "WAS": "Washington Commanders",
}


def _parse_float(val: str) -> float:
    val = val.strip().replace(",", "").replace("%", "")
    if not val or val == "-":
        return 0.0
    try:
        return float(val)
    except ValueError:
        return 0.0


def _split_name(full_name: str) -> tuple:
    parts = full_name.strip().split(None, 1)
    return (parts[0], parts[1]) if len(parts) > 1 else (parts[0], "")


class ClaySource(BaseSource):
    @property
    def name(self) -> str:
        return "clay"

    def __init__(self):
        self._update_date = None

    def get_data_date(self) -> str:
        """Return the 'Updated' date from the PDF cover page."""
        return self._update_date or ""

    def fetch_projections(self) -> List[PlayerProjection]:
        try:
            import fitz  # PyMuPDF
        except ImportError:
            raise ImportError(
                "PyMuPDF (fitz) is required for the Clay source. "
                "Install with: pip install pymupdf"
            )

        pdf_path = self._download_pdf()
        doc = fitz.open(pdf_path)

        # Extract update date from page 1
        page1 = doc[0].get_text().strip().split("\n")
        for i, line in enumerate(page1):
            if "Updated" in line and i + 1 < len(page1):
                self._update_date = page1[i + 1].strip()
                break

        all_projections = []

        for position, pages in _POSITION_PAGES.items():
            for page_idx in pages:
                if page_idx >= len(doc):
                    continue
                text = doc[page_idx].get_text()
                lines = text.strip().split("\n")

                players = self._parse_page(lines, position)
                all_projections.extend(players)

            print(f"  [clay] {position}: {sum(1 for p in all_projections if p.position == position)} players")

        doc.close()

        # Clean up temp file
        try:
            os.unlink(pdf_path)
        except OSError:
            pass

        return all_projections

    def _download_pdf(self) -> str:
        """Download the PDF and return the local path."""
        print(f"  [clay] Downloading PDF...")
        resp = self._request_with_retry(_PDF_URL)

        fd, path = tempfile.mkstemp(suffix=".pdf")
        with os.fdopen(fd, "wb") as f:
            f.write(resp.content)
        return path

    def _parse_page(self, lines: list, position: str) -> List[PlayerProjection]:
        """Parse a single page of positional projections."""
        # Skip header lines
        data_lines = lines[_HEADER_LINE_COUNT:]

        players = []
        i = 0
        while i + _FIELDS_PER_PLAYER <= len(data_lines):
            chunk = data_lines[i:i + _FIELDS_PER_PLAYER]
            i += _FIELDS_PER_PLAYER

            player_name = chunk[0].strip()
            team_abbr = chunk[1].strip()

            # Skip if this looks like a continuation header (not a player name)
            if player_name in ("Quarterback", "Running Back", "Wide Receiver",
                               "Tight End", "Defender", "Team"):
                continue

            first_name, last_name = _split_name(player_name)
            team = _ABBREV_TO_FULL.get(team_abbr, team_abbr)

            # chunk[2] = pos_rank, chunk[3] = ff_points, chunk[4] = games
            if position == "QB":
                # Fields: Name, Team, PosRk, FFPt, G, PAtt, Comp, PYds, PTD, INT, Sk, Carry, RuYds, RuTD
                proj = PlayerProjection(
                    source="clay",
                    first_name=first_name,
                    last_name=last_name,
                    team=team,
                    position="QB",
                    pass_yards=_parse_float(chunk[7]),
                    pass_tds=_parse_float(chunk[8]),
                    interceptions=_parse_float(chunk[9]),
                    rush_yards=_parse_float(chunk[12]),
                    rush_tds=_parse_float(chunk[13]),
                )
            else:
                # RB/WR/TE fields: Name, Team, PosRk, FFPt, G, Carry, RuYds, RuTD, Targ, Rec, ReYd, ReTD, Car%, Targ%
                proj = PlayerProjection(
                    source="clay",
                    first_name=first_name,
                    last_name=last_name,
                    team=team,
                    position=position,
                    rush_yards=_parse_float(chunk[6]),
                    rush_tds=_parse_float(chunk[7]),
                    receptions=_parse_float(chunk[9]),
                    rec_yards=_parse_float(chunk[10]),
                    rec_tds=_parse_float(chunk[11]),
                )

            players.append(proj)

        return players


if __name__ == "__main__":
    src = ClaySource()
    projections = src.fetch_projections()
    print(f"\nTotal: {len(projections)} players")
    print(f"Update date: {src.get_data_date()}")

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
