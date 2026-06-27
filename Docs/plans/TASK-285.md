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
