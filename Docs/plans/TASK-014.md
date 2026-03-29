# TASK-014: Build subscription status sync with Supabase

**Status:** Draft
**Priority:** P1
**Feature:** FEAT-002

---

## Objective
Store and sync subscription tier information in Supabase so the client app can determine a user's subscription status. Create a useSubscription React hook that checks the user's tier and exposes it to components for feature gating. The subscription state must be kept in sync with Stripe's source of truth (via webhooks processed in TASK-013).

## Dependencies
- TASK-013 — Stripe integration must be in place to populate subscription data
- TASK-004 — Auth system provides the user identity to associate subscriptions with

## Open Questions
- Store tier in Supabase user_metadata (simple, no extra tables) or a dedicated subscriptions table (more flexible, supports history)?
- How frequently should the client re-check subscription status? On every page load, on auth state change, or with a TTL cache?
- RLS policies: users should only read their own subscription data.
