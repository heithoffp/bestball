# TASK-198: Incremental Underdog sync to fix timeouts on large portfolios

**Status:** Approved
**Priority:** P2

---

## Objective
Underdog sync hits the 60s timeout in `adapters/underdog.js getEntries()` for users with >100 entries because `syncEntries` in `underdog-bridge.js` fetches `/v2/drafts/{id}` sequentially for every entry, and `writeEntries` in `utils/bridge.js` deletes and re-inserts the full platform row set every sync. Convert to an incremental model: skip the per-draft fetch for entries already stored, upsert only the new ones, and delete only entries that have disappeared from Underdog.

## Verification Criteria
1. **First sync (empty storage)** behaves identically to today — all completed best-ball entries are fetched and persisted; `underdog_entry_ids` in `chrome.storage.local` matches the IDs in Supabase.
2. **Second sync (no new drafts)** issues zero `/v2/drafts/{id}` requests; Supabase rows are unchanged; `lastSync` updates.
3. **Second sync (one new draft completed)** issues exactly one `/v2/drafts/{id}` request and inserts one new row; existing rows untouched.
4. **Withdrawn/removed entry** — if a previously stored draftId no longer appears in `/v2/user/completed_slates` discovery, the corresponding Supabase row is deleted and removed from `underdog_entry_ids`.
5. **Large portfolio (200+ entries) on second sync** completes well under 60s.
6. **DraftKings sync** continues to work unchanged — `writeEntries` still supports the legacy full-replace shape used by the DK adapter.
7. **Empty user (0 completed slates)** returns gracefully, results in 0 entries, no errors.

## Verification Approach
Manual — requires the developer to load the unpacked extension and exercise it in Chrome:
1. Run `npm run lint` and `npm run build` (Claude can run these).
2. **Test 1:** Clear `chrome.storage.local` for the extension, sync a known account with ≥10 entries, confirm Supabase row count and `underdog_entry_ids` match.
3. **Test 2:** Sync again immediately. Network panel — confirm zero `/v2/drafts/` requests.
4. **Test 3:** Manually remove one ID from `underdog_entry_ids`, sync, confirm one `/v2/drafts/` request fires.
5. **Test 4:** Inject a fake stale ID into `underdog_entry_ids`, sync, confirm it disappears from `extension_entries` and storage.
6. **Test 5:** Large account (≥200 entries) — first sync may take minutes; second sync < 5s.
7. **Test 6:** Run a DraftKings sync, confirm DK entries still write correctly.
8. **Test 7:** Account with no entries — sync, no error.

## Files to Change
| File | Change |
|------|--------|
| `chrome-extension/src/injected/underdog-bridge.js` | `syncEntries` accepts `knownEntryIds`. Skips per-draft fetch for already-known ids. Returns `{ newEntries, currentDraftIds }`. |
| `chrome-extension/src/adapters/underdog.js` | `getEntries(knownEntryIds = [])` forwards in postMessage; resolves with `{ newEntries, currentDraftIds }`. Timeout 60s → 300s. |
| `chrome-extension/src/adapters/interface.js` | JSDoc updates for new signature/return shape. |
| `chrome-extension/src/content/content.js` | Read `${platform}_entry_ids` from storage; pass to adapter; pass result to writeEntries. |
| `chrome-extension/src/utils/bridge.js` | `writeEntries` accepts either legacy array or incremental `{ newEntries, currentDraftIds }`. Incremental path = upsert + targeted delete. |

## Implementation Approach
**Bridge protocol**
- `syncEntries({ knownEntryIds })` builds `draftMeta` via the cheap discovery endpoints, partitions into already-known vs new, fetches `/v2/drafts/{id}` only for new. Returns `{ newEntries, currentDraftIds }` (full discovered set).
- Bridge stays stateless about Supabase/storage (MAIN-world isolation preserved).

**Content script**
- Reads storage IDs, calls `adapter.getEntries(ids)`, calls `writeEntries({ newEntries, currentDraftIds }, { platform })`.

**writeEntries**
- Detect via `Array.isArray`. Legacy path unchanged for DK.
- Incremental: `upsert(rows, { onConflict: 'user_id,entry_id' })` for newEntries; `delete().in('entry_id', staleIds)` where `staleIds = previousIds − currentDraftIds`. Update `${platform}_entry_ids = currentDraftIds`.
- Unique constraint on `(user_id, entry_id)` confirmed in `docs/migrations/001_extension_entries.sql`.

**Timeout**
- Raise 60s → 300s. First sync of 200 entries at ~250ms/draft is ~50s; 60s was always tight.

**DraftKings**
- Out of scope. DK keeps the full-replace path via the legacy `writeEntries` shape.
