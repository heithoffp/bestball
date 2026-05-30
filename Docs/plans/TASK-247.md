# TASK-247: draft_boards_admin: include explicit GRANT when adding authenticated read policy

**Status:** Draft
**Priority:** P3

---

## Objective
Migration 006_create_draft_boards_admin.sql notes 'A read policy for authenticated customers will be added in a follow-up task when RosterViewer is wired to prefer admin-scraped data over per-user data.' Under Supabase's new Data API default (effective Oct 30, 2026 for existing projects), an RLS policy alone is insufficient — the table also needs an explicit grant. When this follow-up is implemented, the SQL must include 'grant select on public.draft_boards_admin to authenticated;' alongside the read policy. This is a single-line flag/reminder for whoever picks up the draft_boards_admin customer-read work (linked to ADR-008).

## Dependencies
None

## Open Questions
<!-- Unknowns or decisions to resolve before planning. Delete if none. -->
