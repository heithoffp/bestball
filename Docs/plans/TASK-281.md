# TASK-281: Arena: Edge Functions (pairing + vote/Elo ingestion)

**Status:** Approved (Level 3 auto-executed)
**Priority:** P1

## Objective
Per ADR-013, implement two Supabase Edge Functions: (1) `arena-pair` — issues a signed
single-use token and selects a comparable blind matchup (same platform, nearby Elo,
excludes voter's own teams); (2) `arena-vote` — validates the token, dedupes, ignores
self-votes, applies the server-computed Elo update (provisional higher-K for first N
matches). Extends the ADR-001 Edge Function pattern. Clients never write rating columns.
Built on the TASK-280 schema.

## Decision (guest-vote weighting — ADR-013 left this as a tunable)
**Question:** How do guest (unauthenticated) votes affect the hidden Elo?
**Answer (developer, 2026-06-26):** *Counted equally, but cap a guest at ~5 counted votes.*
Implemented as: authenticated votes always count at full K; guest votes count at full K
too, but only the first `GUEST_VOTE_CAP = 5` per guest id are `counted = true` (tracked by
a client `guest_id` in localStorage, baked into the signed pairing token so it can't be
swapped; server-side per-IP rate limiting added in TASK-285 as the backstop against
guest-id resets). Votes beyond the cap are recorded (`counted = false`) for the tally but
do not move Elo.

## Verification
- Two functions exist: `supabase/functions/arena-pair/index.ts`, `supabase/functions/arena-vote/index.ts`, plus shared `supabase/functions/_shared/arena.ts`.
- Both follow the existing Edge Function template (esm.sh import, `corsHeaders`, OPTIONS preflight, `SB_SERVICE_ROLE_KEY` admin client, JSON responses).
- `arena-pair`: reads `arena_eligibility_mode`; builds the eligible pool (opt_in → enrolled only); excludes the caller's own teams; picks a same-platform, nearby-Elo opponent; returns only `{id, display_snapshot}` per team (no owner, no Elo) + a signed token whose payload carries `pid/a/b/voter/guest/exp`.
- `arena-vote`: HMAC-verifies + expiry-checks the token; binds the token's voter to the live caller; rejects self-votes; computes `counted` per the guest-cap decision; inserts `arena_matches` (pairing_id unique = replay guard) **before** applying Elo; updates both teams' Elo/matches/W-L/provisional only when counted; returns per-team before/after/delta.
- `supabase/config.toml` sets `verify_jwt = false` for both functions (guest access).
- Token signing/verifying is symmetric (sign→verify round-trips); a tampered payload or expired token fails verification.
- Static verification only (no Deno/Supabase stack locally); deploy + live test is a developer step.

## Files to Change
| File | Action | Description |
|------|--------|-------------|
| `supabase/functions/_shared/arena.ts` | Create | Constants, CORS/json helpers, Elo math, HMAC token sign/verify, voter resolution |
| `supabase/functions/arena-pair/index.ts` | Create | Pairing + signed token |
| `supabase/functions/arena-vote/index.ts` | Create | Token validation, dedupe, self-vote exclusion, guest cap, Elo update |
| `supabase/config.toml` | Create | `verify_jwt = false` for arena-pair / arena-vote |

## Deploy (developer)
1. Set the function secret: `supabase secrets set ARENA_TOKEN_SECRET=<random 32+ char string>` (SUPABASE_URL / SUPABASE_ANON_KEY / SB_SERVICE_ROLE_KEY already exist for the other functions).
2. `supabase functions deploy arena-pair arena-vote`.
3. Smoke test: call `arena-pair` (expects `insufficient_pool` until ≥2 enrolled teams exist), then enroll test teams and re-test pair→vote.

## Known v1 limitations (per ADR-013 revisit conditions)
- Elo update is a best-effort read-modify-write (not a single transaction); concurrent votes on the same team could race. Acceptable for v1; the ADR names a scheduled batch Elo recompute as the fallback.
- Matchmaking is in-memory over a bounded sample (`POOL_SAMPLE_LIMIT`); a SQL RPC with an Elo-window + random pick is the scale path.
