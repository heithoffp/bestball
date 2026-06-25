---
title: "How I'm Drafting the 2026 Underdog Eliminator"
date: 2026-06-23
status: draft
image: "/blog/images/og-how-im-drafting-the-2026-eliminator.png"
kb_sources:
  - kb/articles/draft-mechanics/underdog-eliminator-contest-format.md
  - kb/articles/strategy-frameworks/eliminator-week-1-advancement-priority.md
  - kb/articles/strategy-frameworks/eliminator-bye-week-management.md
  - kb/articles/strategy-frameworks/eliminator-roster-construction-three-qb-three-te.md
  - kb/articles/strategy-frameworks/stack-construction-in-eliminator.md
  - kb/articles/strategy-frameworks/eliminator-rookie-fade-heuristic.md
  - analysis/eliminator/eliminator-draft-strategy-2026.md
  - analysis/eliminator/eliminator-anchor-playbooks-2026.md
  - analysis/eliminator/eliminator-rankings-2026.md
topic_tags: [eliminator, strategy, byes]
---

Underdog is running an Eliminator promo right now, and a lot of people are about to draft it the way they draft Best Ball Mania (BBM). The Eliminator is a different game, and once you see how, every pick on your board moves. Two things about the format reset the entire draft. Here's what they are, and how I build around them.

In BBM you accumulate points across 17 weeks against a giant field, and the only week that matters is the one you reach. The Eliminator flips that. You survive one head-to-head week at a time, and the field collapses week by week down to three finalists. Week 1 is the gate: you draft a 12-person pod, and six of twelve advance. That single cut behaves like a DFS double-up (you only have to beat the median), but you cannot recover from missing it. A 20th-percentile Week 1 score knocks you out roughly 99% of the time.

And the money sits at the back. Reach Week 14 and you lock about $10K no matter what you score that week, then it climbs steeply from there.

![Payouts are stacked at the back: reaching Week 14 is most of the game.](/blog/images/eliminator-payout-ladder-2026-06-23.svg)

<!-- CHART SPEC
type: comparison-bars
data:
  - { label: "Reach Week 14", payout: 10000 }
  - { label: "Reach Week 15", payout: 30000 }
  - { label: "3rd place", payout: 130000 }
  - { label: "1st place", payout: 200000 }
caption: Payouts are back-loaded — reaching the Week 14 lock is the whole game.
source: KB Eliminator cluster (underdog-eliminator-contest-format.md). Illustrative — confirm your specific contest.
-->

Put those two facts together and the draft inverts. Survive every week, and the money sits at the far end. In BBM I chase ceiling; in the Eliminator I protect a floor, because the goal isn't a tournament-winning spike, it's never having a hole that hands me an automatic loss in a single week. That one shift produces the handful of rules I actually draft by.

**Build floor at the onesies.** My target shape is 3 QB / 5 RB / 6–7 WR / 3–4 TE. The onesies are quarterback and tight end, the spots you only start one of, and a zero there in a one-on-one week is basically a loss. So the third QB and third TE exist to keep me off that zero, nothing more. I spend my ceiling budget at running back and receiver and take the onesies later, in their window.

**Lean running back early.** Week 1 RB volume is the most projectable production on the board; you know where the ball is going in Week 1 even when October usage is murky. That's why a back like Derrick Henry (17.6 ADP) is a value I'm happy to take in the second round here, and why workhorse volume climbs my board.

**Back-weight your byes.** A late bye is a zero you may never have to take before the money arrives. In 2026 only two teams are off in Week 14 (Arizona and Dallas), with four more in Week 13 (Baltimore, Indianapolis, Las Vegas, the Jets). That scarcity is why a cheap, startable arm like Dak Prescott, who carries that Week 14 bye, jumps from the back of the seventh round (79.8 ADP) up into my second quarterback slot. The rule on top of it: stagger everything, so no two of my quarterbacks, backs, or receivers share a bye — the bye rainbow.

**Stack skinny, not heavy.** Overstacking is a season-long move that makes spike weeks compound. In a single head-to-head week, three teammates just cannibalize the same touches and drag down your average. A quarterback plus one pass-catcher is enough correlation for this format.

**Don't close on four zeros.** The classic BBM ending — stack late-round rookie darts — is backwards here. Their value shows up in November, after most entries are already gone. Closing a draft with four late-developing rookies is the fanciest way to take four zeros, and it leaves you starting Week 1 with about 14 live players instead of 18. A rookie with a locked Week 1 role is fine; a bet on a midseason breakout is not.

Add all of that up and the standard board gets re-priced. Volume backs and late-bye players rise; boom-or-bust vertical receivers and late rookies fall.

![How the format re-prices the board: volume and late byes up, boom/bust and late rookies down.](/blog/images/eliminator-board-movers-2026-06-19.svg)

<!-- CHART SPEC
type: comparison-bars
data:
  - { label: "Dak Prescott (QB, DAL · bye 14)", move: 26 }
  - { label: "Tyler Warren (TE, IND · bye 13)", move: 19 }
  - { label: "Javonte Williams (RB, DAL · bye 14)", move: 13 }
  - { label: "Derrick Henry (RB, BAL · bye 13)", move: 12 }
  - { label: "Jayden Daniels (QB, WSH)", move: -37 }
  - { label: "Brian Thomas (WR, JAX)", move: -48 }
  - { label: "Mike Evans (WR, SF)", move: -58 }
  - { label: "Jordyn Tyson (WR rookie, NO)", move: -58 }
caption: Rank movement from standard Underdog ADP to my Eliminator board, 6/19 snapshot (positive = the format values him more). Volume and late byes rise; boom/bust receivers and late-developing rookies fall.
source: eliminator_rankings_2026-06-19.csv (move column)
-->

That re-priced board is the work behind all of this. I took the full Underdog board apart for the format, wrote a round-by-round game plan, and built anchor playbooks for the top dozen first-round picks — each one answering "you just took this player; now what shape do you build around his specific flaw?" The part that's live in the app is the bye math: flip on Eliminator Mode in the [Draft Assistant](/draft-assistant) and it shows your bye rainbow as you draft, which weeks each position room is off and where two players collide.

![INSERT IMAGE: screenshot of Eliminator Mode turned on in the Draft Assistant, showing the bye rainbow with a clashing (shared-bye) week highlighted in red]

One honest caveat: it's June, and Eliminator ADP is thin and noisy this early. These prices firm up in August as camps settle the depth charts, which is exactly when you want to draft a survival format that lives and dies on Week 1 certainty. Confirm your specific contest before you build [STAT NEEDED: current promo specifics — entry fee, prize pool, dates, and the Week 1 cut rate]. "Eliminator" is now a family of contests, and a tighter Week 1 cut than 6-of-12 actually wants more ceiling, not less. Every ADP here comes from [my own tracker](/adp-tracker), pulled 2026-06-23.

The spine doesn't move, though. Survive Week 1, reach Week 14, and never take a hole you can't afford. Draft the floor. The ceiling is a different contest.
