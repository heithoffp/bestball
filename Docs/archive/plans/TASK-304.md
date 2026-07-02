<!-- Completed: 2026-07-02 | Commit: f5bb972 (verified shipped in 2026-07-02 launch review) -->
# TASK-304: Account-level Arena enrollment (ADR-016)

**Status:** Approved (developer, 2026-07-01)
**Priority:** P2
**Epic:** EPIC-07 (Best Ball Arena)

---

## Objective
Replace per-team Pro-gated Arena enrollment with one account-level enrolled/unenrolled
state (default enrolled) stored in a new `arena_user_prefs` table, and make every
ranked/paired surface respect `enrolled = true` unconditionally. A user is either in
(all teams) or out (all teams); a synced team is in the Arena by default. Implements
the account-level-enrollment refinement of ADR-016.

## Dependencies
None (first of the ADR-016 sequence; TASK-305 and TASK-306 depend on this).

## Implementation Approach
1. **Migration `supabase/migrations/013_arena_user_prefs.sql`** (idempotent, mirrors
   012 style): `arena_user_prefs (user_id uuid primary key references auth.users(id)
   on delete cascade, enrolled boolean not null default true, updated_at timestamptz
   not null default now())`. Enable RLS; owner-only policies for `authenticated`
   (select / insert with check / update using+with check on `user_id = auth.uid()`).
   Grants per CLAUDE.md new-table rule: `select` + column-scoped
   `insert (user_id, enrolled)` + `update (enrolled, updated_at)` to `authenticated`;
   full DML to `service_role`; nothing to `anon`.
2. **`supabase/functions/arena-pair/index.ts`**: make the `enrolled = true` filter in
   `fetchVotablePool` unconditional (today it applies only in the retired `opt_in`
   mode); remove the dead `arena_config.arena_eligibility_mode` read with a comment
   retiring the flag in place (ADR-016).
3. **`best-ball-manager/src/utils/arenaClient.js`**: add `getArenaEnrollment()`
   (select own pref row, `row?.enrolled ?? true`) and `setArenaEnrollment(enrolled)`
   (select-then-insert/update the pref row — NOT upsert, column-scoped grants — then
   bulk `update arena_teams set enrolled, updated_at where user_id = uid`; RLS
   confines it to the user's own `source='owned'` rows). Delete `enrollTeam` /
   `unenrollTeam` (only consumer is ArenaMyTeams). Add `.eq('enrolled', true)` to
   `getLeaderboard`, `getMyBestArenaTeam`, and `getArenaRank`'s `build()`.
4. **`ArenaMyTeams.jsx`**: single account-level switch driven by the new client
   functions; per-team rows become read-only standings (Elo, W–L, provisional);
   remove the `canAccessFeature(tier, 'arena_enroll')` gate and Upgrade CTA.
5. **`featureAccess.js`**: remove the `arena_enroll: 'pro'` key (Arena's per-team
   paid hook is retired per ADR-016; `arena: 'guest'` unchanged).
6. **`Docs/Feature_Specs/Best_Ball_Arena.md`**: update Monetization and Views/My
   Teams sections for the account-level model.

## Files to Change
| File | Change |
|------|--------|
| `supabase/migrations/013_arena_user_prefs.sql` | New: prefs table, RLS, grants |
| `supabase/functions/arena-pair/index.ts` | Unconditional enrolled filter; retire mode read |
| `best-ball-manager/src/utils/arenaClient.js` | get/setArenaEnrollment; remove per-team enroll fns; enrolled filters |
| `best-ball-manager/src/components/arena/ArenaMyTeams.jsx` | Account toggle; read-only standings; drop Pro gate |
| `best-ball-manager/src/utils/featureAccess.js` | Remove `arena_enroll` |
| `Docs/Feature_Specs/Best_Ball_Arena.md` | Monetization + My Teams sections |

## Verification Criteria
1. Migration 013 re-runs cleanly (idempotent); `arena_user_prefs` rejects cross-user
   writes under RLS.
2. `arena-pair` never returns a team whose row has `enrolled = false`, regardless of
   `arena_eligibility_mode`.
3. Toggling the account switch off sets `enrolled = false` on ALL the user's owned
   rows and upserts the pref; toggling on restores; leaderboard/rank exclude the
   user's teams while off.
4. No reference to `arena_enroll` remains in `best-ball-manager/src`.
5. `npm run lint` and `npm run build` pass.

## Verification Approach
- Automatable: `cd best-ball-manager && npm run lint && npm run build`; grep for
  `arena_enroll` in `src/` (expect zero hits).
- Developer-manual: `supabase db push` (run twice — second must be a no-op);
  `supabase functions deploy arena-pair`; SQL editor: inspect `arena_user_prefs`
  after toggling in the UI; set a test user's rows `enrolled=false` and confirm
  arena-pair never serves them; My Teams walk-through on the allowlisted account.

## Rollback
Revert the commit. Migration rollback: `drop table public.arena_user_prefs;` and
redeploy the previous `arena-pair` (the enrolled filter reverts to opt-in-only).
