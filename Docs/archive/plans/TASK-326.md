<!-- Completed: 2026-07-14 | Commit: 10e1546 (base; TASK-326 changes uncommitted at close) -->
# TASK-326: Mobile live capture: pre-flight privacy explainer + inline helper copy for broadcast picker

**Status:** Pending Approval
**Priority:** P3

---

## Objective
Reduce user anxiety about iOS's system broadcast warning ("Everything on your screen, including notifications, will be recorded") on the Live Draft Session screen by showing a BBE-authored plain-language privacy explainer immediately before the system broadcast picker is launched, and by strengthening the inline helper copy with the same privacy guarantee. No native/capture behavior changes — this is messaging that surfaces what `FrameProcessor.swift` already does.

## Background (why this is the fix, and its limits)
Apple's "Screen Broadcast" confirmation sheet is **system UI** — its wording is not customizable, and on iOS ≤26 ReplayKit capture is always full-screen (it cannot be scoped to Underdog). The privacy guarantee we surface is defensible today: per `FrameProcessor.swift`, raw frames never leave the process, only text-dense draft screens are OCR'd (the `items.count >= 4` gate), and only derived pick JSON is sent to the relay. iOS 27 ScreenCaptureKit (`SCContentSharingPicker`, in-process capture) may later remove the underlying issue but is beta / iOS-27-only (GA ~Sept 2026), tracked under the mobile capture work — so this copy is the near-term mitigation and stays useful regardless.

## Verification Criteria
1. In a build where `broadcastPickerLaunchable()` is true (current primary path), tapping the red record button no longer calls `launchBroadcastPicker` directly — it first presents the BBE privacy explainer modal.
2. The explainer's primary action ("Start recording") calls `launchBroadcastPicker(BROADCAST_EXTENSION_ID)` and dismisses the modal; the secondary action ("Not now") dismisses without launching.
3. The explainer states, in plain language: (a) the upcoming iOS prompt is Apple's standard wording that covers all apps, (b) BBE reads only the Underdog draft board, (c) frames are processed on-device and discarded, (d) only draft data is sent — never screenshots/notifications/messages, (e) capture can be stopped anytime.
4. The inline helper copy (`LiveSessionPanel.jsx` ~231–245), for both the launchable and native-picker branches, includes a one-line privacy guarantee consistent with the modal.
5. No regression to the non-launchable/native-view branch or the Control Center fallback branch — they still render and the native `BroadcastPicker` still works (it cannot be gated by the modal; inline copy is its mitigation).
6. The screen bundles without import/syntax errors.

## Verification Approach
- **Automated (Claude, on Windows):**
  - `cd mobile-app && npx expo export --platform ios` (or start the Metro bundler) completes without a module/JSX/import error for `LiveSessionPanel.jsx`, confirming the new `Modal` import and component parse and bundle. If `expo export` is too heavy in-session, fall back to confirming the file compiles via the project's Babel/Metro transform on that single module.
  - Run `/code-review` on the diff to confirm the record-button handler is gated, state is cleaned up on dismiss, and the native-view branch is untouched.
- **Developer manual (on device, EAS dev/preview build — no simulator on Windows):**
  1. Open Draft Assistant → Live Draft Session → Live capture → Start session.
  2. Tap the red record button → confirm the BBE explainer appears **before** the iOS sheet.
  3. Tap "Start recording" → confirm the iOS "Start Broadcast" sheet appears and capture begins.
  4. Re-open, tap record, tap "Not now" → confirm no broadcast starts.
  5. Confirm the inline helper text reads the new privacy guarantee.
  Claude will present these as outstanding manual steps and will not mark the task Verified/Done until the developer confirms them.

## Files to Change
| File | Action | Description |
|------|--------|-------------|
| `mobile-app/src/screens/LiveSessionPanel.jsx` | Modify | Add a `PreflightExplainer` modal (RN `Modal`, theme tokens, matching `DraftBoardModal` conventions); add `showPreflight` state; gate the launchable record-button `onPress` to open the modal instead of calling `launchBroadcastPicker` directly, with the modal's primary action performing the launch; strengthen inline helper copy (both branches) with the privacy guarantee. Add `Modal` + a `lucide-react-native` icon (e.g. `ShieldCheck`) to imports. |

## Implementation Approach
1. **Imports:** add `Modal` to the `react-native` import; add `ShieldCheck` (and `X` for close, matching `DraftBoardModal`) to the `lucide-react-native` import.
2. **State:** add `const [showPreflight, setShowPreflight] = useState(false);`.
3. **Gate the launchable path** (currently `LiveSessionPanel.jsx:217–223`): change the record-button `onPress` from `() => launchBroadcastPicker(BROADCAST_EXTENSION_ID)` to `() => setShowPreflight(true)`. Leave the visual red-dot button unchanged.
4. **Explainer modal:** define a small `PreflightExplainer` (inline component or local render helper, consistent with the inline `WarnRow` pattern) using RN `Modal` (`transparent`, `animationType="fade"`), a centered card styled with `colors`/`spacing`/`radii`/`type`, a `ShieldCheck` header, the copy below, and two actions:
   - **Start recording** (primary): `() => { setShowPreflight(false); launchBroadcastPicker(BROADCAST_EXTENSION_ID); }`
   - **Not now** (secondary): `() => setShowPreflight(false)`
   Render it once within the active-state return, gated by `showPreflight`.
5. **Native-view branch** (`:224–227`, `RPSystemBroadcastPickerView`) and the **Control Center fallback** (`:238–243`): a native picker tap goes straight to the system sheet and cannot be intercepted by JS, so it is *not* gated by the modal. Its mitigation is the strengthened inline copy (step 6). No behavior change to this branch.
6. **Inline helper copy** (`:231–245`): append a privacy-guarantee sentence to both the launchable and native/Control-Center branches, e.g. *"BBE reads only the Underdog draft board on your device and discards every frame instantly — nothing else is stored or sent."*

### Proposed copy (for review — this is the crux of the task)

**Explainer modal**
> **Before you start recording**
>
> iOS will ask to record your screen next. That prompt is Apple's standard wording and it covers every app — but here's exactly what BBE does:
>
> • Reads only the Underdog draft board to follow your picks.
> • Processes each frame on your device, then discards it instantly.
> • Sends only draft data (picks, your slot) — never screenshots, notifications, or messages.
>
> You can stop capture anytime from the red status icon.
>
> [ Start recording ]   [ Not now ]

**Inline helper (added sentence)**
> BBE reads only the Underdog draft board on your device and discards every frame instantly — nothing else is stored or sent.

### Edge cases / notes
- The explainer shows on every record tap (deliberate confirm step). A "don't show again" preference is deferred — noted below, not built here.
- Off-device (`native()` null), neither `broadcastPickerLaunchable()` nor `BroadcastPicker` is available, so the modal path is never reachable — no change to that state.

## Dependencies
None. (Relates to TASK-320 draft session UX / TASK-323 in-app screen / TASK-324 privacy disclosures; candidate to merge into TASK-320 later.)

## Open Questions
- **"Don't show again" toggle?** Deferred as a possible follow-up; v1 shows the explainer each time. Flag if you'd prefer it built now.
- KB not compiled (`kb/index.md` absent) — research phase ran on source files and the spike research notes only.

---
*Approved by: <!-- pending -->*
