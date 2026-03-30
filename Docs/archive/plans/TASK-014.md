<!-- Completed: 2026-03-29 | Commit: uncommitted (staged) -->
# TASK-014: Build subscription status sync with Supabase

**Status:** Done
**Priority:** P1
**Feature:** FEAT-002

---

## Objective
Store and sync subscription tier information in Supabase so the client app can determine a user's subscription status. Expose a `useSubscription` hook for feature gating. Keep state in sync with Stripe via webhooks.

## Verification Criteria
1. `subscriptions` table exists with RLS enabled — users can only SELECT their own row.
2. Stripe webhook handler upserts subscription data on `checkout.session.completed`, `customer.subscription.updated`, `customer.subscription.deleted`, and `invoice.payment_failed`.
3. `SubscriptionContext` queries the user's subscription on auth state change and subscribes to Realtime updates.
4. `useSubscription` returns `tier`, `status`, `isProUser`, `loading`, and `redirectToCheckout`.
5. Unauthenticated users get `tier: 'guest'`, no errors.
6. `SubscriptionProvider` wraps the app inside `AuthProvider` in `main.jsx`.
7. App handles Supabase being unconfigured gracefully (no crashes).

## Verification Approach
1. Read `supabase/migrations/001_create_subscriptions_table.sql` — confirm table schema, RLS policy, and indexes.
2. Read `supabase/functions/stripe-webhook/index.ts` — confirm all 4 event handlers upsert/update correctly.
3. Read `best-ball-manager/src/contexts/SubscriptionContext.jsx` — confirm hook exposes correct API, handles unauthenticated state, and subscribes to Realtime.
4. Read `best-ball-manager/src/main.jsx` — confirm provider ordering.
5. Run `npm run build` from `best-ball-manager/` — confirm no build errors.
6. Run `npm run lint` from `best-ball-manager/` — confirm no lint errors related to subscription code.

## Files to Change
| File | Action | Description |
|------|--------|-------------|
| `supabase/migrations/001_create_subscriptions_table.sql` | Already exists | Table, RLS, indexes |
| `supabase/functions/stripe-webhook/index.ts` | Already exists | Webhook handler with 4 event types |
| `best-ball-manager/src/contexts/SubscriptionContext.jsx` | Already exists | Context, hook, Realtime subscription |
| `best-ball-manager/src/main.jsx` | Already exists | SubscriptionProvider wired in |

## Implementation Approach
Implementation was completed as part of TASK-013 (Stripe integration). This plan documents and verifies the existing implementation rather than proposing new code.

## Dependencies
- TASK-013 — Stripe integration (completed)
- TASK-004 — Auth system (completed)

---
*Approved by: <!-- pending -->*
