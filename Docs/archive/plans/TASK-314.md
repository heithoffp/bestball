<!-- Completed: 2026-07-09 | Commit: (uncommitted) -->
# TASK-314: Rosters page — per-roster Delete button (remove entry from extension_entries)

**Status:** Pending Approval
**Priority:** P2

---

## Objective

Give users a way to delete an individual roster from the Rosters page (`RosterViewer`),
removing its row from Supabase `extension_entries`. This replaces the rejected rule-based
SQL cleanup approach: thrown-out / invalid drafts that skew portfolio results are removed
manually, per-roster, by the user who owns them.

The button lives in the **expanded** roster view (alongside "Board" / "Share Image"), uses
the app's established **inline two-step confirm** pattern, and optimistically removes the
roster from the on-screen list on success. RLS already restricts deletes to the caller's own
rows, so no schema or policy change is required.

---

## Context & Constraints (from research)

- **First web-app delete of `extension_entries`.** Today only the Chrome extension
  (`chrome-extension/src/utils/bridge.js`) deletes from this table; the web app's
  `extensionBridge.js` is read-only. This task adds the first web-side delete helper.
- **Deletes are transient against a still-live draft.** The extension's incremental sync
  sources "already known" ids from Supabase (`readEntryIds`), so a deleted row that still
  exists as a live draft on the platform is **re-fetched and re-added** on the next sync
  (confirmed for both Underdog and DraftKings). This is acceptable and correct for the stated
  use case: thrown-out / invalid drafts no longer appear in the platform's draft list, so once
  deleted they stay gone. **A permanent per-entry suppression list is explicitly out of scope.**
- **Arena pool is not cascaded (ADR-016).** A synced roster is also enrolled in the Arena
  pool as an `arena_teams` row. Deleting the `extension_entries` row does **not** remove the
  Arena entry (backfill/registration is a separate, re-runnable path). Out of scope here —
  flagged as a potential follow-up task.
- **UI convention.** The app uses an inline two-step confirm (trigger → inline
  Cancel/Confirm block with a warning + loading/error states), modeled on
  `AccountSettings.jsx` "Delete Account". `window.confirm` is not used anywhere in the web app.
- **No KB context** — `kb/index.md` is not present; research ran without KB.

---

## Verification Criteria

1. `npm run lint` passes clean (no new warnings/errors introduced by the change).
2. `npm run build` succeeds.
3. In dev, signed in with a real synced account (non-demo): expanding a roster shows a red
   **Delete** action next to "Share Image" (desktop) and in the mobile card actions.
4. Clicking **Delete** reveals an inline confirm ("Delete this roster? This removes it from
   your portfolio.") with **Cancel** and **Delete** (destructive) buttons — no browser
   `confirm()` dialog.
5. **Cancel** returns to the normal action row with the roster intact.
6. **Confirm** removes the roster from the list immediately, and it remains gone after a full
   page reload (verifies the Supabase row was actually deleted, not just hidden locally).
7. The **Delete** action does **not** render in demo mode or for guests (no DB row to delete).
8. A delete failure (e.g. offline) shows an inline error and leaves the roster in place.

---

## Verification Approach

**Automated (Claude runs):**
- `cd best-ball-manager && npm run lint`
- `cd best-ball-manager && npm run build`

**Manual (requires the developer — needs a real authenticated account with synced
entries; guest/demo mode hides the button by design):**
1. `npm run dev`, sign in with an account that has synced rosters, open **Rosters**.
2. Expand a roster; confirm the red **Delete** action appears (desktop table + mobile card).
3. Click Delete → Cancel → confirm roster is intact.
4. Click Delete → Delete (confirm) → confirm the row disappears.
5. Hard-reload the page → confirm the roster is still gone (DB delete persisted).
6. Toggle a mobile viewport (≤599px) and repeat step 2–4 to confirm the mobile placement.
7. (Optional) Load demo mode ("Try Demo") and confirm no Delete action renders.

---

## Files to Change

| File | Change |
|------|--------|
| `best-ball-manager/src/utils/extensionBridge.js` | Add `deleteExtensionEntry(userId, entryId)` — scoped `.delete().eq('user_id').eq('entry_id')`, throws on error. |
| `best-ball-manager/src/App.jsx` | Add `handleDeleteRoster(entryId)`: import+call helper, optimistically `setRosterData(prev => prev.filter(...))`, `trackEvent('roster_deleted')`. Pass `onDeleteRoster` to `<RosterViewer>` only when authenticated + not demo. |
| `best-ball-manager/src/components/RosterViewer.jsx` | Accept `onDeleteRoster` prop. Add a `DeleteRosterButton` sub-component (local confirm/loading/error state). Render it in the desktop expanded-row `shareAction` slot (line ~1199) and the mobile `DraftCapitalMap` `actions` slot (line ~735). On success, reset `expandedEntry`. Gate on `!demoMode && onDeleteRoster`. |
| `best-ball-manager/src/components/RosterViewer.module.css` | Add `.deleteBtn` (+ `:hover`) mirroring `.boardBtn`/`.downloadBtn` in the `var(--negative)` hue, plus minimal inline-confirm layout classes (`.deleteConfirm`, `.deleteConfirmBtns`). Include the mobile padding/font override. |

No migration, RLS, or Edge Function changes. No changes to the Chrome extension.

---

## Implementation Approach

1. **Data helper** (`extensionBridge.js`):
   ```js
   export async function deleteExtensionEntry(userId, entryId) {
     if (!supabase || !userId || !entryId) throw new Error('[BBM] deleteExtensionEntry requires supabase + userId + entryId');
     const { error } = await supabase
       .from('extension_entries')
       .delete()
       .eq('user_id', userId)
       .eq('entry_id', entryId);
     if (error) throw error;
   }
   ```

2. **App wiring** (`App.jsx`): add an async `handleDeleteRoster(entryId)` that dynamically
   imports the helper (matching the existing `loadFromExtension` lazy-import style), deletes,
   then `setRosterData(prev => prev.filter(r => r.entry_id !== entryId))` and
   `trackEvent('roster_deleted')`. Pass to `RosterViewer` as
   `onDeleteRoster={user?.id && !isUsingDemoData ? handleDeleteRoster : undefined}` so demo /
   guest never receive it. Let errors propagate so the button can surface them.

3. **RosterViewer** (`RosterViewer.jsx`): a small `DeleteRosterButton({ entryId, onDelete, onDeleted })`
   with `useState` for `confirming` / `deleting` / `error`:
   - default: red `.deleteBtn` ("Delete") — sets `confirming=true`.
   - confirming: warning text + `Cancel` (resets) and destructive `Delete`/`Deleting…` button
     that `await onDelete(entryId)`, then `onDeleted()`; on throw, set `error`.
   - Rendered next to Share Image (desktop `shareAction`) and inside the mobile `actions` group.
   - `onDeleted` resets `expandedEntry` to `null` (parent already dropped the row from data).
   - All click handlers call `e.stopPropagation()` so they don't toggle the row.
   - Only rendered when `!demoMode && onDeleteRoster`.

4. **CSS**: `.deleteBtn` copies the `.boardBtn` recipe with `var(--negative)` for color/border,
   `:hover` bumps background/border like the others; add the ≤599px override to match
   `.downloadBtn`. Add compact confirm-row classes.

5. **Analytics**: `trackEvent('roster_deleted')` fired once on successful delete (in App's handler).

---

## Out of Scope / Follow-ups

- **Arena pool cleanup (ADR-016):** deleting an `extension_entries` row leaves the matching
  `arena_teams` pool entry in place. If deleted invalid rosters should also leave the Arena
  pool, that is a separate task (server-side, touches the Arena data model). Recommend adding
  a follow-up task if this matters.
- **Permanent suppression:** preventing a still-live draft from re-syncing after deletion
  would need a per-entry suppression list (new table + sync-side check). Out of scope.

---

## Rollback Approach

Single-commit feature with no data migration. Revert the commit to remove the button and
helper. Any rows already deleted by users are gone (no undo), but the schema is unchanged and
the extension will re-sync any still-live drafts on the next sync.

---

## Dependencies

None.
