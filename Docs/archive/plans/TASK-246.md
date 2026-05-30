<!-- Completed: 2026-05-28 | Commit: 0ab091a -->
# TASK-246: Supabase migration grants: update template, existing migrations, and CLAUDE.md

**Status:** Done (Verified)
**Priority:** P2

---

## Objective
Supabase is changing the Data API default on Oct 30, 2026 for existing projects: new tables in the `public` schema will no longer auto-expose to `anon`/`authenticated`/`service_role` roles — explicit `GRANT` statements will be required. This project's committed migrations (`supabase/migrations/001`, `002`, `006` and `docs/migrations/001_extension_entries.sql`) rely on the old implicit-grant behavior. Update them to include explicit grants (so they remain reproducible against new projects or after Oct 30 in this project), and add a note in `CLAUDE.md` under *External Dependencies & Environment* documenting the grant pattern requirement for any future tables.

## Dependencies
None.

## Verification Criteria
1. All four committed migration files have explicit `grant` statements covering the role(s) the table is accessed by.
2. Grant statements match the existing access patterns: each table's grants align with how it is queried in code (verified by grep of `.from('<table>')` callsites and the role/key each callsite uses).
3. `CLAUDE.md` has a short subsection or paragraph under *External Dependencies & Environment* documenting the post-Oct-30-2026 default and the grant pattern to include in future migrations.
4. No runtime behavior change: existing tables retain their old grants; the migration file edits are reproducibility/forward-compatibility only.

## Verification Approach
1. Diff each migration file; confirm grants are present and roles match the table's usage.
2. `grep -n "from('subscriptions'\|from('profiles'\|from('extension_entries'\|from('user_rankings'\|from('draft_boards_admin'" best-ball-manager/src chrome-extension/src supabase/functions admin-extension/src scripts` — cross-check role inferences against actual callsites.
3. Open `CLAUDE.md` and confirm the new content renders cleanly.

## Files to Change
| File | Action | Description |
|------|--------|-------------|
| `supabase/migrations/001_create_subscriptions_table.sql` | Modify | Add `grant select on public.subscriptions to authenticated;` (web client SELECTs via authenticated) and `grant select, insert, update, delete on public.subscriptions to service_role;` (Edge Functions upsert). |
| `supabase/migrations/002_create_profiles_table.sql` | Modify | Add `grant select on public.profiles to authenticated;` and `grant select, insert, update, delete on public.profiles to service_role;` (delete-account Edge Function deletes; handle_new_user trigger runs as `security definer`). |
| `supabase/migrations/006_create_draft_boards_admin.sql` | Modify | Add `grant select, insert, update, delete on public.draft_boards_admin to service_role;` (admin scraper uses service_role key). Do NOT add an `authenticated` grant here — that belongs in the follow-up task (TASK-247) alongside the read policy. |
| `docs/migrations/001_extension_entries.sql` | Modify | Add `grant select, insert, update, delete on public.extension_entries to authenticated;` (extension writes as authenticated user) and `grant select, insert, update, delete on public.extension_entries to service_role;` (delete-account, scripts/dump-user-entries use service_role). |
| `CLAUDE.md` | Modify | Add a short subsection under *External Dependencies & Environment* — "**Supabase Data API grants (post-Oct-30-2026):**" — with the grant template and a one-line note that future tables must include explicit grants. |

## Implementation Approach

### Role-to-table access matrix (derived from code grep)

| Table | anon | authenticated | service_role |
|---|---|---|---|
| `subscriptions` | — | SELECT (web reads own row) | SELECT/INSERT/UPDATE/DELETE (stripe-webhook, create-checkout-session, create-portal-session, delete-account) |
| `profiles` | — | SELECT (web reads own row) | SELECT/INSERT/UPDATE/DELETE (delete-account, grant-pro.mjs, handle_new_user trigger via security definer) |
| `extension_entries` | — | SELECT/INSERT/UPDATE/DELETE (extension + web) | SELECT/INSERT/UPDATE/DELETE (delete-account, dump-user-entries, admin scraper) |
| `user_rankings` | — | SELECT/INSERT/UPDATE/DELETE (extension reads, web upserts) | — (not used) |
| `draft_boards_admin` | — | (deferred to TASK-247) | SELECT/INSERT/UPDATE/DELETE (admin scraper) |

The `user_rankings` table has no committed migration (it was created ad-hoc in the SQL editor), so it's out of scope for this task — flagged separately in the Security Advisor audit (note added to CLAUDE.md will cover the going-forward pattern).

### Grant pattern (to be documented in CLAUDE.md)
```sql
-- After every `create table public.X (...)`:
alter table public.X enable row level security;

grant select on public.X to anon;                               -- only if anonymous reads
grant select, insert, update, delete on public.X to authenticated;
grant select, insert, update, delete on public.X to service_role;

create policy "..." on public.X for select to authenticated using (...);
```

### Note on idempotency
Existing tables in production already have their old grants and won't be affected. Re-running these migrations against a fresh project on/after Oct 30, 2026 would now produce the same role access as today. The `grant` statements are idempotent — re-running them on an existing project is a no-op.

## Rollback Approach
Revert the file changes via `git checkout` — no runtime artifacts were created.

---

Please review and reply **approved** to proceed, or provide feedback to revise.
