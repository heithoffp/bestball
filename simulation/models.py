"""Player model and draft state for the uniqueness simulation."""

import csv
import os
import re
from dataclasses import dataclass, field


@dataclass
class Player:
    display_name: str
    position: str
    team: str
    adp: float
    player_id: str

    @staticmethod
    def make_id(first_name: str, last_name: str, position: str, team: str) -> str:
        """Generate player_id matching the JS app's format in helpers.js:175.

        JS: `id-${displayName}-${pos}-${team}`.replace(/[^\\w-]/g, '')
        JS \\w is ASCII-only: [a-zA-Z0-9_]. Use re.ASCII to match.
        """
        raw = f"id-{first_name} {last_name}-{position}-{team}"
        return re.sub(r"[^\w-]", "", raw, flags=re.ASCII)


@dataclass
class DraftState:
    """Tracks state during a single simulated draft."""

    num_teams: int = 12
    num_rounds: int = 6
    available: list = field(default_factory=list)
    # Each team's picks: team_index -> list of Player
    team_rosters: dict = field(default_factory=dict)

    def __post_init__(self):
        self.team_rosters = {i: [] for i in range(self.num_teams)}

    @property
    def total_picks(self) -> int:
        return self.num_teams * self.num_rounds

    def pick_order(self):
        """Yield (overall_pick_number, team_index) in snake draft order."""
        pick = 1
        for rnd in range(self.num_rounds):
            teams = range(self.num_teams) if rnd % 2 == 0 else range(self.num_teams - 1, -1, -1)
            for team_idx in teams:
                yield pick, team_idx
                pick += 1


def _load_players_from_file(path: str, adp_cutoff: float) -> tuple:
    """Load players from a single ADP CSV file.

    Returns:
        Tuple of (players, adp_date) where players is sorted by ADP ascending.
    """
    adp_date = os.path.basename(path).replace("underdog_adp_", "").replace(".csv", "")
    players = []
    with open(path, newline="", encoding="utf-8") as f:
        reader = csv.DictReader(f)
        for row in reader:
            first_name = (row.get("firstName") or "").strip()
            last_name = (row.get("lastName") or "").strip()
            adp_raw = row.get("adp", "")
            position = (row.get("slotName") or "").strip()
            team = (row.get("teamName") or "").strip()

            if not first_name or not last_name or not position:
                continue
            try:
                adp = float(adp_raw)
            except (ValueError, TypeError):
                continue
            if adp > adp_cutoff:
                continue

            player_id = Player.make_id(first_name, last_name, position, team)
            display_name = f"{first_name} {last_name}"
            players.append(Player(display_name, position, team, adp, player_id))

    players.sort(key=lambda p: p.adp)
    return players, adp_date


def load_players(adp_dir: str, adp_cutoff: float = 120.0) -> tuple:
    """Load players from the latest ADP CSV snapshot.

    Args:
        adp_dir: Path to the directory containing underdog_adp_YYYY-MM-DD.csv files.
        adp_cutoff: Maximum ADP to include (players beyond this are excluded).

    Returns:
        Tuple of (players, adp_date) where players is sorted by ADP ascending.
    """
    csv_files = sorted(
        f for f in os.listdir(adp_dir)
        if f.startswith("underdog_adp_") and f.endswith(".csv")
    )
    if not csv_files:
        raise FileNotFoundError(f"No ADP CSV files found in {adp_dir}")

    latest_path = os.path.join(adp_dir, csv_files[-1])
    return _load_players_from_file(latest_path, adp_cutoff)


def load_epoch_snapshots(adp_dir: str, adp_cutoff: float = 120.0) -> list:
    """Return one (date_str, players) tuple per ISO calendar week (last snapshot of each week).

    Groups all underdog_adp_YYYY-MM-DD.csv files by ISO year-week and picks the last
    file in each group as the epoch representative. Returns list sorted by date ascending.

    Args:
        adp_dir: Path to the directory containing underdog_adp_YYYY-MM-DD.csv files.
        adp_cutoff: Maximum ADP to include (players beyond this are excluded).

    Returns:
        List of (adp_date, players) tuples, one per ISO week, sorted ascending.
    """
    from datetime import date as _date

    csv_files = sorted(
        f for f in os.listdir(adp_dir)
        if f.startswith("underdog_adp_") and f.endswith(".csv")
    )
    if not csv_files:
        raise FileNotFoundError(f"No ADP CSV files found in {adp_dir}")

    # Group by ISO year-week, keep last file per week (files sorted ascending)
    by_week = {}
    for fname in csv_files:
        date_str = fname.replace("underdog_adp_", "").replace(".csv", "")
        y, m, d = map(int, date_str.split("-"))
        iso_week = _date(y, m, d).isocalendar()[:2]  # (iso_year, iso_week)
        by_week[iso_week] = fname

    epochs = []
    for week_key in sorted(by_week):
        path = os.path.join(adp_dir, by_week[week_key])
        players, adp_date = _load_players_from_file(path, adp_cutoff)
        epochs.append((adp_date, players))
    return epochs
