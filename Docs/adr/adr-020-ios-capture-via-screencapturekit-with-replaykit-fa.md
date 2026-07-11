# ADR-020: iOS capture via ScreenCaptureKit with ReplayKit fallback

**Date:** 2026-07-11
**Status:** Accepted

---

## Context

Per ADR-019, the iOS assistant reads draft state from the screen. iOS offers exactly
one sanctioned system-wide screen pipeline, but it is mid-transition (research 2026-07,
during the iOS 27 beta cycle):

- **ReplayKit Broadcast Upload Extension** (iOS ≤26, deprecated in the iOS 27.0 SDK):
  a separate extension process receives every screen frame after the user starts a
  broadcast. Hard constraints: ~50 MB jetsam memory limit in the extension (empirical,
  consistently reported 2018→2026); killed on screen lock; **cannot update a Live
  Activity directly** — ActivityKit only sees activities from the owning app's process,
  so the extension must POST derived state to a server which pushes an APNs
  `liveactivity` update (~1–2 s latency, 4 KB payload, priority-10 budget throttling).
- **ScreenCaptureKit** (new on iOS 27, currently beta, ships ~Sept 2026): Apple's
  stated replacement — "a broadcast extension is no longer necessary." Capture runs
  **in the app's own process** via `SCContentSharingPicker`/`SCStream`, which removes
  the 50 MB extension constraint and puts frames in the same process that owns the
  Live Activity. **Unknown:** whether/how capture continues while the app is
  backgrounded on iOS (semantics not yet documented in beta) — if capture grants
  background runtime like other continuous-media modes, local `Activity.update()`
  calls may eliminate the server hop entirely for glance updates.
- The 2026 best-ball season is already underway (drafts run heavily July–September);
  iOS 27 GA lands mid-season. The developer's test device is an iPhone; adoption of
  new iOS versions among BBE's audience will lag GA by months.
- Precedent: iTranscreen (App Store) proves broadcast-extension + real-time OCR of
  other apps' screens passes review and fits the memory budget.

## Decision

Build the iOS capture layer against **ScreenCaptureKit as the primary target**, with
the capture/parse core isolated behind a `FrameSource` abstraction so a **ReplayKit
broadcast-extension fallback** can be added for iOS 26 devices if the subscriber base
warrants it. The feasibility spike (TASK-318) validates ScreenCaptureKit's
background-capture semantics on the iOS 27 beta before any production code is written.

## Alternatives Considered

### Option A: ScreenCaptureKit-first, ReplayKit fallback later (chosen)
- **Pros:** Targets the API Apple is actively investing in rather than one just
  deprecated; in-process capture removes the 50 MB ceiling and the
  extension→server→APNs relay for foreground scenarios; dramatically simpler
  process model (no App Group choreography); by the time the feature matures,
  iOS 27 is GA.
- **Cons:** Beta API today — semantics may shift before GA; excludes iOS 26 users
  until the fallback ships; background-capture behavior unverified (spike gate).

### Option B: ReplayKit broadcast extension now, migrate later
- **Pros:** Works on today's shipping iOS 26; battle-tested by every screen-share SDK;
  precedent (iTranscreen) de-risks review.
- **Cons:** Building the hardest version first — 50 MB OCR engineering, mandatory
  server push relay, App Group state handoff — against an API already marked
  deprecated, then paying a second migration cost within a year. Poor investment
  for a greenfield feature whose first season is a learning season.

### Option C: Dual implementation from day one
- **Pros:** Maximum device coverage at launch.
- **Cons:** Two capture stacks, two memory profiles, and the push relay must exist
  anyway — roughly doubles the riskiest subsystem before product-market fit is proven.
  Premature at side-project scale.

## Consequences

### Positive
- The 50 MB OCR constraint disappears from the critical path; Vision can run
  `.accurate` recognition in-process if needed.
- One process owns capture, parse, ledger, and ActivityKit — the App Group +
  Darwin-notification choreography of the extension model is avoided.
- The push relay (Supabase Edge Function → APNs) may still be needed for
  background-capture gaps, but its scope shrinks from "every update" to
  "updates while backgrounded," relaxing the throttling-budget pressure.

### Negative
- iOS 26 devices are unsupported at launch; the ReplayKit fallback is a real,
  deferred cost if analytics show meaningful iOS 26 usage among subscribers.
- Development races the iOS 27 GA timeline; beta churn may force rework.
- First-season launch realistically slips to late in the 2026 draft season or
  targets the 2027 season — accepted, since the spike and parse engine work is
  version-independent.

### Risks
- **Spike gate:** if ScreenCaptureKit cannot capture while the BBE app is backgrounded
  (user is in the Underdog app — the *only* scenario that matters) and grants no
  background runtime, the architecture degrades to exactly Option B's shape (some
  separate always-alive capture context + server push relay), and this ADR should be
  revised before implementation. TASK-318 answers this on the iOS 27 beta.
- Live Activity push throttling remains a hard budget even with
  `NSSupportsLiveActivitiesFrequentUpdates`; the update policy must prioritize
  "you're on the clock" moments over routine board movement regardless of transport.

## Revisit Conditions

- Spike finds background capture unsupported → revise toward broadcast-extension
  architecture before Phase-2 implementation tasks are planned.
- iOS 27 GA materially changes ScreenCaptureKit semantics from beta behavior.
- Subscriber device analytics show >25% of mobile-interested users stuck on iOS 26
  at launch → prioritize the ReplayKit fallback.

## Related
- Tasks: TASK-318 (spike), TASK-320 (capture module)
- ADRs: ADR-019 (capture mechanism), ADR-022 (app shell)

---
*Approved by: PH — 2026-07-11*
