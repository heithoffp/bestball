# TASK-328: Draft parser: pin slot from the user's username on the board; harden screen classification + picks-until countdown

**Status:** Approved
**Priority:** P2

---

## Objective
Make the live-draft capture engine robust for both fast (30s clock) and slow (hour clock) Underdog drafts by (1) pinning the user's draft slot deterministically from their own drafter card in the carousel instead of inferring it from the flaky "UP IN N PICKS" ticker, (2) capturing the user's own picks and every observed pick as events from the carousel pick-confirmation card (so fast drafts work without ever opening the Board tab), and (3) hardening screen classification (lobby, player-detail panel, queue vs players, board) so non-list screens never corrupt availability inference. Guarantees at all times, per the developer's priorities: the user's picks, the available-player picture, and (best-effort) the board/other rosters.

## Research Summary (evidence base)

*KB not compiled — research phase ran without KB context.* Sources: pipeline sweep of ADR-019/020/021, `LIVE_SESSION_V1.md`, `DEVELOPMENT_NOTES.md`, task-318 OCR artifacts; frame-by-frame catalog of the new fast-draft recording `mobile-app/docs/live_draft_recording/ScreenRecording_07-13-2026 13-16-13_1.mp4` (366 frames @ 1fps, all read). Ground truth from the recording: user = BIRDENTHUSIAST, slot 7 of 12; user picks J. Taylor (1.7 / #7), D. London (2.6 / #18), T. Higgins (3.7 / #31); full pick sequence #1–#31 documented.

Key UI facts the design relies on:

- **Drafter carousel** (top of every in-draft screen): one card per drafter — `USERNAME` (all-caps) + label `r.p | overall` (that drafter's *next* pick) + a `QB RB WR TE / n n n n` roster tally. The **on-clock card** replaces the label with a live `M:SS` countdown. The carousel auto-scrolls to keep the on-clock drafter in view; the user's card is guaranteed visible only near their turn (it can also be edge-truncated, e.g. "BIRD…"). The same username appears on two adjacent cards at snake turns.
- **Pre-draft lobby**: header `Drafting starts soon` → `Draft starts in M:SS`. Before seats fill, the user's card is the **only named card** (others read "Filled"). Once filled, the whole draft order is scrollable — the user's card label (`1.7 | 7`) gives the slot before pick one.
- **Header state machine** (user-relative, one transition per pick): `UP IN N PICKS` → `UP NEXT` (N=1; "UP IN 1" never occurs) → `Your pick: M:SS` (user on clock; red ≤0:09) → `UP IN N PICKS`. The gold Players-list divider `N picks away` mirrors it but scrolls off-screen.
- **Pick-confirmation card**: on every completed pick a card slides into the carousel's left edge: position badge first (~1s), then `TEAM / F. Lastname` (abbreviated name). It is routinely clipped and mid-animation. The user's own confirmation card is gold-bordered (color — invisible to OCR; the `Your pick →` header transition is the OCR-visible signal that the pick was ours).
- **Board tab**: username column headers, 4 columns visible; filled cells = overall + name + `POS - TEAM (r.p)`; the user's column has yellow-outlined future cells; on-clock cell shows `On the clock / M:SS`. Fast drafts: the user may never open Board (opened ~6 times in 6 minutes in this recording; picks land every 2–20s).
- **Existing engine gaps** (why the ticker approach fails): `picksUntil` drives slot inference (`sessionEngine.js:82-93`), so a missed/garbled ticker read stalls slot + countdown; `looksLikeNameLine()` rejects all-caps usernames as noise (`playerMatcher.js:177`) — the anchor evidence is currently discarded; `myPicks` derives only from board cells ∩ slot overalls — empty in a fast draft where Board is never opened; no lobby or player-detail classification (detail panels can pollute availability inference).

## Verification Criteria

1. **Slot pinning:** From a fixture of the pre-draft lobby (user card `1.7 | 7`) or any in-draft screen showing the user's card, the session reports `slot = 7` with source `anchored` — with zero ticker evidence in the fixture. A truncated username fragment does not anchor (no false pin); the full username does, case-insensitively.
2. **Username auto-learn:** With no configured username, a `Your pick` header + on-clock card fixture teaches the session the username; subsequent screens anchor from it.
3. **Ticker-loss resilience:** After slot is anchored, a screen sequence with *no* "UP IN N PICKS" reads still yields correct `picksUntil` (derived from snake math + currentPick ratchets from upcoming-card overalls / board cells / availability). The ticker, when present, ratchets `currentPick` instead of driving slot.
4. **My-pick capture without Board:** A fast-draft fixture sequence (`Your pick` → header flips to `UP IN N PICKS` + confirmation card `ATL / D. London`) records Drake London as the user's pick at the correct overall, and `myPicks` reflects it — no board screen in the sequence.
5. **Event ledger for opponent picks:** Confirmation-card + header-decrement sequences append opponent picks at the correct overall with lower confidence than board cells; a later board-cell read of the same overall overwrites on higher score (existing score mechanism).
6. **Classification hardening:** Lobby screens classify `lobby` (and set `picksUntil` null, no availability); player-detail-panel screens are inert for availability; queue vs players disambiguation unchanged; non-draft screens remain `kind: 'unknown', changed: false`. All existing 66 checks in `test-draft-parser.mjs` still pass.
7. **Recording replay (ground truth):** Replaying OCR'd text of all 366 recording frames through a fresh session ends with: slot 7 anchored, all 3 user picks correct (J. Taylor #7, D. London #18, T. Higgins #31), `currentPick ≥ 32`, no crash on any frame, and `picksUntil` correct at every frame where the header was legible.
8. **Bundle parity:** `npm run test:draft` (which rebuilds and smoke-tests the JSC `engine.js` bundle) exits 0.
9. **On-device (manual, developer):** In a real UD draft, the Live Activity shows the correct slot and countdown from the lobby onward, and the user's picks appear in the assistant without opening the Board tab.

## Verification Approach

- **Automated:** `cd mobile-app && npm run test:draft` — extended with new check groups for criteria 1–6 and 8 (target: existing 66 checks + ~25 new, all passing; exact count reported).
- **Replay harness (new, dev-only):** `pwsh mobile-app/scripts/ocr-frames.ps1` OCRs the extracted recording frames via Windows.Media.Ocr into `mobile-app/docs/task-328-evidence/frames-ocr.jsonl` (checked in; frames themselves are not). Then `node mobile-app/scripts/test-draft-replay.mjs` feeds each frame's items through `parseUnderdogScreen` → `session.ingest` in order and asserts criterion 7 against the hard-coded ground truth. Windows OCR garbles differently than Vision — that is the point: it stress-tests tolerance. If Windows OCR proves too weak on the dark UI to produce usable text, fall back to hand-curating ~20 keyframe fixtures from the frame catalog instead, and note it in the plan's handoff.
- **Iteration expected:** replay will surface parser gaps (clipped confirmation cards, mid-animation frames); iterate patterns until criterion 7 passes.
- **Manual (developer):** criterion 9 requires a live draft on the physical iPhone — presented as an outstanding manual step at completion; task will not be marked Verified until confirmed.

## Files to Change

| File | Action | Description |
|------|--------|-------------|
| `mobile-app/src/draft/underdogParser.js` | Modify | Carousel card parser (username + label/countdown + tally); header state machine (`Your pick`, lobby states, `UP NEXT`); confirmation-card pattern; new kinds `lobby`/`detail`; classification hardening |
| `mobile-app/src/draft/playerMatcher.js` | Modify | Abbreviated-name matching (`D. London` + team hint) for confirmation cards; keep all-caps rejection for *player* name lines |
| `mobile-app/src/draft/sessionEngine.js` | Modify | `anchoredSlot` evidence tier + username auto-learn; invert ticker to ratchet `currentPick`; event-ledger ingestion (confirmation card + header transitions); `myPickLanded` from `Your pick` transition; opponent tallies + username→slot map; serialize/hydrate v2 (back-compat with v1) |
| `mobile-app/src/draft/sessionController.js` | Modify | Pass configured/learned username into engine ctx; persist learned username |
| `mobile-app/src/draft/extensionEngine.entry.js` | Modify | Thread username through `ingest` ctx; surface anchored-slot in result for the confidence hub |
| `mobile-app/src/screens/LiveSessionPanel.jsx` | Modify | Show slot source (anchored/manual/inferred) and learned username in the confidence hub; optional manual username field |
| `mobile-app/src/draft/__fixtures__/underdogFastDraftFixture.js` | Create | Hand-curated fast-draft screens: lobby, UP NEXT, Your pick, post-pick + confirmation card, detail panel, truncated-username carousel |
| `mobile-app/scripts/test-draft-parser.mjs` | Modify | New check groups for criteria 1–6 |
| `mobile-app/scripts/ocr-frames.ps1` | Create | Dev-only: Windows OCR over extracted recording frames → JSONL |
| `mobile-app/scripts/test-draft-replay.mjs` | Create | Replay harness asserting criterion 7 ground truth |
| `mobile-app/docs/task-328-evidence/frames-ocr.jsonl` | Create | OCR'd frame corpus (text only, no images) |
| `mobile-app/docs/LIVE_SESSION_V1.md` | Modify | Document the new evidence hierarchy, header state machine, and fast-draft capture story |

## Implementation Approach

**Step 1 — Carousel region parser (`underdogParser.js`).** Walk OCR lines pairing all-caps username tokens (≥4 chars, allowing digits: `TIMW1974`) with the following 1–2 lines: a card label (`r.p | overall`, reusing `resolveRoundDotPick` for dropped-dot garbles) or a countdown (`M:SS`). Emit `obs.drafterCards = [{username, nextOverall, onClock, tally}]`, parsing the `QB RB WR TE` tally row beneath (tolerating `O`→`0`). Snake-turn duplicate usernames are expected — keep both cards. Use bounding-box y-position (when available) to prefer top-of-screen matches and avoid misreading board column headers as cards; board headers lack labels/countdowns so the pairing requirement already excludes them.

**Step 2 — Header state machine.** Add patterns: `Your pick[: ]M:SS` → `onClock=true, picksUntil=0`; `Drafting starts soon` / `Draft starts in M:SS` → `kind='lobby'` (no availability, no push significance); keep `UP NEXT`→1 and `UP IN N PICKS`→N.

**Step 3 — Slot anchoring (`sessionEngine.js`).** New evidence tier: `anchoredSlot`, set when a drafter card's username matches the known username (full, case-insensitive; edge-truncated fragments never anchor) — `slot = slotForOverall(card.nextOverall)`; when the header is `Your pick`, the on-clock card's `nextOverall` is `currentPick` itself. Precedence: `manualSlot` (user override, conflict-flagged) > `anchoredSlot` > `inferredSlot` (legacy ticker path, kept as fallback). Anchoring is sticky for the session; contradictory anchors (OCR garble) require two consistent reads to re-pin. **Username auto-learn** (zero-config principle): (a) lobby with exactly one named card among "Filled" placeholders → that username is the user; (b) header `Your pick` → the on-clock card's username is the user. Learned username persists via controller storage; a manual setting in the confidence hub overrides.

**Step 4 — Invert the ticker.** Once slot is known, `picksUntil` derives from snake math (`nextOverallForSlot(slot, currentPick) − currentPick`) and survives ticker dropouts; a legible ticker instead *ratchets* `currentPick` to `myNextOverall − N` (cross-check, tolerant of stale reads via the existing monotonic ratchet). Without any slot, the legacy ticker inference still runs.

**Step 5 — Event ledger (fast-draft pick capture).** Parse the confirmation card (`TEAM / F. Lastname`, possibly split across lines, position badge sometimes alone mid-animation) with a new abbreviated matcher in `playerMatcher.js` (first-initial + surname + team hint against the pool). On a header transition observed between consecutive ingests (N→N−1, `UP NEXT`→`Your pick`, `Your pick`→`UP IN M`), attribute the freshly-appeared confirmation card to overall `currentPick` at transition time, and append to the ledger at ~0.6 score so later board cells (0.8+) overwrite. The `Your pick`→`UP IN M` transition specifically marks the pick as *the user's* (`myPickLanded` significance, already wired for push pacing). Never append from a mid-animation position-only card; wait for the name text (next frame). Guard idempotency by overall.

**Step 6 — Classification hardening.** New kinds: `lobby`; `detail` when a stats-table signature is present (`Rushing`/`Receiving` season headers + `Queue`/`Draft` action bar) — inert for availability (rows behind the panel are partially hidden). Availability inference additionally requires no detail panel and keeps the existing ≥6-confident-ADP-sorted-rows guard. Queue-vs-players and unknown-screen inertness unchanged (regression-checked).

**Step 7 — Nice-to-have surfaces (cheap once Steps 1/5 exist).** Store per-username roster tallies and the username→slot map (from card labels) in session state; expose via `getStatus()` for a future other-rosters UI (no new UI this task beyond the confidence hub slot-source line). The event ledger plus any Board visits give the board picture at whatever fidelity the user's browsing allows — consistent with "best effort" priority.

**Step 8 — Fixtures, tests, replay.** Build the fast-draft fixture from the frame catalog (hand-transcribed in the exact style of the task-318 dump). Extend `test-draft-parser.mjs`. Write `ocr-frames.ps1` (WinRT `Windows.Media.Ocr` over the ffmpeg-extracted frames; frames regenerable from the checked-in mp4) and `test-draft-replay.mjs` (sequential ingest + ground-truth asserts). Iterate parser patterns until replay passes.

**Step 9 — Docs.** Update `LIVE_SESSION_V1.md` (evidence hierarchy, header state machine, fast-draft story, replay harness usage).

**Edge cases handled:** dropped-dot card labels (`310 | 34`); `O`↔`0` in tallies; truncated usernames (corroborate-only); snake-turn duplicate cards; countdown at `0:00` held frames (not a pick event — pick events key on header transitions, not timer); autopick bursts (multiple header decrements between syncs → ledger appends per decrement only when a confirmation card is legible, else just currentPick ratchet); back-to-back user visibility loss (card off-carousel → anchored slot is sticky, no re-read needed); DraftKings is out of scope (Underdog parser only, per task title).

## Implementation Notes (deviations & additions discovered during execution)

The replay corpus surfaced four pre-existing/latent engine bugs beyond the planned scope items; all were fixed as part of this task since criterion 7 could not pass without them:

1. **Geometric card pairing.** OCR line order (y-then-x sort) interleaves fragments of side-by-side carousel cards, pairing a username with the *neighbor's* label (anchored slot 6 instead of 7 in early replays). Card and confirmation-card extraction now pair fragments by bounding-box alignment when boxes exist, with the sequential heuristic as the boxless fallback. This affects the on-device Vision path too, not just Windows OCR.
2. **Carousel min-ratchet hardening.** `currentPick = min(visible upcoming) − 1` now (a) requires the on-clock card visible in the same frame (a hand-scrolled carousel — e.g. the pre-draft lobby scrub — says nothing about picks made), and (b) is treated as an upper bound: with an anchored slot and a legible ticker, the ticker is the exact source and the carousel bound only informs snake-rung selection (with a 3-pick backward tolerance so an inflated bound can't skip a round).
3. **Availability ratchet removed.** `floor(topVisibleAdp) − 1` corrupted the pick position whenever the user scrolled the Players list (ADP ≠ pick number). Availability also now only applies when top visible ADP ≤ currentPick + 12.
4. **Board-cell "On the clock" false positive.** The Board renders "On the clock" in the current pick's cell for any drafter; the user-on-clock header pattern now only matches in the header zone (y < 0.12) when boxes exist.

Additional garble recoveries from the corpus: pipe-merged card labels (`1.7 | 7` → `1.717`), split labels (`2.7` + `19`), both validated by the snake identity. Event-ledger entries are tagged `src: 'event'` and excluded from the ledger-max pick ratchet (feedback-loop protection).

**Replay ground-truth deviation:** the recording cuts one second after the user's third pick (#31 Tee Higgins) — the confirmation card shows only the "WR" badge in the final frames and the Board is never revisited, so the player identity never appears on screen. The replay asserts the two capturable picks (#7, #18) plus exact final position (currentPick 32, next pick #42); the #31-style capture path is covered by the fixture tests. Final replay: 366 frames, 0 crashes, slot 7 anchored, 291/291 header agreement, 27 of 31 picks event-captured at exact overalls.

## Iteration 2 — on-device slow-draft test failures (2026-07-14, debug_screenshots)

The first live test (slow draft, joined mid-draft, two broadcast attempts) confirmed slot anchoring/countdown worked (slot 9 pinned, P54 · up in 3 correct) but surfaced five defects, all fixed and regression-tested:

1. **Self-capture feedback loop** — the expanded Live Activity overlays the draft room and is captured like screen content; our target names parsed as visible available rows and resurrected drafted players into targets. Frames with our glance signature ("synced … ago", FALLING/STACK flags + roster bar) now classify `self` and are fully inert.
2. **Availability was last-scroll-wins** — `inferredGone` was rebuilt from only the latest Players-tab snapshot; now cumulative across scroll windows (visible rows still clear stale marks), which is also what makes a mid-draft resume converge as the user scrolls.
3. **Abbreviated-name tie ("J.J. Taylor")** — the confirmation-card matcher capped scores at 1.0 so a team-confirmed hit could tie a team-less same-surname player, with pool order deciding. Team bonus now uncapped; missing team penalized.
4. **Assistant view round** — `DraftAssistantView` derived the round from `myPicks.length + 1` (wrong whenever the ledger lags); it now uses the live feed's `currentRound`.
5. **Cold extension restarts** — a second broadcast re-initialized the extension from the session-start (empty) config snapshot, and it pushed empty-roster glances that fought the app's richer updates (the flapping roster bar). The controller now writes the merged state back to the App Group config whenever the ledger grows, so restarts resume warm.

**Scope additions (flagged per scope-drift gate):** on-device diagnostics — the extension keeps a ring buffer of its last 6 ingests (parse summary + truncated OCR lines) riding in the existing result JSON, and the confidence hub gained a **Debug** share button exporting app-side status + that buffer. Needed to close the verification loop; on-device parse failures were previously invisible. The missing user picks #33/#40 (board was open but cells didn't land) remain undiagnosed pending a Debug export from the next test.

Note: the broadcast extension's `engine.js` is baked into the native build — **each retest requires a fresh EAS build**, not just a Metro reload.

## Iteration 3 — build-mismatch diagnosability (2026-07-14, second screenshot batch)

The second test batch (IMG_2799–2802) showed the new app JS live (Debug button, correct R5/Pick 57, warm resume banner) while the Live Activity still exhibited old-engine behavior on the UD home screen ("You're on the clock" + zero roster at P54 — the self-capture loop reading our own activity text, which only a new EAS build fixes). Root problem: **nothing revealed which engine build the extension was running.** Changes:

1. `ENGINE_VERSION` stamp (`task328.2`) rides in every extension result; the controller logs it, the panel warns loudly when the extension reports no version (stale pre-TASK-328 build), and it's included in the debug export.
2. Debug export made reliable: the Debug button now opens a selectable-text modal (copy/screenshot always possible) with a Share button that surfaces errors instead of the previous silent-failure `Share.share().catch(() => {})`.
3. Warm-restart config rewrite now triggers on any durable change (ledger size, anchored slot, learned username), not just ledger growth — a pinned slot with an empty ledger previously wasn't persisted across broadcast restarts.

Still open pending a Debug export from a new-build test: why only ~7 of 53 board cells parsed on the slow-draft board (my-picks 2/4).

## Iteration 4 — board-cell cross-column contamination (2026-07-14, debug.txt export)

The first Debug export from a `task328.2` build answered the open question and confirmed several fixes working on device (self-guard classified our expanded activity as `self`; BBE's own screens inert; slot 9/P54/countdown all correct; availability marked 35 gone). The remaining defect was conclusive: OCR read the user's board column perfectly (`Jonathan / Taylor / RB - IND (1.9)`) yet the ledger recorded **Spencer Brown at #9 and Isaiah Williams at #33** — the y-sorted line order interleaves side-by-side board columns, so a cell's meta line grabbed the neighboring column's name fragments and the fuzzy matcher found someone who fit the mangled name. Same defect class as the carousel pairing (iteration 1), now fixed for board cells: with bounding boxes, name fragments are associated geometrically (same column within ±0.10 x-center, ≤0.07 above the meta line); the sequential gather remains the boxless fallback. Also: `usernameSlots`/`tallies` now ride serialize/hydrate (they were extension-only, blinding the app-side export), and `ENGINE_VERSION` bumped to `task328.3`. Regression: a boxed two-column board fixture reproducing the exact interleave.

## Dependencies
None

## Open Questions
1. **Username auto-learn + optional manual setting** (Step 3) — confirms zero-config, but is a manual username field in the confidence hub wanted in v1, or auto-learn only?
2. **Replay harness OCR engine** — Windows.Media.Ocr is the proposed dev-only stress source; if its dark-UI accuracy is unusable, fallback is hand-curated keyframe fixtures (noted in Verification Approach). Acceptable?
3. **ADR** — the evidence-hierarchy change (username anchor > manual > ticker; event ledger alongside board cells) refines ADR-021's engine design. Recommend a short ADR documenting the hierarchy after plan approval. Proceed with drafting it?

---
*Approved by: PH, 2026-07-14*
