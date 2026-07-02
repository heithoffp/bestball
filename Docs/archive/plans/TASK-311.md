<!-- Completed: 2026-07-02 | Commit: dff614f -->
# TASK-311: Arena Edge Function hardening fixes from 2026-07-02 launch review

**Status:** Draft
**Priority:** P2

---

## Objective
Four bounded backend fixes found in the public-launch code review: (1) arena-register has no rate limiting or per-user total-row quota (MAX_TEAMS=2000 per request, unlimited requests — an authenticated account can flood arena_teams); (2) the quote() helper in arena-register strips double-quotes but not backslashes, so an entryId ending in a backslash corrupts the PostgREST or() filter string (bounded impact, still injection); (3) arena-vote accepts guest votes with no guestId, which bypass every durable limit and insert unlimited counted=false junk rows into arena_matches — reject with 400 since they can never count; (4) when beta_mode=false a signed-out arena-register caller gets a misleading 403 beta_closed — should be auth_required. All four are Edge Function changes requiring manual supabase functions deploy after merge.

## Dependencies
None

## Implementation (code complete — pending deploy, branch `arena-public-launch`)
All four fixes landed:
1. **Rate limit + quota** — `arena-register` adds a per-IP throttle
   (`RATE_LIMIT_REGISTERS_PER_MIN`) and a durable per-user owned-team ceiling
   (`MAX_OWNED_TEAMS_PER_USER`, checked against the live count so it holds across
   the client's sequential batches).
2. **Quoting bug** — the hand-built `or()`/`quote()` string is replaced with
   supabase-js `.in()` (which encodes values itself), eliminating the backslash
   injection entirely.
3. **Guest with no guestId** — `arena-vote` returns `400 guest_id_required`.
4. **Wrong error post-beta** — `arena-register` returns `401 auth_required` (not
   `403 beta_closed`) when signed out and `beta_mode=false`.

Files: `supabase/functions/arena-register/index.ts`, `arena-vote/index.ts`,
`_shared/arena.ts`. **Not verified** — needs `supabase functions deploy` (see
`docs/Arena_Public_Launch_Runbook.md`). Decisions: ADR-017.

## Open Questions
<!-- Unknowns or decisions to resolve before planning. Delete if none. -->
