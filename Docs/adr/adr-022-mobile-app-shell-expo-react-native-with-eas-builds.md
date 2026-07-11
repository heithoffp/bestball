# ADR-022: Mobile app shell Expo React Native with EAS builds

**Date:** 2026-07-11
**Status:** Accepted

---

## Context

The Mobile Live Draft Assistant needs an app shell around the native capture layer:
auth (Supabase), portfolio sync, the in-app Draft Assistant screen, manual-fallback
pick entry, and settings. Decision inputs:

- **The analytics brain is already written in portable JavaScript.** The web Draft
  Assistant's engines — `rosterArchetypes.js`, `stackAnalysis.js`, `playoffStacks.js`,
  `eliminatorModel.js`, `canonicalName.js` — are pure ES-module functions with no DOM
  dependencies. A JS-based shell reuses them verbatim; a Swift shell means rewriting
  and then maintaining two divergent copies of BBE's core domain logic.
- **The development machine is Windows 11.** Local iOS compilation requires Xcode on
  macOS; no Mac is confirmed available. Expo's EAS Build compiles iOS apps (including
  native Swift modules and widget/extension targets, via config plugins) in the cloud
  from any OS, delivering to the developer's iPhone through TestFlight.
- The dream explicitly includes **Android later** (overlay assistant); a
  cross-platform shell halves that future cost.
- The genuinely native parts are unavoidable either way: ScreenCaptureKit capture and
  the parse engine (Swift), the ActivityKit Live Activity widget (SwiftUI — WidgetKit
  cannot be React Native), and later the Android capture service + overlay (Kotlin).

## Decision

Build the mobile app as an **Expo React Native app** (`mobile-app/`) with the native
capture/parse/Live-Activity components implemented as **Swift modules integrated via
Expo config plugins**, compiled with **EAS Build** in the cloud and delivered via
TestFlight. The RN layer owns auth, data sync, all full-screen UI, and the ported JS
analytics; native modules own capture, OCR/parse, and ActivityKit.

## Alternatives Considered

### Option A: Expo React Native + native Swift modules + EAS (chosen)
- **Pros:** JS analytics utils and Supabase client patterns port from the web app
  nearly verbatim; iOS development is possible from the Windows machine (EAS cloud
  builds + TestFlight install on the developer's iPhone); Android phase reuses the
  entire shell; Expo config plugins are the established path for widget/extension
  targets (Live Activities have community plugins to start from).
- **Cons:** Native-module debugging through EAS cloud builds is slow-loop (minutes
  per build, no local Xcode debugger without a Mac); Expo adds abstraction over the
  native project that occasionally fights unusual targets; RN runtime adds app-size
  and memory overhead.

### Option B: Pure Swift/SwiftUI app
- **Pros:** First-class ActivityKit/ScreenCaptureKit integration; best performance;
  no framework layer between the app and the OS.
- **Cons:** Requires a Mac for every build-and-debug cycle — effectively unbuildable
  from the current Windows environment; rewrites all portfolio/draft analytics in
  Swift (then two sources of truth as the web app evolves); Android phase starts
  from zero.

### Option C: Capacitor wrapper around the existing web app
- **Pros:** Maximum reuse of the entire React web codebase, not just utils.
- **Cons:** The web app's UI is desktop-dashboard-shaped, not a native mobile
  experience; Capacitor's native-module story for extensions/widgets is weaker than
  Expo's; the parts that matter most here (capture, Live Activities) get no reuse
  benefit at all.

### Option D: Kotlin Multiplatform core + native UIs
- **Pros:** Shared parse/domain core across iOS/Android in one language.
- **Cons:** Rewrites the JS analytics anyway; adds a third language to the project;
  still needs a Mac for the iOS app around it; heavy architecture for a solo
  side-project team.

## Consequences

### Positive
- One codebase (plus thin native modules) targets both halves of the dream —
  iOS Live Activities now, Android overlay later.
- `rosterArchetypes`/`stackAnalysis`/`playoffStacks`/`eliminatorModel` are consumed
  as a shared package, keeping mobile and web analytics answers identical by
  construction.
- The Windows→cloud-build→TestFlight loop is validated as part of the spike, before
  any architecture is irreversible.

### Negative
- The tightest feedback loops (Swift capture module, Live Activity rendering) run
  through cloud builds — expect minutes-long iterations precisely where the hardest
  debugging lives. A borrowed/cloud Mac (e.g., MacStadium hourly) is the pressure
  valve for intensive native debugging weeks.
- An Apple Developer Program membership ($99/yr) and an Expo account (EAS free tier
  suffices initially) become project dependencies.
- Two UI technologies live in the app (RN screens + SwiftUI widget), each styled
  separately.

### Risks
- Expo config-plugin support for ScreenCaptureKit-era capture targets is unproven
  (the ecosystem's precedents are broadcast-extension-shaped); if plugin friction is
  severe, the escape hatch is Expo prebuild + maintaining the generated native
  project, which weakens but does not break the cloud-build story.
- If a Mac becomes regularly available, Option B's main objection dissolves — but
  the analytics-reuse argument still favors RN for this app.

## Revisit Conditions

- The spike's dev-environment step (TASK-318) fails to produce a working
  EAS-built dev client with a stub Swift module on the developer's iPhone.
- The JS analytics layer diverges such that mobile needs fundamentally different
  computation (e.g., on-device inference), removing the reuse advantage.
- Team/tooling changes: dedicated Mac hardware plus an Apple-platform developer
  joining would reopen Option B.

## Related
- Tasks: TASK-318 (spike validates the toolchain), TASK-319 (app scaffold)
- ADRs: ADR-019, ADR-020, ADR-021

---
*Approved by: PH — 2026-07-11*
