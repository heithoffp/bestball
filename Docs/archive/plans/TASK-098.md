<!-- Completed: 2026-04-03 | Commit: cee9a97 -->
# TASK-098: Fix extension sync — tournament names are wrong

**Status:** Done
**Priority:** P2

---

## Objective

Fix `tournamentTitle` in the Underdog bridge sync to use the contest name (e.g., "The Big Board") from `draft.title`, and persist the slate-level name (e.g., "Pre-Draft Best Ball") from `slate.title` as a new `slateTitle` field — enabling pre-draft vs post-draft differentiation in the web app.

## Verification Criteria

- After a fresh sync, `tournament` column in `extension_entries` shows the contest name (e.g., "The Big Board", "The Little Board") — not the slate name.
- `slate_title` column in `extension_entries` shows the slate name (e.g., "Pre-Draft Best Ball").

## Verification Approach

1. Read the three modified JS files and confirm all changes are correct.
2. (Developer) Add `slate_title text` column to `extension_entries` table in Supabase.
3. (Developer) Trigger a fresh sync from the extension on the Underdog completed entries page.
4. (Developer) Check `extension_entries` in Supabase — confirm `tournament` = contest name and `slate_title` = slate name.

## Files Changed

| File | Action | Description |
|------|--------|-------------|
| `chrome-extension/src/injected/underdog-bridge.js` | Modified | Added `slateTitle: slate.title ?? ''` to `draftMeta.push()`; fixed `tournamentTitle` in `entries.push()` to use `draft.title ?? tournamentTitle` |
| `chrome-extension/src/utils/bridge.js` | Modified | Added `slate_title` to `writeEntries()` row mapping and `readEntries()` select + return |

## Implementation Notes

The correct field mapping in the Underdog API is three levels deep:
- `slate.title` = season label ("Pre-Draft Best Ball")
- `tr.title` = round stage ("Qualifiers") — not the contest name
- `draft.title` = actual contest name ("The Big Board", "The Little Board")

`draft.title` is only available from the full `/v2/drafts/{id}` fetch (second loop), not from the tournament_rounds drafts listing. Fix was applied at `entries.push()` using the already-fetched full draft object.

Developer also ran Supabase schema migration (`ALTER TABLE extension_entries ADD COLUMN slate_title text`) and reloaded PostgREST schema cache via `NOTIFY pgrst, 'reload schema'`.

## Dependencies

None

---
*Approved by: Patrick 2026-04-03*
