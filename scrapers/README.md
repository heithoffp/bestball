# Player Projection Aggregator

Standalone Python script that scrapes fantasy football projections from multiple free sources, averages them into consensus rankings, and outputs a CSV compatible with the Best Ball Manager app.

## Sources

| Source | Type | Data |
|--------|------|------|
| **Underdog** | Local CSV | Pre-computed fantasy points from ADP snapshots already on disk |
| **FantasyPros** | Web scrape | Raw stats (pass/rush/rec yards, TDs, etc.) from season projection tables |
| **ESPN API** | JSON API | Raw stats from ESPN's fantasy football projections endpoint |
| **Mike Clay (ESPN)** | PDF parse | Raw stats from Clay's projection guide PDF via PyMuPDF |
| **CBS Sports** | Web scrape | Currently unavailable — requires JS rendering |

For sources that provide raw stats, fantasy points are computed using the selected scoring weights. For points-only sources (Underdog), the pre-computed value is averaged directly with the stat-based total.

## Setup

```bash
pip install -r scrapers/requirements.txt
```

## Usage

Run from the project root (`BestBall/`):

```bash
# Default: all sources, half-PPR scoring, writes to app assets
python -m scrapers.main

# Preview without writing files
python -m scrapers.main --dry-run

# Use cached data (skips network calls if today's cache exists)
python -m scrapers.main --use-cache

# Specific sources only
python -m scrapers.main --sources underdog,fantasypros,clay

# Different scoring format
python -m scrapers.main --scoring full-ppr

# Debug logging (shows fuzzy matches, unmatched players)
python -m scrapers.main --verbose
```

### CLI Flags

| Flag | Default | Description |
|------|---------|-------------|
| `--scoring` | `half-ppr` | Scoring format: `half-ppr`, `full-ppr`, `standard` |
| `--sources` | all | Comma-separated source names |
| `--output` | `best-ball-manager/src/assets/projections.csv` | Output path for app-compatible CSV |
| `--use-cache` | off | Use today's cached data instead of fetching |
| `--dry-run` | off | Print top 30 to stdout, don't write files |
| `--verbose` | off | Enable debug logging |

## Output Files

| File | Location | Purpose |
|------|----------|---------|
| `projections.csv` | `best-ball-manager/src/assets/` | App-compatible CSV (same format as `rankings.csv`) |
| `projections_debug.csv` | Project root | Per-source breakdown with points, dates, averaged stats, and variance |

The debug CSV columns include:
- `{source}_pts` — fantasy points from each individual source (blank if source doesn't have that player)
- `{source}_date` — date the source data was fetched/published
- `spread_pct` — variance across sources as a percentage
- `avg_*` — averaged raw stats across stat-providing sources

## Caching

Fetched data is cached in `scrapers/cache/` as `{source}_{YYYY-MM-DD}.json`. Use `--use-cache` to skip network calls when iterating on aggregation logic. Delete the cache directory to force a full refresh.

## Adding a New Source

1. Create `scrapers/sources/my_source.py`:

```python
from typing import List
from scrapers.models import PlayerProjection
from scrapers.sources.base import BaseSource

class MySource(BaseSource):
    @property
    def name(self) -> str:
        return "mysource"  # used in CLI, cache filenames, and CSV columns

    def fetch_projections(self) -> List[PlayerProjection]:
        # Fetch data however you need to
        resp = self._request_with_retry("https://example.com/projections")

        projections = []
        for player in parse_response(resp):
            projections.append(PlayerProjection(
                source="mysource",
                first_name=player["first"],
                last_name=player["last"],
                team=player["team"],           # full name e.g. "Buffalo Bills"
                position=player["pos"],         # QB, RB, WR, or TE
                # Raw stats (set whichever are available):
                pass_yards=0.0,
                pass_tds=0.0,
                interceptions=0.0,
                rush_yards=0.0,
                rush_tds=0.0,
                receptions=0.0,
                rec_yards=0.0,
                rec_tds=0.0,
                fumbles_lost=0.0,
                # OR if you only have a total points value:
                # fantasy_points=player["pts"],  (leave stat fields at 0)
            ))
        return projections
```

2. Register it in `scrapers/main.py` inside `_register_external_sources()`:

```python
try:
    from scrapers.sources.my_source import MySource
    SOURCE_REGISTRY["mysource"] = MySource
except ImportError:
    pass
```

3. If your source has its own published date, add a `get_data_date()` method returning a string — the aggregator will use it in the debug CSV instead of today's date.

### Inherited from BaseSource

- `_request_with_retry(url, headers, max_retries, delay)` — GET with exponential backoff on 429/503
- `_rate_limit(seconds)` — sleep between requests
- Caching via `_get_cached()` / `_set_cached()` — automatic JSON cache per source per day

### Key design notes

- **Raw stats preferred**: Sources that provide individual stats (yards, TDs, etc.) are averaged at the stat level, then points are computed from the average. This produces better consensus than averaging final point totals.
- **Points-only sources are fine**: If a source only provides a total fantasy points number (like Underdog), set `fantasy_points` and leave stat fields at 0. The aggregator handles both types.
- **Name matching is automatic**: The aggregator normalizes names (strips suffixes, periods, case) and resolves aliases via `scrapers/config.py:NAME_ALIASES`. Add entries there for known mismatches. Fuzzy matching (90% threshold) catches the rest.
- **Team metadata prefers Underdog**: Since Underdog has current-season data, its team assignments take priority over other sources when there are conflicts.
