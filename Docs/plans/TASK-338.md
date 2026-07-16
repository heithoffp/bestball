# TASK-338: Live Activity loss detection + auto-restart (recover dead activity mid slow-draft session)

**Status:** Approved
**Priority:** P2

<!-- Research note: KB not compiled — research phase ran without KB context. Research was
     performed inline in the planning session (no subagents, per developer instruction):
     sessionController.js, liveActivity.js, BBEDraftNativeModule.swift, FrameProcessor.swift,
     LiveSessionPanel.jsx, draft-glance/index.swift, live-activity-relay/index.ts, and the
     2026-07-16 debug evidence were all read directly. -->

---

## Objective

Make the draft Live Activity survive the realities of slow drafts: when iOS ends the
activity (8-hour lifetime cap) or the user swipe-dismisses it, the app detects the loss on
its next foreground, silently re-requests the activity with a fresh push token, and hands
the new token to the running broadcast extension — instead of today's behavior where
`activityStarted` stays true forever, update errors are invisible, and the extension pushes
to a dead APNs token for the rest of the draft. Also close the diagnosability gap that made
the 2026-07-16 report hard to triage: `exportDebug()` gains the Live Activity state fields.

Context: investigation of `mobile-app/docs/debug_screenshots/debug_no_live_activity.txt` +
`frames_no_live_activity.jsonl` (2026-07-16) showed the capture pipeline fully healthy and
the activity successfully started with a push token at session start; the activity later
ceased to exist with no detection, no recovery, no visible error.

## Verification Criteria

1. **Recovery:** With a session running, swiping the Live Activity away on the lock screen
   (or iOS ending it) and then reopening BBE brings the Live Activity back within seconds,
   showing current draft state — and subsequent extension pushes land on the new activity
   (card updates while BBE is backgrounded).
2. **Visibility:** If the Live Activity is in a failed/lost state that recovery could not
   fix, the confidence hub shows a warning row saying so — mid-session failures are no
   longer silent.
3. **Diagnosability:** The Debug bundle shared from the confidence hub now answers "was the
   Live Activity alive?" directly: it contains `activityStarted`, `activityError`,
   `pushToken` (presence), `lastHeartbeatAt`, and the `capabilities` block.

## Verification Approach

Automated (agent runs these):

- `cd mobile-app && npm run lint` (or `npx eslint src/draft/sessionController.js
  src/draft/liveActivity.js src/screens/LiveSessionPanel.jsx` if no lint script) — exits
  clean on the changed JS files.
- `node mobile-app/scripts/test-draft-parser.mjs` — parser/engine tests still pass
  (regression guard; this task must not touch the parse engine, so `src/draft/generated/
  engineSource.js` must show no diff).
- Grep checks: `hasLiveActivity` exposed in `BBEDraftNativeModule.swift` and wrapped in
  `liveActivity.js`; `bbe.pushToken` written in `sessionController.js` and read in
  `FrameProcessor.swift`; `exportDebug` includes the five new fields; `LiveSessionPanel.jsx`
  renders `activityError` without the `!activityStarted` gate.
- Swift changes cannot compile on Windows — compile verification happens via the TASK-334
  GitHub Actions macOS build (below).

Manual (requires the developer — do not mark Verified without explicit confirmation):

1. Produce a new build via the TASK-334 pipeline (`eas build --local` on the GitHub Actions
   macOS runner) and install on the iPhone. Both native targets changed (app module +
   broadcast extension), so a Metro reload is NOT sufficient.
2. Start a Live Session, start the broadcast, confirm the Live Activity appears.
3. Swipe-dismiss the Live Activity on the lock screen. Reopen BBE → within one heartbeat
   poll (~4 s) the panel logs "Live Activity restarted" and the activity is back on the
   lock screen (criterion 1).
4. Background BBE, make a pick in Underdog (or scroll the players tab to force a target
   change) → the restarted card updates via push, proving the extension adopted the new
   token (criterion 1, second half).
5. Export the Debug bundle → confirm the five new fields are present (criterion 3).

## Files to Change

| File | Action | Description |
|------|--------|-------------|
| `mobile-app/modules/bbe-draft-native/ios/BBEDraftNativeModule.swift` | Modify | Add `hasLiveActivity()` (true iff an `Activity<DraftActivityAttributes>` has `activityState == .active` or `.stale`); after a successful `start`, spawn a `pushTokenUpdates` observer Task that writes the hex token to App Group KV `bbe.pushToken`; make `update`/`currentPushTokenHex` prefer `.active` activities over ended ones |
| `mobile-app/src/draft/liveActivity.js` | Modify | Export `hasLiveActivity()` wrapper (false when module unavailable) |
| `mobile-app/src/draft/sessionController.js` | Modify | Write `bbe.pushToken` at session start; add dead-activity check + re-request (debounced) on the foreground/poll path; rewrite session config + `bbe.pushToken` with the new token; clear `activityError` on successful update; add the five fields to `exportDebug()` |
| `mobile-app/targets/draft-broadcast/FrameProcessor.swift` | Modify | `pushGlance` reads the push token fresh from App Group KV `bbe.pushToken` on each push, falling back to the config-captured token |
| `mobile-app/src/screens/LiveSessionPanel.jsx` | Modify | Show `activityError` warn row even when `activityStarted` is true (distinct copy from the initial-request-failed case) |
| `mobile-app/docs/LIVE_SESSION_V1.md` | Modify | Document the loss-detection/auto-restart behavior and the `bbe.pushToken` App Group key |

## Implementation Approach

**1. Native liveness check (`BBEDraftNativeModule.swift`).**
Add `Function("hasLiveActivity")` returning `Bool`. Inside the iOS 16.2 availability guard:
`Activity<DraftActivityAttributes>.activities.contains { $0.activityState == .active || $0.activityState == .stale }`.
`.ended`/`.dismissed` activities can linger in `.activities` (a system-ended card stays
visible up to 4 h) — they must count as dead, which is why the check filters on state
rather than non-emptiness. Return `false` outside the guard. While here, make
`DraftActivityBridge.update` and `currentPushTokenHex` prefer an `.active` activity
(`activities.first { $0.activityState == .active } ?? activities.first`) so they never
target a lingering ended card when a live one exists.

**2. Push token via App Group KV (`bbe.pushToken`) — single source of truth.**
Problem: the running broadcast extension captured `pushToken` into an ivar at `setUp` from
`bbe.sessionConfig`; rewriting the config does not reach it (it only re-reads config on an
epoch bump, which re-inits the engine — too destructive for a token refresh). Solution:
a dedicated KV key, following the established App Group handoff pattern (ADR-020/023/024 —
this is an extension of an existing decided pattern, no new ADR needed).
- In `DraftActivityBridge.start`, after a successful request, spawn
  `Task { for await tokenData in activity.pushTokenUpdates { write hex to defaults key "bbe.pushToken" } }`.
  This makes the key self-maintaining: it covers the initial token arrival, iOS token
  rotation mid-activity, and every recovery re-request (the new activity's observer
  overwrites the key). Keep the existing `getActivityPushToken` polling API unchanged for
  the JS-side `pushToken` status flag.
- In `FrameProcessor.pushGlance`, read the token per push:
  `defaults?.string(forKey: "bbe.pushToken") ?? self.pushToken` (config token as fallback
  for a stale-app-build mismatch). UserDefaults reads are cheap at ≤1 push per 3 s.
- In `sessionController.startSession`, after `getActivityPushToken()` resolves, also
  `writeSharedValue('bbe.pushToken', state.pushToken)` (belt-and-braces for builds where
  the native observer hasn't landed; harmless duplication otherwise). Add the key constant
  next to the existing `*_KEY` constants and clear it in `endSession` alongside the config.

**3. Loss detection + auto-restart (`sessionController.js`).**
Add `ensureActivityAlive()` called from `pollExtension()` (which runs every 4 s while the
app is foregrounded — RN timers suspend in background, and `Activity.request` requires
foreground anyway, so this is exactly the right cadence) and from the existing AppState
`'active'` listener:
- Guard: `state.active && state.activityStarted && nativeModuleAvailable() && !hasLiveActivity()`.
- Debounce: at most one restart attempt per 30 s (`state.lastActivityRestartAt` timestamp)
  so a device refusing requests (e.g. Live Activities toggled off mid-draft) doesn't spin.
- On trigger: call `startActivity(stampedGlance(), { withPushToken: true })` (the existing
  native `start` already ends lingering orphans first, so the dead card is cleaned up).
  - ok: `state.pushToken = await getActivityPushToken()`; write `bbe.pushToken`; update
    `state.baseConfig.pushToken`; rewrite `SESSION_CONFIG_KEY` with
    `{ ...state.baseConfig, state: state.session.serialize() }` (do NOT bump
    `configEpoch` — an epoch bump re-inits the extension engine; the config rewrite is
    only so a future broadcast restart inits with the fresh token);
    `state.activityError = null`; `pushLog('Live Activity restarted — it was ended by iOS or dismissed')`;
    `notify()`.
  - not ok: `state.activityError = res.error`; leave `activityStarted` true (the panel row
    from step 4 surfaces it); retry naturally after the debounce window.
- In `publishAll`, clear `activityError` on a successful `updateActivity` (today it's only
  ever set, never cleared) so transient failures don't leave a permanent warning.

**4. Surface mid-session errors (`LiveSessionPanel.jsx`).**
Replace the `!activityStarted` gate at the warn row (currently line ~422) with two rows:
keep `!activityStarted` → "Live Activity failed: …" (initial request never succeeded), and
add `activityStarted && activityError` → "Live Activity issue: {activityError} — trying to
restore it automatically". Keep the existing gold "No push token" row as-is.

**5. Debug bundle fields (`sessionController.exportDebug`).**
Add to the exported object: `activityStarted: state.activityStarted`,
`activityError: state.activityError`, `pushToken: !!state.pushToken`,
`lastHeartbeatAt: state.lastHeartbeatAt`, and
`capabilities: { nativeModule, liveActivity, activitiesEnabled, frequentPushes }` (reuse the
same calls `getSnapshot()` makes). Scope-item verification: a simulated dead-activity
session must show `activityStarted: true` with the update/restart error captured.

**6. Docs (`mobile-app/docs/LIVE_SESSION_V1.md`).**
Short section: why activities die mid slow-draft (8 h cap, swipe-dismiss), the detect →
re-request → token-rehandoff flow, the `bbe.pushToken` key, and the debounce.

**Edge cases handled:**
- Extension running while the app restarts the activity: no epoch bump, no engine re-init,
  board state untouched; the extension just starts pushing to the new token read per push.
- Live Activities disabled mid-draft (Settings toggle): every restart attempt fails →
  `activityError` set → panel row shows it; debounce keeps attempts to ~2/min.
- Expo Go / Android / web: `hasLiveActivity()` returns false via the module-unavailable
  path, but the guard requires `nativeModuleAvailable()` first, so recovery never fires.
- `endSession` during a pending restart: `startActivity` result handling re-checks
  `state.active` before mutating state.

**Out of scope (intentionally):** re-requesting when the app was killed and relaunched
mid-draft (session state itself is gone then — that's the separate no-board resume flow),
and any parse-engine change (`engineSource.js` must not be regenerated by this task).

## Dependencies

None. (Builds ship via the TASK-334 local-EAS GitHub Actions pipeline; both native targets
changed, so a full build — not Metro reload or engine hot-load — is required to test.)

## Open Questions

None blocking. One alternative considered and rejected: bumping `configEpoch` to hand the
extension the new token via its existing re-init path — rejected because re-init tears down
and rebuilds the engine mid-draft (frame log recreated, push bookkeeping reset) for what is
just a token refresh; the `bbe.pushToken` KV key is strictly less invasive and also solves
token rotation.

## Scope Items

### exportDebug() diagnosability: include activityStarted, activityError, pushToken presence, lastHeartbeatAt, and the capabilities block (nativeModule/liveActivity/activitiesEnabled/frequentPushes)
- **Added:** 2026-07-16
- **Verification:** Debug bundle exported from the confidence hub contains all five fields; a simulated dead-activity session shows activityStarted=true with the update error captured in the bundle

---
*Approved by: PH, 2026-07-16 (execution deferred to a new session with an Opus agent)*
