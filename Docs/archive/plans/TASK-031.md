<!-- Completed: 2026-03-30 | Commit: a57da6a -->
# TASK-031: Remove redundant Sign Out button from AuthButton

**Status:** Done
**Priority:** P3

---

## Objective

Remove the "Sign out" button from the header toolbar (`AuthButton.jsx`). Sign-out now lives exclusively in the `AccountSettings` modal (added in TASK-007), making the toolbar button redundant.

## Verification Criteria

- Signed-in users no longer see a "Sign out" button in the header toolbar.
- Sign-out still works correctly via the `AccountSettings` modal.
- `npm run lint` remains clean after the change.

## Verification Approach

1. Run `npm run dev` and sign in.
2. Confirm no "Sign out" button appears in the toolbar (only the avatar and "Start Free Trial" if applicable).
3. Open Account Settings and confirm the Sign Out button still works.
4. Run `npm run lint` and confirm zero new errors.

## Files to Change

| File | Action | Description |
|------|--------|-------------|
| `src/components/AuthButton.jsx` | Modify | Remove the Sign Out `<button>` element and remove `signOut` from the `useAuth` destructure |

## Implementation Approach

1. In `AuthButton.jsx`, remove lines 30–33 (the `<button className="toolbar-btn toolbar-btn--ghost" onClick={signOut}>Sign out</button>`).
2. Remove `signOut` from the `useAuth` destructure on line 8 (keep `user` and `loading`).
3. Verify `signOut` is not used elsewhere in the file.

## Dependencies

- TASK-007 — Sign Out added to AccountSettings modal (complete)

---

*Approved by: developer 2026-03-30*
