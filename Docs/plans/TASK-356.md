# TASK-356: Mobile cloud storage Blob incompatibility — sync always falls back to local

**Status:** Approved
**Priority:** P2

---

## Objective
Mobile dev client logs repeatedly: `Cloud fetch failed, falling back to local [Error: Creating blobs from 'ArrayBuffer' and 'ArrayBufferView' are not supported]` when loading portfolio / visiting Rosters. Mobile cloud storage reads construct a Blob from an ArrayBuffer/ArrayBufferView (via `supabase.storage.download()`), which RN's Blob impl does not support, so every cloud fetch throws and falls back to local cache — cloud sync is effectively non-functional on mobile (always local). The repeated fallback churn was also the trigger for the Rankings reorder crash (each refresh re-seeded the board mid-interaction, TASK-351). Not a web-app issue.

## Root Cause
`storage-js` 2.110.2 resolves `.download()` via `(await downloadFn()).blob()` (`index.mjs:562`). React Native's `Blob` implements neither construction-from-ArrayBuffer nor `.text()`/`.arrayBuffer()`, so the call throws and `storage.js` falls back to local.

## Verification Criteria
1. `cloudGetFile` no longer calls `supabase.storage.download()` — it reads via `createSignedUrl` + `fetch().text()` (no Blob in the path).
2. The return contract `storage.js:61` depends on is preserved exactly: `{ __notFound: true }` for missing objects, `null` for network/other errors, and the file object `{ id, type, filename, text, uploadedAt }` on success.
3. File parses cleanly (Node ESM syntax check).

## Verification Approach
- Grep `cloudStorage.js` to confirm `.download(` is gone from the read path and `createSignedUrl` is present.
- `node --check --input-type=module < shared/utils/cloudStorage.js` → SYNTAX OK.
- **Manual (developer, on device):** launch the dev client, load a synced portfolio and visit Rosters; confirm the "Cloud fetch failed, falling back to local" log no longer appears, cloud data loads, and Rankings no longer re-seeds mid-drag.

## Files to Change
| File | Change |
|------|--------|
| `mobile-app/shared/utils/cloudStorage.js` | Add `cloudDownloadText(path)` helper (signed URL + `fetch().text()`); rewrite `cloudGetFile` to use it; preserve return contract; document RN divergence. |

## Implementation Approach
Follow the existing `realDraftData.js` precedent (TASK-315 / ADR-030) which already solved the identical RN-Blob problem for the boards artifact. Add a private `cloudDownloadText(path)` that signs a 60s URL, fetches it, and returns `{ text }` / `{ notFound: true }` / `{ error }`. `cloudGetFile` maps those to the existing `__notFound` / `null` / file-object contract. Upload/list/remove paths are untouched (they don't use Blob). A header comment records the deliberate divergence from the web source-of-truth per CLAUDE.md's port-snapshot rule.
