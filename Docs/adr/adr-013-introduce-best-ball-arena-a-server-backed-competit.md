# ADR-013: Introduce Best Ball Arena — a server-backed competitive/social layer

**Date:** 2026-06-26
**Status:** Accepted

---

## Context

Best Ball Exposures launched as a portfolio-awareness tool built on three deliberate boundaries
documented in `Vision_and_Scope.md`:

1. **§3.2 — "Social features (sharing portfolios, comparing with other users)" are excluded** ("out
   of scope for a portfolio awareness tool").
2. **§2.4 / §3.2 — client-only architecture; "Server-side analytics backend" is excluded** ("keeps
   deployment simple. Browser performance is sufficient"). Supabase is used only for auth, storage,
   and Stripe webhooks (ADR-001). All analytics run in the browser.
3. **Principle #1 / ADR-002 — Mirror, Not Advisor is unconditional.** The app describes portfolio
   state and never computes an opinion on quality outside the two carve-outs (Roster Viewer, Draft
   Assistant).

The developer wants to add a **Best Ball Arena**: an LLM-arena-style feature that shows two rosters
head-to-head, asks visitors "which team would you rather have?", accumulates a **hidden Elo rating**
for every eligible team from those votes, and surfaces an **opt-in public leaderboard** of enrolled
teams. The intent is engagement, virality (top-of-funnel for signups), and off-season retention —
all explicit business priorities (`Vision_and_Scope` §1.5; retention is a stated top product
priority).

This feature cannot be reconciled with the three boundaries above by implementation cleverness — it
is fundamentally cross-user comparison, it requires server-side compute (a crowd-voted Elo cannot be
computed or trusted client-side), and a ranked leaderboard is the strongest possible computed
opinion on team quality. The decision is therefore a **conscious product-direction pivot**, made
explicitly so future readers understand the boundaries were relaxed on purpose and bounded to one
pillar — not eroded by drift.

The product is **already launched** (despite a stale `LIFECYCLE.md` still reading "Pre-Launch
Polish"), so this is a net-new pillar on a live product, not pre-launch scope.

## Decision

Add **Best Ball Arena** as a new product pillar (a new `/arena` route/tab) with three parts: a
blind head-to-head **voting** experience, a server-computed **hidden Elo** rating per eligible team,
and an **opt-in public leaderboard**. This consciously relaxes three documented boundaries, each
**contained to the Arena**:

1. **Social/comparison features become in-scope, bounded to the Arena.** Cross-user comparison is
   permitted only inside this pillar; the analytics tabs remain single-user portfolio mirrors.
2. **A server-side compute path is introduced.** Elo computation, matchmaking, and vote ingestion
   run in **Supabase Edge Functions**, extending the Edge Function pattern already established by
   ADR-001 (Stripe webhooks). Elo is **tamper-proof**: clients never write rating columns; only
   `service_role` inside an Edge Function does. The analytics tabs stay client-only — this ADR does
   **not** authorize a general server-side analytics backend.
3. **ADR-002's scope is clarified, not weakened.** Mirror-Not-Advisor remains **unconditional** for
   the analytics tabs (Dashboard, Exposures, ADP Tracker, Combos, Rankings). The Arena is an
   explicitly carved-out competitive zone where crowd opinion *is* the product. The clarification:
   computed/crowd opinions are now permitted in **three** places — Roster Viewer, Draft Assistant,
   and the Arena.

Design parameters fixed by this decision:

- **Vote semantics:** subjective preference — "Which roster would you rather have?" Both rosters are
  shown **blind/anonymized** during voting (no owner identity) to prevent friend-bias and protect
  privacy.
- **Privacy/consent — opt-in by default:** a team enters the vote pool and the leaderboard **only**
  when its owner enrolls it. Eligibility is modeled as a single policy flag
  (`arena_eligibility_mode ∈ {'opt_in','opt_out'}`) so the product can later flip to **opt-out**
  (all teams eligible anonymously, owners opt out) **without a schema change**. Flipping to opt-out
  requires a Terms-of-Service update and is out of scope for this ADR.
- **Elo:** standard Elo, server-computed, with a **provisional** (higher-K) phase for a team's first
  N matches, settling to a stable K thereafter.
- **Integrity / anti-abuse (load-bearing):** server-issued pairings with signed, single-use tokens;
  one counted vote per pairing token; self-votes ignored; rate limiting; authenticated votes
  trusted, guest-vote weighting treated as a tunable (see Risks).
- **Data-API grants:** all new `public` tables are created after 2026-10-30, so each migration
  **must** follow the explicit `GRANT` pattern in `CLAUDE.md` (grant `anon`/`authenticated`/
  `service_role` per actual callsites; RLS alone is insufficient). Rating columns are writable by
  `service_role` only.
- **Monetization funnel:** **viewing + voting are free and guest-accessible** (viral top-of-funnel);
  **enrolling your own teams requires a paid tier**, gated via `featureAccess.js`.

## Alternatives Considered

### Option A: Don't build it — keep the three boundaries intact
Reject the feature; preserve the pure portfolio-mirror identity.
- **Pros:** Zero architectural or trust risk; product story stays clean and easy to market; no new
  ops surface or attack surface.
- **Cons:** Forgoes a strong engagement / virality / off-season-retention lever, all of which are
  stated business priorities. Competitors with social hooks capture the top-of-funnel.

### Option B: Self-only "rank my own rosters" — no cross-user voting
Let a user pit *their own* rosters against each other; no other users' teams, no shared leaderboard.
- **Pros:** Stays client-only; no social/privacy exposure; no Mirror-Not-Advisor conflict at the
  portfolio level (arguably a Roster-Viewer-style single-user judgment).
- **Cons:** Loses the entire LLM-arena dynamic — no crowd, no virality, no shared leaderboard, far
  weaker engagement. Doesn't deliver what the feature is *for*.

### Option C: Cross-user Arena with a server-backed Elo and opt-in leaderboard (Chosen)
The full feature as described, with boundaries relaxed consciously and bounded to the Arena pillar.
- **Pros:** Delivers the intended engagement/virality/retention value; opt-in default + anonymized
  voting contain the privacy risk; Edge Functions reuse an existing, proven pattern (ADR-001); the
  eligibility flag preserves a clean future path to opt-out; free-to-vote/paid-to-enroll turns the
  feature into a conversion funnel rather than a cost center.
- **Cons:** First server-side **application** logic beyond webhooks (ops, cost, latency, and
  maintenance surface). Elo is inherently gameable, so integrity controls become load-bearing
  infrastructure, not nice-to-haves. Introduces genuine privacy/trust risk on a **paid** product —
  these are customers' private rosters. Expands scope and the product's conceptual surface area on a
  live product.

### Option D: Client-computed Elo to avoid the server
Compute and store Elo client-side / in plain Supabase rows writable by clients.
- **Pros:** Avoids introducing server-side compute.
- **Cons:** **Fatal** — a leaderboard whose ratings any client can write is trivially forgeable and
  worthless. Rejected. (This is precisely why the server-side path is non-negotiable.)

## Consequences

### Positive
- Unlocks a high-engagement, shareable surface that can drive signups (free voting) and off-season
  retention ("your team is ranked #14 of 312").
- Boundaries are relaxed **on the record and bounded to one pillar**, so the core analytics identity
  (Mirror-Not-Advisor, client-only) stays intact and defensible against future drift.
- Establishes a reusable, tamper-resistant Edge Function + `service_role`-write pattern for any
  future trusted server computation.
- Opt-in default + anonymized voting + the eligibility flag give a privacy-safe launch with a
  pre-designed, schema-stable path to a larger opt-out vote pool later.

### Negative
- Adds a server-side runtime to operate, monitor, and pay for — the first app logic (not webhooks)
  off the client. Edge Function cold-starts/latency now sit in a user-facing interaction loop.
- Integrity controls (signed pairings, dedupe, rate limits) are now load-bearing; they must ship
  with v1, not after, or the leaderboard is meaningless from day one.
- A second mental model for users and marketing ("we mirror, except in the Arena, where we rank") —
  the carve-out must be communicated clearly to avoid undercutting the Mirror-Not-Advisor promise.

## Revisit Conditions

- **Vote manipulation / brigading.** Elo is gameable; coordinated voting or token replay could
  inflate ranks. Mitigation in v1: server-issued single-use pairing tokens, self-vote exclusion,
  rate limiting, and a tunable guest-vote weight. **Revisit** if abuse appears — consider auth-only
  voting or reputation weighting. (Guest-vote weighting is explicitly left as a tunable sub-decision
  for the implementation plan.)
- **Privacy/trust on a paid product.** Even anonymized, a roster can be self-identifying to its
  owner's audience. Mitigation: opt-in default, anonymized voting, no identity until enrollment
  (enrollment = explicit consent to public ranking). **Revisit before any flip to opt-out mode** —
  that requires a ToS update and its own review.
- **Scope/cost on a live product.** If engagement doesn't materialize, the server surface is pure
  cost. **Revisit** if Arena DAU and signup-attribution don't clear a threshold after one season.
- **Edge Function reliability** becomes part of the UX. **Revisit** the compute location (e.g. a
  dedicated service, or scheduled batch Elo recompute) if Edge Function limits or latency prove
  inadequate.

## Related
- Tasks: TASK-280 (data model — lead plan), TASK-281 (Edge Functions), TASK-282 (voting UI), TASK-283 (leaderboard), TASK-284 (enrollment + gating), TASK-285 (anti-abuse), TASK-286 (Vision/Spec update). Epic: EPIC-07.
- ADRs: ADR-001 (Edge Functions for Stripe webhooks — pattern extended here), ADR-002 (Mirror-Not-Advisor — scope clarified, not weakened)

---
*Approved by: Patrick H. — 2026-06-26*
