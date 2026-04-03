# TASK-112: Uniqueness simulation engine MVP — Python Conditional Logit draft simulator

**Status:** Approved
**Priority:** P2

---

## Objective
Build a Python Monte Carlo draft simulator using the Conditional Logit (Plackett-Luce) model with base utility only (ADP Gaussian, no behavioral multipliers). Simulates 12-team snake drafts through 6 rounds using a single ADP epoch (latest snapshot). Outputs both a Tier 1 exact frequency table and Tier 2 conditional probability tables per ADR-003. Includes a 100K pilot run to validate distribution shape, sparsity, and asset size before committing to full-scale simulation.

## Verification Criteria
1. 100K pilot completes in under 5 minutes on a standard machine.
2. Tier 1 frequency table contains combos with count ≥ 2; top-frequency combos contain high-ADP players drafted in expected round ranges (chalk validation).
3. Player IDs in simulation output match the JS app's format exactly — `id-{DisplayName}-{POS}-{Team}` with non-word/non-hyphen characters stripped (regex `[^\w-]`). Spot-check 5+ players against `processMasterList()` output.
4. Tier 2 conditional probability tables: for each round × position-context combination, probabilities sum to ~1.0 (within floating-point tolerance of 0.001).
5. Both Tier 1 and Tier 2 output files are valid JSON, parseable by `JSON.parse()`.
6. Pilot report includes: unique combo count, combos with count ≥ 2, max frequency, p50/p90/p99 frequency percentiles, Tier 1 JSON size (raw + gzipped), Tier 2 JSON size.

## Verification Approach
1. Run `cd simulation && pip install -r requirements.txt && python simulate.py --pilot` — should complete without errors and print the pilot report to stdout.
2. Inspect `simulation/output/pilot_report.json` — confirm it contains all metrics from criterion 6.
3. Open `simulation/output/tier1_frequency.json` in Python and verify:
   - Top 5 combos by frequency contain recognizable chalk players (Bijan Robinson, Ja'Marr Chase, etc. in round-appropriate positions).
   - No combo has count < 2.
4. Open `simulation/output/tier2_conditional.json` and verify:
   - For round 1 with empty position context, sum of all player probabilities ≈ 1.0.
   - For round 3 with a sample position context (e.g., "RB,WR"), probabilities sum ≈ 1.0.
5. Run a quick player ID cross-check: parse the latest ADP CSV, generate IDs using the Python function, and compare against 5 manually-computed IDs using the JS formula.
6. Developer confirms pilot report numbers look reasonable (e.g., not all combos are singletons, not all combos are the same).

## Files to Change
| File | Action | Description |
|------|--------|-------------|
| `simulation/simulate.py` | Create | Main entry point — CLI args, orchestrates loading → simulation → output |
| `simulation/models.py` | Create | Player dataclass, DraftState class tracking available players and team rosters |
| `simulation/engine.py` | Create | Conditional Logit base utility, Plackett-Luce sampling, snake draft loop |
| `simulation/output.py` | Create | Tier 1 frequency table and Tier 2 conditional probability generation + JSON export |
| `simulation/requirements.txt` | Create | numpy dependency |
| `simulation/output/.gitkeep` | Create | Ensure output directory exists in repo |
| `.gitignore` | Modify | Add `simulation/output/*.json` to ignore generated output files |

## Implementation Approach

### Resolved Open Questions
- **ADP σ**: Linear scaling — `σ(ADP) = 0.1 × ADP + 1.5`. This gives tight consensus at the top (σ≈1.5 at pick 1) and wider variance in later rounds (σ≈7.5 at pick 60). Coefficients tunable via CLI args `--sigma-slope` and `--sigma-intercept`.
- **Simulation count**: 100K pilot first, 1M for full run. Both configurable via CLI.
- **Player ID scheme**: Replicate JS formula exactly — `f"id-{firstName} {lastName}-{position}-{team}"` then strip `[^\w-]` via `re.sub(r'[^\w-]', '', ...)`. This matches `helpers.js:175`.
- **Draftable cutoff**: ADP ≤ 120. The simulation drafts 6 rounds (72 picks per draft = picks 1–72), but players with ADP up to ~120 can appear in rounds 1–6 given σ=4.0 Gaussian spread.

### Step 1: Data loading (`models.py`, `simulate.py`)
1. Find the latest ADP CSV in `best-ball-manager/src/assets/adp/` by sorting filenames (format: `underdog_adp_YYYY-MM-DD.csv`).
2. Parse CSV columns: `firstName`, `lastName`, `adp`, `slotName` (position), `teamName`.
3. Build `Player` dataclass: `display_name`, `position`, `team`, `adp` (float), `player_id` (string).
4. Generate `player_id` using the JS-matching formula:
   ```python
   raw = f"id-{first_name} {last_name}-{slot_name}-{team_name}"
   player_id = re.sub(r'[^\w-]', '', raw)
   ```
5. Filter to players with `adp ≤ 120.0`. Skip rows with missing/invalid ADP.
6. Sort by ADP ascending for deterministic ordering.

### Step 2: Simulation engine (`engine.py`)
1. **Base utility function**: For player with ADP `a` at current pick number `p`:
   ```
   σ(a) = 0.1 * a + 1.5
   U(a, p) = exp(-0.5 * ((p - a) / σ(a))²)
   ```
   This is the Gaussian PDF (without normalization constant — we only need relative utilities). σ scales linearly with ADP — tight at the top (σ≈1.5 at ADP 1), wider in later rounds (σ≈7.5 at ADP 60).

2. **Plackett-Luce selection**: Given utilities for all available players:
   - Compute probabilities: `P(i) = U(i) / Σ U(j)` for all available j
   - Sample one player from this categorical distribution using `numpy.random.choice`

3. **Snake draft loop**:
   - 12 teams, 6 rounds, snake order (round 1: teams 1→12, round 2: teams 12→1, etc.)
   - Track available player pool (starts as all draftable players, shrinks each pick)
   - Track each team's roster (list of player_ids)
   - Overall pick number increments 1→72 across the draft

4. **Per-simulation output**: For each of the 12 teams, produce a sorted tuple of 6 player_ids. This is the "combo key."

5. **Recording for Tier 2**: During each pick, record `(round, position_context, player_picked)` where `position_context` is the frozenset of positions already on the team. This feeds the conditional probability tables.

### Step 3: Output generation (`output.py`)

**Tier 1 — Frequency table:**
- Accumulate combo keys in a `Counter`.
- Filter to count ≥ 2.
- Output JSON structure:
  ```json
  {
    "metadata": { "total_simulations": N, "total_rosters": N*12, "sigma_slope": 0.1, "sigma_intercept": 1.5, "adp_date": "YYYY-MM-DD", "generated": "ISO-timestamp" },
    "combos": { "hash_key": { "players": ["id-...", ...], "count": K }, ... }
  }
  ```
- Hash key = `|`-joined sorted player_ids (deterministic, readable for debugging).

**Tier 2 — Conditional probability tables:**
- Accumulate pick events: for each `(round, position_context_key)`, count how many times each player was selected.
- Normalize to probabilities per group.
- `position_context_key` = comma-separated sorted position list (e.g., `""`, `"RB"`, `"RB,WR"`, `"QB,RB,WR"`).
- Output JSON structure:
  ```json
  {
    "metadata": { "total_simulations": N, "total_rosters": N*12 },
    "rounds": {
      "1": { "": { "id-BijanRobinson-RB-AtlantaFalcons": 0.12, ... } },
      "2": { "RB": { ... }, "WR": { ... } },
      ...
    }
  }
  ```

### Step 4: Pilot run & reporting
- `--pilot` flag runs 100K simulations.
- After generation, compute and print:
  - Total unique combos observed
  - Combos with count ≥ 2 (Tier 1 size)
  - Max frequency combo (with player names)
  - Frequency percentiles (p50, p90, p99)
  - Tier 1 JSON file size (raw bytes + gzip estimate)
  - Tier 2 JSON file size
  - Number of unique position contexts per round
- Save report as `simulation/output/pilot_report.json`.

### Performance considerations
- Use numpy for vectorized utility computation and sampling — avoid per-player Python loops where possible.
- Pre-compute utility arrays once per pick position (utilities only depend on ADP and pick number).
- 100K simulations × 72 picks = 7.2M sampling operations — should be fast with numpy.

## Dependencies
- ADR-003 (Accepted) — defines the two-tier hybrid output model
- ADP snapshot data in `best-ball-manager/src/assets/adp/`
- Python 3.10+ with numpy

---
*Approved by: PH — 2026-04-03*
