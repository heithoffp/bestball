<!-- Completed: 2026-07-02 | Commit: f5bb972 (verified shipped in 2026-07-02 launch review) -->
# TASK-300: Arena: fix pairing pool starvation (own-team exclusion at query level)

**Status:** Approved (Level 3 auto-executed)
**Priority:** P1
**Epic:** EPIC-07 (Best Ball Arena)

---

## Objective
`arena-pair` pulls the `POOL_SAMPLE_LIMIT` (200) lowest-`matches` teams and only THEN
removes the caller's own teams in memory. A caller who owns most of the low-match pool
(exactly the private-beta situation: the developer's own never-voted teams sit at
matches=0 forever while votable board teams accumulate matches and sort out of the
sample) ends up with < 2 votable teams → `insufficient_pool` → the "No matchups yet"
empty state, even though thousands of votable teams exist.

Fix: exclude the caller's own teams **in the SQL query** so the 200-team sample is
entirely votable. `.neq("user_id", voterId)` alone would also drop board teams
(`NULL <> x` is NULL in Postgres), so use `or(user_id.is.null,user_id.neq.<voter>)`,
which keeps ownerless board rows. Keep the in-memory filter as defense-in-depth.

## Decision
None open — bounded bug fix; the exclusion semantics (keep NULL-owner board teams)
are already documented in the existing code comment.

## Verification
- `arena-pair/index.ts`: pool query contains the `or(user_id.is.null,user_id.neq.…)`
  clause applied only when `voterId` is present; in-memory filter retained.
- `voterId` is a Supabase auth UUID (no PostgREST metacharacters), safe in the filter string.
- Independent verifier sub-agent reviews the diff against this objective (no Deno
  toolchain on this machine, so no deterministic typecheck is available).
- Frontend untouched by this task — no lint/build impact.

## Files to Change
| File | Change |
|------|--------|
| `supabase/functions/arena-pair/index.ts` | Add query-level own-team exclusion |

## Rollback
Revert the commit. No schema or data change.
