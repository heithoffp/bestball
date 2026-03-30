# ADR-001: Use Supabase Edge Functions for Stripe webhook handling

**Date:** 2026-03-28
**Status:** Accepted

---

## Context

TASK-013 requires Stripe Checkout integration for subscription payments ($15/month or $50/season Pro tier, per TASK-002 pricing spec). Stripe webhooks are essential for handling subscription lifecycle events — `checkout.session.completed`, `customer.subscription.updated`, `customer.subscription.deleted`, and `invoice.payment_failed`. Without webhooks, the app cannot reliably track cancellations, renewals, or payment failures.

However, Best Ball Portfolio Manager is client-side-only by design (Vision_and_Scope §2.4: "Client-side-only processing is sufficient"; §3.2 explicitly excludes "Server-side processing or analytics backend"). The browser cannot receive inbound HTTP requests from Stripe.

The app already depends on two platforms with serverless capabilities:
- **Supabase** — auth, cloud storage, and the `auth.users` table (already in use)
- **Vercel** — static hosting with analytics (already deployed)

A server endpoint is needed solely for payment webhook plumbing, not analytics computation. This is infrastructure, not a new backend.

## Decision

Use Supabase Edge Functions to receive and process Stripe webhook events. Webhook handlers will verify Stripe signatures, then write subscription status directly to a Supabase `subscriptions` table alongside the existing auth data.

## Alternatives Considered

### Option A: Supabase Edge Functions (chosen)
Deno-based serverless functions hosted on Supabase's infrastructure. Webhook endpoint receives Stripe events, verifies signatures, and writes to the Supabase database.
- **Pros:** Consolidates all server-side concerns (auth, storage, webhooks) in one platform; webhook handler has native access to Supabase tables without additional auth; globally distributed on Deno Deploy with fast cold starts; Supabase has official Stripe webhook examples in their docs
- **Cons:** Deno runtime (TypeScript) differs from the app's browser JS — minor context switch for maintenance; Edge Functions are a newer Supabase feature with less community precedent than Vercel serverless

### Option B: Vercel Serverless Functions
Node.js API routes deployed alongside the static frontend on Vercel.
- **Pros:** Same deployment platform as the frontend; Node.js runtime is more familiar; large ecosystem of Stripe + Vercel examples
- **Cons:** Splits server-side concerns across two platforms (Supabase for data, Vercel for webhooks) — harder to reason about; Vercel functions would need Supabase client credentials to write subscription data, adding a cross-platform auth dependency; blurs the line between "static hosting" and "backend"

### Option C: Client-only polling after Stripe Checkout redirect
After Stripe Checkout redirects back to the app, poll Stripe's API (via client-side `fetch` with a publishable key) or check a Supabase table for the checkout session result.
- **Pros:** No server endpoint needed; stays purely client-side
- **Cons:** Cannot handle asynchronous events (cancellations, failed renewals, subscription updates) — only works for the initial purchase; publishable key has limited API access; would need a server for lifecycle events anyway, making this a half-solution that defers the real problem

## Consequences

### Positive
- All server-side infrastructure lives in Supabase — one platform to manage for auth, storage, and payment webhooks
- Webhook handler writes directly to Supabase tables, so the client app reads subscription status the same way it reads auth state — via Supabase client
- No changes to the Vercel deployment — it remains a static site
- The "no server-side processing" architectural principle is preserved in spirit: browser still does all analytics computation; the Edge Function is pure infrastructure plumbing

### Negative
- Introduces Deno/TypeScript as a secondary runtime (the app is browser JS with Vite)
- Edge Functions require Supabase CLI for local development and testing — new tooling for the developer
- Supabase Edge Functions have a 150ms cold start in some regions (acceptable for webhooks but worth noting)

### Risks
- If Supabase Edge Functions pricing changes or the feature is deprecated, webhook handling would need to migrate to Vercel serverless. Migration is straightforward since the logic is a single endpoint (~50 lines). Revisit if Supabase announces Edge Function changes.
- Stripe webhook signature verification in Deno uses `crypto.subtle` — need to confirm Supabase's Deno runtime supports this (it does as of Deno 1.x).

## Related
- Tasks: TASK-013, TASK-014
- ADRs: None

---
*Approved by: Patrick H. — 2026-03-28*
