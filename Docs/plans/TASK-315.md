# TASK-315: Precompute combo-board aggregate: stop full-table draft_boards_admin downloads

**Status:** Approved (developer pre-approved in session, 2026-07-09)
**Priority:** P1

---

## Objective

Stop every authenticated app load from downloading the entire `draft_boards_admin` table
(measured 2026-07-09: 1,529 rows × ~40 KB `picks` JSONB ≈ **62 MB per load**) to build the
Early Combo frequency tables. Replace the full-table read with a small precomputed artifact
(~1.5 MB, CDN-cached) served from Supabase Storage. This is the dominant consumer of the
project's Disk IO Budget (Supabase depletion warning email, 2026-07-09) and a major egress
cost.

## Background / Evidence

- Chain: `App.jsx` bootstrap prewarm → `rosterPrewarm.js` → `loadRealDraftData()` →
  `fetchAllBoards()` (`realDraftData.js`) → pages ALL of `draft_boards_admin` selecting full
  `picks`. Also triggered from Arena mount, Draft Assistant (`draftModel.js`), and
  `uniquenessEngine.js` (shared per-page-load promise cache — but nothing survives a reload).
- Measured: one 250-row page = 4.6 s / ~10 MB; full fetch ≈ 62 MB of TOAST reads per page load.
- The frequency tables only need, per board: `draft_id`, `slate_title`, and the **first 4
  pick names per seat** (see `addSeat` / `PATH_ROUNDS` in `realDraftData.js`). Everything
  else in `picks` (position, team, ids, rounds 5–18) is discarded by the aggregation.

## Design

1. **New admin script `scripts/build-combo-boards.mjs`** (same pattern as the other
   `scripts/*.mjs` service-role jobs):
   - Pages `draft_boards_admin` (service role), skips unusable boards
     (`picks[0]?.name == null` — pre-fix scraper rows), groups picks by seat
     (`draftEntryId` falling back to `slot`, mirroring the client), sorts by pick,
     keeps the first-4 names per seat.
   - Writes `{ version, generatedAt, boardCount, boards: [{ id, slate, seats: [[names]] }] }`
     to Storage bucket `app-data`, object `combo-boards-v1.json`
     (`upsert: true`, `cacheControl: 3600`). Creates the bucket (**private**) if missing.
   - Re-run cadence: manual, whenever fresh boards matter (e.g. alongside the weekly digest).
     Staleness only softens rarity percentages — fail-soft by design.
2. **Client change (`realDraftData.js`)**: `fetchAllBoards()` is replaced by an
   authenticated `supabase.storage.from('app-data').download()` (zero database IO — served
   from object storage, not Postgres). The `build()` board loop consumes pre-grouped `seats`
   instead of grouping raw picks. All other logic — pre/post classification, excluded
   slates, own-roster merge keyed on `boardIds` — unchanged. Any fetch failure (including
   guests, who have no session) returns `[]` (empty tables, same as today's fail-soft path).
3. **Privacy** *(revised during implementation, 2026-07-09)*: the bucket is **private** with
   an authenticated-read storage policy (added in migration 016). This preserves the exact
   access boundary of `draft_boards_admin` (authenticated-only) rather than widening it —
   the original public-bucket idea was dropped after the permission classifier flagged
   publishing production-derived data publicly. The artifact itself is also anonymized
   (draft id, slate title, first-4 pick names only).

Out of scope (accepted residual IO, per-user and bounded): `fetchUserBoardsOnce()` reads of
the user's *own* boards for the Roster Viewer board view and pod-exact Adv %.

## Verification Criteria

- `scripts/build-combo-boards.mjs` runs to completion against production, prints board/seat
  counts, and the artifact is retrievable at
  `<SUPABASE_URL>/storage/v1/object/public/public-data/combo-boards-v1.json`.
- Artifact size is ~1–3 MB (vs ~62 MB full-table transfer).
- `realDraftData.js` no longer queries `draft_boards_admin` (no `from('draft_boards_admin')`
  remains in that file).
- Early Combo tables built from the artifact match the previous pipeline: for identical
  inputs, `total_rosters` equals the seat count of usable, non-excluded boards plus the
  user's boardless rosters (spot-check via console during dev run).
- `npm run build` and `npm run lint` pass in `best-ball-manager/`.

## Verification Approach

1. Run the script; confirm upload + counts. `curl -sI` the public URL for 200 + size.
2. `grep -c "draft_boards_admin" best-ball-manager/src/utils/realDraftData.js` → 0.
3. `npm run lint && npm run build` from `best-ball-manager/`.
4. Manual (developer): load the app with a synced account and confirm Early Combo % renders
   in Roster Viewer and the Arena rarity chip still appears.

## Files to Change

| File | Action | Description |
|------|--------|-------------|
| `scripts/build-combo-boards.mjs` | Create | Service-role job: slim boards → upload Storage artifact |
| `best-ball-manager/src/utils/realDraftData.js` | Modify | Fetch artifact instead of full-table board pages; consume pre-grouped seats |
| `docs/Feature_Specs/*` (combo/roster spec if data flow documented) | Modify | Note the precomputed-artifact data flow |

## Rollback Approach

Revert the `realDraftData.js` commit — the old full-table path has no schema dependency and
resumes working immediately. The Storage bucket/artifact is inert if unused.
