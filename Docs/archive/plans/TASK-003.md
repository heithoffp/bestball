<!-- Completed: 2026-03-29 | Commit: pending -->
# TASK-003: Draft launch channel strategy

**Status:** Approved
**Priority:** P2
**Feature:** FEAT-021

---

## Objective
Produce a channel strategy document that identifies, prioritizes, and provides actionable approach details for every channel through which Best Ball Portfolio Manager can reach serious best-ball drafters before and during the 2026 draft season. The deliverable informs pre-launch marketing efforts and FEAT-014 (landing page messaging).

## Verification Criteria
1. A channel strategy document exists at `Docs/Channel_Strategy.md`.
2. Document covers at minimum: Reddit, Twitter/X, Discord, YouTube, podcasts, and paid ads — with a clear keep/skip verdict for each.
3. Each kept channel has: target communities/accounts, approach (organic vs. paid vs. partnership), sample messaging hooks, and timing relative to launch.
4. Channels are ranked by expected ROI (reach × conversion likelihood ÷ effort) with rationale.
5. A "Phase 1 / Phase 2" split separates launch-week actions from sustained growth actions.
6. Strategy is consistent with pricing (TASK-002: $15/mo, $50/season, honest free tier) and competitive positioning (TASK-001: price undercut, zero-config, honest free tier vs. BBO's bait-and-switch).

## Verification Approach
1. Developer reviews `Docs/Channel_Strategy.md` against all 6 criteria above.
2. Developer confirms channel selections and messaging align with their knowledge of the best-ball community.

All verification is developer review — no commands to run (this is a strategy deliverable, not code).

## Files to Change
| File | Action | Description |
|------|--------|-------------|
| `Docs/Channel_Strategy.md` | Create | Channel strategy document — the primary deliverable |

## Implementation Approach

### Step 1: Research channels
Use web search to identify current best-ball communities, content creators, and gathering points across each platform:
- **Reddit** — Identify active best-ball subreddits (r/fantasyfootball, r/DynastyFF, r/bestball, etc.), their rules on self-promotion, and posting patterns.
- **Twitter/X** — Find high-engagement best-ball accounts, hashtags, and conversation patterns. Identify who the community follows and trusts.
- **Discord** — Identify active fantasy football Discord servers with best-ball channels, particularly those tied to popular podcasters/streamers.
- **YouTube** — Find active best-ball content creators (draft streams, strategy videos). Assess audience size and engagement.
- **Podcasts** — Identify best-ball-focused podcasts and their sponsorship models.
- **Paid ads** — Assess feasibility of Reddit ads, Twitter/X promoted posts, and Google/YouTube ads targeting best-ball keywords.

### Step 2: Evaluate and rank channels
For each channel, assess:
- **Reach:** How many serious best-ball drafters can we realistically touch?
- **Conversion likelihood:** Does this channel attract our target user (Underdog drafter, multiple teams, wants portfolio-level analytics)?
- **Effort/cost:** Time to execute, budget required, ongoing maintenance.
- **Speed to impact:** Can we activate this before/during launch week?

Rank channels by ROI and assign keep/skip.

### Step 3: Define messaging hooks
Craft 3-5 messaging angles informed by competitive positioning:
- Price ($50/season vs. $370/year BBO)
- Honest free tier (no bait-and-switch)
- Zero-config insights (no homework)
- Web-first (works outside draft windows)
- Analytics depth (roster archetypes, strategy classification)

### Step 4: Build the phased plan
- **Phase 1 (Launch week):** High-impact, low-cost actions to seed initial awareness. Focus on organic channels where we can demonstrate value directly.
- **Phase 2 (Sustained growth):** Ongoing activities, partnerships, and paid promotion to build momentum through the draft season (Feb–Aug).

### Step 5: Write up and present
Compile findings into `Docs/Channel_Strategy.md` with clear structure, specific targets, and actionable next steps per channel. Present to developer for review.

## Dependencies
- TASK-001 (Competitive analysis) — Complete ✓
- TASK-002 (Pricing tiers) — Complete ✓

## Open Questions
- Budget for paid promotion (Twitter ads, podcast sponsorships)?
- Is a beta/early-access program worth running to seed word-of-mouth?
- Should we consider a referral/affiliate program for content creators?
- Timeline — when is the target launch date relative to NFL Draft (April 24-26, 2026)?

---
*Approved by: Patrick H. — 2026-03-29*
