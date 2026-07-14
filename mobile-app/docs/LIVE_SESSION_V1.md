# Live Draft Session — iOS Underdog assistant "overlay"

Status: implemented 2026-07-13 (this doc doubles as the auto-approved plan and the
as-built record). Two capture modes ship:

- **v1.1 Live capture (default)** — ReplayKit broadcast extension; fully
  hands-free. See "Live capture" section below.
- **v1 Screenshots (fallback)** — manual shutter, zero infrastructure, fully
  on-device. Documented first because the live path reuses all of its pieces.

Both were built for the developer's device (iPhone 15, iOS 26.5) — no
ScreenCaptureKit (iOS 27 beta only, spike Q3 unanswered on iOS).

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
- `UP IN N PICKS` → picks-until-turn. `YOUR PICK` / on-the-clock variants → 0.
- Drafter cards: `3.8 | 32` = round.pickInRound | overall pick, for upcoming
  drafters; the on-clock drafter shows a timer (`1hr`, `59:50`) instead.
  → current pick = min(visible upcoming overalls) − 1. OCR noise like `310 | 34`
  is solved using the overall as ground truth ((r−1)·teams + p == overall).
- Slot inference: myNextOverall = currentPick + picksUntil → snake math → slot.
  (Manual slot confirm remains as fallback/override.)

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

## Live Activity content (the "useful information")

ContentState (flat, small, local-update only):
- `phase`: armed | tracking | onDeck | onClock | done
- `picksUntil`, `currentPick`, `round`, `myNextPick`
- `headline` ("Up in 2 picks", "You're on the clock!")
- `targets[]`: top-3 available at your pick by **your UD custom rankings** (fallback
  ADP), each with position and one flag (STACK / high global exposure % / QUEUE RISK)
- `rosterBar`: "QB 0 · RB 2 · WR 0 · TE 0"
- `syncedAtEpoch` → rendered as a self-ticking relative time (no updates needed)

Surfaces: lock screen card (headline + targets + roster bar + synced-ago);
Dynamic Island compact leading `⏳N` / trailing `P31`; minimal `N`; expanded =
lock-screen content. Tap → deep link `bbexposures:///draft?view=assistant`.

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
| `src/draft/sessionEngine.js` | ledger + merge + DraftState + glance payload (pure) |
| `src/draft/liveActivity.js` | lazy native wrapper (no-op off device) |
| `src/draft/screenshotSync.js` | Photos sweep → OCR items (expo-media-library) |
| `src/draft/sessionController.js` | singleton glue: AppState foreground → sweep → ingest → publish + activity update |
| `src/screens/LiveSessionPanel.jsx` | start/stop UI, status, sync log, slot confirm |
| `app/draft-ocr.jsx` | deep-link text ingestion route |
| `scripts/test-draft-parser.mjs` | Node regression test against the OCR fixture |

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
          in JavaScriptCore — no Swift port, guaranteed parity with the app
        → ledger/glance; App Group handoff (bbe.extensionResult/Heartbeat)
        → on change: POST glance → live-activity-relay Edge Function → APNs
          (apns-push-type: liveactivity) → lock screen / Dynamic Island
  BBE app (suspended while drafting):
      on foreground: hydrate serialized engine state from the App Group →
      assistant screen catches up instantly; heartbeat poll drives the
      CAPTURING / NO CAPTURE chip in the panel.
```

- ActivityKit is unreachable from extensions — the push relay is the only
  update path while backgrounded (ADR-020). Locally-computed updates still
  happen whenever the app is foregrounded.
- Push pacing (DEVELOPMENT_NOTES budget): priority 10 only for "significant"
  transitions (entering ≤3-away / on deck / on clock, your pick landing),
  priority 5 for routine movement, max one push per 3 s, and only when the
  glance actually changed. Frames of non-Underdog apps parse to kind
  "unknown" and produce no change — nothing is pushed while you check Messages.
- Session handoff: app writes `bbe.sessionConfig` (pool, slot, rankings,
  exposure, push token, relay URL, serialized engine state) to the App Group
  (`group.com.bestballexposures.app`); ending the session clears it, which the
  extension notices and self-terminates the broadcast.
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
