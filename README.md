# Best Ball Portfolio Dashboard

A web-based dashboard for analyzing and managing Underdog Fantasy Best Ball portfolios.  
The tool focuses on **exposure management**, **ADP trends**, and **portfolio risk** using uploaded CSV data.

This project is designed to support both **early-season drafts (Big Board)** and **late-season drafts (Best Ball Mania)** by adapting analysis depth to the available information.


To run the app `cd best-ball-manager` `npm run dev`
---

## Core Inputs

### 1. Portfolio / Exposure CSV
Typical Underdog export containing drafted rosters.

Expected fields (flexible mapping supported):
- `player_name`
- `position`
- `team`
- `entry_id` (roster identifier)
- `pick_round` (optional)
- `pick_overall` (optional)
- `bye_week` (optional)

### 2. Underdog ADP Data
Current or historical ADP snapshot(s).

Expected fields:
- `player_name`
- `position`
- `team`
- `adp`
- `adp_rank`
- `timestamp`

---

## MVP Features (Phase 1)

### CSV Upload & Parsing
- Upload portfolio and ADP CSVs


### Canonical Player Table
- Normalized player identity (name, position, team)
- Rookie flag
- Unique internal player ID

### Portfolio Overview
- Aggregate exposure table:
  - % of entries per player
  - Total count
  - Average draft position
- Filters by:
  - Position
  - Team
  - Individual entry

### Exposure Summary Dashboard
- Top exposures by player
- Exposure distribution by position
- Exposure distribution by team

### ADP vs Exposure Analysis
- Scatter plot:
  - X-axis: ADP
  - Y-axis: Portfolio exposure %
  - Bubble size: number of shares
- Highlight players where exposure diverges from market pricing

### ADP Time-Series
- Line chart of ADP over time
- Player selection with comparison overlay
- Ability to mark when portfolio shares were added


---

## Phase 2 Features (High-Value Analytics)

### Correlation Analysis
- Pairwise player correlation heatmap
- Identify correlated upside and shared failure modes
- Useful for detecting fragile portfolio construction

### Monte Carlo Portfolio Simulation
- Weekly scoring simulation
- Best-ball lineup selection logic
- Output distributions:
  - Median outcome
  - 90th / 99th percentile outcomes
  - Probability of top-X% finish

### Schedule-Aware Analysis
- NFL schedule integration
- Bye-week impact visualization
- Opponent strength indicators
- Identification of favorable week clusters

### What-If Scenarios
- Replace-player analysis
- Exposure rebalance preview
- Delta in portfolio EV and downside risk

### Draft Target Suggestions
- Identify players that:
  - Reduce correlation
  - Improve exposure balance
  - Offer high upside relative to ADP
  - Expected Round 2 combinations
- While drafting, compare combinations owned (round 1-3) vs available options

---

## Phase 3 Features (Advanced / Long-Term)

### Portfolio Optimization
- Exposure rebalancing recommendations
- Marginal EV per pick analysis
- Constraints for max exposure per player/team

### Historical Backtesting
- Apply strategies to past seasons
- Compare Big Board vs Best Ball Mania approaches
- ROI and finish distribution analysis

### Draft Simulation Engine
- ADP-aware draft simulator
- Strategy constraints (stacking, exposure caps)
- Pick recommendation logic

### Integrations
- Automatic Underdog data ingestion (if available)
- Google Sheets sync
- Notifications for major ADP shifts

---

## UX Principles

- Fast time-to-insight (<30 seconds from upload to dashboard)
- Drill-down friendly (portfolio → player → correlation)
- Explicit uncertainty (confidence indicators, timestamps)
- Manual overrides everywhere (expert-in-the-loop)
- Saved views for different drafting phases

---

## Data Integrity & Guardrails

- Player name matching must support:
  - Exact match
  - Normalized match
  - Fuzzy match
  - Manual override
- ADP data is timestamped and never treated as static truth
- Correlation and simulation models use regularization to avoid overfitting
- Historical distributions adjusted for rookies and injury risk

---

## Target Use Cases

- Identify overexposed players before advancing draft season
- Track ADP movement relative to portfolio exposure
- Reduce correlated downside risk
- Improve probability of top-percentile tournament outcomes
- Support different drafting strategies across the calendar year

---

## Non-Goals (Explicitly Out of Scope for MVP)

- Live draft assistant
- Player projection modeling from scratch
- Betting or DFS optimization
- Lineup setting (best-ball is automatic)

---

## Roadmap Summary

- **Phase 1:** Visibility & exposure management
- **Phase 2:** Risk, correlation, and simulation
- **Phase 3:** Optimization and automation

---

## Philosophy

This tool is designed to **augment expert decision-making**, not replace it.  
The goal is clarity, not automation for its own sake.

If the data is wrong or opaque, the analysis is useless — correctness and transparency come first.
