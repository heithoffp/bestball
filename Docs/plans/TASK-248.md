# TASK-248: Retroactive user_rankings migration + Security Advisor audit

**Status:** Approved
**Priority:** P3

---

## Objective
The `user_rankings` table was created ad-hoc in the Supabase SQL editor across TASK-099 and TASK-144 and has no committed migration. Add a retroactive migration (`supabase/migrations/005_create_user_rankings.sql`) that captures the current schema, RLS policy, and explicit `authenticated` grants so the table is reproducible against a fresh Supabase project (and against this project after the 2026-10-30 Data API default change). Pair the file edit with a developer-run Supabase Security Advisor audit confirming the live table's grants and RLS posture match what the migration declares.

## Verification Criteria
1. New file `supabase/migrations/005_create_user_rankings.sql` exists and declares the schema currently in use: `user_id uuid` referencing `auth.users`, `platform text not null default 'underdog'`, `rankings jsonb not null`, `updated_at timestamptz default now()`, with PK `(user_id, platform)`.
2. The migration enables RLS and creates a single policy granting `authenticated` users full access (`for all`) to rows where `auth.uid() = user_id`, using both `using` and `with check` clauses.
3. The migration includes only an `authenticated` grant (`select, insert, update, delete`). No `anon` grant, no `service_role` grant — matching the role/callsite matrix in archived TASK-246's plan.
4. The migration is safe to re-run against the production project: `create table if not exists`, RLS enable is idempotent by Postgres, grants are idempotent by Postgres, and the policy is guarded with `drop policy if exists ... ;` before `create policy`.
5. Developer confirms via Supabase Security Advisor against the live `public.user_rankings` table that (a) RLS is enabled, (b) only `authenticated` has DML grants, (c) the policy matches the own-row predicate. Any discrepancy is flagged for follow-up — either by adjusting the migration to match production, or by filing a new task to align production with the migration.

## Verification Approach
Claude runs:
1. After writing the migration, Read the new file back and visually confirm it matches Verification Criteria 1–4 line by line.
2. Re-run the callsite grep used in archived TASK-246 (Verification Approach step 2) to reconfirm no service_role usage of `user_rankings`:
   ```
   grep -n "from('user_rankings')" best-ball-manager/src chrome-extension/src supabase/functions scripts admin-extension/src
   ```
   Expected: matches only in `best-ball-manager/src/utils/rankingsExport.js` and `chrome-extension/src/utils/bridge.js` — both authenticated-client callsites.
3. Confirm the new migration's grant block matches the pattern committed in the four migrations updated by TASK-246 (visual diff against `001_create_subscriptions_table.sql`).

Developer runs (Supabase Security Advisor audit — required before marking Done):
4. Open the Supabase dashboard for this project → Database → Security Advisor (or Database → Linter, depending on dashboard version).
5. Filter for entries referencing `user_rankings`. Confirm there are no `rls_disabled`, `policy_exists_rls_disabled`, or `policy_missing` findings against the table.
6. Open Database → Tables → `user_rankings` → permissions panel. Confirm:
   - RLS: enabled.
   - Grants: `authenticated` has SELECT/INSERT/UPDATE/DELETE. `anon` has none. `service_role` has the default (no explicit grant, since pre-2026-10-30 tables retain old behavior — note this in the audit response).
   - Policies: one policy on `user_rankings` with `auth.uid() = user_id` for both `using` and `with check`.
7. Report findings back. If any discrepancy is found, decide between: (a) edit the migration to match production (this task), or (b) file a follow-up task to align production (separate task).

## Files to Change
| File | Action | Description |
|------|--------|-------------|
| `supabase/migrations/005_create_user_rankings.sql` | Create | Retroactive migration capturing live schema, RLS policy, and explicit `authenticated` grants for the `user_rankings` table. Idempotent guards so re-running against production is a no-op. |

## Implementation Approach

### Migration file contents
```sql
-- Retroactive migration for the user_rankings table.
--
-- This table was originally created ad-hoc in the Supabase SQL editor across
-- TASK-099 (initial single-platform schema) and TASK-144 (added `platform`
-- column and re-keyed PK to (user_id, platform)). This file captures the
-- current production schema, RLS policy, and explicit Data API grants so the
-- table is reproducible against a fresh Supabase project and aligned with the
-- post-2026-10-30 grant requirement (see CLAUDE.md > External Dependencies).
--
-- Access pattern (per TASK-246 role/callsite matrix):
--   - authenticated: web app upserts via best-ball-manager/src/utils/rankingsExport.js;
--                    chrome extension selects via chrome-extension/src/utils/bridge.js.
--   - service_role:  not used.
--   - anon:          not used.
--
-- All statements are idempotent so this is safe to re-run against the existing
-- production project as a no-op.

create table if not exists public.user_rankings (
  user_id    uuid not null references auth.users(id) on delete cascade,
  platform   text not null default 'underdog',
  rankings   jsonb not null,
  updated_at timestamptz not null default now(),
  primary key (user_id, platform)
);

alter table public.user_rankings enable row level security;

-- Data API grants (required for new tables in public schema after 2026-10-30).
-- Web client and Chrome extension both authenticate as the end user; no
-- service_role or anon access is needed.
grant select, insert, update, delete
  on public.user_rankings
  to authenticated;

-- Own-row policy: users manage their own rankings rows for any platform.
-- Drop-and-recreate so the migration is idempotent against the production
-- table where a policy may already exist under a different name.
drop policy if exists "Users manage own rankings" on public.user_rankings;
create policy "Users manage own rankings"
  on public.user_rankings for all
  to authenticated
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);
```

### Design notes
- **PK uses `(user_id, platform)` not a surrogate id.** This matches the upsert callsite in `rankingsExport.js` (`onConflict: 'user_id,platform'`) and the original TASK-144 design.
- **`on delete cascade` on `user_id`.** Mirrors the implicit expectation that delete-account flows clean up user_rankings rows. Verified against `supabase/functions/delete-account/` callsites — not currently explicit there, but cascade is the safe default and matches user expectations. If the live table omits cascade, the Security Advisor audit (step 7 above) will surface it; we can match production at that point.
- **No `updated_at` trigger.** The upsert callsite writes `updated_at: new Date().toISOString()` explicitly. No trigger is needed; the column default just covers initial inserts that omit it.
- **Policy is `for all`, not separate select/insert/update/delete policies.** Simpler and matches how this table is actually used (read + upsert from the same user). The `with check` clause is critical — without it, an authenticated user could insert a row with a different `user_id`.
- **No anon grant.** There is no demo path for `user_rankings`; the web app's anon/guest flow uses IndexedDB, not Supabase.

### Reconciliation with production
The migration is written to match the intended schema based on the archived plans + current callsites. If the Security Advisor audit (steps 4–7 above) surfaces a difference (e.g., production has a cascade we didn't declare, a different policy name, or a vestigial `id` column), the resolution is one of:
- **Migration is right, production drifted:** file a new task to reconcile production. Do NOT silently edit the migration to match a quirk we don't want carried forward.
- **Production is right, migration is wrong:** edit this migration file before marking the task Done. Note the diff in the conversation so the rationale is captured.

## Rollback Approach
Delete `supabase/migrations/005_create_user_rankings.sql`. No runtime artifacts are created — the production table is unchanged because every statement in the migration is idempotent. `git checkout` undoes the file edit cleanly.

## Dependencies
None. (Archived TASK-246 covers the four pre-existing migrations; this task fills the gap for the one table that had no committed migration at all.)

---

Please review and reply **approved** to proceed, or provide feedback to revise.
