# ADR-017: Arena public-launch vote-integrity and data hardening (ADR-013 amendment)

**Date:** 2026-07-02
**Status:** Accepted

---

## Context

The Best Ball Arena (ADR-013) shipped as a private beta behind a server-enforced
email allowlist (ADR-015), then grew a full-database opt-out pool with claim-on-sync
(ADR-016). Every integrity control was designed to be *sufficient for a single
developer's own accounts* — the allowlist made the pool effectively single-user, so
several deferred exposures were harmless.

Flipping `arena_config.beta_mode = false` (public launch) removes that containment:
`arena_teams` opens to a real multi-user pool, guests become real anonymous callers,
and the client SELECT/INSERT/UPDATE grants face untrusted input. A 2026-07-02
launch-readiness code review found five issues that are safe under the allowlist but
unsafe in public. ADR-013 named "vote manipulation" and "a leaderboard whose ratings
any client can write is worthless" as explicit revisit conditions; this amendment is
those conditions firing. All constraints from ADR-013/014/015/016 still hold — this
records how each exposure is closed before launch, not a change of direction.

Relevant facts that shaped the choices:
- Guest voting is the Arena's top-of-funnel virality mechanism (ADR-013); making all
  guest votes non-counting would protect integrity but gut the product's reason for
  letting guests vote at all.
- `board_entry_ref` (raw UD `draftEntryId`) and `board_user_hash` are service-role-only
  columns — never client-readable (ADR-014 guardrail #1). Client-readable data is only
  `draft_id` + anonymized player names.
- `draft_boards_admin.picks` is trusted server-side truth for every captured pod.
- Edge Functions read `beta_mode` per request and the browser can read it too
  (migration 012 exposes it), so launch need not be a code event.

## Decision

Close the five exposures as follows, and record the load-bearing sub-decision
(guest-vote integrity) as HYBRID:

1. **Guest-vote integrity = hybrid (guestId + IP-hash cap).** Guest votes still count
   toward Elo, but the counted-vote cap (`GUEST_VOTE_CAP`) and the durable per-voter
   rate limit key on BOTH the client `guestId` AND a salted HMAC of the client IP
   (`arena_matches.voter_ip_hash`). Rotating the guestId no longer resets either limit
   because the shared IP hash keeps accumulating. Over the cap → the vote is recorded
   `counted = false` and the client shows a "sign in to keep counting" nudge (existing
   UI). Guests with no `guestId` are rejected (400). Authenticated callers' rate limit
   keys on `voter_id` only, so users behind a shared NAT are not throttled as a group.
2. **Claim-on-sync hijack — exact-ref only.** `arena-register` honors a live claim of an
   ownerless board row ONLY on an exact `board_entry_ref` match (the unforgeable, non-
   client-readable UD id). The old `draft_id` + roster-fingerprint fallback — matched on
   client-readable data — is removed from the function; cross-user fingerprint dedup
   moves to the trusted backfill script (service_role over stored data).
3. **Snapshot forgery — DB grants + server validation.** Migration 015 revokes client
   `INSERT` and `display_snapshot` `UPDATE` on `arena_teams` (registration is server-only;
   clients may flip only `enrolled`). `arena-register` validates each board team's players
   against `draft_boards_admin.picks` (server truth) and takes the slate title from the
   stored board.
4. **Anon de-anonymization.** `user_id` is dropped from the anon read grant; authenticated
   keeps it. The browser leaderboard requests `user_id` only when signed in.
5. **Public-launch gate = `beta_mode`-driven.** The client visibility gate reads
   `arena_config.beta_mode` instead of a hardcoded allowlist, so the flip alone launches
   the Arena with no frontend redeploy and no pre-flip exposure window.

## Alternatives Considered

### Guest-vote integrity (the primary trade-off)

**Option A — Auth-only counted votes.** Guests vote freely but only authenticated votes
move Elo.
- **Pros:** Simplest; fully robust against guestId rotation and guest self-votes; no IP
  handling or privacy surface.
- **Cons:** Discards all guest signal — the leaderboard would reflect only logged-in
  voters, and the funnel's "your vote mattered" hook disappears.

**Option B — IP-hashed durable cap (chosen, "hybrid").** Guest votes count, capped by
`guestId` AND a salted IP hash.
- **Pros:** Keeps guest signal and the funnel; rotating guestId no longer resets limits;
  the IP hash is non-reversible (salted with `ARENA_TOKEN_SECRET`).
- **Cons:** Shared/NAT IPs collide (a household/office of guests shares one cap — they are
  nudged to sign in sooner); stores a per-match IP-derived value (mitigated: salted hash,
  never the raw IP); a determined attacker rotating BOTH guestId and IP still gets a few
  counted votes each.

**Option C — Require sign-in beyond the cap, no IP.** Cap purely on guestId, then hard-gate.
- **Pros:** No IP handling.
- **Cons:** Trivially defeated by guestId rotation — the exact hole being closed.

Chosen B: it is the only option that preserves the guest funnel (ADR-013's stated purpose)
while making the durable limits actually durable. The reader-facing behavior of A is a
subset (over-cap guest votes already stop counting), so B can degrade toward A if abuse
appears without another product change.

### Claim-on-sync hijack
- **Exact-ref only (chosen):** unforgeable (needs a service-role-only id); cost is that a
  legit owner whose `entry_id ≠ UD draftEntryId` won't auto-claim on sync and instead
  inserts a duplicate, which the trusted backfill later merges. Acceptable — dedup was
  already a backfill responsibility (TASK-296).
- **Cryptographic seat-ownership proof (deferred):** carry the caller's UD `userId` in the
  register payload and match `board_user_hash`. Stronger and would restore fuzzy auto-claim
  safely, but it is a new protocol (payload + hashing + matching) that would be easy to get
  subtly wrong under time pressure. Deferred as a follow-up rather than invented at launch.

### Snapshot forgery
- **Grants + player validation (chosen):** revoke client snapshot writes and validate board
  players against the stored board. Closes the "arbitrary strings shown to voters" vector at
  the durable (grant) layer plus a content check.
- **Full server-side snapshot rebuild (deferred):** port the entire snapshot builder
  (archetype classification, CLV) to Deno and rebuild board snapshots from scratch. Highest
  assurance but a large, risky port; the derived fields (archetype path) are cosmetic and
  CLV is already recomputed at display time, so validating the player set captures the
  material risk.

## Consequences

### Positive
- The public leaderboard's Elo is resistant to the cheap manipulation paths (guestId
  rotation, snapshot injection, board-row hijack) that the beta allowlist had been hiding.
- Launch is a one-line flip with an immediate, redeploy-free rollback (`beta_mode = true`).
- Grants are the durable boundary; RLS and Edge Function checks are defense-in-depth on top.

### Negative
- Guests sharing an IP hit the counted-vote cap collectively, nudging them to sign in
  sooner than a strict per-device model would. Accepted as a funnel trade-off.
- Two known residuals remain by design (below), documented rather than fully closed at
  launch.
- `arena-register` does more work per board batch (loads pod picks, validates players).

### Risks / Residuals
- **Guest self-votes** cannot be fully prevented without auth (a logged-out team owner can
  be paired with their own roster); mitigated by the caps, and by the fact that a few guest
  votes barely move Elo. Revisit if targeted self-inflation appears.
- **Fuzzy auto-claim** is disabled live (exact-ref only) pending the deferred ownership-proof
  protocol; duplicates are healed by backfill in the interim.
- **Determined multi-key abuse** (rotating guestId *and* IP) still lands a handful of counted
  votes per identity; the durable IP cap raises the cost substantially but is not absolute.

## Revisit Conditions
- Observed leaderboard manipulation despite the hybrid caps → move to auth-only counted
  votes (Option A), or add reputation weighting / proof-of-work per ADR-013.
- Guest self-vote inflation observed → require auth for counted votes.
- Need to restore safe fuzzy auto-claim → implement the deferred UD-`userId` /
  `board_user_hash` ownership proof and re-enable the fingerprint claim path.
- Forged derived fields (archetype path) become a problem → complete the server-side
  snapshot rebuild.
- Shared-NAT guest cap collisions generate meaningful complaints → per-device signal
  (signed device token) instead of IP hash.

## Related
- Tasks: TASK-310, TASK-311, TASK-296, TASK-285, TASK-290
- ADRs: ADR-013 (amends), ADR-014, ADR-015, ADR-016

---
*Approved by: developer — standing auto-approval for the Arena public-launch work, 2026-07-02*
