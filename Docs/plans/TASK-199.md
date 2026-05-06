# TASK-199: Clean up duplicate Supabase users created during TASK-192 Google OAuth window

**Status:** Draft
**Priority:** P3

---

## Objective
While TASK-192 was briefly live on 2026-05-05, any existing email/password user who clicked 'Continue with Google' got a second auth.users row (Supabase does not auto-link identities by email). Audit auth.users for same-email pairs created on 2026-05-05 and merge their extension_entries / subscriptions / profiles rows under the email/password user_id, then delete the orphan Google user. Likely affects only the developer's test account.

## Dependencies
None

## Open Questions
<!-- Unknowns or decisions to resolve before planning. Delete if none. -->
