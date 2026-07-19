# TASK-330: Mobile UD live-capture correctness — own-pick inference on the your-pick transition + team-abbreviation fix for playoff/stack badges

**Status:** Approved
**Priority:** P2

---

## Objective

Two correctness defects in the mobile Underdog live-capture engine, both surfaced by replaying `frames-1784477029.jsonl` (a real 12-team slow draft) through the replay harness:

- **Defect A — playoff/stack badges silently blank.** `poolRowsFromAdpRows` in `useSessionInputs.js` abbreviates the Underdog ADP *full* team name with `.toUpperCase().slice(0,3)`, which mangles ~13 teams (New York Jets/Giants, New Orleans, New England all → `"NEW"`; Green Bay → `"GRE"`; Jacksonville → `"JAC"`; San Francisco → `"SAN"`; Las Vegas → `"LAS"`; Kansas City → `"KAN"`; Tampa Bay → `"TAM"`; LA Rams/Chargers → `"LOS"`). The playoff schedule and stack/correlation logic key on proper abbreviations, so lookups return `undefined` and the Live Activity's **P** (playoff-week) and **S** (stack) markers never populate for players on those teams — and NYG/NYJ collide to `"NEW"`, producing false stacks. The playoff math itself is byte-identical to the chrome-extension overlay (verified: 0 divergences across all 16,384 team/position combinations); only the team input is corrupt.
- **Defect B — the user's own picks are missed until a Board glance.** The engine records picks from the drafter carousel / confirmation banner, but Underdog auto-advances the carousel past the user's own slot the instant they draft, so their completed-pick card scrolls off the left edge before it is OCR'd, and there is no self-pick banner. In the recording, De'Von Achane (R2, overall 18) and Rome Odunze (R6, overall 66) only entered `myPicks` at the first Board frame (#287) — "Achane" never appears in the carousel region (y<0.25) in any of the 336 frames. An incomplete roster also feeds Defect A downstream (missing picks → missing P/S markers).

## Verification Criteria

1. Replaying `frames-1784477029.jsonl` now records the user's own picks — De'Von Achane (R2) and Rome Odunze (R6) — into `myPicks` *during* the draft, before any Board-tab frame, instead of only after the board glance at frame #287.
2. With a full-name Underdog pool, the Live Activity target grid's **P** and **S** markers populate for the correct candidates and match the chrome-extension overlay logic — e.g. a DAL candidate shows **P17** opposite a rostered NYG pick, and GB candidates show **P16** opposite a CHI pick — where they were previously blank for NYJ/NYG/GB/JAX/SF/etc.
3. An inferred own-pick never overrides higher-fidelity evidence: a Board / Roster / confirm-card read of the same overall always wins, so a mis-inferred self-pick self-corrects on the next board glance.

## Verification Approach

- **Team normalization (Defect A):** add a unit assertion in `scripts/test-draft-parser.mjs` that `buildPool` fed full-name rows yields abbreviated `player.team` for the mangled set (New York Jets→`NYJ`, New York Giants→`NYG`, Green Bay→`GB`, Jacksonville→`JAX`, San Francisco→`SF`, Las Vegas→`LV`, Kansas City→`KC`, Tampa Bay→`TB`, LA Rams→`LAR`, LA Chargers→`LAC`, New Orleans→`NO`, New England→`NE`), and that already-abbreviated DK-style inputs (`MIN`, `JAX`) pass through unchanged.
- **P/S population (Defect A):** extend the existing playoff glance test so the picks/pool carry *full* team names; assert the P field is blank before the fix and shows the correct week(s) after (mirrors the extension: DAL vs NYG → `17`, GB vs CHI → `16`). Also run `node scripts/replay-frames.mjs <log> --pool <underdog full-name CSV> --username BIRDENTHUSIAST` and confirm the top-target P markers are non-empty where a schedule matchup exists.
- **Own-pick inference (Defect B):** add a regression that ingests an on-clock frame (user's overall known, a top-of-list candidate visible) followed by a Players frame that marks that candidate gone, and asserts `myPicks` contains it at the user's overall *before* any board frame; and a replay assertion that Achane/Odunze appear in `myPicks` earlier than frame #287. Assert the inferred entry's score is below the confirm-card score so a later board entry at the same overall overrides it (feed a board frame and confirm the name/round is corrected).
- **DK-unaffected regression:** confirm the DraftKings replay/parse tests still pass (DK teams are already abbreviations; `teamAbbrev` is a pass-through for them).
- **Bundle parity:** run `npm run build:engine` after the `sessionEngine.js` change, then `node scripts/test-draft-parser.mjs` — its existing checks assert `targets/draft-broadcast/assets/engine.js` and `src/draft/generated/engineSource.js` are byte-identical to the rebuilt engine (a skipped rebuild fails here). All checks must print `All checks passed.`

## Files to Change

| File | Action | Description |
|------|--------|-------------|
| `mobile-app/src/screens/draft/useSessionInputs.js` | Modify | Replace `.toUpperCase().slice(0,3)` with `teamAbbrev()` (from `shared/utils/nflTeams`) on the `latestRows` path; apply `teamAbbrev()` to the `masterPlayers` fallback path too |
| `mobile-app/src/draft/nflTeams.js` | Create | Node/esbuild/Metro-safe plain-`.js` copy of the full-name→abbrev map + `teamAbbrev()`, mirroring the `playoffSchedule.js` precedent (the extensionless shared import doesn't resolve under Node/esbuild); lockstep header note pointing at `shared/utils/nflTeams.js` |
| `mobile-app/src/draft/sessionEngine.js` | Modify | Normalize candidate + pick teams via `teamAbbrev()` inside `candidatePlayoffWeeks` and the S-stack check in `buildTargets` (non-lossy defense-in-depth); add own-pick inference in `ingest` |
| `mobile-app/scripts/test-draft-parser.mjs` | Modify | Add regressions: (a) team normalization, (b) P/S populate with full-name pool, (c) own-pick inference fills the user's overall before any board frame and is overridden by later board evidence |
| `mobile-app/src/draft/__fixtures__/frames-1784477029.jsonl` | Create | Committed replay fixture for the regression (or a trimmed slice around the R2/R6 pick windows if full size is a concern) |
| `mobile-app/targets/draft-broadcast/assets/engine.js`, `mobile-app/src/draft/generated/engineSource.js` | Modify | Regenerated by `npm run build:engine` after the engine change (not hand-edited) |

## Implementation Approach

**Defect A — team abbreviation (source fix + engine guard):**

1. `useSessionInputs.js`: `import { teamAbbrev } from '../../../shared/utils/nflTeams';`
   - `latestRows` path: `team: teamAbbrev(row.teamName || row.team || row.Team || 'N/A')` (drop the `.slice(0,3)`). `teamAbbrev` upper-cases, maps full names to abbreviations, and passes through already-abbreviated / `N/A` / unknown values unchanged.
   - `masterPlayers` fallback path: `team: teamAbbrev(p.team)`.
2. `sessionEngine.js` must resolve under Node (fixture tests), esbuild (extension bundle), and Metro, so it cannot use the extensionless `shared/utils/nflTeams` import. Add `src/draft/nflTeams.js` — a plain-`.js` module with explicit `export`, exactly like `src/draft/playoffSchedule.js` — exporting the full-name→abbrev map and a `teamAbbrev(team)` helper. Header comment: keep in lockstep with `shared/utils/nflTeams.js`.
3. In `candidatePlayoffWeeks`, resolve `team = teamAbbrev(p.team)` and compare `teamAbbrev(mine.team) === opp`. In `buildTargets`, compare `teamAbbrev(mine.team) === teamAbbrev(p.team)` for the S flag. Non-lossy (already-correct abbreviations pass through), belt-and-braces after the source fix; also protects the DK path and any future full-name leakage. Note: the `.slice(0,3)` corruption is *lossy* (NYJ/NYG/NO/NE→`"NEW"`), so it must be fixed at the source (step 1) — the engine guard alone cannot recover it.

**Defect B — own-pick inference on the your-pick transition:**

4. Snapshot on-clock evidence: when `obs.onClock` is true and the slot is known, store `state.onClockSnapshot = { overall: state.currentPick, candidates: <ranked canonicals from availablePlayers(N)> }`. On the clock, `state.currentPick` equals the overall the user is about to fill (verified: frame #85 on-clock → `currentPick` 18 = the R2 overall).
5. Deferred attribution: on each `ingest`, if a snapshot exists, the slot is known, and `state.ledger` has no entry at `snapshot.overall`, find the highest-ranked snapshot candidate that has since become unavailable (`draftedCanonicals()` ∪ `inferredGone`) and is not already in the ledger. The disappearance signal comes from the Players-tab availability inference that already runs — deferring until the picked player is confirmed gone is more reliable than assuming best-available at pick time. Attribute it at `snapshot.overall` with `score: 0.5` (below the confirm-card 0.6 and all board/roster scores) and `src: 'selfInfer'`. Apply the confirm-card ADP-fall sanity guard (`overall - player.adp > 30` → skip as a likely misattribution). Clear the snapshot once consumed (or once the pick window has passed) so it fires at most once per own-pick.
6. Because the inferred entry is the lowest-scored source, any later board cell, roster-panel pick, card pick, or confirm card at the same overall overrides it via the existing `score >` merge rule — satisfying Criterion 3. Extend the serialize/hydrate `src` handling so `selfInfer` survives round-trips (or is simply treated as a low-score ledger entry).

**Build + verify:**

7. Run `cd mobile-app && npm run build:engine` to regenerate `engine.js` + `engineSource.js`, then `node scripts/test-draft-parser.mjs` and the DK/slow-draft replay tests. Iterate until all print `All checks passed.`

## Dependencies

None. (TASK-332 — roster-panel intake — is a complementary, user-action-driven own-pick source noted in Open Questions; it does not block this passive fix.)

## Open Questions

- **Zag risk (Defect B).** Deferred-disappearance inference assumes the user drafted a player near the top of the visible list who then vanished; a deliberate deep reach could momentarily attribute the wrong player. Mitigation: the low `selfInfer` score means any Board/Roster/confirm read corrects it (Criterion 3), and the ADP-fall guard rejects implausible attributions. Acceptable given the alternative is a silently missing pick.
- **Fixture size.** `frames-1784477029.jsonl` is 336 frames. If committing the full log is undesirable, commit a trimmed slice spanning the R2 (overall 18) and R6 (overall 66) pick windows plus one late Board frame — enough to exercise both defects.
- The pre-existing scope item ("Harvest slow-draft completed carousel cards") remains valid and complementary; this plan does not remove it.

---

## Scope Items

### Harvest slow-draft completed carousel cards (pick label + abbreviated player name) as ledger entries
- **Added:** 2026-07-15
- **Verification:** Fixture from frames-1784120786 #14/#23 ('6.4 | 64' + 'J. Tyson' under BIRDENTHUSIAST): ingest appends ledger entry overall 64 = Jordyn Tyson attributed to the card's username; replaying the recording yields myPicks containing the round-6 pick and rosterBar QB/RB/WR/TE counts reflecting it

### Fix Underdog team-abbreviation mangling (slice(0,3)) breaking playoff-P and stack-S badges
- **Added:** 2026-07-19
- **Verification:** Building the live-session pool from a full-name Underdog ADP snapshot yields proper abbreviations (New York Jets->NYJ, Green Bay->GB, Jacksonville->JAX, San Francisco->SF, New York Giants->NYG); replaying frames-1784477029 with that pool populates P-week markers on the target grid (DAL candidate -> P17 opposite a NYG pick) where they were previously blank

---
*Approved by: <!-- pending -->*
