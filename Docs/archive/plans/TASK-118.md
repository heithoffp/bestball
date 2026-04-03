<!-- Completed: 2026-04-03 | Commit: cee9a97 -->
# TASK-118: ETL — Stream BBM 6 picks into clean intermediate format

**Status:** Approved
**Priority:** P2

---

## Objective

Build a streaming Python ETL script that reads the 4.9GB `best_ball_mania_vi_rd1.csv` in
chunks, filters to human picks in rounds 1–6 only, and writes a compact CSV containing one
row per pick. This intermediate file is the data foundation for TASK-119 (fit σ(ADP)) and
TASK-120 (fit roster-state position modifiers).

## Verification Criteria

1. Output file `simulation/Historical_Data/bbm6_picks_rd1_6.csv` exists after running the script.
2. Every row has `team_pick_number` between 1 and 6 (inclusive).
3. Every row has `source = user` filtered out — i.e., no auto-picks remain. (Confirmed by checking that no `source` column with non-user values appears, or by spot-checking.)
4. Columns present: `draft_id`, `pick_order`, `overall_pick_number`, `team_pick_number`, `player_name`, `player_id`, `position_name`, `projection_adp`.
5. `projection_adp` is numeric (float) — no nulls in valid rows.
6. Row count printed to console is consistent with a sanity check: 12 teams × 6 rounds = 72 picks per draft; total rows ÷ 72 ≈ number of unique draft_ids.
7. Script runs to completion without OOM error on the 4.9GB file.

## Verification Approach

1. Run `python simulation/etl_bbm6.py` — confirm it completes with a summary line like:
   `Done. Wrote N rows from M drafts.`
2. Run a quick Python check:
   ```python
   import pandas as pd
   df = pd.read_csv('simulation/Historical_Data/bbm6_picks_rd1_6.csv')
   print(df.shape)
   print(df.dtypes)
   print(df['team_pick_number'].between(1, 6).all())
   print(df['projection_adp'].notna().all())
   print(df.columns.tolist())
   ```
   Confirm: all `team_pick_number` values in [1,6], no NaN ADPs, expected columns present.
3. Spot-check one draft: filter to a single `draft_id`, confirm exactly 72 rows (12 teams × 6 rounds).

## Files to Change

| File | Action | Description |
|------|--------|-------------|
| `simulation/etl_bbm6.py` | Create | Streaming ETL script |
| `simulation/Historical_Data/bbm6_picks_rd1_6.csv` | Create (output) | Intermediate picks dataset |

## Implementation Approach

### Decisions resolved from the Draft

- **Output format:** CSV — simplest for downstream pandas/numpy in TASK-119 and TASK-120.
- **Output shape:** One row per pick — each row is one observation for σ(ADP) fitting.
  Roster state (position counts at time of pick) is NOT pre-computed here; TASK-120 will
  reconstruct it by sorting on `(draft_id, overall_pick_number)` and using cumulative
  position counts — no need to encode this during ETL.

### Columns to keep

From the raw CSV: `draft_id`, `pick_order` (team's slot 1–12), `overall_pick_number`,
`team_pick_number`, `player_name`, `player_id`, `position_name`, `projection_adp`.

Drop: `user_id`, `username`, all timestamp columns, `draft_clock`, `tournament_entry_id`,
`tournament_round_draft_entry_id`, `tournament_round_number`, `source`, `pick_points`,
`roster_points`, `made_playoffs`, `draft_entry_id`.

### Filters

1. `team_pick_number <= 6` — rounds 1–6 only.
2. All pick sources included (`user`, `auto`, `queue`) — auto-picks represent real draft
   behavior and are equally valid for calibrating the pick distribution.
3. `position_name` in `{QB, RB, WR, TE, K, DEF}` — keep all; downstream tasks will
   filter by position as needed.

### Streaming approach

Use `pandas.read_csv(..., chunksize=200_000)` to read the 4.9GB file in ~200K-row chunks.
For each chunk:
1. Apply the two filters above.
2. Select only the 8 columns to keep.
3. Cast `projection_adp` to float, drop rows where it is NaN.
4. Append to output CSV (write header on first chunk, `mode='a'` thereafter).

Print progress every N chunks and a final summary line.

### Script structure

```python
# simulation/etl_bbm6.py
KEEP_COLS = ['draft_id', 'pick_order', 'overall_pick_number', 'team_pick_number',
             'player_name', 'player_id', 'position_name', 'projection_adp']
INPUT_PATH = 'simulation/Historical_Data/best_ball_mania_vi_rd1.csv'
OUTPUT_PATH = 'simulation/Historical_Data/bbm6_picks_rd1_6.csv'
CHUNK_SIZE = 200_000

for i, chunk in enumerate(pd.read_csv(INPUT_PATH, chunksize=CHUNK_SIZE, usecols=KEEP_COLS + ['source'])):
    filtered = chunk[(chunk['source'] == 'user') & (chunk['team_pick_number'] <= 6)].copy()
    filtered = filtered.drop(columns=['source'])
    filtered['projection_adp'] = pd.to_numeric(filtered['projection_adp'], errors='coerce')
    filtered = filtered.dropna(subset=['projection_adp'])
    write_header = (i == 0)
    filtered.to_csv(OUTPUT_PATH, mode='w' if write_header else 'a', header=write_header, index=False)
    if i % 10 == 0:
        print(f'  chunk {i} processed...')

print(f'Done. Wrote N rows from M drafts.')
```

Final two lines should compute and print actual row count and unique `draft_id` count from
the output file.

## Dependencies

None — `simulation/Historical_Data/best_ball_mania_vi_rd1.csv` already exists.

---
*Approved by: <!-- developer name/initials and date once approved -->*
