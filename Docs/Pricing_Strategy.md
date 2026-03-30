# Pricing Strategy

**Last Updated:** 2026-03-29
**Status:** Active
**Authoritative source for all pricing decisions.** Supersedes pricing sections in Channel_Strategy.md and TASK-002.

---

## Pricing Philosophy

The "real" target price is the promo price. The nominal price exists to create perceived value for promo code recipients. Promo codes are the primary distribution mechanism — every creator, beta user, and launch campaign gets one. Users who pay nominal are the exception, not the rule.

---

## Tier Structure

### Guest Mode (No Account)
- **Price:** Free, no signup required
- **Access:** Full app with bundled sample data. Cannot upload own CSVs.
- **Purpose:** Zero-friction try-before-you-sign-up. Proves the tool works.

### Free Tier (Account Required)
- **Price:** $0
- **Access:** Dashboard, Exposure Table, ADP Tracker, Help Guide. Own CSV upload (25 roster limit, 1 ADP snapshot). IndexedDB local storage.
- **Purpose:** Honest free tier that delivers real value. Users hit the ceiling naturally.

### Pro Tier (Paid)
- **Access:** Everything in Free, plus: Draft Assistant, Roster Viewer, Player Rankings, Combo Analysis, Roster Construction, Cloud Storage, CSV Export, Unlimited rosters and ADP snapshots.
- **Purpose:** Full analytics for serious drafters.

---

## Pro Tier Pricing

| Plan | Nominal Price | With 25% Promo Code | Stripe Billing |
|------|--------------|---------------------|----------------|
| Monthly | $20/month | $15/month | Recurring monthly subscription |
| Seasonal | $67/season | $50/season | One-time charge (or recurring yearly) |

**7-day free trial** on all new Pro subscriptions — no charge until day 8.

### Seasonal Plan Notes
- "Seasonal" maps to the yearly Stripe price. Best-ball drafting runs Feb–Aug, so a seasonal pass aligns with user behavior.
- $67 = roughly 3.35 months of the nominal monthly price. Positioned as "Save 44%" vs monthly.
- With a 25% promo code, seasonal drops to $50 — a stronger anchor than "$50 upfront."

### Why This Structure
- $15/mo effective is ~60% cheaper than Spike Week annual ($200/yr) and ~87% cheaper than BBO annual ($370/yr)
- $20 nominal creates a price anchor that makes promo codes feel valuable
- Two plans (monthly + seasonal), not three — one upgrade decision, no analysis paralysis
- Monthly exists for users who start mid-season; seasonal is the default/recommended option

---

## Promo Code Strategy

### Types of Promo Codes

| Code Type | Discount | Duration | Example | Use Case |
|-----------|----------|----------|---------|----------|
| Creator affiliate | 25% off | Forever (all renewals) | `RYAN25`, `CIELY25` | YouTube/podcast creator partnerships |
| Beta conversion | 25% off | Forever | `BETA25` | Expired beta users converting to paid |
| Launch promo | 25% off | First payment only | `LAUNCH25` | Launch week promotion |

### Stripe Configuration Required
Each promo code needs:
1. A **Coupon** in Stripe (e.g., "25% off forever" or "25% off once")
2. A **Promotion Code** attached to that coupon (the user-facing code string)
3. Promotion codes must be set to `active: true` in Stripe

### Creator Affiliate Program
- Each creator gets: free Pro access + unique 25% off promo code for their audience
- Stripe tracks redemptions per promotion code for attribution
- Target: 5-10 mid-tier best-ball creators (5K-50K followers)
- See `docs/Channel_Strategy.md` for full creator list and outreach plan

### How Promo Codes Work in the App
1. User enters code in PlanPicker modal and clicks "Apply"
2. Frontend calls `validate-promo-code` Edge Function, which checks Stripe's API
3. If valid: shows discount label (e.g., "25% off") and adjusted prices on plan cards
4. If invalid: shows error message, user can try another code
5. On checkout: code is passed to `create-checkout-session` Edge Function, which resolves it again via Stripe API and attaches as `discounts[0][promotion_code]` on the checkout session
6. If no code applied: Stripe checkout page shows a promo code field (`allow_promotion_codes: true`) as a fallback

---

## Feature Gating Table

| Feature | Guest | Free | Pro |
|---------|-------|------|-----|
| Dashboard | Sample data | Own data | Own data |
| Exposure Table | Sample data | Own data | Own data |
| ADP Tracker | Sample data | Own data | Own data |
| Help Guide | Yes | Yes | Yes |
| CSV Upload | No | 25 roster limit | Unlimited |
| Draft Assistant | Sample data | Locked | Yes |
| Roster Viewer | Sample data | Locked | Yes |
| Player Rankings | Sample data | Locked | Yes |
| Combo Analysis | Sample data | Locked | Yes |
| Roster Construction | Sample data | Locked | Yes |
| Cloud Storage | No | No | Yes |
| CSV Export | No | No | Yes |

---

## Upgrade Funnel

```
Guest (sample data) --> Free (own data, limited) --> Pro (full analytics)
```

Each step delivers more value with a clear reason to upgrade. The free tier is not a bait-and-switch — it delivers genuine portfolio awareness (exposure + ADP tracking).

---

## Revenue Projections

| Scenario | Monthly Subs | Seasonal Subs | Monthly Revenue |
|----------|-------------|---------------|-----------------|
| Conservative (100 users) | 30 @ $15 | 70 @ $50 | $450 + $583* = ~$1,033 |
| Target (500 users) | 150 @ $15 | 350 @ $50 | $2,250 + $2,917* = ~$5,167 |

*Seasonal revenue amortized monthly over 12 months ($50/12 = $4.17/mo per user).

Most users expected to use promo codes (effective price). Nominal-price users are upside.

---

## References
- **Competitive Analysis:** `docs/Competitive_Analysis.md`
- **Channel Strategy:** `docs/Channel_Strategy.md`
- **Feature Gating Implementation:** TASK-015 (Done)
- **Stripe Integration:** TASK-013, TASK-014 (Done)
- **Plan Selection UI:** TASK-025 (In Progress)
