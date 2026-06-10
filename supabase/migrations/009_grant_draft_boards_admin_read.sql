-- TASK-240: Roster Viewer full Draft Board view.
--
-- The web app reads admin-scraped draft boards (TASK-241) so signed-in users
-- can open the full board for any of their synced Underdog drafts. Interim
-- read path per the 2026-06-10 developer directive: draft_boards_admin remains
-- the source until participant-authorized capture (ADR-009) replaces it, at
-- which point this table and policy are retired together (TASK-252).
--
-- Boards are pod-level tournament data (no per-user rows), so the read policy
-- is a blanket allow for authenticated users. anon is deliberately NOT granted.

grant select on public.draft_boards_admin to authenticated;

create policy "Authenticated users can read draft boards"
  on public.draft_boards_admin
  for select
  to authenticated
  using (true);
