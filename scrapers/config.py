"""Scoring configurations, team abbreviations, and name aliases."""

import os

# --- Scoring weights ---

SCORING_HALF_PPR = {
    "pass_yards": 0.04,
    "pass_tds": 4,
    "interceptions": -1,
    "rush_yards": 0.1,
    "rush_tds": 6,
    "receptions": 0.5,
    "rec_yards": 0.1,
    "rec_tds": 6,
    "fumbles_lost": -2,
}

SCORING_FULL_PPR = {
    **SCORING_HALF_PPR,
    "receptions": 1.0,
}

SCORING_STANDARD = {
    **SCORING_HALF_PPR,
    "receptions": 0.0,
}

SCORING_PRESETS = {
    "half-ppr": SCORING_HALF_PPR,
    "full-ppr": SCORING_FULL_PPR,
    "standard": SCORING_STANDARD,
}

# --- Paths ---

_ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
ADP_DIR = os.path.join(_ROOT, "best-ball-manager", "src", "assets", "adp")
OUTPUT_DIR = os.path.join(_ROOT, "best-ball-manager", "src", "assets")
CACHE_DIR = os.path.join(os.path.dirname(os.path.abspath(__file__)), "cache")

# --- Team abbreviation mapping ---

TEAM_ABBREV = {
    "Arizona Cardinals": "ARI",
    "Atlanta Falcons": "ATL",
    "Baltimore Ravens": "BAL",
    "Buffalo Bills": "BUF",
    "Carolina Panthers": "CAR",
    "Chicago Bears": "CHI",
    "Cincinnati Bengals": "CIN",
    "Cleveland Browns": "CLE",
    "Dallas Cowboys": "DAL",
    "Denver Broncos": "DEN",
    "Detroit Lions": "DET",
    "Green Bay Packers": "GB",
    "Houston Texans": "HOU",
    "Indianapolis Colts": "IND",
    "Jacksonville Jaguars": "JAX",
    "Kansas City Chiefs": "KC",
    "Las Vegas Raiders": "LV",
    "Los Angeles Chargers": "LAC",
    "Los Angeles Rams": "LAR",
    "Miami Dolphins": "MIA",
    "Minnesota Vikings": "MIN",
    "New England Patriots": "NE",
    "New Orleans Saints": "NO",
    "New York Giants": "NYG",
    "New York Jets": "NYJ",
    "Philadelphia Eagles": "PHI",
    "Pittsburgh Steelers": "PIT",
    "San Francisco 49ers": "SF",
    "Seattle Seahawks": "SEA",
    "Tampa Bay Buccaneers": "TB",
    "Tennessee Titans": "TEN",
    "Washington Commanders": "WAS",
}

# Reverse mapping: abbreviation -> full name
ABBREV_TO_TEAM = {v: k for k, v in TEAM_ABBREV.items()}

# --- Name aliases (normalized form -> canonical form) ---

NAME_ALIASES = {
    "gabe davis": "gabriel davis",
    "kenny walker": "kenneth walker",
    "ken walker": "kenneth walker",
    "josh palmer": "joshua palmer",
    "mike evans": "michael evans",
    "mike williams": "michael williams",
    "mike thomas": "michael thomas",
    "rob gronkowski": "robert gronkowski",
    "pat mahomes": "patrick mahomes",
    "matt stafford": "matthew stafford",
    "alex mattison": "alexander mattison",
    "scotty miller": "scott miller",
    "danny dimes": "daniel jones",
    "danny jones": "daniel jones",
    "chris olave": "christopher olave",
    "chris godwin": "christopher godwin",
    "zay jones": "isaiah jones",
    "dk metcalf": "d.k. metcalf",
    "aj brown": "a.j. brown",
    "aj dillon": "a.j. dillon",
    "tj hockenson": "t.j. hockenson",
    "jk dobbins": "j.k. dobbins",
    "dj moore": "d.j. moore",
    "kj osborn": "k.j. osborn",
    "hollywood brown": "marquise brown",
    "terry mclaurin": "terrance mclaurin",
    "laviska shenault": "laviska shenault jr",
    "marvin jones": "marvin jones jr",
    "will levis": "william levis",
    "josh allen qb": "josh allen",
    "josh allen jax": "josh allen",
    "amon ra st brown": "amon-ra st. brown",
    "amon-ra st brown": "amon-ra st. brown",
    "amon ra st. brown": "amon-ra st. brown",
    "brian robinson": "brian robinson jr",
    "michael pittman": "michael pittman jr",
    "odell beckham": "odell beckham jr",
    "irv smith": "irv smith jr",
    "ray davis": "ray davis",
    "bucky irving": "bucky irving",
    "tank dell": "nathaniel dell",
    "rome odunze": "rome odunze",
}
