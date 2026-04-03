<!-- Completed: 2026-04-03 | Commit: cee9a97 -->
# TASK-114: Uniqueness simulation — temporal weighting across ADP epochs

**Status:** Pending Approval
**Priority:** P2

---

## Objective
Extend the simulation to run across multiple ADP epochs (weekly buckets) with equal-weight aggregation, so that a roster that was "chalk" in February but impossible in August is correctly represented as rare in the final aggregate distribution. The output merges frequency and conditional probability tables from all epochs into one unified artifact.

## Verification Criteria
1. `python simulate.py --multi-epoch --pilot` completes without error.
2. ~9 epochs are selected (one per ISO week: roughly Feb 4 through Apr 2, 2026).
3. Output metadata includes `"multi_epoch": true`, `"epochs": [...]` (~9 entries), and `"sims_per_epoch"`.
4. `total_unique_combos` in the pilot report is meaningfully larger than a single-epoch run at the same total sim count (expected — nine different ADP snapshots produce more diversity).
5. Total rosters in metadata = `pilot_sims × num_teams` (same formula as single-epoch).
6. Single-epoch mode (no flag) is unchanged — existing behavior and output format unaffected.

## Verification Approach
1. Run single-epoch pilot for baseline: `python simulate.py --pilot` → note `total_unique_combos`.
2. Run multi-epoch pilot: `python simulate.py --multi-epoch --pilot`.
3. Confirm ~9 epoch entries in metadata output (one per ISO week in the snapshot directory).
4. Confirm `total_unique_combos` is higher than single-epoch baseline.
5. Confirm `total_rosters = 100000 × 12 = 1,200,000` in metadata.
6. Inspect `pilot_report.json` for `multi_epoch`, `epochs`, `sims_per_epoch` keys.

## Files to Change
| File | Action | Description |
|------|--------|-------------|
| `simulation/models.py` | Modify | Extract CSV loading into `_load_players_from_file()` helper; add `load_epoch_snapshots()` |
| `simulation/simulate.py` | Modify | Add `--multi-epoch` flag; loop over epochs, merge results |

## Implementation Approach

### Step 1: `simulation/models.py` — refactor and add epoch loader

Extract the CSV-parsing body of `load_players()` into a private helper:

```python
def _load_players_from_file(path: str, adp_cutoff: float) -> tuple[list[Player], str]:
    """Load players from a single ADP CSV file. Returns (players, adp_date)."""
    adp_date = os.path.basename(path).replace("underdog_adp_", "").replace(".csv", "")
    players = []
    with open(path, newline="", encoding="utf-8") as f:
        reader = csv.DictReader(f)
        for row in reader:
            # ... existing parsing logic (unchanged) ...
    players.sort(key=lambda p: p.adp)
    return players, adp_date
```

Update `load_players()` to call `_load_players_from_file()` on the latest file (no behavior change).

Add new function:

```python
def load_epoch_snapshots(adp_dir: str, adp_cutoff: float = 120.0) -> list[tuple[str, list[Player]]]:
    """Return one (date_str, players) tuple per ISO calendar week (last snapshot of each week).

    Groups all underdog_adp_YYYY-MM-DD.csv files by ISO year-week and picks the last
    file in each group as the epoch representative. Returns list sorted by date ascending.
    """
    from datetime import date as _date
    csv_files = sorted(
        f for f in os.listdir(adp_dir)
        if f.startswith("underdog_adp_") and f.endswith(".csv")
    )
    # Group by ISO year-week, keep last file per week
    by_week = {}
    for fname in csv_files:
        date_str = fname.replace("underdog_adp_", "").replace(".csv", "")
        y, m, d = map(int, date_str.split("-"))
        iso_week = _date(y, m, d).isocalendar()[:2]  # (year, week)
        by_week[iso_week] = fname  # last wins — files are sorted ascending

    epochs = []
    for week_key in sorted(by_week):
        fname = by_week[week_key]
        path = os.path.join(adp_dir, fname)
        players, adp_date = _load_players_from_file(path, adp_cutoff)
        epochs.append((adp_date, players))
    return epochs
```

### Step 2: `simulation/simulate.py` — add `--multi-epoch` flag and merge loop

Add argument:
```python
parser.add_argument("--multi-epoch", action="store_true",
                    help="Run simulation across one epoch per ISO week (equal weight)")
```

Add multi-epoch branch after arg parsing, before the single-epoch flow:

```python
if args.multi_epoch:
    from models import load_epoch_snapshots
    epochs = load_epoch_snapshots(adp_dir, adp_cutoff=args.adp_cutoff)
    n_epochs = len(epochs)
    base_sims = num_sims // n_epochs
    remainder = num_sims - base_sims * n_epochs

    merged_combo_counts = defaultdict(int)
    merged_combo_players = {}
    merged_pick_events = []

    for epoch_idx, (adp_date, players) in enumerate(epochs):
        epoch_sims = base_sims + (remainder if epoch_idx == n_epochs - 1 else 0)
        epoch_seed = args.seed + epoch_idx
        print(f"  Epoch {epoch_idx+1}/{n_epochs}: {adp_date}  ({epoch_sims:,} sims, seed={epoch_seed})")
        cc, cp, pe = run_simulation(players, epoch_sims, ..., seed=epoch_seed, calibration=cal)
        for k, v in cc.items():
            merged_combo_counts[k] += v
            if k not in merged_combo_players:
                merged_combo_players[k] = cp[k]
        merged_pick_events.extend(pe)

    combo_counts = dict(merged_combo_counts)
    combo_players = merged_combo_players
    pick_events = merged_pick_events

    metadata["multi_epoch"] = True
    metadata["epochs"] = [date for date, _ in epochs]
    metadata["sims_per_epoch"] = base_sims
    metadata["adp_date"] = epochs[-1][0]  # most recent epoch
else:
    # existing single-epoch flow unchanged
```

The rest of the script (output generation, pilot report) runs identically on the merged data.

### Edge cases
- If only one week has data, `n_epochs = 1` — effectively single-epoch with the weekly representative.
- `remainder` is added to the last epoch so `sum(epoch_sims) == num_sims` exactly.
- Per-epoch seeds are deterministic: `base_seed + epoch_idx`.

## Dependencies
- TASK-113 — Cancelled (superseded by TASK-120 + TASK-122, both Done)
- All ADP snapshots in `best-ball-manager/src/assets/adp/` (26 files, Feb–Apr 2026)

---
*Approved by: Patrick — 2026-04-03*
