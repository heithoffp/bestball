# Vision and Scope
## Best Ball Exposures (BBE)

**Version:** 2.1
**Last revised:** 2026-06-26

---

## 1. Business Requirements

### 1.1 Background

Best-ball is a fantasy football format where managers draft rosters but never set lineups — the platform automatically selects each week's optimal starters. Because lineup management is removed, the format rewards *draft strategy* above all else. Serious best-ball players enter dozens or hundreds of drafts per season, creating a **portfolio** of rosters rather than a single team.

Managing a portfolio is a fundamentally different problem than managing a single team. A player's value isn't just their projected points — it's how much of your portfolio depends on them, whether your archetypes are diversified, and how your draft cost compares to current market price. Today, drafters track this with spreadsheets, memory, and gut feel. The information exists; it's just scattered across platform exports, ADP trackers, and mental models that break down past 20 rosters.

### 1.2 Business Opportunity

Best Ball Exposures is a commercial portfolio analytics tool. The market includes a small number of competitors (Best Ball Overlay, Spike Week, The Bag Manager) and a long tail of one-off Twitter tools and private spreadsheets. None deliver a complete portfolio-aware experience that is also low-friction enough for a casual drafter to adopt.

The opportunity is a purpose-built tool that does one thing well: show a best-ball drafter what their portfolio looks like *right now*, clearly enough that they can make informed decisions about their *next* draft without configuration overhead.

### 1.3 Commercial Model

BBE is a **paid SaaS subscription**. The product was previously a personal/free tool and pivoted to a commercial offering ahead of the NFL 2026 draft season.

| Aspect | Detail |
|--------|--------|
| Pricing | Nominal $20/mo, with 25% promo codes available (effective ~$15/mo) |
| Trial / guest tier | A `guest` tier exists with reduced feature access; landing page offers "Try Demo" with bundled sample data |
| Distribution | Web app at BestBallExposures.com + companion Chrome extension for roster sync |
| Auth & billing | Supabase auth, Stripe subscriptions, Stripe webhooks via Supabase Edge Functions (see ADR-001) |
| Marketing surface | Twitter / X handle [@BBExposures](https://x.com/BBExposures); paid promo codes targeted at best-ball streamers and content creators |
| Target | 500 subscribers by NFL 2026 |

For pricing details and channel strategy see `docs/Pricing_Strategy.md` and `docs/Channel_Strategy.md`. For competitive positioning see `docs/competitive-landscape.md`.

### 1.4 Customer Needs

The target user is a **serious best-ball drafter** entering 10+ drafts per season who cares about portfolio construction, not just individual rosters. Their needs:

- **Portfolio shape at a glance.** "Am I too concentrated on one player? Are my archetypes balanced? Am I overpaying or getting value?" — answered in seconds.
- **Low setup overhead.** Account creation and Chrome extension install are required; beyond that, every analytic must be useful immediately with no targets to set, no preference wizards.
- **Mobile-friendly.** Drafters check portfolios on phones between drafts. The experience must work on small screens without compromise.
- **Speed during live drafts.** When actively drafting, decisions happen in 30-second windows. The Draft Assistant must surface relevant context fast enough to be useful in real time.
- **Trust through transparency.** Show the data and the math, not a black-box score. Users will trust (and share) tools where they can verify the calculations against their own knowledge.

### 1.5 Business Risks

| Risk | Impact | Mitigation |
|------|--------|------------|
| Platform CSV/page-format changes break ingestion | High | Flexible parsing with column-name fallbacks; multi-platform support hedges single-platform breakage |
| Seasonal usage pattern (drafts run Feb–Aug) | Medium | Off-season retention via digests and welcome emails; accept seasonality as inherent |
| Competitor price war or feature-match | Medium | Defensible position via portfolio-level analytics depth and Mirror-Not-Advisor stance |
| Subscription churn after first draft season | Medium | Retention messaging is a top product priority; renewal hooks built into off-season touchpoints |
| Chrome extension distribution gating | Low | Direct install via Chrome Web Store; install button surfaced in app header |

---

## 2. Vision of the Solution

### 2.1 Vision Statement

> **Best Ball Exposures is the one-stop shop for best-ball portfolio awareness.** It is a mirror that shows the shape of a portfolio so clearly that the drafter naturally knows what to do next — without being told.

The app does not prescribe an optimal portfolio. It does not ask the user to set targets. It presents *what is* — exposures, archetypes, cost basis, trends — with enough clarity and visual immediacy that the right next action becomes obvious. The best insight is the one the user arrives at themselves.

### 2.2 Major Features

*For detailed behavior specs see `docs/Feature_Specs/`.*

#### 2.2.1 Dashboard
The first and most frequent screen. Answers "what does my portfolio look like?" in a single glance with headline metrics, top exposures by position, least-exposed players by ADP round, RB archetype distribution, draft capital by round, and drill-down cards into the detail tabs. The dashboard is the map; the tabs are neighborhoods.

#### 2.2.2 Exposures
Player-level exposure table — the foundational "what do I own?" view. Filterable by position, team, and strategy archetype with inline ADP sparklines for trend context.

#### 2.2.3 Rosters (Roster Viewer)
Individual roster deep-dive with composite grading, archetype classification, stack analysis, and CLV breakdown. Computed grades are appropriate here because the user is evaluating a single completed roster, not their portfolio strategy (per ADR-002).

#### 2.2.4 ADP Tracker
Multi-platform time-series chart showing ADP movement for portfolio players. Supports Underdog and DraftKings snapshots. Quartile pick-range overlays show the user's actual draft positions relative to current market.

#### 2.2.5 Combos
Cross-roster stacking pattern analysis. Surfaces which QB-to-teammate combinations and dual-QB pairs appear most frequently, revealing whether correlation bets are intentional or accidental.

#### 2.2.6 Rankings
Tier-based ranking system with drag-and-drop reordering. The user's personal pre-draft board, supporting per-platform rankings (Underdog and DraftKings) with CSV import/export.

#### 2.2.7 Draft Assistant
The single opinionated tab. Live-draft data companion that surfaces exposure %, ADP, strategy viability, and multi-factor candidate scoring (projected value, diversification, exposure penalty, strategy fit, reach penalty, strategy kill detection — see `utils/draftScorer.js`). Computed grades are appropriate here because it is a single-decision tool, not portfolio commentary.

#### 2.2.8 Help (contextual overlay)
Per-tab Help overlay (`HelpOverlay.jsx`) toggled from a global Help button in the tab bar. Replaces the original standalone Help Guide tab.

#### 2.2.9 Best Ball Arena
A new competitive/social pillar (see ADR-013). Visitors vote on blind head-to-head roster matchups ("which team would you rather have?"); each vote updates a hidden, server-computed Elo per eligible team, and an opt-in public leaderboard ranks enrolled teams. Viewing and voting are **free and guest-accessible** (a top-of-funnel for signups); **every synced team enters the Arena by default** with a single account-level leave/rejoin switch (ADR-016 retired the per-team paid enrollment hook; the Arena's monetization funnel is an open follow-up, TASK-292). This is the one place the product makes a cross-user, crowd-judged comparison — a conscious, bounded relaxation of the social-features, server-side, and Mirror-Not-Advisor boundaries (see §2.3 #1, §2.4, §3.2 and ADR-013). The analytics tabs remain single-user, client-only mirrors. See `docs/Feature_Specs/Best_Ball_Arena.md`.

### 2.3 Design Principles

These principles govern all product decisions. When in doubt, refer back here.

#### 1. Mirror, Not Advisor
The app describes portfolio state. It does not prescribe actions or judge a portfolio as "good" or "bad." Show facts; let the user draw conclusions. Avoid computed opinions (health scores, letter grades, red/green good/bad indicators) on portfolio-level views. The moment you show a "B+" you are implying you know what "A" looks like — and you are asking the user to trust your model over their own judgment.

Computed opinions are permitted in three places only:
- **Roster Viewer** — single-roster grading is evaluating *one finished thing*, not commenting on the portfolio.
- **Draft Assistant** — a live-draft decision tool requires opinionated ranking by definition.
- **Best Ball Arena** — an explicitly carved-out competitive zone where *crowd* opinion is the product (a server-computed Elo and a ranked leaderboard). This is not the app forming an opinion on your behalf; it is the field voting. See ADR-013.

For the analytics tabs (Dashboard, Exposures, ADP Tracker, Combos, Rankings) this principle remains **unconditional** — see ADR-002. ADR-013 clarifies the carve-out (two → three places); it does not weaken the rule for the mirror tabs.

#### 2. Zero-Config Insights
Every feature must be useful immediately after sync, with no additional setup. No personal targets, no preference wizards, no watchlists. Features that require configuration will be underutilized.

#### 3. Shape Over Spreadsheet
Use visual representations — charts, distributions, sparklines, small multiples — that create instant pattern recognition. A pie chart of archetype distribution tells the user "I'm top-heavy in Hero RB" faster than a column of percentages.

#### 4. Layered Depth
Headline facts at the top for the quick glance, detail below for the user who wants to dig. Most users will glance and move on. **That's success, not failure.** Don't force depth on users who just need confirmation.

#### 5. Dashboard-First Navigation
The Dashboard is the entry point and home base. Other tabs are drill-downs reached when the dashboard reveals something worth exploring. Hierarchy: Dashboard → Detail Tab → Individual Record.

#### 6. Transparency Builds Trust
Show the work. When displaying a metric, make its source clear. Users who understand the calculation will trust it, share the tool, and catch errors. Black-box scores erode confidence.

### 2.4 Assumptions and Dependencies

| Assumption / Dependency | Notes |
|------------------------|-------|
| Underdog and DraftKings export formats remain reasonably stable | Primary data sources via Chrome extension; flexible parsing handles known column-name variations |
| Client-side processing is sufficient for analytics | All **analytics** computation runs in the browser; Supabase is auth + storage + Stripe webhooks. ADR-013 adds a **bounded** server-side path for the Arena only (Elo, matchmaking, vote ingestion in Edge Functions) — it does not authorize a general server-side analytics backend |
| Supabase + Stripe remain operational | Required for paid-tier features; guest tier degrades gracefully |
| ADP snapshots are manually collected and bundled at build time | Date-stamped CSVs in `src/assets/adp/`; no live API feed |
| Users have 10+ rosters for portfolio analytics to be meaningful | Single-roster users get limited value from exposure/archetype views |
| React 19 + Vite 7 stack remains current | No planned migration |

---

## 3. Scope and Limitations

### 3.1 Implementation Status and Roadmap

See `BACKLOG.md` (active tasks) and `ROADMAP.md` (epics and features) at the repo root. Per-task plans live in `docs/plans/`.

### 3.2 Limitations and Exclusions

Things this product will **not** do. These are deliberate decisions, not deferred features.

| Exclusion | Rationale |
|-----------|-----------|
| User-configured exposure targets or "optimal portfolio" prescriptions | Violates *Zero-Config Insights* and *Mirror, Not Advisor* |
| Portfolio health scores or letter grades on the dashboard | Violates *Mirror, Not Advisor* (ADR-002). Computed opinions are reserved to Draft Assistant, Roster Viewer, and the Best Ball Arena (ADR-013) |
| Social / cross-user comparison features — **except the Best Ball Arena** | Out of scope for the portfolio-awareness tabs. **Relaxed, bounded to the Arena pillar** by ADR-013: blind head-to-head voting + an opt-in public leaderboard. The analytics tabs remain single-user |
| Live draft API integration | Platform APIs are unstable / unofficial. Roster sync via Chrome extension is reliable and platform-aware |
| Server-side analytics backend — **except the bounded Arena compute path** | Analytics stay client-only (simple deployment, sufficient browser performance). **Relaxed, bounded** by ADR-013: Elo, matchmaking, and vote ingestion run server-side in Supabase Edge Functions (ratings are `service_role`-write only). This does **not** authorize a general server-side analytics backend |
| Multi-sport support | Best-ball football only |
| Bankroll management or contest entry optimization | Different product |
| Roster Construction tab | Built but currently disabled in `App.jsx` for performance reasons. Source preserved; may be re-enabled if optimized |

---

## Appendix A: Glossary

| Term | Definition |
|------|------------|
| **ADP** | Average Draft Position — the market consensus pick where a player is being drafted |
| **Archetype** | A roster construction strategy defined by positional investment pattern (Hero RB, Zero RB, Hyper Fragile, Balanced; QB tiers; TE tiers) |
| **CLV (Closing Line Value)** | Difference between the pick where you drafted a player and their current ADP. Positive = bargain |
| **Exposure** | Percentage of your rosters that contain a specific player |
| **Portfolio** | Aggregate of all rosters a drafter has entered |
| **Stack** | Intentionally pairing correlated players (e.g., QB + WR from the same team) on a roster |
| **Spike Week** | A week where a player scores significantly above their average — critical in best-ball where only top scores count |
| **Uniqueness** | Roster-level rarity score (see ADR-003 and `utils/uniquenessEngine.js`) |

---

## Appendix B: Document Hierarchy

| Document | Purpose | Update Frequency |
|----------|---------|-----------------|
| `docs/Vision_and_Scope.md` (this file) | Product direction, design principles, exclusions | Quarterly or on major pivots |
| `docs/Feature_Specs/*.md` | Detailed behavior specs per implemented tab | When a feature is modified |
| `BACKLOG.md` (root) | Active and completed task table | Continuously (owned by hus-backlog) |
| `ROADMAP.md` (root) | Epics and features | On scope changes (owned by hus-backlog) |
| `docs/adr/*.md` | Architecture Decision Records | When a significant design decision is made (owned by hus-adr) |

*This document is the authoritative source for product direction. For implementation details, see Feature Specs. For status tracking, see BACKLOG.md.*
