# Development Notes — practical constraints & workflow

Working notes for building the mobile app. Companion to ARCHITECTURE.md (design) and
RESEARCH_NOTES.md (evidence). Update as reality teaches us things.

## The Windows problem (and the ADR-022 answer)

The dev machine is Windows 11; iOS cannot be compiled locally (Xcode is macOS-only).
The workflow that works from Windows:

1. **Expo + EAS Build**: `eas build --profile development --platform ios` compiles in
   Expo's cloud, including custom native Swift modules (Expo Modules API) and extension
   targets (config plugins). Install on the iPhone via TestFlight or internal
   distribution (`eas device:create` first for ad-hoc).
2. **JS iteration is fast** (Expo dev client + Metro over Wi-Fi — the phone connects to
   the Windows machine); **native iteration is slow** (each Swift change = cloud build,
   minutes). Design accordingly: keep native modules thin and stable, put logic in JS
   where latency-tolerable, batch native work.
3. **No local Xcode debugger.** For hard native debugging (capture stream lifecycle,
   memory), options: `console.log`-equivalent via `os_log` + Console streaming from the
   device (works over USB with third-party tools, imperfect on Windows), or rent a cloud
   Mac (MacStadium/Scaleway hourly) for intensive weeks. Expect to want one during
   TASK-320.
4. Accounts needed before any device build: **Apple Developer Program** ($99/yr,
   enrollment can take days — see spike plan Open Question 3 re: personal vs. business
   entity) and an **Expo account** (free tier OK).

## Hard platform limits to design around (don't rediscover these)

| Limit | Value | Consequence |
|-------|-------|-------------|
| Live Activity active duration | 8 h max | End activity at draft end; slow drafts never hold one open |
| Live Activity push payload | 4 KB | Glance payload must be tiny: counts, 3 player names, flags |
| Priority-10 push budget | throttled (~40 in 6 min burned one, restore ≤24 h) | Update policy: p10 only near user's turn; p5 otherwise |
| `Activity.request()` | foreground only | Session must start in-app before switching to UD |
| Capture on screen lock | killed (iOS + Android 15) | Resume = calibration sweep; message it in UI |
| ReplayKit extension memory (fallback only) | ~50 MB jetsam | Downscale + `.fast` Vision + release buffers if we ever build it |
| Extension → ActivityKit | impossible | Fallback architecture requires the push relay |
| Compact island text | ~52×37 pt | Content = one number + one badge, period |

## Parse engine notes (pre-TASK-321)

- Fixtures first: every screenshot from the spike goes to `spike/fixtures/` and becomes
  the regression corpus. Add fixtures for every UD redesign forever.
- Frame gating: hash a downscaled ticker strip; OCR only on change. During a 30 s pick
  clock most frames are identical — this is the battery/CPU story.
- Fuzzy matching: port `canonicalName.js` semantics to Swift (or run matching in JS —
  the ledger crosses the bridge anyway; measure before optimizing).
- OCR text order is not layout order — parse by bounding boxes (both Vision and ML Kit).
- Names render truncated/abbreviated in some UD views ("J. Jefferson", "Ja'Marr Ch…") —
  the closed pool makes these recoverable; the matcher must score prefix/initial forms.
- Autopick bursts: several picks can appear at once after timeouts; ingest the ticker
  as a list, append in order, tolerate duplicates (idempotent by pick number).
- The user's own picks: detect via slot math primarily; roster-panel OCR is confirmation,
  not source of truth.

## Live Activity / push notes (pre-TASK-322)

- APNs auth: p8 key in Supabase Edge Function secrets (`live-activity-relay`). Topic:
  `<bundleID>.push-type.liveactivity`. Payload needs `timestamp` + `event` +
  `content-state` mirroring the Swift `ContentState` Codable exactly (field-for-field).
- Set `NSSupportsLiveActivitiesFrequentUpdates`; read
  `ActivityAuthorizationInfo().frequentPushesEnabled` and degrade gracefully (users can
  turn it off per-app).
- Test throttling empirically early — budgets are undocumented; our policy must survive
  a 216-pick fast draft (~2 h). Rough target: ≤20 p10 pushes per draft (3 per user turn
  window × 18 rounds would blow it; collapse to on-deck + on-clock only).
- Deep link: `bbe://draft-session/<id>` from every activity surface.
- Dev-loop warning: Live Activities can't be tested in the iOS Simulator's push
  environment reliably — plan for on-device testing from day one.

## Store posture (pre-TASK-324)

- App Review notes must explain: what is captured (user's own screen, user-initiated),
  what leaves the device (derived picks only), why (portfolio context during drafts).
  Volunteer a demo video — reviewers of screen-capture apps expect one.
- Privacy nutrition label: no data collection from capture (frames discarded);
  account data = existing Supabase auth.
- Age rating questionnaire will land 18+ (gambling-adjacent contests). Accept it.
- Keep marketing copy mirror-not-advisor ("see your portfolio while you draft"), not
  "win more money" — both for brand (ADR-002) and 5.3.4 distance.
- Contingency if 5.2.2 authorization is demanded: Underdog outreach citing their public
  overlay tolerance; fallback is TestFlight-only distribution for a season (10k testers)
  while it resolves.

## Working agreements for this directory

- `mobile-app/spike/` is throwaway — never build product code there.
- The shared analytics package (TASK-319) is consumed by web + mobile; changes to it run
  web lint/tests too.
- Any UD screen-geometry knowledge goes in parse templates (Supabase), never hardcoded —
  if you're typing pixel coordinates into Swift, stop (ADR-021).
- Screenshots/fixtures must be scrubbed of account balance/username before commit.
