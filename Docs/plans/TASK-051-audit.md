# TASK-051 — User Needs Audit

**Coverage key:** `Full` = question clearly answered | `Partial` = some data present but incomplete, buried, or unreliable | `None` = no feature addresses this

**Scope key:** `In Scope` = aligns with Mirror-not-Advisor principle | `Out of Scope` = requires prescribing actions, implying targets, or making judgments — app should not answer this | `Reframe` = the underlying data is mirror-appropriate but the question as stated is advisory; answer the reframed version only

---

## Section 1: Post-Draft Portfolio Questions

Questions a drafter asks between drafts, at season start, or while reviewing their book.

| # | Question | Feature | Coverage | Scope | Notes |
|---|----------|---------|----------|-------|-------|
| PD-01 | What is my overall exposure % for each player? | Exposures tab | Full | In Scope | |
| PD-02 | Who am I most exposed to by position? | Dashboard – Top Exposures | Full | In Scope | |
| PD-03 | Which players have I never drafted (0% exposure)? | Exposures tab (Show 0% toggle) | Full | In Scope | |
| PD-04 | How many total rosters do I have? | Dashboard – headline metric | Full | In Scope | |
| PD-05 | How does my positional draft capital compare to the market by round? | Dashboard – Draft Capital by Round | Full | In Scope | |
| PD-06 | What archetype strategies am I running (RB/QB/TE splits)? | Dashboard – Archetype Distribution | Full | In Scope | |
| PD-07 | How does my exposure look within a specific archetype segment? | Exposures tab – archetype filter | Full | In Scope | |
| PD-08 | What is my full archetype tree breakdown (RB → QB → TE paths)? | Roster Construction tab | Full | In Scope | |
| PD-09 | What does a specific individual roster look like? | Roster Viewer | Full | In Scope | |
| PD-10 | What is the CLV (closing line value) for picks on a specific roster? | Roster Viewer – CLV column | Full | In Scope | CLV is a computed fact (market moved, not an opinion) |
| PD-11 | What archetype does a specific roster run? | Roster Viewer – archetype badge | Full | In Scope | |
| PD-12 | How unique is a specific roster vs. my other rosters? | Roster Viewer – uniqueness score | Full | In Scope | Describes state, does not prescribe |
| PD-13 | What stacks is a specific roster running? | Roster Viewer – stack analysis | Full | In Scope | |
| PD-14 | What are my personal player tiers/rankings? | Player Rankings tab | Full | In Scope | User-authored, not app-generated |
| PD-15 | How has a player's ADP moved over time? | ADP Tracker tab | Full | In Scope | |
| PD-16 | What was my average draft pick vs. current ADP for each player? | ADP Tracker – Value column | Full | In Scope | Factual delta — not "you got value", just the number |
| PD-17 | Is a specific player rising or falling in ADP right now? | ADP Tracker – Trend col + Exposures sparkline | Full | In Scope | |
| PD-18 | What are the archetype paths for rosters containing a specific player? | Roster Construction – player search | Full | In Scope | |
| PD-19 | Who is ADP rising or falling across the whole market right now? | ADP Tracker (must navigate + sort) | Partial | In Scope | Not passively surfaced — FEAT-019 addresses this |
| PD-20 | Which players are highest/lowest exposure in each ADP round? | Dashboard – Exposure by ADP Round | Partial | In Scope | Shows highest + lowest but no zero-exposure gap view — TASK-054 |
| PD-21 | What QB stacks am I running across the whole portfolio? | Combo Analysis tab | Partial | In Scope | Tab disabled (performance) — FEAT-005 |
| PD-22 | How frequently does each team/game stack appear across my rosters? | Combo Analysis tab | Partial | Reframe | Original question "Am I over-concentrated?" is advisory — app shows frequency data only, user decides if it's too much |
| PD-23 | Which player pairs co-occur most or least across my rosters? | Combo Analysis (disabled); no heatmap | Partial | In Scope | FEAT-017 (Correlation Heatmap) |
| PD-24 | How do two or three specific rosters compare side-by-side? | No feature | None | In Scope | FEAT-018 (Roster Comparison Mode) |
| PD-25 | Can I export my exposure data to CSV? | No feature | None | In Scope | FEAT-007 (CSV Export) |
| PD-26 | What is my pick quality distribution by round (early vs. late vs. ADP)? | No feature | None | In Scope | Showing distribution is descriptive — TASK-052. Do not frame as "are you getting value" |
| PD-27 | What is the strategy score and archetype for each of my rosters in one view? | Draft Flow Analysis (manual only) | Partial | In Scope | Draft Assistant is the explicit Mirror exception — TASK-055 |
| PD-28 | What is my value/reach breakdown across all picks? | No feature | None | In Scope | Data presentation only — TASK-052 |
| PD-29 | How similar or different are my rosters to each other? | No feature | None | In Scope | Descriptive similarity metric — TASK-053 |

---

## Section 2: Live-Draft Questions

Questions a drafter asks in real-time while sitting in a live Underdog best-ball draft.

*Note: Per ADR-002, the draft overlay is a data companion only — it surfaces exposure %, ADP, and trend context. No scoring or ranked candidate lists. All LD questions must stay within Mirror-Not-Advisor: show factual data, do not prescribe picks.*

| # | Question | Feature | Coverage | Scope | Notes |
|---|----------|---------|----------|-------|-------|
| LD-01 | What is the draft score for each available player given my current roster? | No feature | None | Out of Scope | Scoring removed per ADR-002. Overlay shows exposure % and ADP data per player — user evaluates, no computed score. |
| LD-02 | What is my current portfolio exposure to a player I'm considering? | Draft Flow Analysis (manual) | Partial | In Scope | Pure data — exposure % is a fact |
| LD-03 | What positions do I still need to fill? | No feature | None | Out of Scope | Implies a target roster shape (e.g., "you need 2 more WR"). App does not define what a complete roster looks like. |
| LD-04 | What is this player's current ADP and recent trend? | Draft Flow Analysis (manual) | Partial | In Scope | Factual data — overlay should surface this inline |
| LD-05 | Does this pick kill my intended archetype strategy? | Draft Flow Analysis (manual) | Partial | In Scope | Strategy kill detection is descriptive — binary archetype viability state (yes/no the path is still open), not a pick recommendation. Consistent with Mirror-Not-Advisor. |
| LD-06 | Who should I prioritize before they're gone? | No feature | None | Out of Scope | Prescribes a pick action. Urgency modeling requires knowing what "should" be prioritized = advisory. |
| LD-07 | What is my current roster's archetype path mid-draft? | Draft Flow Analysis (manual) | Partial | In Scope | Describes state — mirror |
| LD-08 | What is my total portfolio exposure to a player I'm considering? | Draft Flow Analysis (manual) | Partial | In Scope | Pure data — factual exposure % |
| LD-09 | What is the ranked candidate list by composite draft score? | No feature | None | Out of Scope | Scored/ranked candidate lists removed per ADR-002. Overlay surfaces data per player; user ranks candidates themselves. |
| LD-10 | Am I building enough stack with my QB? | Draft Flow Analysis (manual) | Partial | Out of Scope | "Enough" implies a target correlation level the app should not set. App can show current stack count (mirror); judging sufficiency is advisory. |
| LD-11 | What is the ADP trend for a player I'm considering? | No inline feature | None | In Scope | Pure data — overlay should surface this |
| LD-12 | Is this player a strategy kill for my current archetype path? | Draft Flow Analysis (manual) | Partial | In Scope | Descriptive binary archetype viability state — not a pick recommendation. Consistent with Mirror-Not-Advisor. |
| LD-13 | Across my other drafts today, what has my lineup construction looked like? | No feature | None | In Scope | Descriptive cross-draft state — mirror. Post-overlay complexity. |
| LD-14 | What does a typical winning roster look like in this format? | No feature | None | Out of Scope | Prescriptive benchmark. Requires app to define "winning" = advisory. Violates Mirror principle. |

---

## Section 3: Gap List

In-scope questions rated `Partial` or `None` only. Out-of-scope questions are excluded.

### High-priority gaps (None — no feature at all)

| ID | Question | Candidate resolution |
|----|----------|---------------------|
| PD-24 | Side-by-side roster comparison | FEAT-018 (planned, not started) |
| PD-25 | CSV export | FEAT-007 (planned, not started) |
| PD-26 | Pick quality distribution by round | TASK-052 |
| PD-28 | Value/reach breakdown across all picks | TASK-052 |
| PD-29 | Inter-roster similarity / diversity metric | TASK-053 |
| LD-11 | ADP trend inline during draft | TASK-046/047 overlay scope |
| LD-13 | Cross-draft intra-session construction summary | Post-overlay — new task when overlay ships |

### Medium-priority gaps (Partial — exists but buried, incomplete, or disabled)

| ID | Question | Gap Detail | Candidate resolution |
|----|----------|-----------|---------------------|
| PD-19 | ADP movers/fallers passively surfaced | Must navigate to ADP Tracker and sort | FEAT-019 (ADP Movement Alerts on Dashboard) |
| PD-20 | Zero-exposure players per ADP round | Highest/lowest shown but no gap view | TASK-054 |
| PD-21 | QB stacks across portfolio | Combo Analysis disabled | FEAT-005 (Re-enable Combo Analysis) |
| PD-22 | Team/game stack frequency | Disabled tab; reframe away from "over-concentrated" judgment | FEAT-005 — surface frequency data only |
| PD-23 | Player-pair co-occurrence heatmap | Combo disabled; heatmap absent | FEAT-017 (Correlation Heatmap) |
| PD-27 | Per-roster strategy scorecard | Manual re-entry; no summary view | TASK-055 |
| LD-01 | Live candidate scoring inline | Manual web app only | TASK-046/047 |
| LD-02 | Live portfolio exposure check | Manual web app only | TASK-046/047 |
| LD-04 | ADP and trend inline during draft | Manual web app only | TASK-046/047 |
| LD-05 | Strategy kill flag inline | Logic exists, not exposed in extension | TASK-047 |
| LD-07 | Current archetype path mid-draft | Manual web app only | TASK-046/047 |
| LD-08 | Portfolio exposure inline | Manual web app only | TASK-046/047 |
| LD-09 | Ranked candidate list inline | Manual web app only | TASK-046/047 |
| LD-12 | Strategy kill flag inline | Logic exists, not exposed | TASK-047 |

---

## Out-of-Scope Questions (Mirror-not-Advisor exclusions)

These questions will not be addressed by this application. They require the app to prescribe actions, set implicit targets, or make judgments on behalf of the user.

| ID | Question | Reason |
|----|----------|--------|
| LD-03 | What positions do I still need to fill? | Implies a target roster shape — app does not define optimal construction |
| LD-06 | Who should I prioritize before they're gone? | Prescribes a pick action — advisory |
| LD-10 | Am I building enough stack with my QB? | "Enough" requires a correlation target — violates zero-config principle |
| LD-14 | What does a typical winning roster look like? | Prescriptive benchmark — defines "winning" for the user |
