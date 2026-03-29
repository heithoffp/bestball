# TASK-002: Define pricing tiers and feature gating strategy

**Status:** Draft
**Priority:** P1
**Feature:** FEAT-021

---

## Objective
Decide the pricing model (monthly, seasonal, or annual), define tier names and what each tier includes, and determine which features are free vs paid. This decision drives all of FEAT-002 (Stripe integration, subscription sync, feature gating) and must be finalized before any payment code is written. Output is a documented tier structure with clear feature-to-tier mapping.

## Dependencies
- TASK-001 — Competitive analysis must inform pricing decisions

## Open Questions
- Monthly vs seasonal pricing — seasonal aligns with best-ball draft windows but may reduce revenue
- How many tiers? (Free + one paid tier is simplest; free + pro + premium adds complexity)
- Should guest mode (no account) and free tier (account, no payment) be the same experience?
- Which features justify a paywall? Draft Assistant and advanced analytics are candidates; core exposure analysis may need to stay free for adoption.
