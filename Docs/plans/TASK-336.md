# TASK-336: Live draft: no-board mid-draft resume, room presence + reset flow, 6-target Live Activity

**Status:** Approved
**Priority:** P2

## Decision

- **Question:** Where should the Live Activity push decision live?
- **Chosen:** Keep the gate in Swift (FrameProcessor) — add the debounced
  targets-changed trigger there. The JS-relocation alternative was declined.
- **Decided by:** developer
- **Date:** 2026-07-16

- **Question:** How should "left the draft room" be surfaced?
- **Chosen:** Pushed Live Activity `away`/`waiting` state only — no system banner
  notification.
- **Decided by:** developer
- **Date:** 2026-07-16

---

## Objective

Make the live draft assistant seamless for slow drafts: joining a draft already in
progress needs only a glance at the user's roster plus a players-tab scroll (no full
board scan), with the Live Activity updating to match; the session clearly knows when
the user is inside vs outside a draft room, surfaces waiting/away states on the Live
Activity, and offers a reset-for-next-draft flow for back-to-back slow drafts; and the
Live Activity is redesigned to show six targets in two columns with exposure,
stack-correlation, and playoff-stack context per player.

## Root-Cause Evidence (from frames-1784198568.jsonl, 2026-07-16 session)

Replaying the recorded session through the engine (`scripts/replay-frames.mjs`) shows
the engine itself derives the right state — currentPick 89, slot 9 anchored from
BIRDENTHUSIAST's card, 21 ledger picks, 89 players inferred gone, correct top targets
(Rico Dowdle / Jordan Addison / Josh Downs). Two independent defects explain what the
user saw:

1. **Frozen Live Activity targets ("it just keeps Jahmyr Gibbs").** The `--push-sim`
   replay shows exactly 2 pushes: frame 0 (session start) and frame 7 (a board glance
   that ratcheted currentPick 1→89 — a `newPick` trigger). At frame 7 only 21 board
   picks were known and zero availability inference had run, so the pushed targets were
   near-top-of-pool names (Gibbs tier). Frames 12–30 (players tab) marked 89 players
   gone and changed the targets (`changed=true`), but the ADR-024 push gate requires
   `significant || newPick` — availability-only target changes **never push**, so the
   card stayed frozen on stale targets for the rest of the session.

2. **Roster panel picks never reach the ledger.** `underdogParser.js` classifies the
   roster panel (`kind='roster'`, via the "57 / Pick" labels) and correctly refuses to
   let its rows feed availability — but it never *harvests* the (pick-number, player)
   pairs either. Only board cells and confirm cards append to the ledger. In a pure
   roster-scan flow (no board glance) `myPicks` stays empty: roster bar reads zeros and
   stack/playoff flags have nothing to correlate against. In the recorded session this
   was masked by the frame-7 board glance.

## Verification Criteria

1. **Mid-draft resume without a board scan:** replaying the 2026-07-16 recording with
   board frames excluded still yields the user's 7 picks (from the roster panel alone),
   ~89 players inferred gone, and a Live Activity push *after* the players-tab scan
   whose targets are the corrected tier (Rico Dowdle et al., not Jahmyr Gibbs). On a
   real slow draft, entering an existing room, tapping your username to view your
   roster, then scrolling the players tab once updates the Live Activity to correct
   targets within ~15 seconds.
2. **Room presence + reset:** leaving the draft room flips the Live Activity to a
   pushed "away/waiting" state (and re-entering flips it back); when state has
   accumulated, the app panel offers "Reset for next draft", which clears the board
   state (keeping pool, rankings, exposures, username) so the very next room starts
   clean — supporting enter → pick → leave → reset → enter repeatedly without ending
   the broadcast.
3. **Six-target Live Activity:** the lock-screen card and expanded Dynamic Island show
   6 targets in a two-column grid — position, last name, exposure %, and S / P / Q / F
   flags (stack, playoff-stack, queue-risk, falling) — legible on device with no
   truncation or clipping.

## Verification Approach

Automated (all from `mobile-app/`, no device needed):

- `node scripts/replay-frames.mjs docs/debug_screenshots/frames-1784198568.jsonl --pool
  <latest UD ADP csv> --username BIRDENTHUSIAST --drop-kind board` (new flag) — final
  status shows `myPicks` length 7 and `inferredGone` ≥ 80; glance targets contain no
  player with ADP < 60.
- Same command with `--push-sim`: output shows ≥ 1 push at t ≥ 1784198590 (after the
  availability scan) whose targets differ from the frame-7 push; total pushes for the
  33-frame session stay ≤ 6 (debounce holding).
- Replay timeline prints presence transitions: `out` during frames 0–6 (BBE app),
  `in` from frame 7, with no flapping during the players/roster frames.
- New/updated fixture assertions in `scripts/test-draft-replay.mjs` (or a sibling node
  test) covering: roster-panel pick harvest, presence state machine (in→out needs
  sustained evidence; single garbled frame does not flip it), reset() clearing
  board state but keeping pool/maps/username, and 6-target glance format
  (`POS·LastName·EXP·FLAGS`, last-name collision fallback to initial+surname).
- `npm run build:engine` succeeds; `ENGINE_BUILD` bumped; engine.js size delta noted
  (playoff schedule JSON rides in — expect a few KB).
- `npx eslint src/draft scripts` (or project lint equivalent) passes on changed files.

Manual (requires the developer — device + EAS build; native Swift changed in both the
broadcast and widget extensions, so this needs a full EAS build, not just Metro):

1. Real slow draft, mid-draft join: start session, enter the existing room, tap your
   username → roster view, back to players tab, one scroll. Confirm the Live Activity
   shows the corrected 6 targets within ~15 s and the roster bar shows your real
   position counts.
2. Leave the room to the UD lobby/home. Confirm the Live Activity flips to the
   away/waiting state within ~15 s (including when sitting on a static screen — the
   duplicate-frame tick path). Confirm the app panel shows the presence indicator and
   the "Reset for next draft" action; reset, enter a different room, and confirm the
   board state is fresh (no carry-over picks/gone marks) while username/rankings/
   exposures persist.
3. Visual pass on the redesigned card: lock screen + expanded Dynamic Island, light and
   dark wallpaper, 6 targets, flags legible, no clipped rows.

## Files to Change

| File | Action | Description |
|------|--------|-------------|
| `mobile-app/src/draft/underdogParser.js` | Modify | Harvest roster-panel (overall, player) pairs as ledger-grade `rosterPicks`; no availability side-effects (existing guard stays) |
| `mobile-app/src/draft/sessionEngine.js` | Modify | Ingest `rosterPicks`; room-presence state machine with hysteresis + time-based out detection; `reset()`; glance: `waiting`/`away` phases, 6 compact targets with exposure + S/P/Q/F flags, playoff-stack via `analyzeCandidatePlayoffStack` |
| `mobile-app/src/draft/extensionEngine.entry.js` | Modify | Presence transitions ride `significant`; `tick()` entry point for frame-quiet periods; ENGINE_BUILD/VERSION bump |
| `mobile-app/targets/draft-broadcast/FrameProcessor.swift` | Modify | Third push trigger: targets-changed with 15 s debounce (gate stays in Swift per decision); call `tick()` when frames go quiet; config-epoch check in `stillActive()` → engine re-init on reset (clears push state) |
| `mobile-app/targets/draft-glance/index.swift` | Modify | Two-column 6-target grid (lock screen + expanded island), new compact target format parsing, waiting/away phase styling; ContentState struct unchanged |
| `mobile-app/src/draft/sessionController.js` | Modify | `resetDraftBoard()` (fresh engine session, configEpoch bump, clear RESULT_KEY/lastAbsorbedRaw); drop stale-epoch extension results; expose presence in snapshot |
| `mobile-app/src/screens/LiveSessionPanel.jsx` | Modify | Presence indicator ("In draft room" / "Not in a draft room") + "Reset for next draft" action when away with accumulated state |
| `mobile-app/scripts/replay-frames.mjs` | Modify | `--drop-kind <kind>` filter; print presence transitions; push-sim prints pushed targets |
| `mobile-app/scripts/test-draft-replay.mjs` | Modify | Regression assertions listed under Verification Approach |
| `mobile-app/targets/draft-broadcast/assets/engine.js` | Regenerate | `npm run build:engine` output (bundles playoff schedule) |
| `mobile-app/docs/` (LIVE_SESSION / architecture notes) | Modify | Document presence states, reset flow, new card layout |

## Implementation Approach

### Workstream A — mid-draft resume via roster + players tab only

1. **Parser: roster-panel pick harvest.** When `obs.rosterPanel` is true, pair each
   pick-number line with its adjacent "Pick" label (the existing `rosterPickLabel`
   pattern) and geometrically associate the nearest matched player row (same technique
   as board-cell name association). Emit `obs.rosterPicks: [{ overall, player, score,
   raw }]`. Overall numbers are absolute, so entries are slot-agnostic ledger evidence —
   they are valid whether the panel shows the user's roster or an opponent's (the
   ledger is keyed by overall; `myPicks()` already derives per-slot). Guard: overall
   must be ≤ teams × rounds and consistent with `slotForOverall` being a single slot
   across the panel's rows (a mixed-slot panel is a misread — drop the frame's harvest).
2. **Engine: ingest rosterPicks** exactly like `boardPicks` (idempotent, score-gated
   appends), including the same ratchet contribution (max(overall)+1). Availability
   guard stays: roster rows never clear inferred-gone.
3. **Push policy: availability-driven target changes must eventually push.**
   (Per the recorded decision, the gate stays in Swift.) FrameProcessor tracks
   `lastPushedTargets` alongside `lastPushedPick`; the gate becomes
   `significant || (newPick && now−lastPush ≥ 3 s) || (targetsDiffer && now−lastPush
   ≥ 15 s)`, where `targetsDiffer` compares the glance's `targets` array against the
   last *pushed* targets — so a players-tab scroll burst coalesces into one corrected
   push. On config-epoch re-init (reset flow), `lastPushedPick` / `lastPushedTargets` /
   `lastPushAt` are cleared — otherwise a prior draft's pick 89 would suppress every
   newPick push in the next draft until pick 90. `--push-sim` in the replay harness
   mirrors the extended gate so the policy stays verifiable offline. ADR-024's policy
   description gets a matching amendment note via hus-adr when this lands.

### Workstream B — room presence + reset for back-to-back slow drafts

4. **Presence state machine (engine).** Classify each observation: in-room evidence =
   kinds `board/players/queue/roster/detail/header/lobby` (or a confirm card); out
   evidence = `unknown`; neutral = `self` (our own Live Activity can overlay any
   screen). Flip in→out only on sustained evidence: ≥ 2 consecutive out frames OR one
   out frame followed by ≥ 10 s without in-room evidence. Flip out→in on a single
   in-room frame. `ingest(obs, nowMs)` gains an explicit timestamp (entry passes
   `Date.now()`, replay passes the recorded `t`) so the machine is replay-testable.
5. **Frame-quiet tick.** The duplicate-frame gate suppresses ingest on static screens
   (e.g. sitting on UD home), which would freeze presence. FrameProcessor calls a new
   `BBEEngine.tick(nowSec)` when > 10 s pass without an ingest; tick only advances the
   presence timeout and returns a normal result (so an away transition can push).
6. **Glance phases.** Capture live but never in a room yet → phase `waiting`, headline
   "Waiting to enter draft". Was in a room, now out, state accumulated → phase `away`,
   headline "Left draft room — R{r} · P{p} held". Presence transitions count as
   `significant` → immediate push (this is the "left the room" notification; a system
   banner notification is out of scope for v1 — see Open Questions). Re-entering
   resumes the normal tracking phases.
7. **Reset flow.** `sessionController.resetDraftBoard()`: rebuild the engine session
   from `baseConfig` (keep poolRows, rankMap, exposureMap, username; clear manual +
   anchored slot, ledger, inferredGone, queue, currentPick, observedStartPick), bump a
   `configEpoch` field written into `bbe.sessionConfig`, clear `RESULT_KEY` and
   `lastAbsorbedRaw`, push a fresh `waiting` glance. FrameProcessor's `stillActive()`
   already re-reads the config every frame — extend it to compare the epoch and re-init
   the engine when it changes (JS-side push state resets naturally with init). Results
   carry the epoch; the controller drops results from a stale epoch so a pre-reset
   snapshot can't re-pollute the fresh session.
8. **Panel UI.** Presence chip in `LiveSessionPanel` (In draft room / Not in a draft
   room / Waiting to enter draft) fed from the snapshot; when `away` and
   `ledgerSize + inferredGone > 0`, show "Reset for next draft" with a confirm step.

### Workstream C — six-target Live Activity redesign

9. **Payload format (ContentState unchanged).** Keep `targets: [String]` so the
   ActivityKit attribute type is untouched in both Swift copies (no struct sync risk,
   no BBEDraftNativeModule change). New compact per-target format:
   `POS·LastName·EXP·FLAGS` (e.g. `WR·Olave·23·SP`). Last name derived by stripping
   generational suffixes (Jr/Sr/II–IV) and taking the final token; if two targets
   collide on last name, fall back to `F.Surname`. EXP = rounded global exposure %
   (empty when unknown). FLAGS ⊆ {S, P, Q, F}: S = meaningful same-team stack with a
   current pick (QB involved, existing rule), P = playoff-stack candidate via
   `analyzeCandidatePlayoffStack({candidateTeam, candidatePos, currentPicks: myPicks,
   schedule})` from `shared/utils/playoffStacks.js` with
   `shared/data/playoff-schedule-2026.json` bundled into both the app path and the
   engine bundle, Q = queued and at risk (existing QUEUE RISK rule), F = falling
   (existing rule). `getGlance()` emits 6 targets (from `availablePlayers(12)`).
   Payload stays far under ActivityKit's 4 KB content-state limit.
10. **Swift rendering.** Lock screen: replace the 3-row target list with a 3×2 grid
    (two columns), each cell: position tag (colored, ~9 pt heavy) + last name (~12 pt
    semibold, `lineLimit(1)`, `minimumScaleFactor`) + exposure (~9 pt muted) + flag
    glyphs (~9 pt heavy; Q/risk in alert red, others in accent gold). Roster bar and
    header rows unchanged; total height stays within the ~160 pt Live Activity budget
    (current layout uses ~117 pt; the grid keeps 3 rows). Expanded Dynamic Island
    bottom region gets the same grid. `waiting`/`away` phases render a muted headline
    and hide the target grid (nothing useful to show), keeping the roster bar in
    `away` so held state is visible.
11. **Engine bundle.** `npm run build:engine` after entry changes (verify esbuild
    handles the JSON import — add loader config in `build-extension-engine.mjs` if
    not); bump `ENGINE_VERSION` (e.g. `task336.1`) and `ENGINE_BUILD` (+1) per ADR-023.

Sequencing: A3 (push policy) and B (presence) both touch the entry/FrameProcessor —
implement together; A1–A2 (roster harvest) is independent and first (it unblocks the
no-board acceptance test); C last (pure presentation once the glance payload is right).
One EAS build at the end covers all native changes; everything JS-side iterates over
Metro + hot-load during development.

## Dependencies

- Builds on the `task-331-live-capture-wip` branch (frame recorder + replay harness are
  the verification backbone). TASK-331/TASK-333/TASK-335 code is present on this branch;
  their rows are still In Progress — coordinate closure/commits so this task's diff
  stays reviewable.
- ADR-024 gets a small amendment note (extended trigger set: targets-changed debounce +
  presence transitions) via hus-adr when A3/B land — the gate's Swift location is
  unchanged per the recorded decision.
- Manual verification needs a real Underdog slow draft and an EAS build on the
  developer's iPhone.

## Open Questions

1. ~~Push verdict location~~ — resolved (see Decision): stays in Swift.
2. ~~Room-exit notification surface~~ — resolved (see Decision): Live Activity only.
3. **Interactive reset from the Live Activity** (App Intents button on the card) —
   deferred; reset lives in the app panel for v1. Candidate follow-up task.

## Handoff Notes

- Tried: full implementation of all three workstreams (2026-07-16 session).
- Result: complete and green on every automated check — `npm run test:draft` runs
  build:engine + parser fixtures + TASK-328 fast-draft replay + the new
  `test-slow-draft-replay.mjs` (no-board resume, presence machine, glance format,
  push-policy mirror) and all pass. ADR-025 recorded (supersedes ADR-024).
  Engine bundle 53.9 KB → 62.8 KB (ENGINE_BUILD 2, `task336.1`).
  `docs/debug_screenshots/frames-1784198568.jsonl` is now a test corpus — commit it.
- Blocker: none — awaiting on-device manual verification (needs an EAS build; both
  Swift extension targets changed, Metro alone is not enough).
- Next step: EAS build, then the three manual checks in Verification Approach
  (mid-draft join, leave/reset/re-enter, visual pass on the 6-target card).

---
*Approved by: developer (AskUserQuestion), 2026-07-16*
