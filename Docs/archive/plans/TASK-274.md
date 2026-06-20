<!-- Completed: 2026-06-20 | Commit: 28675fc -->
# TASK-274: Capture full draft board at DraftKings sync (mirror UD board capture)

**Status:** Pending Approval
**Priority:** P3

---

## Objective
The DraftKings `draftStatus` API response (`ds.draftBoard[]`) already contains every pick by every user in a draft, but the extension currently filters to only the user's picks (`draftkings.js` ~254-266) and discards the other 11 rosters. Mirror the completed Underdog board capture (TASK-258, ADR-009): normalize the full `draftBoard[]` into the canonical board shape and return it from DK `getEntries()` so `content.js`'s existing platform-agnostic `writeBoards()` path persists it to `draft_boards_admin`. This powers the Roster Viewer full Draft Board view (TASK-240) for DK portfolios — the web app read path and `DraftBoardModal` are already platform-agnostic.

The first implementation step verifies the one genuine unknown: how to derive `slot` (snake-grid seat/column) for each DK pick.

## Dependencies
None blocking. Builds on the merged TASK-258 write path (`writeBoards`, `draft_boards_admin`, migration 010) and is consumed by TASK-240's `DraftBoardModal`.

## Decision point — surface before implementation (ADR check)
ADR-009 explicitly recorded DraftKings board capture as **out of scope** on the factual premise that *"DK sync has no equivalent full-board payload."* Code investigation contradicts that premise: the `draftStatus` endpoint the extension already calls returns the full pod (`ds.draftBoard[]`, all users' picks).

- The **architectural principle** in ADR-009 — *participant-authorized capture from an API response the user is entitled to see* — covers DK cleanly. No new architectural direction is introduced.
- But ADR-009 contains a now-incorrect factual claim, and its **third-party-roster-persistence privacy note** (boards store identifiable non-BBE users' rosters) extends to DK.

**Recommendation:** No new ADR; instead add a short amending note to ADR-009 recording that DK *does* expose a full-board payload via `draftStatus` and is now in scope, with the same privacy posture. This is a one-line decision for the developer at approval time — confirm whether to (a) amend ADR-009 via hus-adr, or (b) proceed and treat this plan's note as sufficient record.

> KB not compiled (no `kb/index.md`) — research phase ran without KB context.

## Verification Criteria
1. After a DK sync from a real `/mycontests` page, `draft_boards_admin` contains rows for DK draft ids with `source='extension'`, non-null `picks[0].name`, and a non-null `slot` on **every** pick.
2. Each captured DK board has `entryCount` equal to the distinct user count (~12) and `picks.length === entryCount * rounds` (full pod, not just the user's roster).
3. Opening `DraftBoardModal` for a DK entry in `/rosters` renders the full snake grid (all columns × all rounds) with players in the correct seats; the syncing user's column is detected/highlighted as for UD.
4. DK entry sync is not regressed: syncing the same DK portfolio twice yields a stable entry count with no duplicates and no lost entries.
5. A board with any unresolvable player name or underivable slot is **skipped** (not written) rather than persisted in a broken state.
6. `cd chrome-extension && npm run build` completes without errors.

## Verification Approach
- **Automated:** `cd chrome-extension && npm run build` — must exit 0. Report full output.
- **Manual (requires the developer — live platform + auth):**
  1. Capture one real `draftStatus` JSON payload (DevTools Network on `/mycontests`, or a one-time `console.log(ds)` in the existing `.then(ds => …)`), and confirm the slot-derivation assumption (step 1 below) holds on real data **before** the normalizer is finalized.
  2. Load the rebuilt unpacked extension, sign in, sync from `/mycontests`.
  3. In Supabase, inspect `draft_boards_admin` rows for DK draft ids → confirm criteria 1 & 2 (named first pick, slot on every pick, full-pod pick count).
  4. Sync a second time → confirm criterion 4 (stable entry count, no dupes/losses).
  5. In `/rosters`, open the Board view for a DK roster → confirm criterion 3 (grid renders, user column highlighted).

The developer must confirm the manual steps before the task is marked Verified/Done.

## Files to Change

| File | Change |
| --- | --- |
| `chrome-extension/src/adapters/draftkings.js` | **Primary.** Add module-scope `normalizeDkBoard(draftBoard, { didToInfo, tidToTeam, slateTitle, draftId })` mirroring `underdog-bridge.js` `normalizeBoard` (canonical shape, snake-slot derivation, null-return guard). In `getEntries()`: retain the full `ds.draftBoard` + contest title alongside the existing user-only `pickMap`; build boards via `normalizeDkBoard`; change the return value from a bare `Entry[]` to `{ newEntries, currentDraftIds, boards }`. |
| `chrome-extension/src/content/content.js` | **Likely no change** — `runSync()` already consumes `result.boards` and `result.currentDraftIds`. Re-verify the switch to the incremental `writeEntries` path (object input) behaves correctly for DK; adjust only if an entry-sync regression surfaces during testing (Implementation step 4). |
| `chrome-extension/src/utils/bridge.js` | **No change.** `writeBoards` already upserts the canonical shape to `draft_boards_admin` on `draft_id`; the incremental branch of `writeEntries` already handles the object input shape. |
| `best-ball-manager/src/utils/draftBoards.js`, `DraftBoardModal.jsx` | **No change.** Read path is already platform-agnostic. |
| Supabase migrations | **No new migration.** `draft_boards_admin` already grants authenticated insert/update (TASK-258 migration 010). |
| `docs/adr/adr-009-*.md` | **Conditional** (see Decision point). Short amending note if the developer chooses option (a) — owned by hus-adr, not edited here directly. |
| `chrome-extension/src/adapters/draftkings.js` (`getBoards`) | **Optional / recommend omitting.** DK already re-emits all boards every sync, so a dedicated `getBoards` backfill is redundant; add only if DK entry sync later becomes incremental. |

## Implementation Approach

1. **Verify slot derivation against a real `draftStatus` payload (do this first, before writing the normalizer).** Capture one live `https://api.draftkings.com/drafts/v1/{contestId}/entries/{userContestId}/draftStatus?format=json` response. Confirm on the real `ds` object:
   - `ds.draftBoard[]` contains all ~12 rosters' picks (count distinct `userKey`; confirm picks exist for other users' `userKey`s).
   - Whether an **explicit** seat index exists anywhere (top-level `entries`/`draftEntries` array, or a `pickOrder`/`seat`/`draftPosition` field on a pick). If present, prefer it.
   - **Snake inference fallback:** each `userKey`'s round-1 pick (`roundNumber === 1`) has `overallSelectionNumber` in `1..entryCount`; that number is the seat/column. Confirm round-1 `overallSelectionNumber`s form a contiguous, duplicate-free `1..N`. Build `userKey → slot` and stamp it on every pick by that `userKey`. **Lock the chosen derivation before step 3.**

2. **Retain the full board in the `draftStatus` handler** (`draftkings.js`, the `.then(ds => …)` block ~250-267). Keep the existing user-only `pickMap` (don't regress entry building), but additionally retain the full `ds.draftBoard` and the resolved contest title so a board can be normalized for this draft. Runs in the content-script (same-origin) context — no MAIN-world bridge / `postMessage` needed.

3. **Add `normalizeDkBoard(...)`** (module scope, near `deriveDkSlate`). It must:
   - Build `userKey → slot` per the locked derivation; `entryCount` = distinct `userKey` count; `rounds` = `max(roundNumber)`.
   - Map each pick to the canonical shape: `pick = overallSelectionNumber`, `round = roundNumber`, `slot = slotByUserKey[userKey]`, `draftEntryId = String(userKey)`, `userId = String(userKey)`, with `name`/`position`/`team` from `didToInfo[draftableId]` (fallback `position` → `TEAM_POS_MAP[teamPositionId]`, `team` → `tidToTeam`).
   - **Return `null` (skip the board) if any pick's name is unresolvable or any `slot` is null** — mirrors UD's null-return guards. `DraftBoardModal` cannot render columns with null slots, so this guard is mandatory.
   - `slate_title`: use the entry's `tournamentTitle`/contest name (not `deriveDkSlate()`, which yields the bucket label).

4. **Change `getEntries()` return shape from bare `Entry[]` to `{ newEntries, currentDraftIds, boards }`** to match the Underdog adapter so `content.js` picks up boards automatically.
   - `newEntries`: the `Entry[]` built today. `currentDraftIds`: all current lineup ids (`lid`). `boards`: non-null `normalizeDkBoard(...)` results.
   - **Behavioral subtlety to validate:** today the bare array sends DK down `writeEntries`'s legacy full-replace path; the object shape moves DK onto the incremental path (`bridge.js` ~257-294) keyed on `currentDraftIds` (stale-pruning) + `newEntries` (upsert). Since DK re-fetches everything each sync, passing all entries as `newEntries` and all lineup ids as `currentDraftIds` reproduces today's full-replace semantics. Confirm via criterion 4 (sync twice, stable counts).

5. **No `content.js` change expected** — board write + try/catch and the `getBoards`-gated backfill block already exist. The backfill stays inert for DK (no `getBoards`).

6. **No `bridge.js` / web-app / migration change.**

7. **(Stretch — recommend omitting) DK `getBoards()` backfill.** DK re-emits all boards every sync, so the UD-style skip-already-synced backfill is redundant. Revisit only if DK entry sync later becomes incremental.

8. **Build & verify.** `cd chrome-extension && npm run build`, reload the unpacked extension, run the manual verification steps above.

---

Please review and reply **approved** to proceed, or provide feedback to revise.
