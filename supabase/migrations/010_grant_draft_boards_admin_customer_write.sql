-- TASK-258 / ADR-009: participant-authorized full-board capture.
--
-- The customer chrome-extension now persists the full 12-roster pod board to
-- this table at sync time, for drafts the syncing user participated in (UD
-- authorizes them to view the whole pod via /v2/drafts/{id}). This supersedes
-- the admin-scraper write path (ADR-008, retired) — see migration 006.
--
-- Trust model: an authenticated customer may insert/update any board they
-- captured. Boards are pod-level tournament data keyed by draft_id; rows are
-- last-writer-wins (the board is identical across pod members). RLS cannot
-- cheaply verify pod membership (it would require matching the writer's UD
-- user id against picks[].userId), so the check is permissive — acceptable for
-- a paid product per ADR-009's Option B trust posture.
--
-- Note: this persists identifiable third-party rosters server-side (ADR-009
-- Risk) — reflected in the privacy policy.
--
-- Existing grants/policies are untouched:
--   migration 006 — service_role full access (admin scraper, being retired).
--   migration 009 — `select` to authenticated + read policy (web read path).

grant insert, update on public.draft_boards_admin to authenticated;

create policy "Authenticated users can insert draft boards"
  on public.draft_boards_admin
  for insert
  to authenticated
  with check (true);

create policy "Authenticated users can update draft boards"
  on public.draft_boards_admin
  for update
  to authenticated
  using (true)
  with check (true);
