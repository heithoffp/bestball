<!-- Completed: 2026-03-30 | Commit: a52594e -->
# TASK-021: Set up creator promo code program

**Status:** Done
**Priority:** P2

---

## Objective

Define and document the creator affiliate program — no cash payout model. Creators get free Pro access + a unique promo code to give their audience 25% off. Remove the $3/signup payout language that currently exists in `Pricing_Strategy.md` and `Channel_Strategy.md`. No application code changes needed — the Stripe and access infrastructure already exists via TASK-026 and the beta flag mechanism.

## Decisions Made

- **No affiliate payout** — creator compensation is free Pro access only
- **Free access mechanism** — set `beta_expires_at` far in the future (e.g., 2028-01-01) in Supabase for creator accounts. Same mechanism as beta users, zero code changes.
- **Unique codes per creator** — for attribution visibility in Stripe (e.g., `RYAN25`, `CIELY25`)
- **Discount:** 25% off forever on all renewals (same "Beta & Creator 25% Forever" Stripe coupon from TASK-026)

## Dependencies

- TASK-013 (Done) — Stripe Checkout integration
- TASK-026 (In Progress) — Stripe promo code configuration and Creator Code SOP

## Verification Criteria

1. `Pricing_Strategy.md` no longer references the $3/signup payout
2. `Channel_Strategy.md` no longer references the $3/signup payout
3. `Pricing_Strategy.md` accurately reflects the no-payout creator deal
4. A Creator Onboarding SOP section exists in this file covering: qualification criteria, how to grant free access in Supabase, how to create their Stripe code, and outreach pitch template

## Verification Approach

1. Read `Pricing_Strategy.md` — confirm no $3/signup language remains
2. Read `Channel_Strategy.md` — confirm no $3/signup language remains
3. Read the Creator Onboarding SOP below — confirm all four sections are present and complete

## Files to Change

| File | Action | Description |
|------|--------|-------------|
| `Docs/Pricing_Strategy.md` | Modify | Remove $3/signup reference from Creator Affiliate Program section |
| `Docs/Channel_Strategy.md` | Modify | Remove $3/signup from deal structure and Decisions Made section |
| `docs/plans/TASK-021.md` | Modify | Add Creator Onboarding SOP section (this file) |

## Implementation Approach

### Step 1: Update Pricing_Strategy.md
Change the Creator Affiliate Program bullet from:
> "free Pro access + unique 25% off promo code + $3 per paid signup using their code"

To:
> "free Pro access + unique 25% off promo code for their audience"

### Step 2: Update Channel_Strategy.md
- Remove "+ $X per paid signup using their code" from the Offer line
- Remove "**Per-signup affiliate payment:** $3 per paid Pro signup." from Decisions Made (superseded by this task)

### Step 3: Creator Onboarding SOP (below)

---

## Creator Onboarding SOP

### Qualification Criteria

A creator qualifies for the program if they meet all of:
- Active best-ball content creator (YouTube, podcast, Twitter/X, Discord)
- Minimum ~1K followers/subscribers OR strong niche fit (pure best-ball focus with an engaged audience)
- No existing exclusive partnership with a competing tool (BBO, Spike Week)

### How to Grant Free Pro Access

1. Get the creator's account email (after they sign up at the app)
2. Supabase Dashboard → Table Editor → `profiles`
3. Find their row by email → set `beta_expires_at` to `2028-01-01T00:00:00Z`
4. Save — they now have Pro access indefinitely, no Stripe subscription needed

### How to Create Their Promo Code

Follow the Creator Code SOP in `docs/archive/plans/TASK-026.md` (once archived).
Use their handle in caps: `RYAN25`, `CIELY25`, etc.

### Outreach Pitch Template (DM or email)

> Hey [Name] — big fan of your best-ball content. I built a portfolio analytics tool for Underdog drafters — exposure tracking, ADP trends, roster archetypes, draft assistant.
>
> There's a free tier anyone can try (no account needed), but I'd love to give you full Pro access. If you like it, I can set up a promo code for your audience (25% off for life) — no contract, no commitment.
>
> [Link] — see what it does before committing to anything.
