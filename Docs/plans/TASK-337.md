# TASK-337: Live Activity target table redesign: fixed P/S/C/E columns, drop Q/F flags, header cleanup

**Status:** Approved
**Priority:** P2

---

## Objective

Redesign the draft Live Activity targets per the approved mockup
(https://claude.ai/code/artifact/f89c7816-7aa6-4d90-bc27-ab4478aa9deb): replace the
floating flag glyphs with a fixed-column table per target — **P** playoff week(s) in the
extension's W15/16/17 bronze/silver/gold (multi-week red "15+"), **S** gold stack check,
**C** roster correlation (same math as the Chrome extension overlay), **E** exposure.
Remove the Q (queue-risk) and F (falling) flags, remove the "synced … ago" line, and fold
the round into a single "P91 · R8" readout top-right on both the lock screen and the
Dynamic Island. No staleness indicator replaces the synced line (see Decision below).

## Verification Criteria

1. On an iPhone during a live Underdog draft, the lock screen and expanded Dynamic Island
   show the 6-target table with fixed P/S/C/E columns and header strips per the approved
   mockup — no Q/F glyphs, no "synced … ago" line, one "P91 · R8" readout, roster bar
   intact, deep link into the assistant still works.
2. The C column shows the same correlation the Chrome extension overlay would show for the
   same portfolio and picks (average conditional probability, `computeCorrelation` math),
   and P shows the actual playoff week(s) rather than a boolean glyph.
3. Live capture does not ingest the redesigned overlay's own rows: with the new-format
   Live Activity expanded over the draft room, parser replay produces zero self-poisoned
   player rows.

## Verification Approach

Automated (Claude runs, reports output):

- `cd mobile-app && npm run build:engine` — regenerates
  `src/draft/generated/engineSource.js` and `targets/draft-broadcast/assets/engine.js`;
  both must be in lockstep (the ADR-023 sync guard in the test suite checks this).
- `node scripts/test-draft-parser.mjs` — exits 0 with all checks passing, including
  new/updated assertions:
  - glance targets are 6-field lines `POS·Name·P·S·C·E`; no emitted line carries a
    Q or F glyph;
  - a fixture player with a known W15/16/17 opponent overlap yields the expected week
    token; a multi-week case emits weeks joined with `/` (never `·`);
  - with a hand-built `rosterIndexMap` in the test config, the C field equals the
    hand-computed `computeCorrelation` value; C is blank before the first pick;
  - `JSON.stringify(glance)` stays under the relay's 3,500-byte content-state budget;
  - self-overlay excision tests pass against updated new-format fixture frames
    (`rows.length === 0` for frames containing our own card).
- `cd mobile-app && npx eslint src/draft src/screens` on touched JS files (project lint
  conventions).

Requires the developer (manual steps — task is not Done until confirmed):

1. Build the dev client via the TASK-334 GitHub Actions `eas build --local` pipeline and
   install on the iPhone.
2. In a live (or replayed) draft: confirm lock-screen card matches the mockup — table
   columns aligned, position colors, W15/16/17 colors, gold ✓, "P91 · R8" top-right,
   no synced line; confirm the expanded Dynamic Island equivalents.
3. Confirm a pushed update (app backgrounded, broadcast running) still renders the new
   table — no relay change is needed; the content-state contract is unchanged.

## Files to Change

| File | Action | Description |
|------|--------|-------------|
| `mobile-app/src/draft/sessionEngine.js` | Modify | Replace `targetFlags` with structured per-target meta: upgrade `candidateHasPlayoffStack` to return the week list; keep stack check; port `computeCorrelation` from the extension; drop Q/F logic; `buildTargets` emits `POS·Name·P·S·C·E`; accept `rosterIndexMap` config |
| `mobile-app/src/screens/LiveSessionPanel.jsx` | Modify | Build `rosterIndexMap` (canonical → entry-id array) in the same `rosterData` pass as `exposureMap`; pass to `startSession` |
| `mobile-app/src/draft/sessionController.js` | Modify | Accept/persist/hand off `rosterIndexMap` through `startInputs` and the App Group config (serialize Sets as arrays) |
| `mobile-app/src/draft/extensionEngine.entry.js` | Modify | Deserialize `rosterIndexMap` (arrays → Sets) alongside the existing `toMap` calls |
| `mobile-app/src/draft/generated/engineSource.js` | Regenerate | `npm run build:engine` output — never hand-edited |
| `mobile-app/targets/draft-broadcast/assets/engine.js` | Regenerate | Same build output for the broadcast extension |
| `mobile-app/targets/draft-glance/index.swift` | Modify | `TargetCell` parses 6 fields into fixed-width columns; header strip in `TargetGrid`; delete `flagText` and `SyncedAgoText`; brand row gains "P91 · R8"; DI trailing collapses to one line; week colors W15 `#CD7F32` / W16 `#C9CED6` / W17 `#FFD700` / multi red |
| `mobile-app/src/draft/underdogParser.js` | Modify | Update self-excision signals for the new overlay content (P S C E header-strip fragments, ✓ garbles, paired `NN%` fragments); keep legacy long-form/`[SPQF]` patterns for replaying old frame logs |
| `mobile-app/scripts/test-draft-parser.mjs` | Modify | Replace old-format assertions (queue-risk flag, `WR·McConkey·30·`) with new-format ones; add correlation, playoff-week, byte-budget, and no-Q/F checks; keep self-excision tests green |
| `mobile-app/src/draft/__fixtures__/underdogFastDraftFixture.js` | Modify | Update synthetic self-overlay frames to the new card content (keep some legacy-format frames for the legacy regex path) |
| `mobile-app/docs/LIVE_SESSION_V1.md` | Modify | Update the glance format spec (`POS·LastName·EXP·FLAGS` → 6-field table encoding) and the flag-glyph documentation |

## Implementation Approach

1. **Payload format.** Each target line becomes exactly six `·`-separated fields:
   `POS·Name·P·S·C·E`. P is `""`, a single week (`"16"`), or ascending weeks joined with
   `/` (`"15/17"` — `/` because `·` is the field separator). S is `""` or `"S"` (ASCII in
   the payload; Swift renders ✓). C and E are `""` or integer percents without the `%`
   sign (Swift appends it). Examples: `WR·Downs·16·S·24·10`, `QB·Mahomes·15/17··31·13`,
   `RB·Corum···9·8`. `ContentState` is untouched — same fields, both Swift copies stay
   identical, no ActivityKit attribute-matching risk and no relay contract change.
2. **Engine.** In `sessionEngine.js`, change `candidateHasPlayoffStack` to
   `candidatePlayoffWeeks` returning the qualifying week list (same pair rules); port
   `computeCorrelation` from `chrome-extension/src/content/draft-overlay.js:995` operating
   on the new `rosterIndexMap` (Map canonical → Set entryId) against `myPicks()`; C is
   blank until the first pick lands. Delete the Q and F branches (the queue set itself
   stays — it still feeds availability logic). `buildTargets` keeps the top-6,
   column-major, name-collision (`F.Surname`) behavior.
3. **Plumbing.** `LiveSessionPanel.jsx` already builds `Map(canonical → Set(entryId))`
   internally for exposures — keep both products of that single pass and pass
   `rosterIndexMap` into `startSession`. `sessionController.js` serializes it into the
   App Group config as arrays; `extensionEngine.entry.js` rehydrates arrays → Sets. Then
   `npm run build:engine` so the broadcast extension runs the same engine.
4. **Widget.** In `index.swift`: rewrite `TargetCell` to split into 6 parts with fixed
   frame widths (pos 16pt / name flex with `minimumScaleFactor` / P 23pt / S 12pt /
   C 24pt / E 24pt) and add a header strip row to each grid column; single-week P colored
   bronze/silver/gold, `/`-containing P rendered as first week + `+` in red; blank cells
   render a muted `–`. Delete `flagText` and `SyncedAgoText`. Lock screen top row becomes
   brand left + `P91 · R8` right (shown for the same phases that show it today); DI
   trailing becomes the same single line. Add a small red dot next to the brand rendered
   only when `context.isStale`. Keep `widgetURL` deep links and compact/minimal states.
5. **Staleness.** Skipped per the recorded Decision — no `staleDate` changes to
   `BBEDraftNativeModule.swift` or the relay; `SyncedAgoText` is removed with no
   replacement indicator.
6. **Self-excision.** The parser already region-bounds our own expanded card (TASK-329)
   via brand/headline/roster-bar signals — those all survive the redesign. Update the
   fragment signals: add header-strip fragments (`P S C E`, OCR-merged `PSCE`), ✓ garbles
   (`v`, `√`, `/`), and paired bare `NN%` tokens as region signals; ambiguous bare week
   numbers are NOT used as signals. `selfSynced` and the legacy `selfFlag` alternation
   stay for replaying recorded frame logs from current builds.
7. **Tests and docs.** Update `test-draft-parser.mjs` assertions and the fixture's
   synthetic overlay frames per the Verification Approach; update
   `docs/LIVE_SESSION_V1.md` (format spec at the TASK-336 section, queue-risk flag
   paragraph). Sequence: engine + plumbing → tests green → Swift → docs.

## Dependencies

None blocking. TASK-336 (claimed, In Progress) built the current 6-target grid, but its
Live Activity work is already merged to main (`eb06b1c`, `47a4f49`), so no file collision
is expected; this task builds directly on it.

---
*Approved by: developer (AskUserQuestion, plan approval prompt), 2026-07-16*

## Decision

- **Question:** Staleness signal after removing the synced-ago line
- **Chosen:** Skip the stale dot entirely - no staleDate changes to the native module or relay; accepted that a dead feed is indistinguishable from a quiet one on the card
- **Decided by:** developer
- **Date:** 2026-07-16
