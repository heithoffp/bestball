# Vision and Scope Document
## Best Ball Portfolio Manager

**Version:** 1.1
**Date:** 2026-03-23
**Author:** Patrick H.

---

## 1. Business Requirements

### 1.1 Background

Best-ball is a fantasy football format where managers draft rosters but never set lineups — the platform automatically selects each week's optimal starters. Because lineup management is removed, the format rewards *draft strategy* above all else. Serious best-ball players enter dozens or hundreds of drafts per season, creating a **portfolio** of rosters rather than a single team.

Managing a portfolio of this scale is a fundamentally different problem than managing one team. A player's value isn't just their projected points — it's how much of your portfolio depends on them, whether your archetypes are diversified, and how your draft cost compares to current market price. Today, best-ball players track this with spreadsheets, memory, and gut feel. The information exists — it's just scattered across platform export files, ADP trackers, and mental models that break down past 20 rosters.

### 1.2 Business Opportunity

No dedicated tool exists that aggregates a player's best-ball drafts into a portfolio-level view and presents it clearly. Current options:

- **Platform sites (Underdog, DraftKings):** Show individual rosters but offer no cross-roster analytics. A player who has drafted 50 rosters must mentally aggregate their exposure, archetype balance, and cost basis.
- **Spreadsheets:** Flexible but require manual data wrangling for every new draft. No visualization, no ADP integration, high friction.
- **Twitter/community tools:** Occasionally someone builds a one-off exposure calculator, but these are ephemeral, single-purpose, and not maintained.

The opportunity is a purpose-built tool that does one thing well: show a best-ball drafter what their portfolio looks like *right now*, clearly enough that they can make informed decisions about their *next* draft without any setup or configuration.

### 1.3 Business Objectives and Success Criteria

| Objective | Success Metric |
|-----------|---------------|
| Community adoption beyond the developer | Active users other than the author |
| Retention across draft season | Users return and re-upload after new drafts |
| Word-of-mouth growth | Organic sharing in best-ball communities (Twitter, Discord, podcasts) |
| Low friction onboarding | A new user can upload data and understand their portfolio within 60 seconds |

### 1.4 Customer or Market Needs

The target user is a **serious best-ball drafter** — someone entering 10+ drafts per season who cares about portfolio construction, not just individual rosters. Their needs:

- **See portfolio shape at a glance.** "Am I too concentrated on one player? Are my archetypes balanced? Am I overpaying or getting value?" — answered in seconds, not minutes of spreadsheet work.
- **Zero setup overhead.** No targets to configure, no preferences to set, no accounts required to start. Upload a CSV, see results. Every feature that requires user configuration is a feature that will be underutilized.
- **Mobile-friendly.** Drafters check portfolios on their phones between drafts, on the couch, in line. The experience must work on small screens without compromise.
- **Speed during live drafts.** When actively drafting, decisions happen in 30-second windows. The draft assistant must surface recommendations fast enough to be useful in real time.
- **Trust through transparency.** Show the data, not a black-box score. Users will trust (and share) a tool where they can see exactly what's being calculated and verify it against their own knowledge.

### 1.5 Business Risks

| Risk | Impact | Mitigation |
|------|--------|------------|
| Underdog CSV format changes break data ingestion | High — app becomes unusable until parser is updated | Flexible CSV parsing with column name fallbacks; support multiple naming conventions |
| Single-platform support limits addressable audience | Medium — DraftKings/Sleeper users can't use the tool | Multi-platform CSV parsing planned for subsequent release |
| Seasonal usage pattern (drafts run Feb–Aug) | Medium — app sits idle 6 months/year | Season-long features (projections, results tracking) can extend utility; accept seasonality as inherent to the market |
| Client-side architecture limits data freshness | Low — ADP data requires manual CSV snapshots | Acceptable for v1.0; automated ADP feeds are a future consideration |

---

## 2. Vision of the Solution

### 2.1 Vision Statement

> **Best Ball Portfolio Manager is the one-stop shop for best-ball portfolio awareness.** It is a mirror that shows you the shape of your portfolio so clearly that you naturally know what to do next — without being told.

The app does not prescribe an optimal portfolio. It does not ask you to set targets. It presents *what is* — your exposures, your archetypes, your cost basis, your trends — with enough clarity and visual immediacy that the right next action becomes obvious to *you*. The best insight is the one the user arrives at themselves.

### 2.2 Major Features

*For detailed behavior specifications, see `Docs/Feature_Specs/`.*

#### 2.2.1 Dashboard (Landing Page)
The user's first and most frequent screen. Answers "what does my portfolio look like?" in a single glance with headline metrics, portfolio shape visualizations, and drill-down entry points to detail tabs. The dashboard is the map; the tabs are neighborhoods.

#### 2.2.2 Exposure Analysis
Player-level exposure table — the foundational "what do I own?" view. Filterable by position, team, and strategy archetype with inline ADP sparklines for trend context.

#### 2.2.3 ADP Tracker
Time-series chart showing ADP movement for portfolio players. Answers "is the market agreeing or disagreeing with my drafts?" by surfacing price trends relative to what the user paid.

#### 2.2.4 Draft Assistant
Live-draft data companion — surfaces exposure %, ADP, and trend context for available players during live drafts. Consistent with Mirror-Not-Advisor: data only, no scoring or ranked recommendations.

#### 2.2.5 Roster Viewer
Individual roster deep-dive with composite grades, archetype classification, stack analysis, and CLV breakdown. Computed grades are appropriate here because the user is evaluating a single completed roster, not their portfolio strategy.

#### 2.2.6 Player Rankings
Tier-based ranking system with drag-and-drop reordering. The user's personal board for pre-draft preparation, exportable to CSV.

#### 2.2.7 Combo Analysis
Cross-roster stacking pattern analysis. Surfaces which QB-to-teammate combinations and QB pairs appear most frequently, revealing whether correlation bets are intentional or accidental.

#### 2.2.8 Roster Construction
Hierarchical view of portfolio archetype distribution across the strategy tree (RB path x QB path x TE path). Lets users drill from portfolio-level strategy balance down to individual rosters.

#### 2.2.9 Help Guide
In-app guide covering each feature's purpose, controls, and terminology. Serves as onboarding for new users and reference for experienced ones.

### 2.3 Design Principles

These principles govern all product decisions. When in doubt, refer back here.

#### 1. Mirror, Not Advisor
The app describes portfolio state. It does not prescribe actions or judge whether your portfolio is "good" or "bad." Show facts and let the user draw conclusions. Avoid computed opinions (health scores, letter grades, red/green good/bad indicators) on portfolio-level views. The moment you show a "B+" you're implying you know what "A" looks like — and you're asking the user to trust your model over their own judgment.

#### 2. Zero-Config Insights
Every feature must be useful immediately after CSV upload with no additional setup. No personal targets, no preference wizards, no required accounts, no watchlists to maintain. Features that require user configuration will be underutilized. If a feature can't deliver value without setup, redesign it until it can.

#### 3. Shape Over Spreadsheet
Use visual representations — charts, distributions, sparklines, small multiples — that create instant pattern recognition. A pie chart of archetype distribution tells you "I'm top-heavy in RB_HERO" faster than a column of percentages. The user should *see* their portfolio shape before they read a number.

#### 4. Layered Depth
Present information in layers: headline facts at the top for the quick glance, detail below for the user who wants to dig. Most users will glance at the headlines and move on. **That's success, not failure.** Don't force depth on users who just need confirmation that things look roughly right.

#### 5. Dashboard-First Navigation
The dashboard is the entry point and the home base. Other tabs are drill-downs you reach when the dashboard reveals something worth exploring. The hierarchy is: Dashboard → Detail Tab → Individual Record.

#### 6. Transparency Builds Trust
Show your work. When displaying a metric, make it clear where the number comes from. Users who understand the calculation will trust it, share the tool, and catch errors. Black-box scores erode confidence.

### 2.4 Assumptions and Dependencies

| Assumption / Dependency | Notes |
|------------------------|-------|
| Underdog CSV export format remains stable | Primary data source; parser handles known column name variations |
| Client-side-only processing is sufficient | All computation happens in the browser; no server-side analytics |
| Supabase provides auth and cloud storage | Optional — app works fully without authentication via IndexedDB fallback |
| ADP snapshots are manually collected | Date-stamped CSV files bundled at build time; no live API feed |
| Users have 10+ rosters to make portfolio analytics meaningful | Single-roster users get limited value from exposure/archetype analysis |
| React 19 + Vite 7 remain the framework | No planned migration |

---

## 3. Scope and Limitations

### 3.1 Implementation Status and Roadmap

See `Docs/Backlog.md` for current implementation status, remaining v1.0 work, identified improvements, and planned future features.

### 3.2 Limitations and Exclusions

Things this product will **not** do. These are deliberate decisions, not deferred features.

| Exclusion | Rationale |
|-----------|-----------|
| User-configured exposure targets or "optimal portfolio" prescriptions | Violates *Zero-Config Insights* and *Mirror, Not Advisor*. Too much overhead; will be underutilized. The app shows what is, not what should be. |
| Portfolio health scores or letter grades on the dashboard | Violates *Mirror, Not Advisor*. Computed opinions belong in the Draft Assistant and Roster Viewer, not on the portfolio overview. |
| Social features (sharing portfolios, comparing with other users) | Out of scope for a portfolio awareness tool. Adds complexity without serving the core use case. |
| Live draft API integration | Platform APIs are unstable/unofficial. Manual entry is reliable and platform-agnostic. |
| Server-side processing or analytics backend | Client-only architecture keeps deployment simple and costs zero. Browser performance is sufficient for the data volumes involved. |
| Multi-sport support | Best-ball football is the sole domain. Generalizing dilutes the product. |
| Bankroll management or contest entry optimization | Financial optimization is a different product. This tool is about roster construction awareness. |

---

## Appendix A: Glossary

| Term | Definition |
|------|-----------|
| **ADP** | Average Draft Position — the market consensus on where a player is being drafted |
| **Archetype** | A roster construction strategy defined by positional investment pattern (e.g., RB_HERO, RB_ZERO, RB_HYPER_FRAGILE) |
| **CLV (Closing Line Value)** | The difference between the pick position where you drafted a player and their current ADP. Positive = you got a bargain. |
| **Exposure** | The percentage of your rosters that contain a specific player |
| **Portfolio** | The aggregate of all rosters a drafter has entered across contests |
| **Stack** | Intentionally pairing correlated players (e.g., QB + WR from the same team) on a single roster |
| **Spike Week** | A week where a player scores significantly above their average — critical in best-ball where only top scores count |

---

## Appendix B: Document Hierarchy

| Document | Purpose | Update Frequency |
|----------|---------|-----------------|
| `Docs/Vision_and_Scope.md` (this file) | Product direction, design principles, exclusions | Quarterly or on major pivots |
| `Docs/Feature_Specs/*.md` | Detailed behavior specs per implemented feature | When a feature is modified |
| `Docs/Backlog.md` | Prioritized work items and status tracking | Every development session |

*This document is the authoritative source for product direction. For implementation details, see Feature Specs. For status tracking, see Backlog.*
