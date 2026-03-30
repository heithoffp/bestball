<!-- Completed: 2026-03-30 | Commit: a57da6a -->
# TASK-030: Deploy delete-account Edge Function to Supabase

**Status:** Done
**Priority:** P2

---

## Objective

The `delete-account` Edge Function was created in `supabase/functions/delete-account/index.ts` as part of TASK-007 but has not been deployed to Supabase. Without deployment, the delete account flow in AccountSettings will silently fail. Needs to be deployed and verified end-to-end so the feature actually works in production.

## Dependencies

- TASK-007 — delete-account function source created (complete)

## Notes

- Deployed with `--no-verify-jwt` flag. Supabase's gateway-level JWT verification was rejecting valid tokens; the function handles its own auth internally via `supabaseClient.auth.getUser()` so this is safe.
- A 403 on `/auth/v1/logout` after deletion is expected — the user no longer exists when signOut() fires, but local session is still cleared.
