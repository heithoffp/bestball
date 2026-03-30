# Competitive Analysis — Best Ball Portfolio Tools

**Date:** 2026-03-28
**Purpose:** Inform pricing tiers (TASK-002) and launch messaging (TASK-003)

---

## Market Overview

The best-ball portfolio management space is small and emerging. Two direct competitors exist: **Best Ball Overlay** and **Spike Week**. Both rely heavily on Chrome extension overlays for the in-draft experience. Neither has strong brand recognition outside the streamer/hardcore community — a new best-ball player is unlikely to have heard of either.

**Where players gather:** Reddit, YouTube streams, Twitter/X. Best-ball streamers are the primary discovery channel for existing tools.

---

## Competitor 1: Best Ball Overlay

### Pricing
| Tier | Price | Notes |
|------|-------|-------|
| Free | $0 | Advertised as "Comprehensive ADP analysis" + "Compare Players Across All Tournaments" — but effectively useless. Free tier forces extension install, which is paywalled behind the paid tier. Deceptive funnel. |
| Monthly | $40/month | Single paid tier, no feature levels |
| Annual | $370/year | ~$31/month, slight discount |
| Promo | ~$30/month | Streamer promo codes widely available right now |

### Features
- **Combinatorial ownership analysis** — portfolio-wide view of player combinations, visible during drafts. Most similar to our Combo Analysis.
- **Portfolio analysis** — exposure and roster-level insights
- **Draft overlay** — Chrome extension that surfaces combination data in the Underdog draft room
- **ADP analysis** — advertised in free tier but not practically accessible

### Platform Coverage
- **Underdog only** — no DraftKings support. Interesting gap given DK's novice-friendly audience.

### Strengths
- Clean, polished UI on the overlay
- Strong streamer partnerships — most visible tool among best-ball content creators
- Portfolio-wide combinatorial view during drafts is compelling

### Weaknesses
- **Price:** $40/month is steep for a seasonal hobby tool
- **Free tier is a bait-and-switch:** advertised features require the paid extension
- **Shallow analytics:** not doing as much as they could with the data they have
- **Chrome-only:** no standalone web experience worth using
- **Underdog-only:** ignores the DraftKings market entirely

---

## Competitor 2: Spike Week

### Pricing
| Tier | Price | Notes |
|------|-------|-------|
| Monthly | $40/month | Same price point as Best Ball Overlay |
| Annual | $200/year | ~$17/month — significantly cheaper annually than BBO |

### Features
- **Draft overlay** — similar concept to Best Ball Overlay but visually inferior
- **Multi-sport support** — covers sports beyond football
- **Target exposure customization** — users can set per-player target exposures, and the tool suggests players to balance the portfolio toward those targets
- **Platform support** — handles both Underdog and DraftKings

### Strengths
- **DraftKings + Underdog support** — broader platform coverage
- **Annual pricing is reasonable** at $200/year
- **Multi-sport** may attract users who play across seasons

### Weaknesses
- **Overlay UI is notably worse** than Best Ball Overlay
- **Over-customization problem:** the per-player target exposure feature requires too much manual setup. Users want useful insights out of the box, not homework. This directly violates the "zero-config" principle that resonates with users.
- **Jack of all trades risk:** multi-sport breadth may come at the cost of best-ball depth

---

## Competitive Positioning: Best Ball Portfolio Manager

### Our Differentiators

| Advantage | Detail |
|-----------|--------|
| **Price point** | Target: "too good to resist" — significant undercut vs. the $40/month standard. Goal is broad adoption, not profit maximization. |
| **Zero-config insights** | Everything useful out of the box. No per-player target setting, no customization homework. The app tells you what matters without asking you to configure it first. |
| **Analytics depth** | Roster Archetypes (RB_HERO, RB_ZERO, etc.) are unique in this space — no competitor classifies roster construction strategy. Deeper statistical output than either competitor. |
| **Web-first experience** | Full standalone web app, not just a Chrome extension. Works anywhere, reviewable outside of draft windows. |
| **Faster iteration** | Solo developer with direct user feedback loop — can ship improvements faster than either competitor. |
| **Honest free tier** | If we offer a free tier, it should actually work — unlike Best Ball Overlay's bait-and-switch. |

### Gaps to Close

| Gap | Priority | Notes |
|-----|----------|-------|
| **Draft overlay / Chrome extension** | High | Both competitors center on the in-draft experience. We need this to compete directly. Feasible to build. |
| **DraftKings support** | Medium | Spike Week has this, BBO doesn't. Large novice player base on DK is an untapped audience. |
| **Streamer partnerships** | Medium | BBO's main distribution channel. We'll need visibility here or find alternative channels (Reddit, YouTube, Twitter). |

### Key Takeaways for Pricing (TASK-002)

1. **$40/month is the market rate** — both competitors charge this. There's clear room to undercut.
2. **Annual pricing varies widely** — BBO at $370/yr vs Spike Week at $200/yr. Annual discount is expected.
3. **A functional free tier is a differentiator** — BBO's broken free tier creates an opportunity for trust-building.
4. **Price is not the moat** — but combined with better out-of-box analytics and honest UX, an aggressive price point makes the product very hard to ignore.
5. **Target audience includes novices** — DraftKings players and people new to best-ball won't know competitors exist. Price + simplicity wins this segment.
