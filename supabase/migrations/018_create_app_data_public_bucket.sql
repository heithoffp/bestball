-- TASK-355 / ADR-031: public-read bucket for the mobile ADP artifact.
--
-- ADP snapshots are the app's most frequently changing data. ADR-031 moves them
-- out of the app binary into a Storage object (adp-snapshots-v1.json) so a
-- refresh ships via `npm run publish:adp` (a file upload) instead of a native
-- rebuild + App Store review.
--
-- The bucket itself is created (public) by scripts/publish-adp.mjs; service_role
-- bypasses RLS for the upload. Unlike the private `app-data` bucket (migration
-- 016, authenticated-only), this artifact must be readable by GUESTS and the
-- demo experience — the identical data already ships in the app binary and is
-- not secret — so reads are granted to anon as well as authenticated.
--
-- A public bucket already serves objects at /storage/v1/object/public/...
-- without an RLS check; this explicit select policy documents the access
-- boundary in version control and also covers the authenticated object API path.
--
-- Idempotent — safe to re-run.

drop policy if exists "Public read app-data-public" on storage.objects;
create policy "Public read app-data-public"
  on storage.objects for select
  to anon, authenticated
  using (bucket_id = 'app-data-public');
