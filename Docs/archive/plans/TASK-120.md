<!-- Completed: 2026-04-03 | Commit: cee9a97 -->
# TASK-120: Fit roster-state position modifiers and team stacking multipliers

**Status:** Pending Approval
**Priority:** P2

---

## Objective

Using the BBM6 picks dataset from TASK-118, (1) augment it with each player's NFL team by joining to ADP snapshot CSVs, (2) compute empirical position selection multipliers conditioned on the roster's current position counts, and (3) compute empirical team stacking multipliers conditioned on how many same-team players are already on the roster. All modifiers are written to `simulation/calibration.json` for use by the simulation engine. Team stacking is prioritized because it drives major structural differences in real drafts — a drafter with a QB from team T is meaningfully more likely to add that QB's receivers.

## Verification Criteria

1. `simulation/Historical_Data/bbm6_picks_rd1_6.csv` gains a `player_team` column; ≥ 90% of rows have a non-empty team value.
2. `simulation/calibration.json` gains a `position_modifiers` key containing at least the most common roster states (e.g., `"QB0RB0WR0TE0"`, `"QB0RB1WR1TE0"`).
3. `simulation/calibration.json` gains a `stacking_multipliers` key with keys `"0"`, `"1"`, `"2"` as floats.
4. All position multipliers are positive floats; states with < 500 observations are absent (no noisy estimates).
5. Stacking multiplier for `"0"` equals `1.0` (baseline); multipliers for `"1"` and `"2"` are > 1.0 (empirical stacking signal must be present — if they're ≤ 1.0, flag it in output for developer review).
6. `fit_modifiers.py` runs to completion, printing a summary table of state coverage and stacking lifts.

## Verification Approach

1. Run `python simulation/etl_add_team.py` — confirm it prints a summary like:
   `Done. Matched N/M rows (X%). Unmatched: [list of player names].`
2. Spot-check the augmented CSV: sample 5 rows and confirm `player_team` is populated.
3. Run `python simulation/fit_modifiers.py` — confirm it completes without errors and prints state coverage and stacking summary.
4. Run a quick Python check:
   ```python
   import json
   cal = json.load(open('simulation/calibration.json'))
   assert 'position_modifiers' in cal
   assert 'stacking_multipliers' in cal
   sm = cal['stacking_multipliers']
   assert sm['0'] == 1.0
   print('stack lift k=1:', sm['1'])
   print('stack lift k=2:', sm['2'])
   pm = cal['position_modifiers']
   print('# position modifier states:', len(pm))
   ```
   Confirm all assertions pass and print values look reasonable.

## Files to Change

| File | Action | Description |
|------|--------|-------------|
| `simulation/etl_add_team.py` | Create | Join ADP snapshot team names to picks CSV; adds `player_team` column |
| `simulation/fit_modifiers.py` | Create | Fit and output position modifiers + stacking multipliers |
| `simulation/Historical_Data/bbm6_picks_rd1_6.csv` | Modify | Add `player_team` column in-place |
| `simulation/calibration.json` | Modify | Add `position_modifiers` and `stacking_multipliers` sections |

## Implementation Approach

### Step 1 — `etl_add_team.py`: augment picks with NFL team

1. Load **only the earliest** ADP snapshot from `best-ball-manager/src/assets/adp/` (sort filenames ascending, take index 0). Pre-free-agency team assignments are more accurate for BBM6, which was drafted before the roster moves of free agency. ADP snapshot format: columns `firstName`, `lastName`, `teamName`.

2. Normalize player names for join: strip leading/trailing whitespace, remove `.` and `-`, collapse multiple spaces, lowercase everything. Apply the same normalization to both the lookup dict keys and the picks `player_name` values.

3. Read `bbm6_picks_rd1_6.csv`. For each row, look up `normalized(player_name)` in the lookup dict. Assign `player_team` if found, else empty string.

4. Write the augmented CSV back to `bbm6_picks_rd1_6.csv` with `player_team` appended as the last column.

5. Print a match report: total rows, matched count, unmatched count, list of unmatched names (deduplicated) sorted alphabetically for manual review.

### Step 2 — `fit_modifiers.py`: position modifiers

Reconstruct roster state at each pick:
- Sort all picks by `(draft_id, overall_pick_number)`.
- Group by `draft_id`. Within each draft, iterate picks in order, maintaining a running count dict `{QB, RB, WR, TE, K, DEF}` per team (keyed by `pick_order`).
- At pick p: roster state for that team is the count dict BEFORE this pick is added.

Encode roster state as a string key:
- `QB` capped at 2 → `0, 1, 2`
- `RB` capped at 3 → `0, 1, 2, 3`
- `WR` capped at 3 → `0, 1, 2, 3`
- `TE` capped at 2 → `0, 1, 2`
- K/DEF ignored (positions we don't model in the engine)
- Key format: `"QB{n}RB{n}WR{n}TE{n}"` (e.g., `"QB1RB2WR1TE0"`)

Compute conditional distributions:
- Accumulate `counts[state_key][position_picked]` for positions QB/RB/WR/TE only.
- Compute marginal `P(position)` across all picks.
- For each state with ≥ 500 total observations, compute `multiplier[pos] = (n[pos]/total_state) / P(pos)`.
- Discard states below 500 observations entirely.

### Step 3 — `fit_modifiers.py`: team stacking multipliers

Using the reconstructed per-team roster from Step 2:
- At each pick p (for team T_pick, picking player with team NFL_team):
  - `n_same_team` = count of players already on T_pick's roster with `player_team == NFL_team`.
  - Skip picks where `player_team` is empty.
- Bucket picks by `n_same_team` = 0, 1, 2 (cap at 2).

Compute null rate for normalization:
- From the ADP snapshot (earliest file), count how many players each NFL team has with ADP ≤ 120. Call this `team_sizes[team]`.
- Total draftable players N = sum(team_sizes).
- For a roster with `k` players from team T already, the null probability of picking another player from team T is approximately `(team_sizes[T] - k) / (N - roster_size)`. Since this varies by team and pick context, use a simplified aggregate:
  - Null rate for `n_same_team = k` = (mean team size - k) / (N - mean_roster_size_at_that_point).
  - Use mean_roster_size across all picks in that bucket as the roster size denominator.

Stacking multiplier:
- `observed_rate[k]` = count(picks where n_same_team = k) / total_picks_with_teams (excluding k=0 baseline adjusts itself).
- `null_rate[k]` = computed as above.
- `stack_multiplier[k]` = `observed_rate[k] / null_rate[k]`.
- Force `stack_multiplier[0] = 1.0` by definition (baseline).
- Print lift values for review.

### Step 4 — write to `calibration.json`

Merge new keys into the existing `calibration.json` without overwriting existing keys (`sigma_slope`, `sigma_intercept`, etc.):

```json
{
  "sigma_slope": ...,
  "sigma_intercept": ...,
  "position_modifiers": {
    "QB0RB0WR0TE0": {"QB": 1.2, "RB": 0.9, "WR": 1.0, "TE": 0.8},
    ...
  },
  "stacking_multipliers": {
    "0": 1.0,
    "1": 1.45,
    "2": 1.9
  }
}
```

Read, update, write with `json.dump(..., indent=2)`.

## Dependencies

TASK-118 — requires `simulation/Historical_Data/bbm6_picks_rd1_6.csv` to exist.
TASK-119 — requires `simulation/calibration.json` to exist (will be updated, not replaced).

## Open Questions

- Unmatched player names (~6% from sample): most are likely name formatting differences (e.g., `DJ Moore` vs `D.J. Moore`) or rookies/practice squad players not in the ADP snapshot. Unmatched rows are excluded from stacking modifier fitting; they still contribute to position modifier fitting (position is already in the picks dataset).
- Round-specific modifiers: current plan is round-agnostic (pool all rounds together). If empirical data shows round 1 vs round 6 behavior is qualitatively different for position modifiers, a follow-up task can add round stratification.
- Null rate computation for stacking uses a simplification (mean team size / mean pool size) rather than a per-draft reconstruction. This is a deliberate approximation — accurate enough for a multiplier that will likely be in [1.0, 2.5] range.

---
*Approved by: <!-- developer name/initials and date once approved -->*
