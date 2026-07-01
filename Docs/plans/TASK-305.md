# TASK-305: Arena registration rework — retire guardrail #3 + claim-on-sync (ADR-016)

**Status:** Approved (developer, 2026-07-01)
**Priority:** P2
**Epic:** EPIC-07 (Best Ball Arena)

---

## Objective
`arena-register` accepts board teams from any existing `draft_boards_admin` row
(source `'extension'` AND `'admin_scraper'` — ADR-014 guardrail #3 retired by
ADR-016), converts fingerprint-matching ownerless board rows into the caller's owned
rows preserving Elo history (claim-on-sync), and honors the account enrollment pref
(TASK-304) for newly registered owned rows.

## Dependencies
TASK-304 (reads `arena_user_prefs`; its migration must be pushed before this
function deploys).

## Shared claim algorithm (also used by TASK-306)
For an incoming owned team `{userId, entryId, platform, draftId, snapshot}`:
1. Owned row `(userId, entryId, platform)` already exists → skip (merge cleanup is
   TASK-306's backfill job — keeps the hot path cheap).
2. Else find a `source='board'` candidate: exact `board_entry_ref = entryId AND
   platform` first, then fingerprint match (`playerNameKey` of
   `display_snapshot.players`) among rows with the same `draft_id + platform`.
3. Claim = UPDATE that row: `source='owned'`, `user_id`, `entry_id`,
   `enrolled = pref ?? true`, `display_snapshot = snapshot` (owned snapshot carries
   `tournamentTitle`, needed by the featured filter), `updated_at`. Never touch
   `elo/matches/wins/losses/provisional`. Keep `board_entry_ref`/`board_user_hash`
   for provenance (the board unique index is partial on `source='board'`, so no
   conflict after conversion) and the row's real `draft_id`.
4. No match → INSERT `source='owned'` with `enrolled = pref ?? true`.

## Implementation Approach
1. **`supabase/functions/arena-register/index.ts` board path**: drop
   `.eq("source", "extension")` from the `draft_boards_admin` verification query —
   existence is still required (fabricated draft ids stay rejected). Update the
   header comment block and the rejection log message.
2. **Owned path**: fetch the caller's pref once
   (`select enrolled from arena_user_prefs where user_id = voterId`,
   `enrolledDefault = row?.enrolled ?? true`) and use it instead of hardcoded
   `enrolled: true`. Between the existing dedup and insert, run the claim algorithm
   with ONE batched candidate query (`source='board'` AND (`board_entry_ref in
   (entryIds)` OR `draft_id in (draftIds)`), selecting `id, platform, draft_id,
   board_entry_ref, display_snapshot`). Matched teams become claim UPDATEs, counted
   in a new `ownedClaimed` response field; unmatched insert as today.
3. **`supabase/functions/_shared/arena.ts`**: add `playerNameKey(players)` (small
   copy, comment-pinned to `best-ball-manager/src/utils/arenaSnapshot.js` — Deno
   cannot import the Vite module).
4. **`best-ball-manager/src/utils/draftBoards.js`**: remove `.eq('source',
   'extension')` from `fetchExtensionBoards`, rename to `fetchDraftBoards`, update
   the ADR-014 comment to cite ADR-016; update import/call in `Arena.jsx`.
5. **`Docs/Feature_Specs/Best_Ball_Arena.md`**: Server-side contract (guardrail #3
   retired, claim-on-sync, `ownedClaimed`) and Blindness & privacy (all board
   sources eligible).

## Files to Change
| File | Change |
|------|--------|
| `supabase/functions/arena-register/index.ts` | Drop source filter; claim-on-sync; pref-driven enrolled; comments |
| `supabase/functions/_shared/arena.ts` | Add `playerNameKey` |
| `best-ball-manager/src/utils/draftBoards.js` | Drop source filter; rename; ADR-016 comment |
| `best-ball-manager/src/components/Arena.jsx` | Renamed import/call |
| `Docs/Feature_Specs/Best_Ball_Arena.md` | Server-side contract + privacy sections |

## Verification Criteria
1. A board team whose `draft_id` exists only as `source='admin_scraper'` registers
   successfully; a fabricated `draft_id` is still rejected (boardRejected).
2. Registering an owned team whose roster fingerprint matches an existing ownerless
   board row produces ZERO new rows: the board row flips to `source='owned'` with
   the caller's `user_id`/`entry_id`; `elo/matches/wins/losses/provisional` are
   unchanged.
3. With `arena_user_prefs.enrolled = false`, newly registered owned rows AND claims
   land `enrolled = false`.
4. Re-posting the same payload writes nothing (insert-new-only preserved).
5. `npm run lint` and `npm run build` pass.

## Verification Approach
- Automatable: lint/build; grep `supabase/functions` and `best-ball-manager/src` for
  residual `source', 'extension'` filters (expect only the extension's own board
  writer, which legitimately sets source).
- Developer-manual: `supabase functions deploy arena-register` (after TASK-304's
  `db push`). SQL editor: seed a `source='board'` row with a known roster and fake
  nonzero elo/matches; POST arena-register with an allowlisted JWT and a matching
  ownedTeam; verify a single converted row with preserved ratings; re-POST → response
  shows 0 written / 0 claimed.

## Rollback
Revert the commit and redeploy the previous `arena-register`. Claimed rows stay
valid owned rows (no data rollback needed).
