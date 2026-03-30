<!-- Completed: 2026-03-30 | Commit: a57da6a -->
# TASK-007: User profile and account settings page

**Status:** Approved
**Priority:** P3
**Feature:** FEAT-001

---

## Objective

Complete the existing `AccountSettings` modal by adding user profile info (email, display name), a sign-out button, and a hard-delete account flow with confirmation dialog — giving authenticated users a single place to manage their identity and account lifecycle.

## Verification Criteria

1. Opening Account Settings (gear icon in header) shows the signed-in user's email address and display name (or email fallback if no name is set).
2. Clicking "Sign Out" inside the modal signs the user out and closes the modal.
3. Clicking "Delete Account" shows a confirmation dialog before taking any action.
4. Confirming deletion calls the `delete-account` Edge Function, clears local data, signs the user out, and closes the modal.
5. Cancelling the delete confirmation returns to the normal modal state without any action taken.
6. The delete flow handles errors gracefully — if the Edge Function call fails, an inline error message is shown and the account is not deleted.

## Verification Approach

1. Run `npm run build` from `best-ball-manager/` — expect clean build with no errors.
2. Developer: Start dev server (`npm run dev`), sign in, open Account Settings — confirm email and name are visible.
3. Developer: Click "Sign Out" inside the modal — confirm sign-out completes and modal closes.
4. Developer: Click "Delete Account" — confirm confirmation step appears, then cancel — confirm nothing happens.
5. Developer: (Optional, on staging) Click "Delete Account" → confirm — verify account is deleted from Supabase dashboard.

## Files to Change

| File | Action | Description |
|------|--------|-------------|
| `best-ball-manager/src/components/AccountSettings.jsx` | Modify | Add profile section (email, display name), sign-out button, delete account button + inline confirmation state |
| `best-ball-manager/src/components/AccountSettings.module.css` | Modify | Add styles for profile section, danger zone, and secondary/destructive button variants |
| `supabase/functions/delete-account/index.ts` | Create | Edge Function that deletes the calling user from Supabase auth using the service-role key |

## Implementation Approach

### 1. Profile section in `AccountSettings.jsx`

- Import `useAuth` and pull `user` and `signOut` from it.
- Add a new section above the subscription section with two rows:
  - **Name:** `user.user_metadata?.full_name ?? user.user_metadata?.name ?? '—'`
  - **Email:** `user.email`
- No edit fields — display only. This is a viewer, not a form editor (keeping scope tight).

### 2. Sign-out button

- Add a "Sign Out" button to the `.actions` section.
- On click: call `signOut()` then `onClose()`.
- Style as a secondary (ghost) button — less prominent than the billing action.

### 3. Delete account flow

- Add a "Delete Account" link-style button at the bottom of the modal (danger color, small).
- Manage a local `deleteConfirm` boolean state (default `false`).
- When `deleteConfirm` is false: show "Delete Account" button.
- When `deleteConfirm` is true: replace it with an inline confirmation panel:
  - Warning text: "This will permanently delete your account and all data. This cannot be undone."
  - Two buttons: "Cancel" (resets state) and "Delete permanently" (calls the edge function).
- On confirm:
  1. Set loading state.
  2. Call `DELETE /functions/v1/delete-account` with the user's JWT (same pattern as `redirectToPortal`).
  3. If error: show inline error message, clear loading, stay in modal.
  4. If success: call `signOut()` (clears IndexedDB via `clearAllData`), then `onClose()`.

### 4. `delete-account` Edge Function

- Pattern matches existing edge functions (`create-checkout-session`, `create-portal-session`).
- Extract JWT from `Authorization` header, verify it to get `user_id`.
- Use Supabase admin client (service role key) to call `supabase.auth.admin.deleteUser(user_id)`.
- Return `{ success: true }` on success, `{ error: "..." }` on failure.
- Handle CORS with the same OPTIONS pre-flight pattern used in other edge functions.

### Edge cases

- If `user.user_metadata.full_name` and `user.user_metadata.name` are both absent (email/password signup with no name), show `—` for name.
- Delete button is only rendered for authenticated users with Supabase configured (`supabase !== null`).

## Dependencies

- TASK-004 — Auth system (complete)
- TASK-005 — Auth modal (complete)
- TASK-016 — Subscription management UI (complete — `AccountSettings.jsx` already exists with billing section)

---
*Approved by: <!-- developer name/initials and date once approved -->*
