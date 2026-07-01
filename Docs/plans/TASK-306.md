# TASK-306: Full-database Arena pool backfill script (ADR-016)

**Status:** Approved (developer, 2026-07-01)
**Priority:** P2
**Epic:** EPIC-07 (Best Ball Arena)

---

## Objective
A re-runnable, dry-run-by-default, service-role Node script that enrolls every roster
in `draft_boards_admin` (both sources) and every `extension_entries` roster into
`arena_teams`, with three-layer dedup (owned unique key, board unique key, roster
fingerprint), claim-on-match, and owned/board merge. Delivers ADR-016's
"full database in the pool by default."

## Dependencies
TASK-304 (prefs) and TASK-305 (claim-on-sync) — the backfill must run only AFTER
TASK-305 is deployed; if board rows are backfilled before claim-on-sync is live,
subsequent user syncs would mass-produce owned/board duplicates.

## Implementation Approach
1. **Prerequisite refactor**: in `best-ball-manager/src/utils/arenaSnapshot.js`,
   add `.js` to the two extensionless import specifiers (`./rosterArchetypes.js`,
   `./clvHelpers.js`) so Node ESM can load the module (no Vite behavior change).
   The script then REUSES `playerNameKey`, `buildBoardTeams`, `buildEnrollableTeams`
   — one snapshot builder, archetype classification for free. ADP/CLV stay null in
   backfilled snapshots; clients enrich at display time (`enrichSnapshotCLV`).
2. **New `scripts/arena-backfill-pool.mjs`** following `grant-pro.mjs` conventions
   (dotenv from repo-root `.env.local`, `createClient(SUPABASE_URL,
   SUPABASE_SERVICE_ROLE_KEY)`). REQUIRED env `ARENA_TOKEN_SECRET` (must equal the
   Edge Function secret so `board_user_hash` matches server hashing — abort loudly
   if unset). HMAC via `node:crypto` `createHmac('sha256', secret)` base64. Flags:
   dry-run default, `--apply`, `--limit N`.
3. **Phase 0 — preload**: page `arena_teams` (1000/page, order by id) into maps:
   `ownedKeys` (`user_id::entry_id::platform`), `boardByRef`
   (`board_entry_ref::platform`), `fpByDraft` (`draft_id::platform::fp`),
   `boardFpByPlatform` (`platform::fp`). Load `arena_user_prefs` → `prefByUser`.
4. **Phase 1 — boards**: page `draft_boards_admin` (100/page — picks jsonb is
   heavy), both sources. Per board: `buildBoardTeams(board, null)` (all seats;
   nameless legacy scrapes yield zero seats automatically). Per seat: skip on
   `boardByRef` or `fpByDraft` hit; else queue insert `{user_id: null, entry_id:
   null, platform, source: 'board', draft_id, board_entry_ref, board_user_hash:
   seat.userId ? hmac(userId) : null, display_snapshot, enrolled: true}`. Batch
   inserts 500; update in-run maps.
5. **Phase 2 — extension entries**: page `extension_entries` (500/page). Derive
   platform from `slate_title?.startsWith('DK')` (null → underdog, matching client
   behavior). Wrap `players` as flat roster rows and build the snapshot via
   `buildEnrollableTeams`. Then per the shared algorithm (TASK-305 plan):
   - owned key exists → **merge** check: find board duplicate via `boardByRef` or
     `boardFpByPlatform`; if found and `board.matches > owned.matches`, copy the
     five rating columns onto the owned row; DELETE the board duplicate.
   - else **claim**: ref-then-fingerprint (platform-wide map — `extension_entries`
     has no draft_id); UPDATE to owned preserving ratings, `enrolled =
     prefByUser.get(user_id) ?? true`.
   - else **insert** owned row (`draft_id: entry_id` fallback).
6. **Summary report** (always, incl. dry-run): boards scanned / nameless skipped,
   seats found, board inserts, skips by reason, entries scanned, owned inserts,
   claims, merges, deletions, timings. Dry-run performs every read and all matching
   with zero writes — pending-write counts double as the idempotency probe.
7. **`Docs/Feature_Specs/Best_Ball_Arena.md`**: Computations/Related — pool
   composition (full-DB backfill) and the claim lifecycle.

## Files to Change
| File | Change |
|------|--------|
| `scripts/arena-backfill-pool.mjs` | New backfill script |
| `best-ball-manager/src/utils/arenaSnapshot.js` | `.js` import extensions only |
| `Docs/Feature_Specs/Best_Ball_Arena.md` | Pool composition + claim lifecycle |

## Verification Criteria
1. Full dry-run completes against prod with zero writes and plausible counts
   (seats ≈ boards × ~12 minus dedup; nameless boards contribute 0).
2. `--limit 5 --apply` inserts only expected rows; immediate re-run reports 0
   pending writes for that slice.
3. After full `--apply`, a second full dry-run reports 0 inserts / 0 claims /
   0 merges (idempotent).
4. SQL invariants: no duplicate `(board_entry_ref, platform)` among board rows; no
   duplicate `(user_id, entry_id, platform)` among owned rows; no draft with two
   rows sharing a `playerNameKey` fingerprint.
5. A `board_user_hash` written by the script equals the hash arena-register produces
   for the same userId (same secret).
6. `npm run lint` and `npm run build` pass (arenaSnapshot import change).

## Verification Approach
- Automatable: `node scripts/arena-backfill-pool.mjs` (dry-run, read-only);
  `--limit 5 --apply` then re-run; `cd best-ball-manager && npm run lint && npm run
  build`; Node-loadability one-liner for `arenaSnapshot.js`.
- Developer-manual: run against prod with real env; SQL invariant queries
  (`group by ... having count(*) > 1`); eyeball a few backfilled snapshots on the
  vote card (allowlisted account) — archetype path present, CLV enriched at display.

## Rollback
Board rows: `delete from arena_teams where source='board' and matches=0` removes
unvoted backfill; claimed/merged rows are legitimate owned rows and stay. Revert the
commit for code.
