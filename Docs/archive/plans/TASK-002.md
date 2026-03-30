<!-- Completed: 2026-03-28 | Commit: pending -->
# TASK-002: Define pricing tiers and feature gating strategy

**Status:** Approved
**Priority:** P1
**Feature:** FEAT-021

---

## Objective
Define the pricing model, tier structure, and feature-to-tier mapping for Best Ball Portfolio Manager. This decision drives FEAT-002 (Stripe integration, subscription sync, feature gating) and FEAT-014 (landing page messaging). Output is a documented tier structure ready for implementation.

## Verification Criteria
1. A pricing document exists with tier names, prices, and billing periods clearly defined.
2. Every app feature is mapped to exactly one tier (Guest, Free, or Pro).
3. The feature gating table is unambiguous — an implementer can read it and build the gate logic without further clarification.
4. Pricing is informed by competitive analysis (TASK-001) with explicit positioning rationale.
5. Guest mode, Free tier, and Pro tier have distinct value propositions with a clear upgrade path.

## Verification Approach
1. Review this plan document against all 5 criteria above.
2. Confirm every component listed in CLAUDE.md's Architecture section appears in the feature gating table.
3. Developer reviews the pricing strategy and confirms it aligns with business goals.

All verification is developer review — no commands to run (this is a strategy deliverable, not code).

## Files to Change
| File | Action | Description |
|------|--------|-------------|
| `Docs/plans/TASK-002.md` | Modify | This file — contains the pricing spec as the deliverable |

## Implementation Approach

This is a strategy task. The deliverable is the pricing spec below, not code.

---

## Pricing Spec

### Context from Competitive Analysis (TASK-001)
- Market rate: $40/month (both Best Ball Overlay and Spike Week)
- BBO annual: $370/yr (~$31/mo); Spike Week annual: $200/yr (~$17/mo)
- BBO's free tier is a bait-and-switch — opportunity to differentiate with an honest free tier
- Our positioning: aggressive price + zero-config insights + deeper analytics + web-first

### Pricing Model: Seasonal + Monthly
Best-ball drafting is seasonal (Feb–Aug). A seasonal pass aligns with user behavior and simplifies the value proposition. Monthly option available for users who start later in the season.

### Tier Structure

#### Guest Mode (No Account)
- **Price:** Free, no signup required
- **Purpose:** Zero-friction trial — proves the tool works before asking for anything
- **Includes:** Full app with bundled sample data only. Cannot upload own CSVs.
- **Rationale:** Visitors explore every tab with realistic data. No bait-and-switch. This is how we build trust that BBO destroys.

#### Free Tier (Account Required)
- **Price:** $0
- **Purpose:** Honest free tier that delivers real value — builds trust and word-of-mouth
- **Includes:**
  - Dashboard
  - Exposure Table
  - ADP Tracker
  - Help Guide
  - Own CSV upload (rosters + ADP)
  - IndexedDB local storage
- **Limits:** Up to 25 rosters, 1 ADP snapshot
- **Rationale:** Core portfolio awareness is free. Users see their exposure and ADP trends — the fundamental value prop. Roster limit encourages natural upgrade for serious drafters (10+ drafts = likely 30+ rosters).

#### Pro Tier (Paid)
- **Price:** $15/month OR $50/season (Feb 1 – Aug 31)
- **Purpose:** Full analytics for serious drafters at a "no-brainer" price point
- **Includes:** Everything in Free, plus:
  - Draft Assistant (strategy-aware candidate scoring)
  - Roster Viewer (composite grades, archetype classification)
  - Player Rankings (custom tier board)
  - Combo Analysis (cross-roster stacking patterns)
  - Roster Construction (archetype distribution tree)
  - Supabase cloud storage (sync across devices)
  - Unlimited rosters and ADP snapshots
  - CSV export on all views
- **Rationale:** $50/season is ~60% cheaper than Spike Week annual ($200) and ~87% cheaper than BBO annual ($370). At this price, upgrading is an impulse decision. Monthly at $15 is still well below the $40 market rate.

### Why Two Tiers, Not Three
- Simplicity: one upgrade decision, not two
- Avoids "which paid tier?" analysis paralysis
- Every paid feature is immediately available
- If a power-user segment emerges later, easier to add a tier than remove one

### Feature Gating Table

| Feature | Guest | Free | Pro |
|---------|-------|------|-----|
| Dashboard | ✓ (sample data) | ✓ | ✓ |
| Exposure Table | ✓ (sample data) | ✓ | ✓ |
| ADP Tracker | ✓ (sample data) | ✓ | ✓ |
| Help Guide | ✓ | ✓ | ✓ |
| CSV Upload | ✗ | ✓ (25 roster limit) | ✓ (unlimited) |
| Draft Assistant | ✓ (sample data) | ✗ | ✓ |
| Roster Viewer | ✓ (sample data) | ✗ | ✓ |
| Player Rankings | ✓ (sample data) | ✗ | ✓ |
| Combo Analysis | ✓ (sample data) | ✗ | ✓ |
| Roster Construction | ✓ (sample data) | ✗ | ✓ |
| Cloud Storage (Supabase) | ✗ | ✗ | ✓ |
| CSV Export | ✗ | ✗ | ✓ |

### Guest vs Free Distinction
- **Guest:** No account. Full app with sample data. Purpose: "try before you sign up."
- **Free:** Has an account. Own data with limits. Purpose: "use it for real, hit the ceiling naturally."
- The funnel is Guest → Free → Pro. Each step delivers more value with a clear reason to upgrade.

### Downstream Impact
This spec is the input for:
- **TASK-015** — Feature gating implementation (use the gating table directly)
- **TASK-013/014** — Stripe integration (Pro tier pricing: $15/mo, $50/season)
- **TASK-003** — Launch channel strategy (messaging around price advantage)
- **FEAT-014** — Landing page (pricing section with tier comparison)

## Dependencies
- TASK-001 (Competitive analysis) — Complete ✅

## Risks
- $50/season may be too low if infrastructure costs grow — but client-side architecture keeps server costs near zero
- 25-roster free limit may need tuning based on real user behavior
- Seasonal billing requires clear UX around billing period dates and auto-renewal

---
*Approved by: Patrick H. — 2026-03-28*
