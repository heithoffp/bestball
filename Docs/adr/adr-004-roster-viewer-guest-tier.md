# ADR-004: Move Roster Viewer to guest tier for conversion optimization

**Date:** 2026-04-06
**Status:** Accepted

---

## Context

The competitive landscape audit (TASK-163) revealed that our current free tier — Dashboard and Exposures — offers nothing beyond what free competitors already provide:

- **The Bag Manager** (Chrome extension): free exposure overlay on UD + DK
- **SOLVER Explorer**: free exposure tracking across UD + DK
- **BBO Chrome Extension**: free real-time exposure % during drafts

A guest user who signs up and uploads CSVs sees Dashboard + Exposures — the same data they can already get for free from multiple tools. There is no conversion hook: nothing in the free experience demonstrates value that free tools can't match.

Meanwhile, **Roster Viewer with archetype classification** (RB_HERO, RB_ZERO, RB_HYPER_FRAGILE, RB_VALUE) is our strongest unique feature — no competitor offers automatic roster strategy classification. But it's gated behind Pro, so free users never see it.

The current gating creates a weak conversion pitch: "pay $20/mo for what you already get for free elsewhere." Moving Roster Viewer to the guest tier shifts the pitch to: "you've already seen analytics no free tool can match — now unlock the full picture."

Additionally, during this audit we discovered that two Pro-gated tabs — ADP Tracker (`timeseries`) and Combo Analysis (`combo`) — were not actually enforcing access checks in `App.jsx`. The tab buttons showed lock icons, but clicking them rendered the full component. These were fixed as part of this change.

## Decision

1. Change the `rosters` feature gate from `'pro'` to `'guest'` in `featureAccess.js`.
2. Add missing `canAccessFeature` guards for `timeseries` and `combo` tabs in `App.jsx`.

Guest users can now access the Roster Viewer tab (including archetype classification, composite grades, stack analysis, and CLV breakdown) without authentication or payment. ADP Tracker and Combo Analysis are now properly enforced as Pro-only.

## Alternatives Considered

### Option A: Move Rosters to guest (chosen)
Make Roster Viewer freely accessible to create a stronger conversion hook.
- **Pros:** Exposes our most unique feature (archetype classification) to every user; creates an "aha moment" that free tools can't replicate; strengthens the upgrade pitch for remaining Pro features; no development cost beyond a one-line config change
- **Cons:** Reduces the feature count behind the paywall from 6 to 5 Pro-gated tabs; users who only care about roster deep-dives may not convert

### Option B: Keep current gating (status quo)
Dashboard + Exposures remain the only free features.
- **Pros:** Maximum feature count behind paywall; no risk of giving away too much
- **Cons:** Free tier is indistinguishable from free competitors; no unique conversion hook; relies on users trusting that Pro is worth $20/mo without experiencing what makes us different

### Option C: Move multiple features to guest (Rosters + one more)
Also make Draft Flow or Combo Analysis free.
- **Pros:** Even stronger free experience
- **Cons:** Thins the Pro tier too much — Draft Flow, Combo, Rankings, Construction, and ADP Tracker are the five features that justify $20/mo. Giving away two of them risks undermining the paid tier's value

## Consequences

### Positive
- Every new user immediately sees archetype classification — a feature unique to us
- Conversion pitch becomes "upgrade to see the full picture" rather than "pay for what free tools do"
- Roster Viewer is a natural drill-down from Dashboard, creating a smoother free user journey
- Pro tier still retains 5 gated tabs (ADP Tracker, Draft Flow, Rankings, Combo, Construction) — sufficient value for $20/mo
- Two previously ungated Pro features (ADP Tracker, Combo Analysis) are now properly enforced

### Negative
- Users who only wanted roster deep-dives have less incentive to subscribe
- Slightly reduces perceived "premium" surface area

### Risks
- If archetype classification alone doesn't drive conversion interest, we've given away a feature for no uplift. Mitigated by: it's a config change, trivially reversible.
- If competitors copy archetype classification, this differentiator erodes. Mitigated by: our classification uses a multi-factor protocol tree that's non-trivial to replicate.

## Related
- Tasks: TASK-163 (competitive audit that motivated this), TASK-164 (value proposition), TASK-172 (feature gating review)
- ADRs: None

---
*Approved by: PH — 2026-04-06*
