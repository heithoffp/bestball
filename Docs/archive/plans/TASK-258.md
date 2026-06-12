<!-- Completed: 2026-06-12 | Commit: (extension v1.2.0 release) -->
# TASK-258: Chrome extension: capture full draft board at UD sync (ADR-009)

**Status:** Pending Approval
**Priority:** P3

---

## Objective
Per ADR-009 (participant-authorized full-board capture): the customer extension already
fetches `/v2/drafts/{id}` at sync and that response already contains all 12 rosters in
`draft.picks`, but `underdog-bridge.js` discards 11/12 and keeps only the syncing user's
picks. Capture the **full pod board** at sync time and persist it to shared, draft-id-keyed
board storage so it surfaces in the Roster Viewer Draft Board view for every synced UD draft.

**Scope (this task):** capture + write only. The web read path is unchanged — `draftBoards.js`
already reads `draft_boards_admin`, and per the storage decision below we reuse that table, so
captured boards surface with **zero web-app changes**.

**Storage decision (developer, 2026-06-12):** reuse the existing `public.draft_boards_admin`
table rather than create a new `draft_boards` table. Customer writes go to the same table the
admin scraper used and the web app already reads.

**Out of scope (tracked separately):**
- Switching/retiring the read path — N/A; reuse means no switch.
- Retiring `admin-extension/` + the admin scraper (TASK-252). **Scope shift:** because the
  customer extension now writes to `draft_boards_admin`, TASK-252 can no longer *drop* the
  table — it retires the admin extension and (optionally) renames the table. Flagged for a
  TASK-252 backlog update; not actioned here.
- DraftKings boards (UD only — DK sync has no equivalent full-board payload).
- Privacy-policy note for third-party roster persistence (ADR-009 Risk) — see Discovered Work.

## Dependencies
None. ADR-009 (Accepted) is the governing decision.

## Verification Criteria
1. A migration file exists granting `insert, update` on `public.draft_boards_admin` to
   `authenticated`, with RLS `insert`/`update` policies for `authenticated`. (Existing
   `select` grant + read policy from migration 009 are untouched.) **Manual:** developer
   applies it via the Supabase SQL editor (project is not CLI-linked).
2. `chrome-extension/src/injected/underdog-bridge.js` normalizes **all** picks in
   `draft.picks` (not just the user's) into the board shape
   `{pick, round, slot, draftEntryId, userId, name, position, team}`, matching the admin
   `normalizeDraft` output, and includes a `boards` array in `BBM_SYNC_RESULT`. Boards with
   any unresolved player name or no derivable slots are omitted (mirrors admin: a nameless
   board is useless).
3. `chrome-extension/src/adapters/underdog.js` threads `boards` through from
   `BBM_SYNC_RESULT` into the `getEntries` resolve value.
4. `chrome-extension/src/utils/bridge.js` exposes `writeBoards(boards)` that upserts rows to
   `draft_boards_admin` on conflict `draft_id` with columns
   `{draft_id, slate_title, entry_count, rounds, picks, fetched_at, source:'extension'}`,
   guarded (no-op without supabase/session/boards).
5. `chrome-extension/src/content/content.js` calls `writeBoards` after `writeEntries`, in a
   `try/catch` so a board-write failure logs but does **not** fail the entry sync.
6. Board capture piggybacks on the existing incremental fetch — only **newly fetched** drafts
   (those not in `knownEntryIds`) produce boards. Historical drafts require a re-sync (per
   ADR-009; acceptable).
7. `cd chrome-extension && npm run build` succeeds (the dist bundle, not src, is what the
   browser loads). `npm run lint` passes in `chrome-extension/` if a lint script exists.
8. **Manual (developer):** after applying the migration and reloading the rebuilt extension,
   syncing a fresh UD draft creates a `draft_boards_admin` row with `source='extension'`, all
   12 rosters, and non-null player names; opening that draft's Board in `/rosters` renders the
   full grid.

## Verification Approach
1. **Automated:** `cd chrome-extension && npm run build` (and `npm run lint` if present).
   Report full output.
2. **Manual (developer) — required:**
   1. Apply the new migration in the Supabase SQL editor.
   2. Reload the rebuilt extension; on `app.underdogfantasy.com/completed`, click Sync.
   3. In Supabase, confirm a new `draft_boards_admin` row exists for a freshly-synced draft
      with `source='extension'`, `entry_count=12`, and named picks across all entries.
   4. Open `/rosters` signed in, click **Board** on that UD roster, confirm the full grid,
      user-column highlight, and per-column stats render (existing TASK-240 read path).

## Files to Change
| File | Action | Description |
|------|--------|-------------|
| `supabase/migrations/010_grant_draft_boards_admin_customer_write.sql` | Create | `grant insert, update on public.draft_boards_admin to authenticated` + RLS `insert`/`update` policies (`with check (true)`). Header documents the ADR-009 trust model and third-party-data note. |
| `chrome-extension/src/injected/underdog-bridge.js` | Modify | Add a `normalizeBoard(draft)` that ports admin `normalizeDraft` logic (slot from `draft_entries.pick_order`/`slot_index`, normalize every pick, skip if any name unresolved or no slots). In `syncEntries`, build a board per newly-fetched draft and collect into `boards`. Add `boards` to the `BBM_SYNC_RESULT` payload. Existing `userPicks`/`normalizePick` per-entry path stays as-is. |
| `chrome-extension/src/adapters/underdog.js` | Modify | Add `boards: event.data.boards ?? []` to the `getEntries` resolve object. |
| `chrome-extension/src/adapters/interface.js` | Modify | Update the `getEntries` return-type JSDoc to include `boards`. |
| `chrome-extension/src/utils/bridge.js` | Modify | Add `writeBoards(boards)`: guard on `supabase`/session/non-empty; map to rows; `upsert(..., { onConflict: 'draft_id' })` against `draft_boards_admin` with `source:'extension'`. |
| `chrome-extension/src/content/content.js` | Modify | In `runSync`, capture the `boards` from `adapter.getEntries`, and after `writeEntries` call `await writeBoards(boards).catch(logAndContinue)` so board-write failures don't fail the sync. |

## Implementation Approach

### 1. Migration (additive, non-breaking)
`draft_boards_admin` already has `select` granted to `authenticated` + a read policy
(migration 009) and `source text default 'admin_scraper'`. Add only the write surface:

```sql
-- 010_grant_draft_boards_admin_customer_write.sql
-- ADR-009: participant-authorized full-board capture. The customer extension now writes
-- the full 12-roster board to this table at sync, for drafts the syncing user participated
-- in (UD authorizes them to view the whole pod). Trust model: an authenticated customer may
-- write any board they captured; boards are pod-level tournament data, last-writer-wins on
-- draft_id (identical across pod members). Note: persists identifiable third-party rosters
-- server-side — reflected in the privacy policy (see privacy-note task).
grant insert, update on public.draft_boards_admin to authenticated;

create policy "Authenticated users can insert draft boards"
  on public.draft_boards_admin for insert to authenticated with check (true);

create policy "Authenticated users can update draft boards"
  on public.draft_boards_admin for update to authenticated using (true) with check (true);
```
RLS cannot cheaply verify pod membership (the writer's `userId` would have to be matched
against `picks[].userId`); per ADR-009 we accept the paying-customer trust model and keep the
check permissive. Existing `select`/admin grants are untouched.

### 2. Full-board normalization in the injected bridge
The bridge already caches `appearances`/`players`/`teams` and has `ensureSlateLoaded`. Add a
`normalizeBoard(draft)` that mirrors `admin-extension/src/scraper/normalizePick.js`'s
`normalizeDraft`:
- Build `slotByEntry` / `userByEntry` from `draft.draft_entries` (`pick_order ?? slot_index`).
  Return `null` if no slots resolve.
- Map **every** `draft.picks` entry via the existing appearance→player→team join, producing
  `{pick, round, slot, draftEntryId, userId, name, position, team}`. Track unresolved names;
  return `null` if any are unresolved (a nameless board is useless and would be filtered out
  by `fetchAvailableBoardIds`'s `first_pick_name != null` check anyway).
- Return `{draftId, slateTitle, entryCount, rounds, picks}`.

In `syncEntries`, inside the existing per-draft loop (after `ensureSlateLoaded`, where the full
`draft.picks` is in hand), call `normalizeBoard(draft)` and push non-null results into a
`boards` array. Add `boards` to the returned object and the `BBM_SYNC_RESULT` postMessage. This
reuses the slate reference data already loaded for the user's own picks — no extra fetches.

### 3. Thread boards back and persist
- `underdog.js`: include `boards` in the resolved object.
- `interface.js`: extend the JSDoc return type.
- `bridge.js`: `writeBoards(boards)` maps each board to a row and upserts on `draft_id`.
  Reuses the same `supabase`/session guard pattern as `writeEntries`. Sets
  `source:'extension'` to distinguish customer-captured rows from admin-scraped ones.
- `content.js`: `const { newEntries, currentDraftIds, boards } = await adapter.getEntries(...)`;
  call `writeEntries` first, then `writeBoards(boards)` in a `.catch` that logs and continues —
  boards are supplementary; a failure must not break the user-facing entry sync.

### 4. Build
`chrome-extension/` is bundled by Vite + @crxjs — run `cd chrome-extension && npm run build`
after the source edits (per CLAUDE.md; skipping it silently runs the old bundle).

## Discovered Work (to add via hus-backlog after approval)
- **Privacy-policy note:** customer sync now persists identifiable third-party rosters via the
  `authenticated` role (ADR-009 Risk). Add a privacy/retention note task.
- **TASK-252 scope update:** retirement can no longer drop `draft_boards_admin` (customer write
  path depends on it) — narrow to retiring `admin-extension/` + optional table rename.

## ADR Note
ADR-009 already decides the approach (participant-authorized capture, shared draft-id-keyed
storage). The only deviation is implementation detail — **reusing `draft_boards_admin`** instead
of a new `draft_boards` table, which repurposes a table ADR-009 framed as "to retire." This is
non-obvious and affects TASK-252, so it is flagged here and in Discovered Work. It does not
warrant a new ADR (no new architectural direction), but if you'd prefer it recorded, I can add
a short amendment note to ADR-009 via hus-adr.
