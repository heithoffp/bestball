# Live Draft Session — iOS Underdog assistant "overlay"

Status: implemented 2026-07-13; **live capture proven end-to-end on device and
made the sole capture path 2026-07-14 (TASK-327)**. This doc doubles as the
as-built record.

> **2026-07-14 (TASK-327):** live capture is now the *only* capture path. The
> screenshot (Photos-sweep) fallback and the Shortcuts/deep-link OCR route were
> removed — along with the `expo-media-library` dependency and Photos
> permission — once live capture was confirmed working on device. The "v1
> Screenshots" section below is retained for historical context only; those
> pieces (`screenshotSync.js`, `app/draft-ocr.jsx`, `syncNow`, `ingestOcrText`)
> no longer exist. `demoSync` (fixture replay) and the pure parse engine remain.
>
> **Mid-draft resume detection** was added the same day: the engine records the
> draft position at first capture (`observedStartPick`) and exposes
> `picksAtStart` / `isResume` (resume = more than one full round already
> drafted). Because board picks are ingested idempotently by overall pick
> number, joining an in-progress slow draft backfills the whole ledger on the
> first board frame; the panel then shows a "Resumed mid-draft — N picks already
> on the board" banner. The flag round-trips through the App Group handoff.

Built for the developer's device (iPhone 15, iOS 26.5) — no ScreenCaptureKit
(iOS 27 beta only, spike Q3 unanswered on iOS).

## What v1 is

You start a **Live Session** from the Draft Assistant tab, switch to Underdog and
draft. A **Live Activity** (lock screen + Dynamic Island) shows your draft state the
whole time. To sync, take a **screenshot** of the draft room (any tab — Players,
Board, or Queue) and flip briefly back to BBE: the app reads new screenshots from
Photos, OCRs them on-device with Vision, parses them into the pick ledger, updates
the Draft Assistant screen (via the existing `draftFeed` seam), and refreshes the
Live Activity — then you flip back to Underdog. The Activity persists between syncs
showing last-known state plus a live "synced Xm ago" timestamp.

This is the ADR-021 architecture with a **manual shutter** instead of a continuous
frame stream: same parse engine, same ledger, same DraftState contract. When a
continuous FrameSource lands (post-spike), it feeds the identical pipeline.

- Slow drafts (hour clocks): UD notifies you're up → screenshot → hop → pick. Fully
  usable.
- Fast drafts (30 s clocks): sync every couple of picks; the Activity's
  picks-until-turn stays correct between syncs only if no picks happen — v1
  limitation, stated in the UI ("as of last sync").

## The pipeline

```
Screenshot(s) in Photos
  → screenshotSync.js   expo-media-library sweep (session-scoped, screenshots only)
  → BBEDraftNative.recognizeText(uri)   Vision OCR, on-device, boxes + confidence
  → underdogParser.js   classify screen (players|board|queue) + extract observations
  → playerMatcher.js    canonicalName + fuzzy match vs the UD ADP player pool
  → sessionEngine.js    merge into monotonic pick ledger; snake math; derive
                        DraftState {currentPick, currentRound, draftSlot,
                        availablePlayers, myPicks} + glance payload
  → draftFeed.publishDraftState()  → DraftAssistantView goes LIVE
  → liveActivity.js → BBEDraftNative.updateDraftActivity() → lock screen / island
```

An alternate ingestion path takes pre-extracted OCR **text** (no boxes): deep link
`bbexposures:///draft-ocr?t=<url-encoded text>` (triple slash — empty host so
expo-router sees the path), aimed at an iOS Shortcut
(Take Screenshot → Extract Text from Image → Open URL). It exists both as a
Shortcuts-based flow that skips Photos entirely and as the test harness path —
the parser accepts box-less line sequences, which is exactly the artifact format
in `docs/task-318 artifacts/`.

## What the parser reads (fixture-derived, from the 4 shared screenshots)

Header (visible on every tab):
- `UP IN N PICKS` → picks-until-turn. `YOUR PICK` / `Your pick: 0:19` /
  on-the-clock variants → 0 (header zone only — the Board also renders
  "On the clock" inside the current pick's cell for *whoever* is picking;
  the plural is rejected because the UD home screen's tagline "Your players.
  Your picks." sits in the header zone and read as a false on-the-clock,
  frames-1784120786). `UP NEXT` → 1. `Drafting starts soon` /
  `Draft starts in M:SS` → lobby.
- Drafter cards: `3.8 | 32` = round.pickInRound | overall pick, for upcoming
  drafters; the on-clock drafter shows a timer (`1hr`, `59:50`, `0:14`) instead.
  In slow drafts, cards whose pick already happened keep their label and show
  the drafted player as an abbreviated `F. Surname` line beneath it — those
  abbreviated forms are never row candidates (they resurrected just-drafted
  players into the targets, frames-1784120786) but are a future ledger source
  (TASK-330/332).
  OCR noise like `310 | 34` (dropped dot), `1.717` (pipe merged into digits),
  and `2.7` + `19` (split fragments) is solved using the overall as ground
  truth ((r−1)·teams + p == overall). Card fragments are paired geometrically
  (x-centers aligned, label below username) when boxes exist — the y-sorted
  line order interleaves side-by-side cards.
- Slot: **anchored from the user's own drafter card** (TASK-328) — username
  match → card label overall → snake math → slot, knowable in the lobby before
  pick one. The username is configured, remembered from a prior draft, or
  auto-learned (lobby: the only named card among "Filled" seats; in-draft: the
  on-clock card while the header reads "Your pick"). Truncated edge-clipped
  fragments ("BIRD…") never anchor; re-pinning an established anchor takes 3
  consecutive contradicting reads. Precedence: manual > anchored > legacy
  ticker inference (myNextOverall = currentPick + N → slot), which remains the
  unanchored fallback. Manual-vs-evidence conflicts surface in the panel.
- Current pick, in evidence order: board-grade ledger max + 1; carousel
  min(visible upcoming) − 1 — only while the on-clock card is visible (proves
  the carousel is auto-tracking; a hand-scrolled carousel says nothing) and
  treated as an upper bound; with an anchored slot the ticker is exact:
  currentPick = (my rung overall) − N, rung chosen near the position estimate
  with a small backward tolerance so an inflated carousel bound can't skip a
  snake round.

Players tab: ordered rows of name / `WR13` pos-rank pill / `NO, Bye 8` team line.
Names are matched against the pool; the top visible player's ADP lets us infer
"everyone with meaningfully lower ADP who isn't visible is drafted" (only applied
to positions present in the visible list, since position filters are invisible to
OCR). Raw Vision text decouples the ADP/Proj number columns from rows, so row
association uses the name sequence, not the numbers.

Board tab: cells like `Jahmyr / Gibbs / RB - DET (1.1)` → exact ledger appends
(overall = (r−1)·teams + pickInRound), idempotent by pick number. This is the
highest-fidelity source; my picks fall out of ledger ∩ my snake overalls.

Queue tab: queued player names → "queue risk" flag when a queued player's ADP is
ahead of your next pick.

OCR-noise handled by the matcher (all present in the fixture): `Je Von Achane` →
De'Von Achane, `Amon-Ra st. Brown`, `VR`/`:B` position garbling, `J LAR`/`] CIN`
team prefixes, split names across lines, `3.10` → `310`.

### Fast drafts: event capture from the pick-confirmation card (TASK-328)

In a 30s fast draft the Board tab is rarely opened, so board cells alone leave
the ledger (and my-picks) empty. Every completed pick also injects a
confirmation card at the carousel's left edge — position badge first, then
`TEAM / F. Lastname` (`ATL / D. London`, often OCR-split into `ATL` +
`D. London`). The engine attributes a *newly seen* card (deduped on raw text)
to overall = currentPick − 1 when the same frame carries a fresh position read,
matches the abbreviated name against the pool (first initial + surname + team
hint), and appends at score 0.6 with `src: 'event'` — board cells (≥0.74)
overwrite, and event entries never feed the ledger-max pick ratchet (they
derive from currentPick, so feeding back would compound any error). A pick
whose card name never renders in a captured frame is simply missed until board
evidence fills it; a "fall" of 30+ picks past ADP is rejected as misattribution.
The `Your pick` → `UP IN N` header transition marks the landed pick as the
user's (`myPickLanded` significance for push pacing).

Carousel cards also carry each drafter's `QB RB WR TE` roster tally and
username → slot mapping (`opponentTallies` / `usernameSlots` in status) — the
raw material for a future other-rosters surface.

Availability inference no longer ratchets the current pick (ADP is not a pick
number, and a slightly-scrolled list inflates the top-ADP read); it also only
applies when the top visible ADP is plausibly at the list top
(≤ currentPick + 12).

Regression: `npm run test:draft` (fixtures incl. the hand-transcribed fast-draft
screens in `underdogFastDraftFixture.js`), plus a full-recording replay —
`node scripts/test-draft-replay.mjs` over `docs/task-328-evidence/frames-ocr.jsonl`
(Windows OCR of the 366-frame fast-draft recording; regenerate with
`scripts/ocr-frames.ps1`). The replay asserts slot anchoring, my-pick capture,
exact final position, and ≥98% agreement between the derived countdown and
every legible header (291/291 at check-in).

## Live Activity content (the "useful information")

ContentState (flat, small, local-update only):
- `phase`: armed | waiting | tracking | onDeck | onClock | away | done
  (TASK-336: `waiting` = capture live, no draft room seen yet; `away` = left
  the room with board state held)
- `picksUntil`, `currentPick`, `round`, `myNextPick`
- `headline` ("Up in 2 picks", "You're on the clock!", "Waiting to enter
  draft", "Left draft room — R8 · P89 held")
- `targets[]` (TASK-336): top-6 available at your pick by **your UD custom
  rankings** (fallback ADP), compact-encoded `POS·LastName·EXP·FLAGS`
  (e.g. `WR·Olave·23·SP`) — exposure % plus flag glyphs S (stack with a
  current pick, QB involved), P (W15/16/17 playoff game stack vs a current
  pick), Q (queued + ADP risk before your next pick), F (falling past ADP).
  Empty outside the tracking phases. Last-name collisions render `F.Surname`.
- `rosterBar`: "QB 0 · RB 2 · WR 0 · TE 0"
- `syncedAtEpoch` → rendered as a self-ticking relative time (no updates needed)

Surfaces: lock screen card (headline + 3×2 two-column target grid, column-major
so ranks 1–3 fill the left column + roster bar + synced-ago); Dynamic Island
compact leading `⏳N` / trailing `P31`; minimal `N`; expanded = lock-screen
content. Tap → deep link `bbexposures:///draft?view=assistant`.

## Room presence + reset-for-next-draft (TASK-336)

The engine classifies every frame as in-room evidence (board / players /
queue / roster / detail / header / lobby kinds, or a confirm card), out
evidence (`unknown` — UD home, other apps, the BBE app itself), or neutral
(`self`, our own expanded Live Activity). Hysteresis: entering flips on one
in-room frame; leaving needs two consecutive out frames OR one out frame plus
10 s without in-room evidence (`BBEEngine.tick`, called by FrameProcessor when
the duplicate gate has kept frames quiet ≥ 10 s, covers screens left static).
Presence transitions ride `significant` → pushed immediately; that push IS the
"left the draft room" notification.

The roster panel is also a ledger source now: each row's absolute overall
("57 / Pick" right rail) pairs geometrically with its player row, so a
mid-draft join needs only a glance at your roster + one players-tab scroll —
no full board scan. A mixed-slot harvest (misread number) is dropped whole.

Back-to-back slow drafts: when the panel shows "Left the draft room — board
state held", the **Reset** action (`sessionController.resetDraftBoard()`)
rebuilds the session keeping pool/rankings/exposures/username, clears
ledger/availability/slot/pick position, rewrites `bbe.sessionConfig`, and bumps
`bbe.configEpoch`. FrameProcessor re-reads the epoch every frame and re-inits
its engine (and its push bookkeeping) without ending the broadcast; results
echo the epoch so the app drops any pre-reset snapshot.

Push policy (ADR-024, triggers extended by TASK-336): priority-10 on
`significant` (crunch / my pick / presence — no floor), a newly-detected pick
(3 s floor), or a changed target list (15 s floor — availability inference
reshapes targets without advancing the pick; before this trigger the card
froze on stale top-of-pool names for entire mid-draft resumes,
frames-1784198568).

## Native surface (all new, kept thin per DEVELOPMENT_NOTES)

- `modules/bbe-draft-native/` — local Expo module `BBEDraftNative` (Swift):
  `startDraftActivity/updateDraftActivity/endDraftActivity` (ActivityKit, iOS 16.2+
  guarded, JSON-string payloads decoded with Codable), `areActivitiesEnabled`,
  `recognizeText(uri)` (Vision `.accurate`, language correction off, returns text +
  normalized top-left-origin boxes + confidence).
- `targets/draft-glance/` — WidgetKit extension (via `@bacons/apple-targets`)
  holding the ActivityConfiguration SwiftUI. `DraftActivityAttributes` is duplicated
  verbatim in both targets (standard ActivityKit pattern).
- app.json: `NSSupportsLiveActivities(FrequentUpdates)`, expo-media-library photos
  permission, `@bacons/apple-targets` plugin, EAS `appExtensions` signing hint.

Everything is lazily required in JS — the app still boots in Expo Go / web where
the module is absent (`liveActivity.js` no-ops and the panel says so).

## JS module map

| File | Role |
|------|------|
| `src/draft/snake.js` | pure snake-draft math (overall↔round/slot, my picks) |
| `src/draft/playerMatcher.js` | pool build + canonical/fuzzy name matching |
| `src/draft/underdogParser.js` | OCR lines/boxes → screen observations |
| `src/draft/sessionEngine.js` | ledger + merge + DraftState + glance payload + resume detection (pure) |
| `src/draft/liveActivity.js` | lazy native wrapper (no-op off device) |
| `src/draft/sessionController.js` | singleton glue: App Group handoff → extension state absorption on foreground → publish + activity update |
| `src/screens/LiveSessionPanel.jsx` | start/stop UI, capture chip, status, sync log, slot confirm, resume banner, preflight modal |
| `scripts/test-draft-parser.mjs` | Node regression test against the OCR fixture |

(`src/draft/screenshotSync.js` and `app/draft-ocr.jsx` were removed in TASK-327 — see the status note at the top.)

Pure modules (`snake/playerMatcher/underdogParser/sessionEngine`) import nothing
from React Native so the Node fixture test can run them directly.

## Testing performed on Windows (no device available to Claude)

1. `node scripts/test-draft-parser.mjs` — fixture assertions: picksUntil=2, current
   pick 31, slot inference → 9, board picks matched (incl. noisy names), players-tab
   availability top = Chris Olave, queue parse, DraftState + glance shape.
2. `npx expo export --platform ios` — full JS bundle graph compiles.
3. `npx expo prebuild --platform ios` — config plugins execute; generated pbxproj
   inspected for the DraftGlance target + module pod; `ios/` then deleted (managed
   workflow stays managed).

Swift compiles only on EAS — the first device build is the real gate (same posture
as every native change from Windows, ADR-022).

## Developer test loop

```bash
cd mobile-app
npm install
npm run build:data        # refresh bundled ADP before any EAS build
npm run eas:dev           # or eas:preview for standalone
```

On device: Draft tab → Draft Assistant → Live Session card → Start session →
allow Photos ("All Photos") when asked → switch to Underdog draft → screenshot →
flip to BBE → watch the toast/Activity → flip back. "Demo sync" on the panel replays
the bundled fixture through the whole pipeline (including the Live Activity) without
needing a real draft.

---

# v1.1 — Live capture (ReplayKit broadcast, hands-free)

The seamless mode: start the session, tap the record button once (system
broadcast picker, preselected to **BBE Draft Capture**), switch to Underdog and
just draft. No screenshots, no app hops. This is ADR-020's fallback topology
promoted to the working v1 path because the test device is on iOS 26 (the
"primary" ScreenCaptureKit path needs iOS 27 — see the SCK plan below).

## Topology

```
Underdog on screen
  → ReplayKit broadcast extension (targets/draft-broadcast/, separate process)
      SampleHandler (thin ReplayKit shell)
      FrameProcessor (capture-agnostic core):
        1 fps gate + 24×24 luma frame-diff (clock ticks don't wake the OCR)
        → downscale 0.6 (0.4 + .fast Vision under memory pressure,
          os_proc_available_memory guard for the ~50 MB jetsam limit)
        → Vision OCR
        → THE SAME JS ENGINE, bundled by esbuild into assets/engine.js and run
          in JavaScriptCore — no Swift port, guaranteed parity with the app.
          Prefers the app's hot-loaded engine from the App Group when newer
          (ADR-023), else this bundled asset
        → ledger/glance; App Group handoff (bbe.extensionResult/Heartbeat)
        → on detected pick / significant event: POST glance →
          live-activity-relay Edge Function → APNs
          (apns-push-type: liveactivity) → lock screen / Dynamic Island
  BBE app (suspended while drafting):
      on foreground: hydrate serialized engine state from the App Group →
      assistant screen catches up instantly; heartbeat poll drives the
      CAPTURING / NO CAPTURE chip in the panel.
```

- ActivityKit is unreachable from extensions — the push relay is the only
  update path while backgrounded (ADR-020). Locally-computed updates still
  happen whenever the app is foregrounded.
- Push policy — event-driven (ADR-024): a **priority-10** push on each detected
  pick (`currentPick` advances, which happens only from board/ticker/carousel
  evidence — never OCR availability) or on a "significant" transition (entering
  ≤3-away / on deck / on clock, your pick landing). A 3 s floor coalesces
  autopick bursts into one newest-state push; a "significant" event bypasses the
  floor so on-clock is never delayed. Nothing advanced → no push, so an idle
  slow draft costs zero ActivityKit budget and the card's "synced Ns ago" line
  self-ticks in SwiftUI. **Priority 5 is not used** — iOS delivers it
  "opportunistically" (deferred), which froze the card whenever you were more
  than a few picks from your turn (the bug ADR-024 fixes). This p10-only policy
  relies on `NSSupportsLiveActivitiesFrequentUpdates` (`app.json`) for the higher
  p10 budget a full fast draft (~216 pushes) needs. Frames of non-Underdog apps
  parse to kind "unknown" and produce no change — nothing is pushed while you
  check Messages. Offline-checkable via `node scripts/replay-frames.mjs <frames>
  --pool <adp.csv> --push-sim`.
- Session handoff: app writes `bbe.sessionConfig` (pool, slot, rankings,
  exposure, push token, relay URL, serialized engine state) to the App Group
  (`group.com.bestballexposures.app`); ending the session clears it, which the
  extension notices and self-terminates the broadcast.
- Engine hot-load (ADR-023): at session start the app also writes its current
  parse engine — `engine-hotload.js` (the `ENGINE_SOURCE` string from
  `src/draft/generated/engineSource.js`, generated by `npm run build:engine`)
  plus `bbe.engineBuild`/`bbe.engineVersion`. `FrameProcessor.setUp` adopts it
  over the bundled asset only when `ENGINE_BUILD` is strictly higher AND it
  passes a sanity-eval (a well-formed `globalThis.BBEEngine` with a matching
  integer `build`, a `version` string, and a callable `init`); any failure
  falls back to the bundled engine, the always-safe floor. Because the engine
  text rides the app's JS bundle, parser fixes reach the extension via a JS
  reload with no EAS rebuild — **bump `ENGINE_BUILD` (and `ENGINE_VERSION`)**
  in `extensionEngine.entry.js` on every engine change so the extension knows
  the App Group copy is newer.
- Privacy invariants hold (ADR-019): frames never leave the extension process;
  only the derived glance ContentState (player names, pick numbers) transits
  the relay, addressed by the user's own activity push token.

## One-time developer setup — APNs key (required for background pushes)

Without this, live capture still works but the Live Activity only refreshes
when BBE is foregrounded (the panel warns "No push token / relay").

1. [Apple Developer portal](https://developer.apple.com/account) →
   Certificates, IDs & Profiles → **Keys** → add a key with **APNs** enabled →
   download the `.p8` (one-time download) and note the 10-char Key ID.
2. `supabase secrets set APNS_AUTH_KEY="$(cat AuthKey_XXXXXXXXXX.p8)" APNS_KEY_ID=XXXXXXXXXX`
   (team id defaults to WNGNQ89YJ2, bundle id to com.bestballexposures.app).
3. `supabase functions deploy live-activity-relay` (manual deploy per project
   convention; config.toml sets verify_jwt=false — see the function header for
   the token-capability security model).

The relay tries the APNs production host first and falls back to sandbox on
BadDeviceToken, so dev builds (sandbox push environment) and TestFlight/App
Store builds (production) both work with no client flag.

## ScreenCaptureKit plan (iOS 27 — keep ReplayKit, add SCK later)

ADR-020 still stands: SCK is the eventual primary. What changes and when:

- **Enrolled developers can run iOS 27 betas today**, but don't put the primary
  test iPhone on a beta mid-draft-season; SCK code also only compiles against
  the iOS 27 SDK, so EAS must offer an Xcode 27 beta image first.
- When both exist, answer spike Q3 (TASK-318): does an in-app `SCStream`
  keep delivering frames while BBE is backgrounded, and does that runtime allow
  local `Activity.update()`? If yes, SCK mode = frames → the JS engine
  **directly in the app** (no JSC bundle, no App Group hop, no relay).
- The seams are already cut for it: `FrameProcessor` is capture-agnostic
  (SampleHandler is a ~30-line ReplayKit shell), and the engine is one shared
  JS implementation everywhere. ReplayKit stays for iOS 26 users regardless —
  GA lands mid-season and the audience upgrades slowly.

## Live-capture testing checklist (on device)

1. `npm install && npm run build:data && npm run test:draft` (66 checks,
   includes the JSC bundle smoke test), then `npm run eas:dev`.
2. Draft tab → Live Draft Session → mode **Live capture** → Start session.
3. Tap the record button → choose **BBE Draft Capture** → Start Broadcast →
   switch to Underdog. The red status icon confirms capture; the panel chip
   flips to CAPTURING within ~8 s.
4. Draft. Watch the Dynamic Island/lock screen (requires the APNs setup above;
   otherwise flip to BBE to see the state catch up instantly).
5. End: BBE panel **End** (self-terminates the broadcast) or stop the
   broadcast from the red status icon, then End in BBE.
6. Console.app filter `draftbroadcast` (device over USB) shows the extension's
   os_log lines: engine init, JS exceptions, relay HTTP status.

## Session frame recorder + offline replay (TASK-331)

Fixing parser defects from the 6-frame diag ring buffer required a live draft
plus an EAS build per iteration. The recorder removes that loop: the broadcast
extension appends **every** OCR'd frame to `frames-<epoch>.jsonl` in the App
Group container (`{"t": epochSec, "items": [{text,x,y,w,h,confidence}]}` per
line), and the whole draft replays offline through the identical engine.

- **Recording:** on when the session config has `recordFrames: true`
  (sessionController currently always sets it — developer build; before any
  public TestFlight either default it off behind a Debug toggle or add
  retention limits). One recording is retained at a time; stale files are
  deleted at session start; hard cap 20 MB (a long slow draft is ~3–10 MB).
  Append-only `FileHandle` on the processing queue — no memory accumulation,
  no jetsam pressure.
- **Privacy:** consistent with ADR-019/020 — raw pixels never leave the
  process; the recording is derived OCR text, stays on device in the App
  Group, and leaves only via the user-initiated share sheet.
- **Export:** confidence hub → **Frames** button → iOS share sheet
  (`BBEDraftNative.latestFrameLogPath()` + `expo-sharing`).
- **Replay:**
  `node scripts/replay-frames.mjs frames.jsonl --pool underdog_adp.csv \
     [--username X] [--slot N] [--from t] [--to t] [--dump N] [--quiet]`
  prints a per-frame timeline (kind · picksUntil · currentPick · ledger ·
  inferredGone with deltas), final status/glance, and the top-12 available.
  `--dump N` prints one frame's raw OCR lines. `npm run test:draft` includes a
  parity check: replaying a synthetic recording must equal direct ingestion.

## Explicitly deferred (v2+)

- ScreenCaptureKit mode (above — blocked on iOS 27 + EAS Xcode beta image;
  re-answer spike Q3 then).
- App-Intent ingestion (Shortcut → background ingest) — the deep-link route is
  its forward-compatible seam.
- Remote parse templates in Supabase (ADR-021) — patterns are code constants,
  structured to lift into templates.
- DraftKings templates; 6-team pods; multi-draft concurrency; Watch Smart Stack.
- Broadcast-extension orientation handling assumes portrait (UD is
  portrait-locked; RPVideoSampleOrientationKey is read when present).
- Governance follow-ups intentionally skipped per the developer's direct
  instruction (no BACKLOG/plan-file/ADR writes this session); reconcile via
  hus-backlog + hus-adr when the developer returns — ADR-020 should get an
  amendment noting ReplayKit shipped as the working primary.
