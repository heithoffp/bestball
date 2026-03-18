Nice — here’s a focused, no-nonsense set of algorithms (with clear pseudocode) you can implement to reproduce the Jaccard charts and analysis from Legendary Upside. The site shows both unweighted and draft-capital–weighted Jaccard scores, an “average shared players” translation, category breakdowns (positions and round buckets), and quartile thresholds on bar charts — I’ll reproduce the math and the steps you’ll need. ([Legendary Upside][1])

---

# What you need (data model)

* `Roster`: list of players with metadata per pick: `(player_id, position, pick_number)`
* `Portfolio` (for one drafter): list of `Roster`s (each roster is one team entry)
* `Population`: collection of all portfolios (used to compute quartiles/benchmarks)

Assume `N = number of rosters in portfolio`. You already said you have rosters and players — that’s sufficient.

---

# High-level algorithm steps (overview)

1. Preprocess rosters into set and weighted representations (per category).
2. For each category (overall, by position, by round-bucket), compute pairwise Jaccard for all pairs of rosters in a portfolio:

   * Unweighted: classic set Jaccard (|A ∩ B| / |A ∪ B|).
   * Weighted: treat each roster as a weighted vector (weights derived from draft capital); compute weighted-Jaccard = sum(min(wi, wj)) / sum(max(wi, wj)).
3. Convert Jaccard to intuitive metrics:

   * `AvgSharedPlayers` = average |A ∩ B| across pairs (helps interpret Jaccard scale).
   * Express Jaccard as percentage (×100) if desired.
4. Compute aggregate portfolio scores: mean (or median) of pairwise Jaccards ⇒ produce one score per category per portfolio (both weighted & unweighted).
5. Compute population quartiles/percentiles for each category (to display quartile lines).
6. Plot: bar charts for categories, two bars per category (unweighted vs weighted), annotate raw Jaccard, draw quartile lines, show AvgSharedPlayers below each bar. (Site uses bar charts and quartiles rather than pure percentiles.) ([Legendary Upside][1])

---

# Useful definitions and helpers (pseudocode)

```
# helper: build roster sets and weights
function build_representations(roster):
    players = roster.players  # list of (player_id, position, pick)
    set_rep = set(player_id for each p in players)

    # weight scheme example: normalized draft capital
    # simple: weight = (max_picks - pick + 1) / sum_over_roster(max_picks - pick + 1)
    # or map pick -> ADP_expected_value if you have it.
    weights = dict()
    total_raw = 0
    for p in players:
        raw = max_picks - p.pick_number + 1   # higher weight for earlier pick
        weights[p.player_id] = raw
        total_raw += raw
    for pid in weights: weights[pid] /= total_raw   # normalize to sum=1 (optional)

    return set_rep, weights
```

---

# Unweighted pairwise Jaccard (per category)

```
# A and B are sets of player_ids within the chosen category (e.g., only RBs, or only picks from rounds 1-6)
function jaccard_unweighted(A, B):
    inter = size(A ∩ B)
    union = size(A ∪ B)
    if union == 0: return 0
    return inter / union
```

To compute for a portfolio:

```
function portfolio_unweighted_scores(portfolio, category_filter):
    R = [apply filter to roster i => set_i]  # list of sets per roster
    pair_values = []
    for i in range(len(R)):
        for j in range(i+1, len(R)):
            pair_values.append(jaccard_unweighted(R[i], R[j]))
    return mean(pair_values), pair_values, mean_intersection_count(pair_values, R)  # mean and raw distribution
```

`mean_intersection_count` is just average |A ∩ B| across pairs — use for "Average Shared Players" metric the site shows. ([Legendary Upside][1])

---

# Weighted Jaccard (draft capital weighted)

Define each roster as a mapping `w_r(pid)` (weight >=0). Weighted Jaccard:

```
function jaccard_weighted(weightsA, weightsB):
    all_pids = union of keys(weightsA, weightsB)
    num = sum( min(weightsA.get(pid,0), weightsB.get(pid,0)) for pid in all_pids )
    den = sum( max(weightsA.get(pid,0), weightsB.get(pid,0)) for pid in all_pids )
    if den == 0: return 0
    return num / den
```

Pick your weighting function deliberately. If you want draft capital to be absolute (earlier picks strongly matter), do not normalize to sum=1 across roster — normalize against global max or use raw inverse-pick formula. The article explicitly contrasts "draft capital weighted" vs unweighted; implement both so you can compare. ([Legendary Upside][1])

---

# Category filters (examples)

* `overall`: include all players.
* `by_position`: include only players where `player.position == 'RB'` (or QB/WR/TE).
* `by_round_bucket`: include only players drafted in pick ranges (e.g., rounds1-6, 7-12, 13-18). Convert pick numbers → round.

Implement a generic filter function:

```
function filter_roster(roster, position=None, round_min=None, round_max=None):
    return [p for p in roster.players if (position==None or p.position==position)
                                      and (round_min==None or round_from_pick(p.pick) >= round_min)
                                      and (round_max==None or round_from_pick(p.pick) <= round_max)]
```

---

# Population quartiles / thresholds

Compute the same portfolio-level metric (e.g., mean pairwise Jaccard for RB unweighted) for each drafter in the population. Then compute quartiles:

```
# portfolios_scores is list of (portfolio_id, value)
function percentile_thresholds(population_values):
    sort population_values
    q1 = value at 25th percentile
    q2 = median (50th)
    q3 = 75th percentile
    return q1, q2, q3
```

Use these quartile values to draw horizontal lines on your bars and annotate where the current portfolio sits relative to the field. The article shows quartile thresholds on bars rather than raw percentiles to avoid over-emphasis on small absolute differences. ([Legendary Upside][1])

---

# Average Shared Players translation

Instead of reporting tiny Jaccard decimals, compute `AvgSharedPlayers` directly:

```
function avg_shared_players(portfolio, category_filter):
    intersections = []
    for each pair (i,j) of rosters in portfolio:
        Ai = set(filter_roster(i, category_filter))
        Aj = set(filter_roster(j, category_filter))
        intersections.append(size(Ai ∩ Aj))
    return mean(intersections)
```

This gives the *expected number of identical player slots* between two randomly chosen rosters from the portfolio — easier to interpret. The site highlights this as useful for human-readable risk signals (they flag Jaccard > 10 as a warning in some categories). ([Legendary Upside][1])

---

# Player exposure / stands detection

Compute frequency of each player across portfolio rosters:

```
function player_exposure(portfolio):
    counts = dict()
    for roster in portfolio:
        for p in roster.players: counts[p.player_id] += 1
    exposure = {pid: counts[pid]/N for pid in counts}  # fraction of rosters containing player
    return exposure
```

A “stand” can be defined as a player with exposure > threshold (e.g., > 0.1 or appearing in >= 2 rosters depending on contest). You can also compute stands per position or round-bucket and report concentrations (site calls these “stands” and uses them to explain weighted vs unweighted differences). ([Legendary Upside][1])

---

# Visualization plan

* For each category (QB, RB, WR, TE, Rounds 1–6, 7–12, 13–18, overall):

  * Draw two bars: Unweighted Jaccard (%) and Weighted Jaccard (%).
  * Annotate raw Jaccard value on each bar.
  * Below each bar show `AvgSharedPlayers` (numeric).
  * Add horizontal lines at population Q1/Q2/Q3 for that category.
* Optionally keep radar charts as complementary visuals (site kept radar charts). Use bar charts as primary visualization (site moved to bars). ([Legendary Upside][1])

---

# Performance / scaling notes (practical)

* Pairwise is O(M^2) where M = # rosters in a portfolio (M typically small for contest entrants but can be large if max-enter). Use vectorized bitsets or binary masks for fast set intersections if you have many rosters.
* Weighted Jaccard: represent as sparse vectors; do dot-products on intersecting keys only.
* If population is large (thousands of portfolios), compute quartiles offline or incrementally; store pre-computed population thresholds per category and update nightly.

---

# Example: end-to-end pseudocode for one portfolio

```
function analyze_portfolio(portfolio, population_stats):
    categories = [overall, position=QB, RB, WR, TE, rounds1_6, rounds7_12, rounds13_18]
    results = {}
    for cat in categories:
        # unweighted
        mean_unw, pair_dist_unw, avg_shared = portfolio_unweighted_scores(portfolio, cat)
        # weighted
        weights_list = [build_weights(roster, cat) for roster in portfolio]
        mean_w = mean( jaccard_weighted(weights_list[i], weights_list[j]) for all pairs i<j )
        # population quartiles (precomputed)
        q1,q2,q3 = population_stats[cat]['quartiles']
        results[cat] = {
           'unweighted_pct': mean_unw*100,
           'weighted_pct': mean_w*100,
           'avg_shared_players': avg_shared,
           'quartiles': (q1,q2,q3)
        }
    return results
```

---

# Interpretation guidance (explicit, blunt)

* Do not over-interpret small Jaccard differences; on the raw scale differences are often tiny. Use `AvgSharedPlayers` to decide if a difference is materially meaningful. The referenced article made the same point: percentiles can mislead because raw differences are small. ([Legendary Upside][1])
* Compare weighted vs unweighted: if weighted ≫ unweighted in a category, your earlier picks are concentrated (higher risk). If unweighted ≫ weighted, you repeated players mostly in late/low-draft-capital picks (less risk). ([Legendary Upside][1])

---

# Extra analyses you should add (recommended, not optional)

* Player-level impact: compute for each player the marginal change in portfolio Jaccard if you remove that player from all rosters. That finds high-impact players for diversification risk.
* Bootstrap a random baseline: simulate random portfolios (respecting position/pick distributions) to produce expected Jaccard/AvgSharedPlayers baseline; use that for significance testing.
* Time-series (if you keep drafts across seasons): track increasing concentration.

---

If you want, I can now:

* Produce concrete Python code (numpy/pandas) implementing the above (optimized pairwise and weighted variants), or
* Give a minimal working example that reads a CSV of rosters and outputs the bar chart & quartiles.

Which of those do you want right away? I’ll skip questions and pick the straightforward path: produce a tested, runnable Python implementation next unless you tell me otherwise.

[1]: https://www.legendaryupside.com/bbm6-jaccard-charts-and-analysis/ "BBM6 Jaccard Charts and Analysis"
