# Best of All Exposures — iOS Draft Assistant Architecture

**Approach:** ReplayKit Broadcast Upload Extension captures the Underdog app's screen → on-device Vision OCR extracts draft state → analysis engine compares against synced exposures/correlations → Live Activity surfaces recommendations in the Dynamic Island while the user drafts.

---

## Components

### 1. Companion iOS App (main process)
- Auth and sync with the Best of All Exposures website API
- Pulls down: user's exposure targets, correlation matrices, custom stack rules, lineup pools
- Hosts the Broadcast Upload Extension as a target
- Manages Live Activity lifecycle (start/update/end)
- Local cache of player pool + OCR templates per platform (Underdog, DraftKings, etc.)

### 2. ReplayKit Broadcast Upload Extension
This is the only way to capture another app's screen on iOS. `RPScreenRecorder` only captures your own app — you specifically need the **Broadcast Upload Extension** for system-wide capture.

- User starts broadcast via `RPSystemBroadcastPickerView` (a button in your app) or Control Center
- Extension receives `CMSampleBuffer` frames at ~30fps
- **Hard memory ceiling (~50MB).** No big ML models. Vision's built-in text recognizer is fine; custom CoreML needs to be tiny.
- Runs in a separate process from the main app

### 3. OCR Pipeline (Vision framework, inside the extension)
- `VNRecognizeTextRequest` with `.accurate` recognition level
- **Don't OCR every frame.** Sample at 2–3fps, or run a frame-diff motion detector and only OCR when pixels in the relevant regions change
- Define **ROIs (regions of interest) per platform**: pick ticker, available players list, your roster, draft clock, round indicator
- Fuzzy-match recognized strings against the known player pool (Levenshtein distance) to handle OCR noise, suffixes (Jr/Sr/III), and apostrophes

### 4. Draft State Engine
- Maintains current state: picks made, by which slot, your roster, round/pick number, time remaining
- Diffs new OCR output against last state to detect pick events
- Resolves ambiguity using position + team context (multiple "Smith"s, etc.)
- Lives in the main app, fed by the extension via shared storage

### 5. Analysis Engine
- Same logic as your Chrome extension: correlation scoring, stack detection, exposure delta vs targets, leverage scores
- Runs in the **main app**, not the extension (avoids the memory ceiling)
- On state change, recomputes top N recommendations

### 6. Inter-Process Communication
Extension and main app are separate processes — they share data through:
- **App Group container** (shared SQLite DB or UserDefaults) for draft state
- **Darwin notifications** to wake the main app and trigger Live Activity updates when the extension writes new state

### 7. Live Activity + Dynamic Island (ActivityKit)
- Three presentations: compact (lock screen), expanded (long-press Dynamic Island), minimal (when stacked with other activities)
- **App Intents (iOS 17+)** for interactive buttons: "mark drafted manually," "show next 3," "ignore this rec"
- Updates pushed via ActivityKit — **Apple throttles update frequency**, so budget ~1 update per actual pick event, not per OCR frame
- Limited real estate: show top 2–3 recommendations, exposure delta, correlation warning icon

### 8. Website Sync Layer
- REST or GraphQL to your existing backend
- OAuth or API key auth
- Pull on app launch and before draft start; push completed draft results for analytics
- Cache aggressively — assume network is unreliable mid-draft

---

## Data Flow During a Live Draft

1. User opens companion app → syncs latest exposures and correlation rules from website
2. User taps **Start Draft Assist** → `RPSystemBroadcastPickerView` appears → user confirms screen broadcast
3. User switches to Underdog and enters a draft
4. Broadcast extension captures frames → motion detector flags changes → Vision OCR reads ticker + roster ROIs
5. New pick detected → written to App Group shared store → Darwin notification fires
6. Main app wakes → analysis engine recomputes recommendations against your exposure targets
7. Live Activity content state updates → user sees new top pick in the Dynamic Island
8. User either drafts directly in Underdog (state auto-detected on next pick) or taps an App Intent button in Dynamic Island to override/confirm
9. Draft ends → broadcast auto-stops, results synced back to website

---

## Known Hard Parts

**OCR latency vs Underdog's clock.** Underdog drafts run on a ~30-second per-pick timer (faster in turbo). You realistically have 3–5 seconds end-to-end (frame capture → OCR → analysis → Live Activity update) before the recommendation is too late to act on. Profile this before building anything else — if you can't hit it, the whole architecture is in trouble.

**Memory ceiling in the broadcast extension.** ~50MB total. No room for large models. Keep the extension thin: capture, OCR, write state. All analysis happens in the main app.

**UI changes break OCR.** Underdog and DraftKings ship UI updates without warning. Your ROI coordinates and template strings need to be **versioned and remote-updatable** without requiring an App Store release. Build a config-fetch layer from day one.

**App Store review risk.** ReplayKit + capturing other apps is a legitimate API (screen recorders and streamers use it), but Apple has historically scrutinized DFS-adjacent tools. Mitigations: clear privacy policy stating all OCR is on-device and no captured frames leave the phone; no automated drafting (you're an advisor, not a bot); avoid language like "auto-pick" in marketing.

**Battery.** Continuous screen capture plus OCR is heavy. Add a max session timeout, auto-stop on draft completion (detect "Draft Complete" screen via OCR), and warn users on low battery before starting.

**Permission flow.** Apple requires the user to confirm screen broadcast every session — there's no "always allow." Design your entry flow assuming 2 confirmation taps before the draft starts. Consider a 10-second countdown banner so they can switch to Underdog cleanly.

**Multiple platforms.** Underdog and DraftKings have totally different UIs. Each needs its own ROI map, template strings, and pick-detection logic. Start with one platform, ship it, then add the second.

---

## Suggested Build Order

1. Prove the OCR latency budget on Underdog with a stub broadcast extension that just logs detected picks
2. Build the App Group state schema and Darwin notification plumbing
3. Port a minimal version of the analysis engine from the Chrome extension
4. Wire up Live Activity with static recommendations
5. Connect everything end-to-end on Underdog only
6. Add App Intent buttons for manual override
7. Add DraftKings as second platform once Underdog is stable
8. Add remote config for ROI/template updates
