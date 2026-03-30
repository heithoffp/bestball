<!-- Completed: 2026-03-29 | Commit: pending -->
# TASK-018: Add .env.local.example for local dev onboarding

**Status:** Pending Approval
**Priority:** P3
**Feature:** FEAT-003

---

## Objective

The existing `.env.example` is incomplete (missing `VITE_STRIPE_PUBLISHABLE_KEY`, no comments). Update it with all required environment variables, descriptive comments, and a note that the app works without these vars in local-only mode.

## Verification Criteria

- `.env.example` lists all three `VITE_*` environment variables used in the codebase.
- Each variable has a comment explaining its purpose.
- File includes a note that the app works without these vars (IndexedDB fallback, auth disabled).
- No actual secrets or values are present — only placeholders.

## Verification Approach

1. Read the updated `.env.example` and confirm all three vars are present with comments.
2. Grep for `import.meta.env.VITE_` across the codebase to confirm no env vars are missing from the example.

## Files to Change

| File | Action | Description |
|------|--------|-------------|
| `best-ball-manager/.env.example` | Modify | Add `VITE_STRIPE_PUBLISHABLE_KEY`, add comments for all vars, add local-only mode note |

## Implementation Approach

1. Rewrite `best-ball-manager/.env.example` with:
   - Header comment explaining the file's purpose
   - Note that the app works without any of these (local-only mode)
   - `VITE_SUPABASE_URL=` with comment pointing to Supabase dashboard
   - `VITE_SUPABASE_ANON_KEY=` with comment
   - `VITE_STRIPE_PUBLISHABLE_KEY=` with comment

## Dependencies

None

---
*Approved by: <!-- developer name/initials and date once approved -->*
