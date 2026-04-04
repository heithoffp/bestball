# TASK-133: Rankings tab not loading saved rankings from Supabase on startup

**Status:** Pending Approval
**Priority:** P2

---

## Objective

When an authenticated user loads the app, their saved custom rankings are not restored from Supabase. The `loadData()` authenticated path never fetches the `rankings` file from Supabase, so `rankingsSource` stays empty (or defaults to ADP data) even if the user previously uploaded and saved rankings.

## Verification Criteria

1. After a user uploads rankings and refreshes the page (while signed in), the Rankings tab shows their previously saved rankings — not an empty state.
2. Users without saved rankings continue to see rankings derived from the ADP snapshot (current default behavior).
3. The unauthenticated demo path (`loadFromAssets`) is unaffected.

## Verification Approach

Manual steps (developer to verify):
1. Sign in and upload a custom rankings CSV via the Rankings tab upload button.
2. Hard-refresh the page.
3. Navigate to the Rankings tab — previously uploaded rankings should be loaded, not empty.
4. Sign out and verify the demo path still loads the bundled asset rankings unchanged.

Code inspection:
1. Confirm `syncGetFile('rankings', user.id)` is called in `loadData()` for authenticated users.
2. Confirm `setRankingsSource` is called with the parsed result if a file is found.

## Files to Change

| File | Action | Description |
|------|--------|-------------|
| `best-ball-manager/src/App.jsx` | Modify | In `loadData()`, after the authenticated data load, fetch the saved rankings file from Supabase and set `rankingsSource` if found |

## Implementation Approach

In `loadData()` in `App.jsx`, after either the `loadFromExtension()` path or the fallback path completes, add a call to `syncGetFile('rankings', user.id)`. If a file is returned, parse it with `parseCSVText` (same pattern as `handleRankingsUpload`) and call `setRankingsSource`.

Specifically, replace the block at lines 123–141:

```js
if (user?.id && supabase) {
  const loaded = await loadFromExtension();
  if (!loaded) {
    // ... fallback path sets rankingsSource from ADP data ...
  }
  setStatus({ type: '', msg: '' });
}
```

After the `if (!loaded)` block but before `setStatus`, add:

```js
// Restore user's saved rankings from Supabase (overrides ADP default)
const savedRankings = await syncGetFile('rankings', user.id);
if (savedRankings) {
  const { parseCSVText } = await import('./utils/csv');
  setRankingsSource(await parseCSVText(savedRankings.text));
}
```

Using a dynamic import for `parseCSVText` matches the existing pattern in `handleRankingsUpload` and avoids adding a static import just for this one async operation.

**Edge cases:**
- `syncGetFile` returns `null` if no rankings file exists → no-op, existing `rankingsSource` from ADP default is kept.
- `syncGetFile` throws (network/Supabase error) → the outer `try/catch` in `loadData()` catches it and sets an error status. This is acceptable — the rankings file fetch is non-fatal so we could optionally wrap it in its own try/catch to degrade gracefully. Given the existing pattern in `storage.js` where `syncGetFile` already falls back to IndexedDB on cloud failure, a top-level catch is fine.

## Dependencies

None

---
*Approved by: <!-- developer name/initials and date once approved -->*
