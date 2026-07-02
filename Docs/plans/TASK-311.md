# TASK-311: Arena Edge Function hardening fixes from 2026-07-02 launch review

**Status:** Draft
**Priority:** P2

---

## Objective
Four bounded backend fixes found in the public-launch code review: (1) arena-register has no rate limiting or per-user total-row quota (MAX_TEAMS=2000 per request, unlimited requests — an authenticated account can flood arena_teams); (2) the quote() helper in arena-register strips double-quotes but not backslashes, so an entryId ending in a backslash corrupts the PostgREST or() filter string (bounded impact, still injection); (3) arena-vote accepts guest votes with no guestId, which bypass every durable limit and insert unlimited counted=false junk rows into arena_matches — reject with 400 since they can never count; (4) when beta_mode=false a signed-out arena-register caller gets a misleading 403 beta_closed — should be auth_required. All four are Edge Function changes requiring manual supabase functions deploy after merge.

## Dependencies
None

## Open Questions
<!-- Unknowns or decisions to resolve before planning. Delete if none. -->
