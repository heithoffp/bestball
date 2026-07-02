# TASK-285: Arena: anti-abuse hardening + guest-vote weighting decision

**Status:** Approved (Level 3 auto-executed)
**Priority:** P2

## Objective
Per ADR-013, harden vote integrity and resolve the guest-vote weighting sub-decision.
Core integrity primitives (signed single-use pairing tokens, self-vote exclusion,
pairing_id-unique dedupe/replay guard, guest cap) shipped with TASK-281; this task adds
**rate limiting** and **observability** on top, and records the guest-vote decision.

## Decision (guest-vote weighting)
Recorded in TASK-281's plan: guest votes count **equally** toward Elo, capped at
`GUEST_VOTE_CAP = 5` counted votes per guest id (baked into the signed token at pair
time). This task adds the rate-limit backstop against guest-id resets.

## What this task adds (on top of TASK-281)
- **Per-IP throttle** (`inMemoryRateLimit`, best-effort, per-isolate): `arena-pair`
  `RATE_LIMIT_PAIRS_PER_MIN = 40`, `arena-vote` `RATE_LIMIT_VOTES_PER_MIN = 20`.
- **Durable per-voter vote-rate limit** (the load-bearing one — gates state mutation):
  `arena-vote` counts the voter's (`voter_id` or `voter_guest_id`) matches in the last
  minute via `arena_matches` and rejects with 429 over `RATE_LIMIT_VOTES_PER_MIN`.
- **Observability**: structured `console` lines for every recorded vote
  (`pairing/winner/counted/guest`) and for each anomaly (invalid token, self-vote
  blocked, guest cap reached, rate limited) — visible in the Supabase function logs.

## Integrity primitives already in place (TASK-281, verified)
- HMAC-signed pairing token carrying team ids + voter identity → vote cannot be
  retargeted or forged; expiry enforced.
- `arena_matches.pairing_id` UNIQUE → replayed token rejected (409 `already_voted`).
- Self-vote exclusion at both pair time and vote time (authoritative DB `user_id`).
- Rating columns are service_role-write only (column-scoped grants, TASK-280).

## Verification
- `_shared/arena.ts` exposes `getClientIp`, `inMemoryRateLimit`, and the rate-limit constants.
- `arena-pair` throttles per IP before doing work; `arena-vote` throttles per IP and per voter (durable) before insert.
- Anomaly + volume logging present in `arena-vote`.
- Existing TASK-281 verification still holds (changes are additive; re-verified by the independent verifier).

## Files to Change
| File | Action | Description |
|------|--------|-------------|
| `supabase/functions/_shared/arena.ts` | Modify | Rate-limit constants + `getClientIp` + `inMemoryRateLimit` |
| `supabase/functions/arena-pair/index.ts` | Modify | Per-IP throttle + warn log |
| `supabase/functions/arena-vote/index.ts` | Modify | Per-IP + durable per-voter throttle, anomaly/volume logging |

## Known v1 limitations / revisit (ADR-013)
- In-memory IP limiter is per-isolate (not shared); durable cross-instance limiting would need a table or Redis. The durable per-voter `arena_matches` count is the real guard.
- Guest cap + rate count are not transactional with the insert; a determined guest racing distinct pairings could exceed the cap slightly. Revisit (auth-only voting / reputation weighting) if abuse appears, per ADR-013.

## 2026-07-02 launch-review findings — REOPENS this task before beta_mode=false
The public-launch code review found the guest path insufficient once guests are real
(both "durable" guards key on the client-invented `guestId`):
1. **Rotating `guestId` resets everything.** The 5-counted-vote cap and the durable
   20/min limit are keyed on `voter_guest_id`; a guest who mints a fresh random id per
   pairing bypasses both. Only the per-isolate in-memory IP throttle remains — it
   resets on cold start and is not shared across instances. Sustained public-leaderboard
   Elo manipulation is feasible on day one.
2. **Guest self-votes.** `arena-pair` excludes own teams only `if (voterId)` and
   `arena-vote`'s self-vote check is likewise auth-only, so a team owner in a
   logged-out tab can be paired with — and vote for — their own rosters.
Direction to decide (this is ADR-013's "vote manipulation" revisit condition firing):
key the durable cap/rate limit on a hashed IP stored per match (in addition to
guestId), and/or require auth for *counted* votes while keeping guest voting
frictionless-but-uncounted. Launch-gating alongside TASK-290/296/310.

## Resolution — HYBRID (code complete, branch `arena-public-launch`)
Decision recorded in **ADR-017**: guest votes still count toward Elo but the counted
cap (`GUEST_VOTE_CAP`) and the durable per-voter rate limit key on BOTH the client
`guestId` AND a salted HMAC of the client IP (`arena_matches.voter_ip_hash`, added in
migration 015). Rotating the guestId no longer resets either limit — the shared IP
hash accumulates. Guests with no `guestId` are rejected (400, TASK-311). Over the cap
→ vote recorded `counted=false`; the existing client UI shows the "sign in to keep
counting" nudge. Authed callers' rate limit keys on `voter_id` only (shared-NAT users
not throttled as a group). Residual (accepted, ADR-017): guest self-votes can't be
fully identified without auth — mitigated by the caps. Files: `arena-vote/index.ts`,
`_shared/arena.ts` (`hashClientIp`), migration 015. **Not verified** — needs deploy
(see `docs/Arena_Public_Launch_Runbook.md`).
