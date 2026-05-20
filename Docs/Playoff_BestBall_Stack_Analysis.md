# NFL Playoff Best Ball — Stack Analysis (Vegas Implied Totals)

**Source data:** `docs/Playoff_BestBall_Projections.xlsx`
**Slate:** NFL Weeks 15 / 16 / 17 (fantasy playoffs)
**Format assumption:** 3-week cumulative best-ball tournaments (Underdog Playoff Best Ball Mania, DraftKings playoff contests, etc.), large-field GPP payout structures where ceiling outcomes win.

> Methodology in one line: Vegas implied team totals are the cleanest publicly available proxy for week-level fantasy production. Stacking concentrates correlated upside, which is the only thing that wins large-field GPPs. We rank the slate by 3-week implied totals, identify the highest-projected games (shootout candidates for game stacks), and recommend stack constructions.

---

## 1. Slate Overview

Average team-week implied total across the slate: **45.7 points** (W15) / **45.8** (W16) / **45.4** (W17). Three-week average per team: **137.0**.

### Teams ranked by 3-week implied total

| Rank | Team | Sum | W15 | W16 | W17 | 3-wk Floor |
|-----:|:----:|:---:|:---:|:---:|:---:|:---:|
| 1 | **DAL** | **153.5** | 52.5 @LAR | 51.5 vs JAX | 49.5 vs NYG | **49.5** |
| 2 | **CIN** | **151.5** | 47.5 @CAR | 52.5 @IND | 51.5 vs BAL | 47.5 |
| 3 | CHI | 148.5 | 51.5 @BUF | 47.5 vs GB | 49.5 vs DET | 47.5 |
| 4 | LAR | 148.5 | 52.5 vs DAL | 47.5 @SEA | 48.5 @TB | 47.5 |
| 5 | BUF | 145.5 | 51.5 vs CHI | 46.5 @DEN | 47.5 @MIA | 46.5 |
| 6 | DET | 144.5 | 46.5 @MIN | 48.5 vs NYG | 49.5 @CHI | 46.5 |
| 7 | IND | 143.5 | 47.5 @TEN | 52.5 vs CIN | 43.5 @CLE | 43.5 |
| 8 | JAX | 143.5 | 43.5 @HOU | 51.5 @DAL | 48.5 vs WAS | 43.5 |
| 9 | WAS | 141.5 | 46.5 vs ATL | 46.5 @MIN | 48.5 @JAX | 46.5 |
| 10 | BAL | 140.5 | 45.5 vs PIT | 43.5 vs CLE | 51.5 @CIN | 43.5 |
| 11 | SF | 139.6 | 47.6 @LAC | 46.5 @KC | 45.5 vs PHI | 45.5 |
| 12 | TB | 139.5 | 45.5 @NO | 45.5 @ATL | 48.5 vs LAR | 45.5 |
| 13 | LAC | 138.5 | 47.5 vs SF | 45.5 @MIA | 45.5 @KC | 45.5 |
| 14 | MIA | 138.5 | 45.5 @GB | 45.5 vs LAC | 47.5 vs BUF | 45.5 |
| 15 | NYG | 138.5 | 40.5 vs CLE | 48.5 @DET | 49.5 @DAL | 40.5 |
| 16 | KC | 137.5 | 45.5 vs NE | 46.5 vs SF | 45.5 @LAC | 45.5 |
| 17 | ATL | 136.5 | 46.5 @WAS | 45.5 vs TB | 44.5 vs NO | 44.5 |
| 18 | GB | 135.5 | 45.5 vs MIA | 47.5 @CHI | 42.5 vs HOU | 42.5 |
| 19 | NO | 135.5 | 45.5 vs TB | 45.5 vs ARI | 44.5 @ATL | 44.5 |
| 20 | MIN | 133.5 | 46.5 vs DET | 46.5 vs WAS | 40.5 @NYJ | 40.5 |
| 21 | SEA | 133.5 | 43.5 @PHI | 47.5 vs LAR | 42.5 @CAR | 42.5 |
| 22 | TEN | 132.5 | 47.5 vs IND | 42.5 @LV | 42.5 vs PIT | 42.5 |
| 23 | CAR | 131.5 | 47.5 vs CIN | 41.5 @PIT | 42.5 vs SEA | 41.5 |
| 24 | DEN | 130.5 | 41.5 @LV | 46.5 vs BUF | 42.5 @NE | 41.5 |
| 25 | PHI | 130.5 | 43.5 vs SEA | 41.5 vs HOU | 45.5 @SF | 41.5 |
| 26 | NE | 129.5 | 45.5 @KC | 41.5 @NYJ | 42.5 vs DEN | 41.5 |
| 27 | PIT | 129.5 | 45.5 @BAL | 41.5 vs CAR | 42.5 @TEN | 41.5 |
| 28 | ARI | 128.5 | 41.5 @NYJ | 44.5 @NO | 42.5 vs LV | 41.5 |
| 29 | CLE | 127.5 | 40.5 @NYG | 43.5 @BAL | 43.5 vs IND | 40.5 |
| 30 | HOU | 127.5 | 43.5 vs JAX | 41.5 @PHI | 42.5 @GB | 41.5 |
| 31 | LV | 126.5 | 41.5 vs DEN | 42.5 vs TEN | 42.5 @ARI | 41.5 |
| 32 | NYJ | 123.5 | 41.5 vs ARI | 41.5 vs NE | 40.5 vs MIN | 40.5 |

Five teams clear **145+** for the slate (top 16%). The drop-off from rank 10 (BAL 140.5) to rank 20 (MIN 133.5) is the meaningful gradient — every team in the top 10 has at least one week ≥ 48.5 and a 3-week sum that's ~3+ points above slate average.

---

## 2. Top 10 Games by Combined Implied Total

These are the shootout candidates — the games where stacking *both sides* (game stack) creates the strongest correlation profile.

| Rank | Week | Game | Total | Why it matters |
|-----:|:----:|:-----|:-----:|:--------------|
| **1** | **W15** | **LAR @ DAL** | **105.0** | Two top-4 teams collide in Week 1 of the playoffs |
| **1** | **W16** | **CIN @ IND** | **105.0** | The slate's most concentrated shootout total |
| 3 | W15 | CHI @ BUF | 103.0 | Two top-5 offenses, dome-vs-cold doesn't matter to Vegas here |
| 3 | W16 | JAX @ DAL | 103.0 | DAL's second straight 103+ game |
| 3 | W17 | BAL @ CIN | 103.0 | Division championship-week shootout; both teams elite |
| 6 | W17 | DET @ CHI | 99.0 | Lions-Bears NFC North rematch in W17 |
| 6 | W17 | NYG @ DAL | 99.0 | DAL's third top-7 game of the slate |
| 8 | W16 | NYG @ DET | 97.0 | NYG's only meaningful spike on the slate |
| 8 | W17 | LAR @ TB | 97.0 | TB's only top-10 game; LAR road consistency |
| 8 | W17 | WAS @ JAX | 97.0 | JAX's second straight 97+ game |

### Critical observation: DAL and CIN appear in 3 of the top 5 games

- **DAL** participates in games totaling **105 (W15) + 103 (W16) + 99 (W17)** — every single playoff week. No other team has three games in the top 8.
- **CIN** participates in **105 (W16) + 103 (W17)** plus a respectable 95 (W15) — the only team besides DAL with two top-5 games.
- **CHI** participates in **103 (W15) + 99 (W17)** with a 95 in between.

These three are the slate's structural anchors.

---

## 3. Tier 1 — Anchor Stacks (Build Around These)

An anchor stack = QB + 2 of his pass catchers (preferably WR1 + WR2 or WR1 + TE) from a high-total team across all three weeks. In best-ball, you don't need to start them; the auto-flex captures the spike weeks.

### A. Dallas Cowboys — The Slate's #1 Stack

- **Why:** Highest 3-week sum (153.5), every week ≥ 49.5, all three games are top-7 by combined total. There is no week to fade Dallas.
- **Stack core:** QB + WR1 + WR2 (or WR1 + TE). Adding a 4th piece (RB or 3rd WR) is acceptable given the strength of every matchup.
- **Bring-back priority (by week):**
  - **W15:** LAR side (52.5 implied; their WR1 is the premier bring-back).
  - **W16:** JAX side (51.5 implied; their QB1 + WR1 are live).
  - **W17:** NYG side (49.5 implied; their WR1).
- **Expected ownership:** Will be the chalkiest stack on the slate. The advantage is that the implied totals genuinely justify the popularity — you do not need to fade chalk here, you need to *differentiate within* the Dallas stack (e.g., 3rd-WR or TE-heavy build).

### B. Cincinnati Bengals — The Late-Slate Killer

- **Why:** 151.5 total with the highest W16 + W17 ceiling pair on the slate (52.5 + 51.5). CIN's two biggest weeks are weeks 2 and 3 of the contest, which is exactly when survivor-pool dynamics narrow the field.
- **Stack core:** QB + WR1 + WR2 is the canonical build given the WR depth.
- **Bring-back priority:**
  - **W16:** IND side (52.5 implied — the highest opposing team-total CIN faces). Pair their QB or WR1.
  - **W17:** BAL side (51.5 implied — and BAL is itself a top-10 anchor, which means a CIN/BAL game stack double-dips two anchor teams in one game).
- **Why this matters more than DAL late:** Late-tournament leaderboards reward W17 ceilings. CIN's W17 implied is 2 points higher than DAL's, and the BAL bring-back is far stronger than the NYG bring-back.

### C. Chicago Bears — The Volatility Anchor

- **Why:** 148.5 sum, but the key is **every week is a top-10 game total** (103 / 95 / 99). CHI is the only team besides DAL where every single week is a shootout candidate.
- **Stack core:** QB + WR1 + TE (or RB if pass-catching). The WR1 is the priority.
- **Bring-back priority:**
  - **W15:** BUF side (the bring-back is itself the slate's #5 anchor — see below).
  - **W17:** DET side (DET is rank #6 on the slate; the bring-back is anchor-grade).
- **Note:** CHI's W15 is at BUF (51.5 vs 51.5) — this is the lowest-friction *natural* game stack on the slate because both teams are already top-5 anchors.

### D. LA Rams — The DAL Mirror

- **Why:** 148.5 sum, all three weeks ≥ 47.5. LAR's W15 game (vs DAL) is the slate's co-#1.
- **Stack core:** QB + WR1 + WR2.
- **Edge over DAL:** Likely lower ownership at every position. Players will gravitate to DAL even though LAR's W15 implied is identical and the W16/W17 totals only drop ~3-4 points.

### E. Buffalo Bills — The Anchor With a Built-In Bring-Back

- **Why:** 145.5 sum, headlined by the W15 game vs CHI (103 total). BUF's QB is in the slate's #3 shootout in Week 1.
- **Stack core:** QB + WR1 + WR2/TE.
- **Bring-back:** CHI in W15 is the obvious play — and since CHI is itself a Tier 1 anchor, this becomes a true mega-stack.

---

## 4. Tier 1 — Premier Game Stacks (Both Sides of One Game)

Game stacks are the highest-correlation play in best ball. Here are the five strongest:

### Stack 1: **DAL/LAR — Week 15 (105.0)**
- **Build:** DAL QB + WR1 + LAR WR1 (or LAR QB + WR1 if you want full inversion).
- **Pros:** Two top-4 anchors, both teams remain top-tier in W16+W17 individually.
- **Cons:** Highest-owned game on the slate; differentiation depends on which secondary pieces you add.

### Stack 2: **CIN/IND — Week 16 (105.0)**
- **Build:** CIN QB + WR1 + IND WR1 (or IND QB + WR1 + CIN WR1).
- **Pros:** The slate's most concentrated W16 shootout; both teams are individually top-7 anchors.
- **Cons:** IND falls off in W17 (43.5), so it's a single-game spike rather than a multi-week anchor.
- **Differentiator:** Stacking the IND side rather than the CIN side is contrarian and capitalizes on the same correlation.

### Stack 3: **BAL/CIN — Week 17 (103.0)**
- **Build:** BAL QB + WR1/TE + CIN WR1.
- **Pros:** This is the most under-discussed mega-stack on the slate. BAL is the #10 team overall but their W17 (51.5) is tied for the second-highest single-week total. CIN's W17 (51.5) matches it. **You stack two top-10 anchors in the championship week.** Both teams have multi-week relevance, so the build doesn't depend on a single game.
- **Why this is the sharp play:** DAL/LAR and CIN/IND will be top-3 owned game stacks. BAL/CIN W17 is structurally identical in total but will run noticeably lower.

### Stack 4: **CHI/BUF — Week 15 (103.0)**
- **Build:** CHI QB + WR1 + BUF WR1 (or invert).
- **Pros:** Natural double-anchor (both teams Tier 1). CHI's WR1 has a 3-week ceiling profile (every week ≥ 47.5 team total).
- **Cons:** Both QBs project to be high-owned individually.

### Stack 5: **JAX/DAL — Week 16 (103.0)**
- **Build:** JAX QB + WR1 + DAL WR1.
- **Pros:** Picks up DAL's W16 *and* gets JAX's biggest week (51.5). JAX's W17 (vs WAS, 97 total) gives the JAX side a second spike week, which most W16 game stacks lack.
- **Sharp angle:** The JAX QB is materially cheaper than Burrow/Dak/Allen and has back-to-back 97+ total games to close the slate.

---

## 5. Tier 2 — Secondary Anchors and Contrarian Plays

### Detroit Lions (144.5)
- W16 (vs NYG, 97 total) + W17 (@ CHI, 99 total) is the strongest **back-half** profile on the slate behind CIN.
- Build: QB + WR1 + TE. The DET/CHI W17 bring-back doubles as a Tier 1 game-stack pivot off CHI.

### Indianapolis Colts (143.5)
- The single best W15 + W16 ceiling combination outside DAL/CIN (47.5 + 52.5). W17 dropoff is real (43.5 vs CLE).
- Build: Two-week stack — punt W17 contribution. Pair with a Tier 1 anchor that has its biggest week in W17 (BAL or CIN).

### Jacksonville Jaguars (143.5)
- Back-loaded slate: 43.5 / 51.5 / 48.5. **The W16 + W17 combined total (200) is the slate's third-best 2-week stretch behind DAL and CIN.**
- Build: Naked QB stack pairs well with a DAL or WAS bring-back.

### Washington Commanders (141.5)
- The most *consistent* mid-tier team: 46.5 / 46.5 / 48.5. No bad week, no great week.
- Best used as a bring-back to JAX in W17 (97 total), not as a primary anchor.

### Baltimore Ravens (140.5)
- W17 spike (51.5) is the second-highest single-week total on the slate behind DAL/LAR W15 and CIN/IND W16. Already covered as the bring-back side of the **BAL/CIN W17** game stack.

### NY Giants (138.5)
- Almost dead weight in W15 (40.5), but then 48.5 and 49.5. **NYG is the strongest pure W16+W17 contrarian play on the slate.** Pure bring-back utility against DET (W16) and DAL (W17), not an anchor.

---

## 6. Recommended Portfolio Constructions

For a multi-entry best-ball playoff portfolio, diversify across **3-4 distinct anchor stacks** rather than re-running the same DAL/LAR build. Suggested portfolio shape:

| Build # | Primary Stack | Bring-back | Secondary Pivots | Notes |
|--------:|:-------------|:----------|:----------------|:------|
| 1 | **DAL** QB + 2 WR | LAR WR1 (W15) | NYG WR1 (W17 swing) | Chalky but justified |
| 2 | **CIN** QB + 2 WR | BAL QB + WR1 (W17 game stack) | IND WR1 (W16 pivot) | **Best W17 ceiling build** |
| 3 | **CHI** QB + WR + TE | BUF WR1 (W15) | DET WR1 (W17) | Both bring-backs are Tier 1 anchors |
| 4 | **LAR** QB + 2 WR | DAL WR1 (W15) | TB WR1 (W17 game stack) | Lower-owned mirror of build #1 |
| 5 | **JAX** QB + WR | DAL WR1 (W16) | WAS WR1 (W17) | Back-half contrarian build |

### Strategic ownership note

Builds 1 and 4 (DAL/LAR W15 game stack) will be the slate's most popular concept. If you're entering many lineups, **overweight builds 2, 3, and 5** — they reach equivalent or superior implied-total exposure with materially lower expected ownership. The **BAL/CIN W17 game stack inside build 2** is the single best leverage spot on the slate.

---

## 7. Best 4-Team Combinations — Concentrated Correlation Plays

A single best-ball lineup naturally concentrates around 3–5 teams. The question is **which 4 teams maximize cross-game correlation**: how many of your teams play each other inside the 3-week window? Each internal matchup is a free game stack — you're not buying both sides of a high-total game with separate roster spots; the schedule has already done it for you.

We enumerated all 35,960 four-team combinations from the 32 teams and ranked by:
1. **# of internal games** (pairs within the combo that play each other in W15–W17)
2. **Combined internal game total** (the sum of those games' Vegas totals)
3. **Team sum** (the floor — how good the 4 teams are on weeks they're not playing each other)

### Three structural archetypes

| Archetype | Definition | Strength | Trade-off |
|-----------|-----------|----------|-----------|
| **Round-robin** | 4 internal games; some weeks have 2 simultaneous internal games | Maximum correlation density | Usually means mid-tier team totals |
| **Hub** | 3 internal games, all centered on one team that plays every other combo member | Guaranteed weekly correlation | Hub-team dependency |
| **Pure anchor** | 2 internal games but maximum 4-team sum | Highest raw ceiling | Some weeks fully uncorrelated |

### A. **BUF / CHI / GB / MIA** — The 4-Game Maximum-Density Combo

- **4 internal games, combined total 384** (the slate's highest).
- **W15:** CHI/BUF (103) **AND** MIA/GB (91) — two simultaneous internal games, all 4 teams paired internally in Week 1.
- **W16:** CHI/GB (95).
- **W17:** BUF/MIA (95).
- **Team sum:** 568. Three top-15 teams (CHI 148.5, BUF 145.5, MIA 138.5) plus GB (135.5).
- **Why it's special:** The only top-tier combo where **every single week contains at least one internal game**, and W15 has two. Half your lineup is correlated in Week 1, and you carry through-line correlation into W16 and W17.
- **Best for:** Lineups that want a balanced 3-week correlation curve rather than betting on one shootout week.

### B. **BAL / CIN / CLE / IND** — The Late-Slate Round Robin

- **4 internal games, combined total 382**, structurally unique on the slate.
- **W15:** zero internal games (CIN @ CAR, IND @ TEN, BAL vs PIT, CLE @ NYG).
- **W16:** CIN/IND (105) **AND** BAL/CLE (87) — full pairing.
- **W17:** BAL/CIN (103) **AND** CLE/IND (87) — full pairing.
- **Team sum:** 563.
- **Why it's special:** In W16 and W17, **all 4 teams' opponents are other combo members**. There is no other 4-team set on the slate where 2 entire weeks are fully self-contained. The cost is that W15 is dead correlation-wise (but the team totals are still respectable individually).
- **Best for:** Tournament leverage on the championship week. CIN/BAL W17 (103 total) is the slate's most undervalued elite game — and this combo gets it on top of the slate-leading CIN/IND W16.

### C. **DAL / LAR / JAX / NYG** — The DAL Hub (3 Internal Games, Highest Total)

- **3 internal games, combined total 307** (the highest of any hub structure).
- **W15:** DAL/LAR (105) | **W16:** DAL/JAX (103) | **W17:** DAL/NYG (99).
- **Team sum:** 584 — highest of any 3+ internal-game combo.
- **DAL plays an internal game every single week.** Pair the DAL QB with a WR1 + WR2 anchor stack, then use one player from each of LAR, JAX, NYG as a 1-off bring-back per week.
- **Best for:** Builds where the DAL anchor stack is the spine and bring-backs cycle each week.

### D. **DAL / JAX / LAR / WAS** — The Hub Anchor Swap

- **3 internal games, combined total 305**, team sum **587** (highest among any combo with 3+ internal games).
- **W15:** DAL/LAR (105) | **W16:** DAL/JAX (103) | **W17:** JAX/WAS (97).
- DAL hubs W15+W16, then JAX hands off the hub role in W17 — a **DAL → JAX bridge** structure.
- Swaps NYG (138.5, with a dead W15 of 40.5) for WAS (141.5, no dead week). You sacrifice 2 points of internal total for **a healthier non-correlated W15** and no Giants-shaped landmine.
- **Best for:** The strongest pure-upgrade alternative to the DAL hub when you want NYG-less exposure.

### E. **BAL / CIN / DAL / LAR** — The Pure-Anchor Ceiling Play

- **Only 2 internal games — but team sum 594, the third-highest of any correlated combo.**
- **W15:** DAL/LAR (105) | **W17:** BAL/CIN (103). The slate's #1 and #5 games.
- **W16:** zero internal games. CIN @ IND, BAL vs CLE, DAL vs JAX, LAR @ SEA — each team independent.
- **Team sum:** the top 3 + #10 teams. Three of the four are top-10 in every individual week.
- **Best for:** Lineups that want maximum raw ceiling and accept that W16 is independent. Captures both **bookend mega-games** without diluting team quality.

### Decision matrix

| Goal | Recommended combo |
|------|-------------------|
| Correlation in **every** week, balanced curve | **BUF / CHI / GB / MIA** |
| Late-slate (W16+W17) GPP leverage, championship-week ceiling | **BAL / CIN / CLE / IND** |
| DAL anchor build with weekly bring-backs | **DAL / LAR / JAX / NYG** |
| DAL anchor build minus the NYG W15 dead week | **DAL / JAX / LAR / WAS** |
| Maximum team-total ceiling, accept W16 independence | **BAL / CIN / DAL / LAR** |

### Multi-entry portfolio note

If you're running ≥10 lineups, spread across **all 5** of these combos rather than re-running the same DAL hub. Combo A (BUF/CHI/GB/MIA) and Combo B (BAL/CIN/CLE/IND) will be materially less owned than the DAL-anchored builds despite having more internal correlation per combo. **The structural edge on this slate lives in the BAL/CIN W17 game stack and the BUF/CHI/GB/MIA Week 15 double-game.**

---

## 8. Fade List

Teams to avoid as primary anchors (3-week sum below 130 *and* no top-10 game):

- **NYJ** (123.5), **LV** (126.5), **HOU** (127.5), **CLE** (127.5), **ARI** (128.5), **PIT** (129.5), **NE** (129.5).

Tactical exposure to a WR1 from these teams in a one-off bring-back is fine (e.g., CLE WR1 vs BAL W16, NYG matchups). Treat them as accessories, never anchors.

Special mentions:
- **NYG** is a fade as an anchor (W15 is a 40.5 dead week) but a top contrarian bring-back in W16 + W17.
- **MIN** sum looks acceptable (133.5) but the W17 (40.5 @ NYJ) actively bleeds points during the most important week. Avoid as an anchor.
- **TEN** has a real W15 (47.5) but two 42.5s after — use only as a one-week W15 piece.

---

## 9. Methodology, Limits, Caveats

- **Team totals only.** This analysis is entirely team-implied-total driven. We have no player-level projections, no usage shares, no injury overlay, and no weather. Player selection within each stack must be done with a separate player-projection layer.
- **Vegas embeds opinion.** Implied totals already price in injuries, weather, and matchup edges as of the line's publication. They are *not* independent of those factors — they aggregate them.
- **Best-ball-specific assumption.** This analysis assumes the contest is 3-week cumulative best-ball where lineups are auto-optimized. If the contest uses set-and-forget lineups (no auto-flex), the stack value drops significantly and the analysis should be redone with explicit player-level projections.
- **Correlation is not commutative with risk.** Stacking concentrates outcomes — your best lineups are better, your worst lineups are worse. This is correct for large-field GPPs and wrong for cash games.
- **Edges decay fast.** Lines move. If you're drafting after a line move (e.g., a starter QB ruled out), re-run the team-total ranking before committing.

---

*Generated from Vegas implied team totals in `docs/Playoff_BestBall_Projections.xlsx`. Not financial advice; for entertainment purposes only.*
