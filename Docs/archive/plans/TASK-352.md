<!-- Completed: 2026-07-18 | Commit: pending -->
# TASK-352: DraftKings live capture follow-ups: Rosters-tab roster harvest + auto new-draft detection

**Status:** Approved
**Priority:** P2

---

## Objective
Make the DraftKings Rosters tab a first-class roster source for the live Draft Assistant: a
glance at the user's own roster populates `myPicks`, the Live Activity roster bar, stack/
correlation targets, and availability — no Board visit required. The same roster-set signal
gives DK the contradiction evidence it was missing for hands-free back-to-back slow-draft
detection (deferred item 1 of this task). Deferred item 2 (lobby/pre-draft screen grammar)
stays out of scope — no lobby frame corpus exists yet — and will be re-captured as its own
task at completion.

## Verification Criteria
1. **Roster from the Rosters tab alone:** replaying the real capture
   `docs/draftkings_debug/frames-1784393824.jsonl` (which contains roster and players frames
   but zero Board frames) ends with `myPicks` listing Derrick Henry, Puka Nacua, Rashee Rice,
   and Tetairoa McMillan, and the glance `rosterBar` reading `QB 0 · RB 1 · WR 3 · TE 0` —
   today the same replay ends with `myPicks: []` and an all-zero bar.
2. **Drafted players leave the available list:** after the roster glance, none of the four
   rostered players appear in `availablePlayers` / the target grid.
3. **No regressions on existing captures:** the Underdog and DraftKings replay regression
   scripts still pass, and board/event evidence still outranks the roster-set heuristic when
   both exist for the same pick.

## Verification Approach
All commands run from `mobile-app/`.

- **Primary replay (criterion 1 & 2):**
  `node scripts/replay-frames.mjs docs/draftkings_debug/frames-1784393824.jsonl --pool ../best-ball-manager/src/assets/adp/draftking_adp_2026-07-18.csv --platform dk --username BirdEnthusiast`
  Expected final status: `ledgerSize >= 5` (4 roster picks + the Last-Pick event),
  `myPicks` = the four names above with rounds 1–4, glance `rosterBar` = `QB 0 · RB 1 · WR 3 · TE 0`,
  and the top-12 available list free of all four names.
- **Board-priority check (criterion 3):** replay the TASK-350 board-visit capture
  `docs/draftkings_debug/frames-1784385816.jsonl` with the same flags — final `myPicks`,
  ledger size, and slot must be unchanged from the pre-change baseline (capture the baseline
  output before editing).
- **Regression scripts:** `node scripts/test-dk-draft-replay.mjs`,
  `node scripts/test-draft-replay.mjs`, `node scripts/test-slow-draft-replay.mjs` all exit 0.
- **New-draft detection:** unit-style replay assertion in `scripts/test-dk-draft-replay.mjs`:
  feed a session the 1784393824 roster frames (roster established), then synthetic roster
  frames whose owner is BirdEnthusiast but whose complete player set omits all held picks —
  first read must NOT reset (streak 1), second consecutive read must reset the board
  (`newDraft: true`, ledger cleared).
- **Engine bundle regen:** `node scripts/build-extension-engine.mjs` runs clean;
  `generated/engineSource.js` `ENGINE_BUILD` is bumped and `git diff --stat` shows
  `targets/draft-broadcast/assets/engine.js` and `src/draft/generated/engineSource.js`
  regenerated together.
- **Manual (developer):** next real DK slow draft — open the Rosters tab once and confirm the
  Live Activity roster bar and Draft Assistant roster populate within a few frames.

## Files to Change
| File | Action | Description |
|------|--------|-------------|
| `mobile-app/src/draft/draftkingsParser.js` | Modify | Emit `rosterSet` observation (`{ username, players, tallyTotal }`) from matched Rosters-tab rows |
| `mobile-app/src/draft/sessionEngine.js` | Modify | Merge self-owned complete roster sets into the ledger at the slot's overalls (low score, `src: 'rosterSet'`); DK new-draft contradiction via missing-held-pick set check; glance rosterBar tally fallback |
| `mobile-app/src/draft/generated/engineSource.js` | Regenerate | Rebuilt by `scripts/build-extension-engine.mjs` (ENGINE_BUILD bump) |
| `mobile-app/targets/draft-broadcast/assets/engine.js` | Regenerate | Same rebuild — broadcast-extension copy |
| `mobile-app/scripts/test-dk-draft-replay.mjs` | Modify | Add roster-glance assertions for frames-1784393824.jsonl + the new-draft reset case |
| `docs/plans/TASK-352.md` | Modify | This plan |

## Implementation Approach

**Parser — `draftkingsParser.js`:**
1. Add `rosterSet: null` to the `obs` literal.
2. After the player-row loop (rows are already matched on roster frames — verified against
   the capture: all four players match at score 1.00 with owner + tally on every roster
   frame), when `obs.rosterPanel && obs.rosterOwner` and `obs.rows.length >= 1`, set
   `obs.rosterSet = { username: obs.rosterOwner, players: obs.rows.map(({ player, score, raw }) => ({ player, score, raw })), tallyTotal }`
   where `tallyTotal` is the sum of the harvested tally's filled counts (`null` when no tally
   read). Rows on roster frames keep feeding `obs.rows` exactly as today (availability is
   already guarded for roster kind).

**Engine — `sessionEngine.js` `ingest()`:**
3. **Self-roster merge.** After the existing rosterTally handling: when `obs.rosterSet`
   exists, its username matches `state.learnedUsername` (`anchorUsernameMatches`, truncation-
   tolerant), the slot is known (`slot()`), and the read is **complete**
   (`tallyTotal != null && players.length === tallyTotal`) — merge:
   - Compute the user's pick overalls: first `tallyTotal` entries of
     `overallsForSlot(slot, teams, rounds)`.
   - Drop players already in the ledger anywhere (dup guard) and overalls already held.
   - Assign remaining players to remaining overalls **in ADP-ascending order** (earlier pick
     ≈ better ADP) at score `0.55` with `src: 'rosterSet'` — low enough that board cells
     (1.0) and Last-Pick events (0.7) always override a mis-paired round, and excluded from
     identity-contradiction checks. The pairing heuristic only affects the round label shown
     per pick; the set itself (names, positions, teams — everything targets/correlation/
     availability consume) is exact.
   - The completeness guard means a scrolled/partial roster view merges nothing — no risk of
     mis-assigning when a row is off-screen.
4. **DK auto new-draft detection** (deferred item 1). Before the merge, when the roster set
   is self-owned and complete: count held board-grade my-picks (src ≠ 'event', ≠ 'rosterSet')
   whose player is absent from the on-screen set. `missing >= 1` is a contradiction — reuse
   the existing `newDraftStreak` machinery (defer the merge on the first read, reset the
   board on the second consecutive contradicting read). Set-level comparison sidesteps the
   pairing ambiguity that makes UD's exact-overall check unusable on DK, and cannot
   false-positive within one draft: a complete self-roster read always contains every real
   pick. Existing `resetForNewDraft()` and the manual reset stay as-is.
5. **Roster bar fallback.** In `getGlance()`, when `myPicks()` is empty but
   `state.tallies` holds a tally for the learned username, build the QB/RB/WR/TE counts from
   that tally — covers the window where the tally OCRs clean but rows haven't matched yet.
6. **Ledger `src` hygiene:** the existing new-draft conflict check (`e.src !== 'event'`)
   gains `&& e.src !== 'rosterSet'` so heuristic pairings never count as contradiction
   evidence at exact overalls.

**Bundle + tests:**
7. `node scripts/build-extension-engine.mjs` to regenerate `engineSource.js` +
   `targets/draft-broadcast/assets/engine.js` (hot-load path, ADR-023 — no EAS build needed).
8. Extend `scripts/test-dk-draft-replay.mjs` with the two new assertions (roster-glance
   resume; two-read new-draft reset).

**Edge cases handled:** opponent rosters viewed in the Rosters tab (owner mismatch → tally
stored for display only, no merge — unchanged from today); partial scroll (completeness guard);
OCR-garbled tally (`hasTally` gate already normalizes `O`→`0`); FLEX-slotted players (DK's
tally counts them under their true position — verified in the capture: Henry/RB + 3 WR =
`RB 1/2 WR 3/3` with McMillan in FLEX); duplicate evidence when the user later opens the
Board (board score 1.0 overwrites the 0.55 roster-set entries, correcting any mis-paired
rounds).

## Dependencies
None

## Open Questions
- **Round-pairing heuristic:** ADP-order assignment can label a pick with the wrong round
  (e.g. a reach TE taken in round 2 with worse ADP than a round-3 WR). Alternative rejected:
  keeping a separate overall-less roster set outside the ledger — it would require a parallel
  code path through `myPicks`/`draftedCanonicals`/DraftState (whose contract requires
  round/overall per pick) for marginal benefit; the ledger merge self-corrects the moment any
  board or event evidence arrives.
- **Lobby/pre-draft grammar (deferred item 2)** is explicitly out of scope; re-capture as a
  new task at completion (needs a recorded lobby-entry corpus first).

---
*Approved by: PH, 2026-07-18*
