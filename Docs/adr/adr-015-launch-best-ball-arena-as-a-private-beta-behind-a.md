# ADR-015: Launch Best Ball Arena as a private beta behind a server-enforced email-allowlist gate

**Date:** 2026-06-27
**Status:** Accepted

---

## Context

ADR-014 approved flipping the Arena to **opt-out** with owned **and** participant-captured **board (third-party) teams** auto-enrolled into a **public** vote pool + leaderboard. That approval was explicitly conditioned on four guardrails, two of which must land *before public launch*: a board-team **takedown path** (guardrail #2 / TASK-290) and a **privacy-policy + ToS update** (guardrail #4 / TASK-291). Neither exists yet.

The developer wants to deploy the **complete machine to production now** — migration 012 (ownerless board rows), board-team auto-registration, leaderboard visibility, and the `opt_out` flip — to exercise the full board-fed pool with real synced data, **without** waiting on the legal/operational guardrails and **without** exposing any third-party roster to the public.

The reconciling insight: ADR-014's guardrails exist because the leaderboard and vote pool are *public*. If the entire Arena is reachable only by the developer's own accounts, **nothing third-party is published to anyone** — so the guardrails are not yet triggered. They remain mandatory, but their trigger moves from "deploy" to "go public."

This requires an access-control boundary that did not previously exist in the product. Existing gating is **subscription-tier** based (`featureAccess.js`), which is the wrong primitive — every paying user would gain access. We need an **identity allowlist** (specific developer emails: `heithoff.patrick+*@gmail.com` and `heithoff.patrick@gmail.com`), and — critically — it must be enforced where the data actually lives, not only in the UI. The Arena's Edge Functions run with `verify_jwt = false` and accept guests by design (ADR-013), and the leaderboard is a direct RLS-governed table read; a frontend-only flag would leave both the API and the data directly reachable.

## Decision

Introduce an **Arena beta gate**: a new `arena_config.beta_mode` flag plus an email allowlist that, while `beta_mode = true`, restricts **every** Arena surface to allowlisted accounts — enforced at three layers:

1. **Frontend** — the Arena nav tab and `/arena` route render only for an allowlisted signed-in user; everyone else never sees it (direct navigation redirects).
2. **Edge Functions** (`arena-pair`, `arena-vote`) — reject any caller that is not an allowlisted authenticated user (`403`). **Guest voting is disabled during beta** (the ADR-013 / TASK-285 guest path is suspended while `beta_mode = true`).
3. **RLS** — leaderboard / `arena_teams` reads are restricted to an allowlisted `auth.jwt() ->> 'email'`; `anon` gets no read access while in beta.

With this gate in place, deploying `opt_out` + board-team auto-registration is safe: the pool and leaderboard fill with real owned + board teams, but their **publication is contained to the allowlist**. This **defers — does not remove —** ADR-014 guardrails #2 (takedown) and #4 (privacy/ToS): they become the hard blockers for flipping `beta_mode = false` (true public launch), not for this private-beta deploy. This ADR **refines the rollout of ADR-014; it does not supersede it.**

The allowlist is authoritative in one place (`arena_config`, service-role-writable only) and referenced by all three layers, so widening or closing the beta is a single data change.

## Alternatives Considered

### Option A: Stay opt-in / manual-enroll (ADR-013 status quo)
- **Pros:** No new access-control surface; zero added risk; no schema change.
- **Cons:** The developer cannot exercise the full board-fed opt-out pool with real data — the entire point of the requested work. Leaves ADR-014 unimplemented and untested.

### Option B: Full public launch now (ADR-014 as written)
- **Pros:** Simplest end state; no beta gate to build or later remove.
- **Cons:** Requires the takedown path (290) and privacy/ToS update (291) *first* — neither is ready. Publishing identifiable third-party rosters publicly without those guardrails directly violates the accepted ADR-014.

### Option C: Frontend-only feature flag
- **Pros:** Cheapest to build — hide the tab and route, done.
- **Cons:** **Insufficient and unsafe.** The Edge Functions accept guests (`verify_jwt = false`) and the leaderboard is a direct table read; both stay reachable by anyone who calls the API or queries the table. Third-party board data would be exposed despite a hidden UI — a false sense of containment.

### Option D: Private beta with a server-enforced allowlist (Chosen)
- **Pros:** Ships the full opt-out + board machine to production now and lets the developer validate it against real data, while genuinely containing third-party exposure at the data layer. Cleanly defers (without discarding) the ADR-014 legal/operational guardrails. The allowlist is a single source of truth, trivially flipped to public later.
- **Cons:** Net-new access-control concept to build and maintain across three layers (schema/RLS, two Edge Functions, frontend). Temporarily suspends the guest-voting path the Arena was designed around. Adds a `beta_mode` flag that must eventually be retired or repurposed at public launch.

## Consequences

### Positive
- The complete ADR-014 build (migration 012, auto-registration, visibility, opt-out flip) ships and runs in production against real synced + board data, validated end-to-end before any public exposure.
- Third-party board rosters are provably contained to the developer's own accounts — the privacy/platform-relations exposure that gated ADR-014 is not incurred during beta.
- A reusable, single-source-of-truth identity allowlist exists for future internal/beta features.

### Negative
- Three enforcement points must stay in sync; an allowlist check omitted at any one layer (especially RLS or the Edge Functions) silently reopens the exposure the gate exists to prevent.
- Guest voting — a core ADR-013 engagement mechanic — is dark for the duration of the beta, so beta vote volume is limited to allowlisted accounts and matchmaking will be sparse.
- A `beta_mode = false` transition still carries the full ADR-014 public-launch checklist (290 + 291); this ADR moves that work later, it does not eliminate it.

### Risks
- **Enforcement gap = silent public exposure.** If the RLS policy or an Edge Function check is wrong, board data leaks despite the hidden UI. Mitigation: the allowlist is the security boundary at the *data* layer (RLS + service-role function checks), with the frontend gate as convenience only; verify each layer independently before deploy.
- **Stale/over-broad allowlist.** A too-loose pattern (e.g., matching beyond the intended addresses) admits unintended users. Mitigation: explicit allowlist values in `arena_config`, service-role-write only, reviewed before deploy.
- **Beta forgotten in `opt_out`.** Flipping `beta_mode = false` without first completing 290/291 would instantly publicize third-party rosters. Mitigation: TASK-293 (the public flip) is explicitly gated on 290 + 291; `beta_mode = false` inherits that same gate.

## Revisit Conditions
- The takedown path (290) and privacy/ToS update (291) land → reconsider flipping `beta_mode = false` for public launch (the ADR-014 decision then applies as written).
- Beta needs broader (non-developer) testers → widen the allowlist, and re-evaluate whether guest voting must be re-enabled for meaningful matchmaking volume.
- If maintaining three-layer enforcement proves error-prone → consider consolidating Arena reads behind an Edge Function so the allowlist is enforced in one place rather than via RLS.

## Related
- ADRs: ADR-014 (refines its rollout — private beta before the public opt-out it approved; does not supersede), ADR-013 (Arena pillar; guest-voting path suspended during beta), ADR-009 (source of board teams), ADR-001 (Edge Function pattern).
- Tasks: EPIC-07; TASK-287 (migration 012), TASK-288 (auto-registration), TASK-289 (leaderboard visibility), TASK-293 (opt-out flip). New gating work to be filed via hus-backlog. Public-launch blockers deferred: TASK-290 (takedown), TASK-291 (privacy/ToS).

---
*Approved by: Patrick H. — 2026-06-27*
