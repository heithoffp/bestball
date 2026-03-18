"""ESPN API projection scraper — fetches from ESPN's fantasy football API."""

from typing import List

from scrapers.models import PlayerProjection
from scrapers.sources.base import BaseSource

# ESPN Fantasy API endpoint for season projections
# Note: ESPN may not have the upcoming season's data yet, so we try
# the current year first, then fall back to the prior year.
_API_URL_TEMPLATE = (
    "https://lm-api-reads.fantasy.espn.com/apis/v3/games/ffl/seasons/{year}/"
    "segments/0/leaguedefaults/3"
    "?view=kona_player_info"
)

# ESPN stat ID -> our field mapping
# See: https://stmorse.github.io/journal/espn-fantasy-v3.html
_STAT_MAP = {
    "3": "pass_yards",       # passingYards
    "4": "pass_tds",         # passingTouchdowns
    "20": "interceptions",   # passingInterceptions
    "24": "rush_yards",      # rushingYards
    "25": "rush_tds",        # rushingTouchdowns  (note: some ESPN versions use 27)
    "53": "receptions",      # receivingReceptions
    "42": "rec_yards",       # receivingYards
    "43": "rec_tds",         # receivingTouchdowns
    "72": "fumbles_lost",    # fumbles lost
}

# ESPN position ID -> position name
_POS_MAP = {1: "QB", 2: "RB", 3: "WR", 4: "TE", 5: "K", 16: "DST"}

# ESPN uses abbreviated team names but sometimes includes IDs
_TEAM_ID_MAP = {
    1: "Atlanta Falcons", 2: "Buffalo Bills", 3: "Chicago Bears",
    4: "Cincinnati Bengals", 5: "Cleveland Browns", 6: "Dallas Cowboys",
    7: "Denver Broncos", 8: "Detroit Lions", 9: "Green Bay Packers",
    10: "Houston Texans", 11: "Indianapolis Colts", 12: "Jacksonville Jaguars",
    13: "Kansas City Chiefs", 14: "Las Vegas Raiders", 15: "Los Angeles Rams",
    16: "Minnesota Vikings", 17: "New England Patriots", 18: "New Orleans Saints",
    19: "New York Giants", 20: "New York Jets", 21: "Philadelphia Eagles",
    22: "Pittsburgh Steelers", 23: "San Francisco 49ers", 24: "Seattle Seahawks",
    25: "Tampa Bay Buccaneers", 26: "Tennessee Titans", 27: "Washington Commanders",
    28: "Carolina Panthers", 29: "Miami Dolphins", 30: "Arizona Cardinals",
    33: "Baltimore Ravens", 34: "Los Angeles Chargers",
}


class ESPNSource(BaseSource):
    @property
    def name(self) -> str:
        return "espn"

    def fetch_projections(self) -> List[PlayerProjection]:
        print(f"  [espn] Fetching projections from API...")

        # Try current year first, then fall back to prior year
        from datetime import date
        current_year = date.today().year
        years_to_try = [current_year, current_year - 1]

        resp = None
        used_year = None
        for year in years_to_try:
            url = _API_URL_TEMPLATE.format(year=year)
            headers = {
                "x-fantasy-filter": (
                    f'{{"players":{{"filterStatsForExternalIds":{{"value":[{year}]}},'
                    f'"filterSlotIds":{{"value":[0,2,4,6,23]}},'
                    f'"filterStatsForSourceIds":{{"value":[1]}},'
                    f'"sortAppliedStatTotal":{{"sortAsc":false,"sortPriority":1,"value":"10{year}"}},'
                    f'"limit":1000,"offset":0}}}}'
                ),
                "x-fantasy-platform": "kona-PROD-8bbeb94c1d3a4dcb964e51e654e4ef77e0f14913",
                "x-fantasy-source": "kona",
            }
            try:
                resp = self._request_with_retry(url, headers=headers)
                used_year = year
                print(f"  [espn] Using {year} season data")
                break
            except Exception as e:
                print(f"  [espn] {year} not available: {e}")
                continue

        if resp is None:
            raise RuntimeError("ESPN API unavailable for any recent season")
        data = resp.json()

        projections = []
        players = data.get("players", [])

        for player_data in players:
            player = player_data.get("player", player_data)

            # Get position
            pos_id = player.get("defaultPositionId", 0)
            position = _POS_MAP.get(pos_id, "")
            if position not in ("QB", "RB", "WR", "TE"):
                continue

            full_name = player.get("fullName", "")
            first_name = player.get("firstName", "")
            last_name = player.get("lastName", "")
            if not full_name and not first_name:
                continue

            # If only full name, split it
            if not first_name and full_name:
                parts = full_name.split(None, 1)
                first_name = parts[0]
                last_name = parts[1] if len(parts) > 1 else ""

            # Team
            team_id = player.get("proTeamId", 0)
            team = _TEAM_ID_MAP.get(team_id, "")

            # Extract projected stats
            stats = {}
            player_stats = player.get("stats", [])
            for stat_set in player_stats:
                # Source ID 1 = projections, statSplitTypeId 1 = season
                if stat_set.get("statSourceId") == 1 and stat_set.get("id", "").startswith("10"):
                    stat_values = stat_set.get("stats", {})
                    for espn_id, field_name in _STAT_MAP.items():
                        if espn_id in stat_values:
                            stats[field_name] = float(stat_values[espn_id])
                    break

            if not stats:
                continue

            projections.append(PlayerProjection(
                source="espn",
                first_name=first_name,
                last_name=last_name,
                team=team,
                position=position,
                **stats,
            ))

        return projections


if __name__ == "__main__":
    src = ESPNSource()
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
