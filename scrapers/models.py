"""Core data model for player projections."""

from dataclasses import dataclass, field


@dataclass
class PlayerProjection:
    source: str
    first_name: str
    last_name: str
    team: str
    position: str
    pass_yards: float = 0.0
    pass_tds: float = 0.0
    interceptions: float = 0.0
    rush_yards: float = 0.0
    rush_tds: float = 0.0
    receptions: float = 0.0
    rec_yards: float = 0.0
    rec_tds: float = 0.0
    fumbles_lost: float = 0.0
    fantasy_points: float = 0.0

    @property
    def full_name(self):
        return f"{self.first_name} {self.last_name}"

    @property
    def has_raw_stats(self):
        """Whether this projection has stat-level data (vs just a points total)."""
        return any([
            self.pass_yards, self.pass_tds, self.interceptions,
            self.rush_yards, self.rush_tds, self.receptions,
            self.rec_yards, self.rec_tds, self.fumbles_lost,
        ])
