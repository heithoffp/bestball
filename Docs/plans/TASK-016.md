# TASK-016: Build subscription management UI

**Status:** Approved
**Priority:** P2
**Feature:** FEAT-002

---

## Objective
Build a self-service subscription management UI where authenticated users can view their current plan status and access Stripe Customer Portal for billing management (invoices, payment method changes, cancellation).

## Verification Criteria
1. Authenticated pro user sees their plan tier ("Pro"), status ("Active"/"Trialing"), and renewal date.
2. Pro user with `cancel_at_period_end = true` sees a "Cancels on [date]" warning.
3. "Manage Billing" button calls the `create-portal-session` Edge Function and redirects to Stripe Customer Portal.
4. Authenticated free user (no subscription) sees "Upgrade to Pro" button that triggers checkout.
5. Guest users cannot access the account settings panel — gear icon only appears when authenticated.
6. Edge Function returns 401 for unauthenticated requests and 404 when no subscription exists.
7. When Supabase is unconfigured, the gear icon does not render (graceful degradation).

## Verification Approach
1. Run `npm run build` from `best-ball-manager/` — must succeed with no errors.
2. Run `npm run lint` — must pass cleanly.
3. Visual review: read the AccountSettings component and confirm it renders tier badge, status, renewal date, cancellation warning (conditional), and appropriate action button based on tier.
4. Read `create-portal-session/index.ts` and confirm it validates JWT, looks up `stripe_customer_id`, calls Stripe billing portal API, and returns the URL.
5. Read `SubscriptionContext.jsx` and confirm `redirectToPortal()` follows the same pattern as `redirectToCheckout()`.
6. Read `App.jsx` and confirm the gear icon is conditionally rendered only when `user` is truthy and Supabase is available.
7. Developer: manually test the Stripe Customer Portal redirect in a browser with a test subscription (requires Stripe test mode credentials and Customer Portal configured in Stripe Dashboard).

## Files to Change
| File | Action | Description |
|------|--------|-------------|
| `supabase/functions/create-portal-session/index.ts` | Create | Edge Function to create Stripe Billing Portal session |
| `best-ball-manager/src/contexts/SubscriptionContext.jsx` | Modify | Add `redirectToPortal()` method |
| `best-ball-manager/src/components/AccountSettings.jsx` | Create | Account settings panel with plan status and billing actions |
| `best-ball-manager/src/components/AccountSettings.module.css` | Create | Styles for AccountSettings component |
| `best-ball-manager/src/App.jsx` | Modify | Add AccountSettings modal state, gear icon trigger, and render |

## Implementation Approach

### Step 1: Create `create-portal-session` Edge Function
- Follow the same structure as `create-checkout-session/index.ts`
- Verify JWT from Authorization header using Supabase auth
- Query `subscriptions` table for the user's `stripe_customer_id`
- If no subscription found, return 404 with error message
- Call Stripe API: `POST https://api.stripe.com/v1/billing_portal/sessions` with `customer` and `return_url` (app origin)
- Return `{ url: session.url }`

### Step 2: Add `redirectToPortal()` to SubscriptionContext
- Mirror the `redirectToCheckout()` pattern
- Call `${supabaseUrl}/functions/v1/create-portal-session` with auth token
- On success, redirect `window.location.href` to returned URL
- On error, log and surface error (same error handling as checkout)
- Expose via context value

### Step 3: Build AccountSettings component
- Modal overlay, consistent with AuthModal styling approach
- Content sections:
  - **Plan badge:** Tier name with colored indicator (Guest/Free = gray, Pro = accent blue)
  - **Status line:** "Active", "Trialing", "Past Due", or "Canceled" with appropriate color
  - **Renewal date:** Formatted `current_period_end` from subscription object (pro only)
  - **Cancellation warning:** If `cancel_at_period_end`, show amber warning: "Your subscription will end on [date]"
  - **Action button:** "Manage Billing" for pro users (calls `redirectToPortal`), "Upgrade to Pro" for free users (calls `redirectToCheckout` with price ID)
- Close button (X) in top-right corner
- Uses `useSubscription()` for all subscription state

### Step 4: Integrate into App.jsx
- Add `showAccountSettings` / `setShowAccountSettings` state
- Add gear icon (Lucide `Settings` icon) next to AuthButton in header
- Only render gear icon when `user` is truthy (authenticated) and Supabase is available
- Render `<AccountSettings isOpen={showAccountSettings} onClose={...} />` conditionally

### Step 5: Stripe Customer Portal configuration (manual, documented)
- Add a comment in the Edge Function noting that the Customer Portal must be configured in Stripe Dashboard (Settings > Customer portal) with:
  - Cancel subscription enabled
  - Update payment method enabled
  - View invoices enabled
  - Return URL set to app origin

## Dependencies
- TASK-014 (Done) — SubscriptionContext with tier, status, subscription object
- TASK-013 (Done) — Stripe checkout and Edge Functions pattern

---
*Approved by: <!-- developer name/initials and date once approved -->*
