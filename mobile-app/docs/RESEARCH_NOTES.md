# Platform & Landscape Research Notes

Condensed from three parallel research passes run 2026-07-11 (iOS platform, Android
platform/policy, competitive + ToS landscape). Confidence tags: **[official]** =
vendor docs/policy text, **[field]** = credible engineering reports/shipping apps,
**[inferred]** = synthesis. Re-verify load-bearing items at implementation time —
especially anything tagged beta.

## iOS

### Screen capture
- The **only** sanctioned way to see another app's screen is user-initiated system
  capture. Screen Time APIs, accessibility, and App Intents cannot observe another
  app's content. [official]
- **ReplayKit Broadcast Upload Extension** (iOS ≤26; **deprecated in the iOS 27 SDK**):
  system-wide frames via `RPBroadcastSampleHandler`; started via
  `RPSystemBroadcastPickerView` or Control Center; red system recording indicator;
  **killed on screen lock**; no documented time limit (multi-hour broadcasts ship).
  [official] Memory limit ~**50 MB** (empirical jetsam, consistent 2018→2026; vendor
  docs: Zego, Twilio). [field] Network requests allowed (that's its purpose). [official]
- **ScreenCaptureKit arrives on iOS 27 (beta now, GA ~Sept 2026)** — Apple: "a broadcast
  extension is no longer necessary." `SCContentSharingPicker` + `SCStream` deliver
  frames **in the app's own process**. Background-capture semantics on iOS undocumented
  in beta → **spike Q3**. [official, beta]
  https://developer.apple.com/documentation/screencapturekit/
- Precedent that capture+OCR of other apps passes App Review: **iTranscreen — Screen
  Translator** (App Store id1663139919, 4.4★) OCRs/translates other apps' screens in
  real time. TeamViewer QuickSupport, Discord/Zoom screen share = broadcast-extension
  precedents. [field]

### Vision OCR
- `VNRecognizeTextRequest` works in extensions; within 50 MB requires downscale/crop +
  `.fast` mode + aggressive buffer release (a 1179×2556 BGRA frame ≈ 12 MB). In-process
  (ScreenCaptureKit) removes that ceiling → `.accurate` viable. [field/inferred]
- Zero-code accuracy proxy for the spike: **Shortcuts "Extract Text from Image"** and
  Photos Live Text run the same Vision stack. [official]

### Live Activities (ActivityKit)
- Start requires **foreground** `Activity.request()`. Update paths when backgrounded:
  BackgroundTasks, ActivityKit push receipt, `LiveActivityIntent` (runs in app process),
  or any legitimately-held background runtime. A **suspended app cannot update**. [official]
- **Extensions cannot update activities** — `Activity.activities` is empty outside the
  owning app's process. The extension-era workaround is extension → your server → APNs.
  [official/field] https://developer.apple.com/forums/thread/735382
- **Push updates**: `apns-push-type: liveactivity`, p8 token auth, topic
  `bundleID.push-type.liveactivity`, payload `timestamp`/`event`/`content-state`,
  **4 KB cap**. Priority 10 = immediate but **budget-throttled** even with
  `NSSupportsLiveActivitiesFrequentUpdates` (field report: ~40 priority-10 pushes in
  6 min exhausted a budget; restoration up to 24 h). Priority 5 exempt. Check
  `frequentPushesEnabled` (user-disableable). [official + field]
  https://developer.apple.com/forums/thread/731715
- Push-to-start (iOS 17.2+); **broadcast channels** (iOS 18+, one push → many devices —
  overkill here). [official]
- **8 h max active**; lock-screen linger ≤4 h more. Dynamic Island: compact
  52.33×36.67 pt (62.33 on Max), expanded 371–408 × 84–160 pt, lock screen ≤160 pt.
  [official, HIG]
- iOS 26/27: activities auto-forward to **Watch Smart Stack / CarPlay / macOS menu bar**
  (`supplementalActivityFamilies`); iOS 27 adds landscape island + StandBy. [official]

### App Review
- **2.5.14**: explicit consent + clear indication when recording user activity — system
  picker + red pill largely satisfies; add in-app indication. Known rejections center on
  *hiding* recording, not OCR per se. [official/field]
- **5.1.1/5.1.2**: privacy — on-device OCR + derived-data-only upload is the safe shape.
- **5.3.4**: "illegal gambling aids, including card counters, are not permitted" — the
  discretionary hazard. Mirror-not-advisor framing + not being real-money gaming argues
  it doesn't apply; no public precedent either way. [official + inferred]
- **5.2.2**: reviewers can demand proof of authorization to use a third-party service —
  the sharpest iOS distribution risk given UD/DK ToS. Contingency: Underdog outreach
  (they publicly tolerate overlays). [official + inferred]
- Expect **18+ rating** via the questionnaire (gambling-adjacent). UD/DK themselves are
  18+ real-money apps on both stores. [official]

### Safari Web Extension (secondary channel, not the foundation)
- iOS Safari 15+ supports WebExtensions with full content-script DOM access — the
  existing Chrome content script largely ports. Only reaches users drafting on
  underdog.com **in mobile Safari** (most draft in the native app). Background service
  worker is unreliable on iOS (documented kill bugs) — keep logic in the content script;
  containing app cannot be woken (App Group data read on next launch; real-time path is
  content script → server → APNs). [official/field]

## Android (future phase — FEAT-032)

- **MediaProjection**: consent strictly **per session** (Android 14+ throws on intent
  reuse); FGS type `mediaProjection` required; **single-app capture** mode (14+) usefully
  excludes notifications; **Android 15 QPR1: projection auto-stops on device lock** +
  status-bar chip; capture of other apps while backgrounded is the design. [official]
- **FLAG_SECURE renders black to capture** — the Android concept-killer risk. DK (real-
  money app) likely flags; UD unverified. AccessibilityService bypasses FLAG_SECURE but
  is high Play-policy risk (Oct 2025 tightening; declaration + manual review; read-only
  "narrow purpose" is the permitted side). Test before building. [official/field]
- **ML Kit Text Recognition v2**: on-device, ~300 ms–1 s/frame mid-range after
  crop/downscale; chars ≥16 px; parse by bounding-box geometry (reading order interleaves
  columns). 1 fps for 30–60 min viable (screen translators ship this). [official/field]
- **SYSTEM_ALERT_WINDOW** overlay: one-time settings grant, interactive chat-head pattern
  accepted on Play; counter-measure exists (`setHideOverlayWindows`, banking apps use it).
  [official]
- **Play gambling policy — sharpest Android risk**: non-licensed apps "must not provide
  gambling or real money game… support or **companion functionality**." A no-ads,
  no-link analytics companion is a documented gray area. [official]
  https://support.google.com/googleplay/android-developer/answer/9877032
- Prior art: screen translators (MediaProjection+ML Kit+bubble), Poker Equity HUD,
  Arcane Tracker; cautionary tale: Untapped.gg's Android tracker broke via a platform
  change and was unlisted. No Overwolf equivalent on Android. [field]

## Competitive & ToS landscape

- **Nobody auto-reads mobile drafts.** Every UD/DK live-draft tool is a desktop browser
  extension (Best Ball Overlay, Draft Caddy, The Solver/ETR, LegUp Sidekick, Draft
  Optics, Bag Manager, Spike Week). The only mobile-branded product — **Spike Week
  Mobile Draft Hacker** (2024) — is manual/second-surface. [field]
- An ETR-tool review estimated **75%+ of Underdog drafts happen on phones** — the
  unserved population. [field]
  https://mparkhill.substack.com/p/reviewing-establish-the-runs-best
- **Underdog's operative line** (May 2025, InGame, post-ETR-backlash): "We do not allow
  scripts, we do not allow strain on our APIs, we do not allow automation. **We do allow
  suggestions and overlays** and have for quite a while." ToS §6 bans automated access +
  unauthorized scripts. No known enforcement against overlay tools through 2026-07.
  [official statement + field] https://www.ingame.com/best-ball-tool-establish/
- **DraftKings**: paper ToS bans off-site scripts/scrapers (2016 Fair Play reversal;
  SuperLobby C&D precedent) but best-ball overlays operate unenforced. [field]
- **No public API** exists for either platform. The extension's private-API usage
  (token capture) is exactly the category UD banned — which is why ADR-019 chose screen
  reading and forbids the API-watcher path.

## Codebase grounding (what mobile reuses)

- `chrome-extension/src/adapters/interface.js` — the `DraftState` typedef mobile must
  produce (currentPick, currentRound, draftSlot, availablePlayers, myPicks).
- `chrome-extension/src/utils/canonicalName.js` — name normalization for fuzzy matching.
- `best-ball-manager/src/utils/`: `rosterArchetypes.js`, `stackAnalysis.js`,
  `playoffStacks.js`, `eliminatorModel.js` — pure JS, port verbatim (ADR-022).
- `DraftFlowAnalysis.jsx` is **manual-entry** today — the mobile assistant is "the same
  analytics, fed automatically," plus its manual mode is the degradation path.
- Extension history lesson feeding ADR-021: selector/hash churn + the 2026-05
  underdogsports.com rebrand → platform knowledge must live in remotely-updatable
  templates, not app binaries.
