<!-- Completed: 2026-03-30 | Commit: a52594e -->
# TASK-025: Add plan selection UI with monthly/yearly toggle and promo code support

**Status:** Approved
**Priority:** P2
**Feature:** FEAT-002

---

## Objective
Add a plan picker modal between the "Subscribe" action and Stripe Checkout so users can choose monthly vs yearly billing, and enable promo code support so codes like BETA25 are actually applied at checkout rather than just displayed as text.

## Verification Criteria
1. Clicking "Upgrade to Pro" in LockedFeature, BetaBanner, or AccountSettings opens a PlanPicker modal instead of redirecting directly to Stripe.
2. PlanPicker displays monthly and yearly options with prices and a savings badge on the yearly option.
3. PlanPicker has a "Promo Code" input field where users can enter a code before checkout.
4. Selecting a plan and clicking "Continue to Checkout" redirects to Stripe Checkout with the chosen price ID.
5. When a promo code is entered, it is passed to the Edge Function which applies it via `discounts` parameter on the Stripe session.
6. When no promo code is entered, the Stripe session includes `allow_promotion_codes: true` so users can still enter one on Stripe's page.
7. BetaBanner's expired-beta flow opens PlanPicker with "BETA25" pre-filled in the promo code field.
8. The old single `VITE_STRIPE_PRO_PRICE_ID` env var is replaced by `VITE_STRIPE_PRO_MONTHLY_PRICE_ID` and `VITE_STRIPE_PRO_YEARLY_PRICE_ID`.
9. `.env.example` is updated with the two new env vars.
10. `npm run build` completes without errors.

## Verification Approach
1. Run `npm run build` from `best-ball-manager/` — expect clean build with no errors.
2. Run `npm run lint` — expect no new lint errors.
3. Visually inspect PlanPicker component code for: monthly/yearly toggle, price display, promo code input, continue button.
4. Verify LockedFeature, BetaBanner, and AccountSettings all open PlanPicker via state/callback instead of calling `redirectToCheckout` directly.
5. Verify BetaBanner passes `promoCode="BETA25"` (or equivalent prop) when opening PlanPicker for expired beta users.
6. Verify Edge Function handles both `promoCode` (apply via `discounts`) and fallback (`allow_promotion_codes: true`).
7. Verify `.env.example` lists both new price ID vars.
8. Developer: confirm the modal looks correct in the browser with `npm run dev`.

## Files to Change
| File | Action | Description |
|------|--------|-------------|
| `best-ball-manager/src/components/PlanPicker.jsx` | Create | Modal with monthly/yearly toggle, price display, promo code input, and checkout button |
| `best-ball-manager/src/contexts/SubscriptionContext.jsx` | Modify | Update `redirectToCheckout` to accept `{ priceId, promoCode? }`, expose monthly/yearly price IDs, add PlanPicker open/close state and helpers |
| `best-ball-manager/src/components/LockedFeature.jsx` | Modify | Open PlanPicker instead of calling `redirectToCheckout` directly |
| `best-ball-manager/src/components/BetaBanner.jsx` | Modify | Open PlanPicker (with BETA25 pre-filled for expired beta) instead of calling `redirectToCheckout` directly |
| `best-ball-manager/src/components/AccountSettings.jsx` | Modify | Open PlanPicker instead of calling `redirectToCheckout` directly |
| `supabase/functions/create-checkout-session/index.ts` | Modify | Accept optional `promoCode`, apply via `discounts` param or fall back to `allow_promotion_codes` |
| `best-ball-manager/.env.example` | Modify | Replace `VITE_STRIPE_PRO_PRICE_ID` with monthly and yearly variants |

## Implementation Approach

### Step 1: Update env vars
- In `.env.example`, replace `VITE_STRIPE_PRO_PRICE_ID` with:
  - `VITE_STRIPE_PRO_MONTHLY_PRICE_ID`
  - `VITE_STRIPE_PRO_YEARLY_PRICE_ID`

### Step 2: Update Edge Function
- In `create-checkout-session/index.ts`, destructure `promoCode` from the request body alongside existing fields.
- If `promoCode` is provided, look up the Stripe promotion code via `GET /v1/promotion_codes?code={promoCode}&active=true` and add `discounts[0][promotion_code]={id}` to the session params.
- If no `promoCode`, add `allow_promotion_codes=true` to the session params so users can enter one on Stripe's checkout page.

### Step 3: Update SubscriptionContext
- Add state: `planPickerOpen` (boolean) and `planPickerPromoCode` (string, default empty).
- Add `openPlanPicker(promoCode?)` and `closePlanPicker()` callbacks.
- Expose monthly/yearly price IDs from env vars: `VITE_STRIPE_PRO_MONTHLY_PRICE_ID`, `VITE_STRIPE_PRO_YEARLY_PRICE_ID`.
- Update `redirectToCheckout` signature to accept `{ priceId, promoCode }` object. Pass `promoCode` in the fetch body to the Edge Function.
- Expose all new state/callbacks via context value.

### Step 4: Create PlanPicker modal
- New component `PlanPicker.jsx`:
  - Reads `planPickerOpen`, `closePlanPicker`, `redirectToCheckout` from `useSubscription()`.
  - Local state: `selectedInterval` ('monthly' | 'yearly', default 'yearly'), `promoCode` (initialized from context's `planPickerPromoCode`).
  - UI: overlay backdrop, centered card with:
    - Title: "Choose Your Plan"
    - Two plan cards (monthly / yearly) — yearly shows a "Save X%" badge.
    - Display prices as text (e.g. "$20/mo", "$200/yr"). These are display-only — actual pricing is controlled by Stripe.
    - Promo code text input with label.
    - "Continue to Checkout" button calls `redirectToCheckout({ priceId, promoCode })`.
    - Close/X button.
  - Style with existing app CSS patterns (inline styles or CSS module matching other modals).

### Step 5: Render PlanPicker in App
- Add `<PlanPicker />` in the component tree (inside SubscriptionProvider), so it's available globally.

### Step 6: Update entry points
- **LockedFeature.jsx**: Replace `redirectToCheckout(priceId)` call with `openPlanPicker()`.
- **BetaBanner.jsx**: Replace `redirectToCheckout(priceId)` with `openPlanPicker('BETA25')` for expired-beta state, and `openPlanPicker()` for countdown state.
- **AccountSettings.jsx**: Replace upgrade button's `redirectToCheckout(priceId)` with `openPlanPicker()`.
- Remove `VITE_STRIPE_PRO_PRICE_ID` references from these components since PlanPicker handles price selection.

## Dependencies
- TASK-013 (Done) — Stripe Checkout integration
- TASK-014 (Done) — Subscription status sync
- TASK-024 (Done) — Beta program and BETA25 promo code display

---
*Approved by: <!-- developer name/initials and date once approved -->*
