# Competitive Landscape Audit

**Last updated:** 2026-04-06
**Task:** TASK-163
**Purpose:** Catalog free and paid best-ball portfolio tools to inform value proposition (TASK-164) and landing page copy (TASK-165).

---

## Free / Freemium Tools

### The Bag Manager

| Field | Detail |
|-------|--------|
| **Type** | Chrome extension |
| **Developer** | u/dmuney |
| **URL** | [Chrome Web Store](https://chromewebstore.google.com/detail/the-bag-manager/obhjhofochndbceaalcfcdfcljghmjom) |
| **Reddit** | [r/BestBall post](https://www.reddit.com/r/BestBall/comments/1sda3k2/i_built_a_free_chrome_extension_for_tracking_best/) |
| **Pricing** | Free (no account required) |
| **Platforms** | Underdog, DraftKings. Drafters and FFPC planned. |

**Features:**
- Live exposure overlay on draft board
- Stack highlighting across portfolio
- Analytics panel (draft capital breakdown, positional grid, ADP value, stack counts)
- One-click history import of completed drafts
- Side panel for draft history and settings

**Architecture:** Runs entirely in-browser, no data sent externally, no account required.

**Roadmap:** Drafters + FFPC support, auto-syncing slow drafts, companion website with deeper portfolio analytics.

**Community reception:** 12 upvotes, 94% upvote ratio, 5 comments — all positive. Users appreciated DK support (where exposure tracking is harder). Slow draft support confirmed working.

**Threat level: HIGH** — Most directly competitive free tool. Same concept (portfolio tracking, exposure overlay, client-side, no account), supports both UD and DK. Active developer with plans for a companion analytics site.

---

### Best Ball Team Builder

| Field | Detail |
|-------|--------|
| **Type** | Web app (browser-based, mobile-friendly) |
| **Developer** | u/DeliciousAd3239 |
| **URL** | [BestBallTeamBuilder.com](https://www.bestballteambuilder.com/underdog-best-ball-team-builder) |
| **Reddit** | [r/BestBall post](https://www.reddit.com/r/BestBall/comments/1l2c3ga/if_you_draft_best_ball_on_underdog_i_built_a_free/) |
| **Pricing** | Free tier (up to 20 teams). Pro tier exists (500 teams, CSV import, CLV tracking) — pricing TBD. |
| **Platforms** | Underdog only |

**Features:**
- Team and playoff stacking optimizer using live Underdog ADP
- Roster tracking panel (Roster / Team Stacks / Playoff Stacks tabs)
- Customizable team filters for mid-draft pivots
- Draft slot selection with stack probability highlighting
- Live ADP Trends (risers/fallers)
- BBM Winners archive (2023+)
- Weekly Perfect Lineups (in-season)
- Portfolio saving / exposure tracking

**Community reception:** 17 upvotes, 96% upvote ratio, 7 comments — very positive. Developer is responsive (provided tutorial video). One user reported ADP data loading bug.

**Threat level: MEDIUM** — Strong stacking focus and free tier, but Underdog only and not an overlay (requires manual dual-entry of picks in a separate window).

---

### THE SOLVER Explorer (Establish The Run)

| Field | Detail |
|-------|--------|
| **Type** | Web app (Best Ball Explorer) + Chrome extension (Draft Assistant, paid) |
| **Developer** | Establish The Run (ETR) |
| **URL** | [thesolver.com](https://thesolver.com/) |
| **Pricing** | Explorer: **Free**. Draft Assistant: **Paid** (~$25-45/mo estimated). Requires ETR subscription for rankings sync. |
| **Platforms** | Underdog, DraftKings |

**Features (Free Explorer):**
- Exposure tracking across all entries from UD and DK
- ADP trend tracking
- Draft Capital CLV measurement
- Single-draft deep-dive

**Features (Paid Draft Assistant):**
- Smart Player Recommendations (beta)
- Real-time SOLVER scores updated per pick
- Post-draft performance reports
- Combo ownership tracking
- Stacking/correlation indicators
- ETR rankings integration

**Community sentiment:** Respected due to ETR brand. Seen as analytical/data-heavy.

**Threat level: MEDIUM** — Free Explorer competes on exposure tracking. ETR brand credibility is strong, but requires ETR subscription for full value and pricing is opaque.

---

### FantasyLife Best Ball HQ

| Field | Detail |
|-------|--------|
| **Type** | Web app |
| **URL** | [fantasylife.com/tools/best-ball-hub](https://www.fantasylife.com/tools/best-ball-hub) |
| **Pricing** | Basic features free. Full portfolio tools require **FantasyLife+** subscription. |
| **Platforms** | Underdog (primary) |

**Features:**
- CSV upload of exposure data from Underdog email exports
- Portfolio management dashboard
- Player exposure tracking, stack CLV, player CLV
- Team exposures, rankings

**Threat level: LOW** — Relies on manual CSV upload from Underdog emails. Limited free tier. Not a draft-time tool.

---

### RotoGrinders Underdog Tools

| Field | Detail |
|-------|--------|
| **Type** | Chrome + Firefox extension |
| **URL** | [Chrome extension](https://chrome-stats.com/d/gmkifldndgcobdkfnfdfhmkmenjcbgoo) |
| **Pricing** | Extension download free, but **requires RotoGrinders Premium** for projection data. |
| **Platforms** | Underdog |

**Features:**
- RotoGrinders player projections overlaid on Underdog pick'em and draft pages

**Threat level: LOW** — Not truly free (premium sub required). Focused on pick'em more than best-ball portfolio analysis.

---

## Paid Competitors

### Best Ball Overlay (BBO)

| Field | Detail |
|-------|--------|
| **Type** | Chrome extension (free) + web app (paid) |
| **URL** | [bestballoverlay.com](https://bestballoverlay.com/) |
| **Pricing** | Extension: **Free**. Portfolio Analytics PRO: **$24.99/mo**. |
| **Platforms** | Underdog only (separate Drafters extension exists) |

**Features (Free Extension):**
- Real-time exposure %
- QB stack correlations with bring-backs
- Playoff schedule + dome game indicators
- Team-based draft extraction
- CSV export, combo tool

**Features (PRO Web App):**
- CLV tracking with historical trends
- Playoff stack analysis (Wk 15-17)
- Player exposure across tournaments
- Interactive exposure management
- Custom rankings with history
- ADP movement tracking
- Player comparison tools

**Social proof:** Chrome extension rated 4.9/5 from 127 reviews. Claims "$1,000,000+ combined winnings through our tools." Partnership with FanSpeak.

**Community sentiment:** Well-regarded. Users call overlays and portfolio optimizer "game changers." Dominant brand in the space.

**Threat level: HIGH** — Primary competitor. Free extension is genuinely useful and widely adopted. PRO tier at $25/mo is the price anchor for portfolio analytics.

---

### Spike Week (Draft Hacker + DraftIQ)

| Field | Detail |
|-------|--------|
| **Type** | Browser extension (**Firefox only**) + web app |
| **URL** | [spikeweek.com](https://spikeweek.com/) |
| **Pricing** | **$24.98/mo** or **$200/yr** (annual saves ~$100). |
| **Platforms** | Underdog, DraftKings, Drafters, FastDraft |

**Features (Draft Hacker):**
- Customizable data overlays on draft screen
- Correlations, playoff schedules, exposure tracking
- Fully customizable colors and data display
- Mobile version available

**Features (DraftIQ):**
- Portfolio and exposure management
- Stacks, player combos, Week 17 correlations
- Opponent exposures — all auto-tracked
- Claims "the very first best ball portfolio and exposure management tool"

**Community sentiment:** Respected in the community. Strong content brand (podcast + articles).

**Weaknesses:** Firefox-only extension is major friction. Premium-only, no free tier.

---

### Draft Caddy (Endgame Syndicate / Run The Sims)

| Field | Detail |
|-------|--------|
| **Type** | Chrome + Firefox extension |
| **URL** | [endgamesyndicate.com/draft-caddy](https://endgamesyndicate.com/draft-caddy/) |
| **Pricing** | **$29.99/mo** (NFL). MLB/NBA at $10/mo. |
| **Platforms** | Underdog, DraftKings, Drafters |

**Features:**
- Configurable best ball draft settings
- Customized data overlays
- Combo player ownership projections (BBM-specific)
- Custom ADP uploads
- Player matchup data
- Personal exposure % during live drafts

**Developers:** Four gambling professionals (Youdacao, NerdyTenor, Bric75, ShipMyMoneyDFS).

**Weaknesses:** Most expensive monthly at $30. Requires login. Smaller community, less polish.

---

### LegUp Sidekick (Legendary Upside)

| Field | Detail |
|-------|--------|
| **Type** | Web app (draft companion, not an overlay) |
| **URL** | [legendaryupside.com/sidekick](https://www.legendaryupside.com/sidekick/) |
| **Pricing** | **$499/yr** (~$50/mo) or **$199/mo**. Price locks at signup rate. |
| **Platforms** | Underdog, DraftKings |

**Features:**
- Sim-driven dynamic rankings updated after each pick
- Automatic roster adjustment
- Handles multiple simultaneous fast drafts
- Custom ranking uploads
- Accounts for injury/suspension/bench risk
- Jaccard Similarity portfolio diversification tool
- Market Visualizer

**Community sentiment:** Premium-tier product. Respected for analytical depth.

**Weaknesses:** By far the most expensive ($499-$2,388/yr). Not an overlay. No free tier.

---

## Price Positioning Map

| Tool | Monthly Cost | Free Tier? | Platforms |
|------|-------------|------------|-----------|
| The Bag Manager | $0 | Yes (fully free) | UD, DK |
| Best Ball Team Builder | $0 / Pro TBD | Yes (20 teams) | UD |
| THE SOLVER Explorer | $0 | Yes | UD, DK |
| BBO Chrome Extension | $0 | Yes | UD |
| BBO Portfolio PRO | $24.99/mo | No | UD |
| Spike Week Premium | $24.98/mo ($200/yr) | No | UD, DK, Drafters, FastDraft |
| THE SOLVER Draft Asst. | ~$25-45/mo | No | UD, DK |
| Draft Caddy | $29.99/mo | No | UD, DK, Drafters |
| LegUp Sidekick | ~$50/mo ($499/yr) | No | UD, DK |
| **Us (target)** | **$20/mo ($15 w/ promo)** | **Beta free through May 4** | **UD, DK** |

---

## Market Gaps and Opportunities

### 1. Multi-platform portfolio analytics at low cost
No free tool covers both Underdog AND DraftKings for portfolio-level analytics. THE SOLVER Explorer is closest but basic. We support both.

### 2. Post-draft portfolio awareness is underserved in free tier
Most tools focus on in-draft overlays. Exposure analysis, archetype analysis, combo analysis, and draft flow analysis after the draft are premium features everywhere else or don't exist.

### 3. Archetype classification is unique
Nobody else classifies rosters into strategic archetypes (RB_HERO, RB_ZERO, RB_HYPER_FRAGILE, RB_VALUE). This is a genuine differentiator.

### 4. Draft flow analysis is unique
No competitor offers round-by-round draft flow visualization across a portfolio.

### 5. Zero-config simplicity
Every paid tool requires meaningful setup, account creation, or configuration. Our "just sync via the Chrome extension and go" philosophy is differentiated.

### 6. DraftKings support is sparse
Most polished tools are Underdog-first. DK users have fewer quality options.

---

## Direct Threats

| Threat | Why |
|--------|-----|
| **The Bag Manager** | Same concept, free, UD + DK, active dev planning a companion analytics site. Most directly competitive. |
| **BBO free extension** | Market standard for in-draft overlay. 127 reviews, 4.9 stars. Hard to displace. |
| **THE SOLVER Explorer** | Free exposure tracking with ETR credibility. |
| **Best Ball Team Builder** | Free stacking tool, growing community. |

---

## Our Positioning (for TASK-164)

**Price:** $20/mo undercuts BBO PRO ($25), Spike Week ($25), Draft Caddy ($30), and LegUp ($50). With 25% promo ($15 effective), we're the cheapest paid portfolio analytics tool.

**Unique features competitors lack:**
- Roster archetype classification
- Draft flow analysis
- Portfolio-level combo analysis (BBO charges $25/mo for this)
- Cross-module roster navigation
- Zero-config design (no targets, no setup — just sync and explore)

**Weakness to address:**
- No Chrome extension overlay yet (The Bag Manager, BBO have this free)
- No live ADP data feed (Best Ball Team Builder, BBO have this)
- Brand awareness is zero — competing against established names
