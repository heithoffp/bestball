# TASK-348: Mobile cache-first launch data with delta sync (ADR-030)

**Status:** Approved
**Priority:** P2

---

## Objective

Eliminate the launch-blocking network round on mobile by rendering the portfolio from an
on-device cache immediately and refreshing in the background via a `synced_at` delta query
plus `entry_id`-list reconciliation (ADR-030). Also: rankings read local-first, captured
boards cached permanently per `draftId`, the combo artifact cached with a freshness window,
and `readExtensionEntries` paginated past the PostgREST 1000-row cap (web + mobile).

## Verification Criteria

1. **Instant relaunch:** with a previously-loaded portfolio, relaunching the app renders
   rosters immediately from the device cache (no blocking "Loading data..." network wait),
   and entries synced or deleted on desktop since the last launch appear/disappear after
   the background refresh without user action.
2. **No cross-account leakage:** signing out (or deleting the account) clears the cached
   portfolio; signing in as a different user never shows the prior user's rosters.
3. **Large portfolios complete:** portfolios over 1000 entries load fully on both web and
   mobile (pagination fix), instead of silently truncating at 1000.

## Verification Approach

Automated (run and report):
- `node --check` on every modified/created JS file in `mobile-app/` (no test runner exists
  for expo-importing modules).
- `cd best-ball-manager && npm run lint && npm run build` — web pagination change passes
  lint and production build.
- Grep-level assertions: `readExtensionEntries` contains a `.range(` pagination loop in
  both copies; `clearAllData` clears the entries cache and model cache; PortfolioContext
  reads the cache before any Supabase call on the authenticated path.
- Cache-merge logic (pure part: merge delta + reconcile deletions) exercised with a small
  node script against the extracted pure helper, since expo modules can't load under node.

Manual (requires the developer — do not mark Verified without confirmation):
1. On-device (dev build / TestFlight): cold-launch with an existing portfolio → rosters
   render instantly; toggle airplane mode → still renders from cache.
2. Sync a new draft on desktop, relaunch mobile → new roster appears after background
   refresh. Delete a roster on mobile → gone after relaunch.
3. Sign out → sign in as another account → no stale rosters.

## Files to Change

| File | Action | Description |
|------|--------|-------------|
| `mobile-app/shared/utils/entriesCache.js` | Create | expo-file-system JSON cache (entries + cursor + userId) with delta fetch, id-list reconciliation, and pure merge helper |
| `mobile-app/shared/utils/extensionBridge.js` | Modify | Paginate `readExtensionEntries`; export `mapEntryRow` for the delta path |
| `best-ball-manager/src/utils/extensionBridge.js` | Modify | Same pagination fix + `mapEntryRow` export (lockstep; the 1000-row bug exists on web too) |
| `mobile-app/src/contexts/PortfolioContext.jsx` | Modify | Cache-first load with background delta refresh; rankings local-first; cache rewrite on delete |
| `mobile-app/shared/utils/storage.js` | Modify | `clearAllData` also clears the entries cache and model cache (sign-out / delete-account hygiene) |
| `mobile-app/shared/utils/draftBoards.js` | Modify | Persistent per-`draftId` board cache (boards are immutable; fetch only never-seen ids) |
| `mobile-app/shared/utils/realDraftData.js` | Modify | Combo artifact cached with 24 h freshness window; stale copy as network-failure fallback |

## Implementation Approach

1. **`entriesCache.js` (new, mobile-only).** File `bbe-entries-cache-v1.json` in
   `Paths.document` via the `File` API (same pattern as `rankingsExport.js`). Shape:
   `{ version: 1, userId, cursor, entries }` where `cursor = max(synced_at)` and `entries`
   is the mapped array `readExtensionEntries` returns. Exports:
   - `readEntriesCache(userId)` — null on missing file, version mismatch, userId mismatch,
     or parse error (corrupt file is deleted).
   - `writeEntriesCache(userId, entries)` — computes cursor from entries.
   - `clearEntriesCache()`.
   - `refreshEntries(userId, cached)` — runs the delta query
     (`.gt('synced_at', cursor)`, paginated) and a paginated `select('entry_id')`
     reconciliation in parallel; returns `{ entries, changed }` via the pure helper
     `mergeEntries(cached, delta, liveIds)` (upsert by entryId, drop ids absent from
     liveIds, sort by syncedAt desc). All fetch errors fail soft to the cached array.
2. **`extensionBridge.js` (both copies).** Wrap the select in a `.range(from, from+999)`
   loop until a short page. Extract the row→entry mapping into an exported `mapEntryRow`
   so `entriesCache.refreshEntries` maps delta rows identically (slate normalization
   included).
3. **`PortfolioContext.jsx`.** Authenticated path becomes: read cache → if hit, process +
   render immediately (spinner clears at local-CPU speed), then `refreshEntries` in the
   background — if `changed`, re-process, re-apply state, rewrite cache; if miss, full
   (now-paginated) fetch → apply → write cache. `deleteRoster` rewrites the cache after
   filtering. `reload` (pull-to-refresh path) bypasses the cache with a full fetch and
   rewrites it. Rankings: read local `getFile` copies first and set state immediately,
   then run the existing cloud-first `syncGetFile` flow in the background and update state
   only if content changed.
4. **`storage.js`.** `clearAllData` additionally calls `cacheClearAll()` (modelCache) and
   `clearEntriesCache()` — covers sign-out and delete-account, which both already call it.
5. **`draftBoards.js`.** In `fetchDraftBoards`, before querying, load per-id cached boards
   from modelCache (`board:<draftId>`); query only missing ids; persist newly fetched
   boards. Cache key carries a version constant so a re-scrape event can force refetch.
6. **`realDraftData.js`.** `fetchAllBoards` checks modelCache `comboBoardsArtifact`
   `{ fetchedAt, boards }`; younger than 24 h → use without network; otherwise fetch and
   rewrite, falling back to the stale copy on failure.

Edge cases: cache from a different user id is ignored and overwritten; corrupt/older-version
cache file deleted and treated as a miss; empty portfolio (0 entries) is a valid cache state
(prevents re-fetching for users with no syncs); delta returning rows already in cache
(cursor ties) is idempotent under upsert-by-entryId.

## Dependencies

None (implements ADR-030).

## Open Questions

None — decisions recorded in ADR-030.

---
*Approved by: Patrick (developer), 2026-07-18 — pre-approved in discussion ("I auto approve the task based on this discussion"), recorded per the plan approval gate.*
