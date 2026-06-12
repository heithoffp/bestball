<!-- Completed: 2026-06-12 | Commit: (extension v1.2.0 release) -->
# TASK-260: Backfill draft boards for already-synced UD drafts (bounded re-fetch)

**Status:** Pending Approval
**Priority:** P3

---

## Objective
TASK-258 captures full pod boards only for *newly-fetched* drafts. Per ADR-009, historical
(already-synced) drafts have no board until re-fetched, so a user's existing portfolio shows
empty board views. Add a **bounded, self-converging backfill** that runs automatically after
each sync: detect synced draft IDs that lack a board, re-fetch a capped batch of them through
the existing `ensureSlateLoaded` + `normalizeBoard` path, and persist via `writeBoards`.
Repeated syncs converge without reintroducing the TASK-198 timeout.

**Decisions (developer, 2026-06-12):**
- **Trigger:** automatic on every sync (no new UI).
- **Batch cap:** 100 board-less drafts per run (initially 50; raised to 100 on 2026-06-12
  after confirming sync has ample time — `BOARD_BACKFILL_PER_RUN` in content.js).

## Dependencies
TASK-258 (capture path + `writeBoards` + `normalizeBoard` + migration 010 grants). Done/landed.

## Verification Criteria
1. `chrome-extension/src/utils/bridge.js` exposes `readBoardIds(draftIds)` returning a
   `Set<string>` of those `draftIds` that already have a row in `draft_boards_admin`
   (`.in('draft_id', draftIds)`), guarded (empty set without supabase/session/empty input).
2. `chrome-extension/src/adapters/underdog.js` exposes `getBoards(draftIds)` that posts
   `BBM_BOARDS_REQUEST` and resolves with a `boards[]` array (same shape as TASK-258's
   `normalizeBoard`); the DraftKings adapter does **not** define `getBoards`.
3. `chrome-extension/src/injected/underdog-bridge.js` handles `BBM_BOARDS_REQUEST`: for each
   requested draft id it fetches `/v2/drafts/{id}`, runs `ensureSlateLoaded`, `normalizeBoard`,
   and posts `BBM_BOARDS_RESULT { boards }`. Unfetchable/unnormalizable drafts are skipped
   (not fatal). Reuses the existing reference-data caches — no duplicate slate loads.
4. `chrome-extension/src/content/content.js` runs the backfill after the normal sync:
   computes `missing = currentDraftIds − existing board ids − ids just captured`, slices to
   **50**, and only if `typeof adapter.getBoards === 'function'`. Wrapped so a backfill failure
   logs but never fails the entry sync.
5. The backfill is **convergent**: a draft that gains a board on one run is excluded on the
   next (via `readBoardIds`), so repeated syncs reduce the board-less set monotonically and a
   fully-backfilled portfolio fetches zero extra drafts.
6. The backfill never fetches more than 50 `/v2/drafts/{id}` per sync run (timeout guard;
   respects TASK-198).
7. `cd chrome-extension && npm run build` succeeds.
8. **Manual (developer):** with a portfolio of pre-TASK-258 drafts, clicking Sync repeatedly
   populates `draft_boards_admin` rows (`source='extension'`) for previously board-less drafts
   in batches of ≤50; their Board views render in `/rosters`; sync does not time out.
9. **(Plan expansion 2026-06-12)** During backfill the FAB overlay shows a progress label
   "Backfilling boards… X / Y" (driven by the bridge's `phase:'boards'` progress messages).
   When the sync completes and board-less drafts still remain beyond this run's batch, the
   overlay result line tells the user how many remain and to reload + Sync again.

## Verification Approach
1. **Automated:** `cd chrome-extension && npm run build`. Report full output.
2. **Manual (developer) — required:**
   1. Reload the rebuilt extension; on the UD completed-entries page, click **Sync**.
   2. Confirm new `draft_boards_admin` rows appear for previously-synced drafts (≤50 per run).
   3. Click Sync again; confirm the next batch fills in and already-boarded drafts are skipped.
   4. Open `/rosters`, confirm Board views now render for historical drafts.

## Files to Change
| File | Action | Description |
|------|--------|-------------|
| `chrome-extension/src/utils/bridge.js` | Modify | Add `readBoardIds(draftIds)`: guard, `select draft_id from draft_boards_admin .in('draft_id', draftIds)`, return `Set<string>`. |
| `chrome-extension/src/injected/underdog-bridge.js` | Modify | Add a `BBM_BOARDS_REQUEST` branch in the message listener → `fetchBoards(draftIds)`: per id `apiFetch('/v2/drafts/'+id)`, `ensureSlateLoaded`, `normalizeBoard`; collect non-null; emit `BBM_SYNC_PROGRESS { phase:'boards', done, total }`; post `BBM_BOARDS_RESULT { boards }`. Errors per-draft are skipped. |
| `chrome-extension/src/adapters/underdog.js` | Modify | Add `getBoards(draftIds)`: postMessage `BBM_BOARDS_REQUEST`, resolve on `BBM_BOARDS_RESULT`, reject on `BBM_SYNC_ERROR`, with a generous timeout. Returns `[]` for empty input. |
| `chrome-extension/src/adapters/interface.js` | Modify | Document optional `getBoards?(draftIds): Promise<object[]>` on the adapter typedef. |
| `chrome-extension/src/content/content.js` | Modify | After `writeEntries` + the existing new-board `writeBoards`, run the bounded backfill (guarded on `adapter.getBoards`), then `writeBoards` the result; failure-isolated. **Return `boardsRemaining`** (board-less count beyond this run's batch) alongside `count`. |
| `chrome-extension/src/content/draft-overlay.js` | Modify | **(Plan expansion)** Add a `phase === 'boards'` branch to `onProgress` → "Backfilling boards… X / Y" (determinate bar). In the sync-success block, if `boardsRemaining > 0`, append "N draft board(s) left to fill — reload and press Sync again." to the result line. |

## Implementation Approach

### 1. `readBoardIds(draftIds)` — bridge.js
Mirror the `readEntryIds`/`writeBoards` guard pattern. Query is bounded by the portfolio's
current draft count (Supabase `.in()` handles a few hundred ids fine; if a portfolio is huge
this can be chunked, but current scales don't require it). Returns `new Set(rows.map(String))`.

### 2. `BBM_BOARDS_REQUEST` handler — underdog-bridge.js
The message listener currently handles only `BBM_SYNC_REQUEST`. Add a second branch:
```js
if (event.data?.type === 'BBM_BOARDS_REQUEST') { … post BBM_BOARDS_RESULT … }
```
`fetchBoards(draftIds)` loops the (already-capped) ids: `apiFetch('/v2/drafts/'+id)` →
`ensureSlateLoaded(draft.slate_id)` → `normalizeBoard(draft)`; push non-null. Per-draft
failures are caught and skipped (a 404/withdrawn draft must not abort the batch). Emits the
existing `BBM_SYNC_PROGRESS` shape with `phase:'boards'` so the popup can show progress.
Requires a token (same guard as sync); if absent, posts `BBM_BOARDS_RESULT { boards: [] }`.

### 3. `getBoards(draftIds)` — underdog.js
Symmetric to `getEntries`: install a one-shot `message` handler, post
`BBM_BOARDS_REQUEST { draftIds }`, resolve on `BBM_BOARDS_RESULT`. Short-circuit to `[]` if
`draftIds` is empty (no round-trip). DK adapter is left without `getBoards` so the content
guard skips it.

### 4. Backfill orchestration — content.js
After the existing sync + new-board write:
```js
if (typeof adapter.getBoards === 'function' && result?.currentDraftIds?.length) {
  try {
    const captured = new Set((result.boards ?? []).map(b => String(b.draftId)));
    const existing = await readBoardIds(result.currentDraftIds);
    const missing  = result.currentDraftIds
      .map(String)
      .filter(id => !existing.has(id) && !captured.has(id))
      .slice(0, 50);                    // batch cap — TASK-198 timeout guard
    if (missing.length) {
      const backfilled = await adapter.getBoards(missing);
      await writeBoards(backfilled);
    }
  } catch (err) {
    console.warn('[BBM] board backfill failed (sync OK):', err.message);
  }
}
```
Convergence: `existing` grows each run, so `missing` shrinks to empty; a fully-backfilled
portfolio computes `missing = []` and makes zero extra fetches.

### 5. Build
`cd chrome-extension && npm run build` after edits (per CLAUDE.md).

## ADR Note
No new ADR. ADR-009 explicitly anticipated this ("Re-sync friction… mitigation belongs in
[the follow-up] plan") and the change reuses TASK-258's authorized-capture mechanism unchanged —
no new data path or access posture.
