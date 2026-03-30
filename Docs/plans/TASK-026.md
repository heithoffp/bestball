# TASK-026: Configure Stripe promo codes and coupons

**Status:** Approved
**Priority:** P2
**Feature:** FEAT-002

---

## Objective

Configure Stripe coupons and promotion codes so that `BETA25`, creator codes, and an optional launch promo code all work end-to-end with the existing Edge Functions. No code changes are needed — the `validate-promo-code` and `create-checkout-session` Edge Functions are fully built and ready.

## Decisions Made

- **Creator codes:** 25% off forever (all renewals, not first payment only) — stronger CTA for creator promotion
- **Affiliate payouts:** Stripe redemption reporting + Google Sheet — no dedicated affiliate platform at this stage

## Coupon Structure

| Coupon Name | Discount | Duration | Stripe `duration` param | Use Case |
|-------------|----------|----------|------------------------|----------|
| Beta & Creator 25% Forever | 25% off | All renewals | `forever` | BETA25 + all creator codes |
| Launch Promo 25% Once | 25% off | First payment only | `once` | Optional general launch push |

## Verification Criteria

1. `BETA25` promotion code exists in Stripe test mode and is active
2. `CREATOR25` (sample creator code) promotion code exists in Stripe test mode and is active
3. `validate-promo-code` Edge Function returns `{ valid: true, discountLabel: "25% off" }` for both codes
4. Checkout session with `BETA25` entered in PlanPicker shows 25% discount on Stripe Checkout page
5. Checkout session with no code entered allows manual promo code entry on Stripe's Checkout page
6. Steps 1–4 are replicated in Stripe live mode
7. Affiliate tracking Google Sheet exists with correct columns
8. Creator code creation process is documented (in this file)

## Verification Approach

All verification is manual (this is configuration, not code):

1. In dev app (`npm run dev`), open PlanPicker and enter `BETA25` → expect green "25% off" label to appear
2. Click "Continue to Checkout" → expect Stripe Checkout page to show the 25% discount applied to the plan price
3. Repeat with `CREATOR25`
4. Open PlanPicker without entering any code → click "Continue to Checkout" → expect Stripe Checkout page to show a promo code input field
5. Go to Stripe Dashboard (test mode) → Promotion Codes → confirm `BETA25` and `CREATOR25` are listed as Active
6. Switch to live mode and repeat step 5

## Files to Change

| File | Action | Description |
|------|--------|-------------|
| `docs/plans/TASK-026.md` | Modify | Add creator code SOP section after task is complete |

No application code changes required.

## Implementation Approach

### Step 1: Create the "forever" coupon in Stripe test mode
- Stripe Dashboard → Products → Coupons → Create coupon
- Type: Percentage, 25%
- Duration: **Forever**
- Name: `Beta & Creator 25% Forever`
- Redemption limits: unchecked (unlimited)
- Save — note the coupon ID

### Step 2: Create the `BETA25` promotion code
- On the coupon from Step 1 → Add promotion code
- Code: `BETA25`
- Redemption limit: unchecked
- Expiry: end of NFL 2026 season (or leave open)
- Save

### Step 3: Create a sample creator promotion code
- On the same "forever" coupon → Add promotion code
- Code: `CREATOR25`
- No redemption limit, no expiry
- Save — this validates the creator code flow before real creator onboarding

### Step 4: (Optional) Create the launch promo coupon and code
- Create a second coupon: 25% off, duration `once`, name `Launch Promo 25% Once`
- Add promotion code `LAUNCH25` with a redemption limit if desired
- Only needed if a general launch push campaign is planned

### Step 5: Verify end-to-end in test mode
- Run `npm run dev` from `best-ball-manager/`
- Open PlanPicker → enter `BETA25` → verify discount label appears
- Click Continue to Checkout → verify Stripe Checkout shows 25% off
- Repeat with `CREATOR25`
- Repeat with no code → verify Stripe Checkout shows promo code input

### Step 6: Replicate in live mode
- Switch Stripe Dashboard to live mode
- Repeat Steps 1–4 (coupons and promotion codes are environment-specific in Stripe)
- Confirm codes are listed as Active in the live Promotion Codes view

### Step 7: Set up affiliate tracking sheet
- Create a Google Sheet with columns:
  `Code | Creator | Payout Rate | Redemptions (Stripe) | Amount Owed | Paid Date`
- Use Stripe Dashboard → Promotion Codes to pull redemption counts per code
- Record the sheet URL somewhere accessible (internal notes or a pinned Slack/bookmark)

### Step 8: Document creator code SOP
See "Creator Code SOP" section below — add this to the plan file after completing the task
so future sessions can onboard new creators without context.

---

## Creator Code SOP

To add a promotion code for a new creator:

1. Go to Stripe Dashboard → Products → Coupons → **Beta & Creator 25% Forever**
2. Click **Add promotion code**
3. Set code to the creator's handle in all caps (e.g. `SHARPFOOTBALL25`)
4. Redemption limit: unchecked (unless negotiated otherwise)
5. Expiry: leave open (or set per agreement)
6. Save
7. Add a row to the affiliate tracking Google Sheet: Code | Creator name | 25% forever | 0 | $0 | —

## Dependencies

- TASK-025 (Done) — PlanPicker UI and promo code Edge Functions

---

*Approved by: <!-- developer name/initials and date once approved -->*
