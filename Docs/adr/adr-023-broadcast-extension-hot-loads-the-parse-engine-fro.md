# ADR-023: Broadcast extension hot-loads the parse engine from the App Group

**Date:** 2026-07-15
**Status:** Accepted

---

## Context

The live-draft parse engine runs inside the ReplayKit **broadcast extension** via JavaScriptCore. `FrameProcessor.swift` loads it from `engine.js` — a static resource baked into the *native* extension bundle (`Bundle(for: FrameProcessor.self).url(forResource: "engine", withExtension: "js")`). The **same** engine also runs in the app process from its JS modules, and per the load-bearing design of ADR-021 both paths run byte-identical logic so behavior is guaranteed to match.

Because the extension's copy is a native bundle resource, **every parser fix requires a full EAS iOS build**. Mid-draft-season (2026-07-15) the free EAS build quota is exhausted, so parser iteration (`task329.x`) is blocked. Meanwhile app-side JS already iterates freely via Metro dev-client reload — the extension's frozen copy is the *only* piece chained to native builds.

Two facts shape the options:

- The app process has App Group write access (`BBEDraftNativeModule`, `group.com.bestballexposures.app`) and already hands the extension its session config and frame-log files through that container.
- The extension is a **fresh process** each broadcast, so it reads the container at every session start — there is no stale-in-memory concern.

## Decision

The app writes its current engine bundle — engine **text** plus a monotonic **`ENGINE_BUILD`** integer and the human-readable **`ENGINE_VERSION`** string — into the App Group container at Live Session start. In `FrameProcessor.setUp()` the extension prefers the App Group copy over its bundled asset **only when both** hold:

1. the App Group `ENGINE_BUILD` is **strictly greater** than the extension's own bundled build (**higher-build-wins**), and
2. the chosen source passes an **integrity sanity-eval** — evaluated in a throwaway `JSContext`, `globalThis.BBEEngine` must exist with a matching integer `build`, a `version` string, and a callable `init`.

On **any** failure — missing / partial / corrupt file, eval exception, or an older-or-equal build — it falls back to the **bundled asset**, which is the always-safe floor. The engine text is emitted by `build:engine` into a generated `engineSource.js` that becomes part of the app's JS bundle, so after **one** final EAS build ships this mechanism, parser fixes reach the extension via a JS reload (Metro today, production OTA if `expo-updates` is later adopted) with **zero native rebuilds**.

## Alternatives Considered

### Option A: Keep `engine.js` as a native-only bundle resource (status quo)
- **Pros:** Simplest trust model — the extension only ever runs code from its own signed bundle; no version-ordering logic.
- **Cons:** This *is* the bottleneck. Every parser fix costs a full EAS build; iteration is currently blocked by quota exhaustion. Rejected.

### Option B: Hot-load with **higher-build-wins** ordering (chosen)
The app writes the engine to the App Group; the extension runs `max(appGroupBuild, bundledBuild)` among sources that pass integrity.
- **Pros:** Robust against a **stale** App Group copy left by a prior app version overriding a newer native build. Matches the intuitive "prefer the newer engine" contract. Bundled asset remains the guaranteed floor.
- **Cons:** In a JS **rollback**, the extension could run one build *ahead* of the rolled-back app modules, skewing the serialize/hydrate state contract. Mitigated: the app rewrites the App Group copy on **every** session start, and rollbacks are exceptional recovery events.

### Option C: Hot-load with **app-is-authoritative** ordering
The extension prefers **any** valid App Group copy regardless of build number.
- **Pros:** The extension always mirrors the app's *current* engine modules — best possible serialize/hydrate consistency.
- **Cons:** Trusts the app to write promptly and leans entirely on the integrity eval to reject a stale/corrupt leftover; a stale-but-valid copy from a previous app version would override a newer native build. Not selected.

### Option D: Transport the engine as a UserDefaults blob instead of a file
- **Pros:** Reuses the existing `writeSharedValue` KV path; no new native function.
- **Cons:** A ~40 KB blob bloats the KV store that also carries session config and heartbeat. A container file matches how the frame-log recorder already uses the App Group and keeps KV lean. Rejected in favor of a file, with only small build/version markers in UserDefaults for a cheap pre-check.

## Consequences

### Positive
- After one final EAS build (shipping the new `FrameProcessor` + native `writeSharedFile`), **engine/parser changes are JS-reload-only** — the EAS-build tax on parser iteration is removed.
- The bundled asset stays the safe floor: a fresh install, cleared container, or corrupt write still starts capture on a known-good engine. The hot-load path can never brick capture.
- The engine's actual identity is observable — the result JSON's existing `engine` field reports whichever engine actually ran, so the confidence hub can prove it.

### Negative
- Slightly **widens the extension's trust surface**: it now evaluates JS read from the shared container rather than only from its own signed bundle. Bounded by same-app authorship, on-device-only origin, the integrity eval, and the bundled fallback.
- Introduces a **coordination signal** (`ENGINE_BUILD`) that must be bumped with every engine change, and a generated `engineSource.js` that must stay in lockstep with `assets/engine.js` (enforced by a build sync-guard).

### Risks
- **App Review posture (2.5.2 / 3.3.2):** the JS the extension runs originates from the app's **own** JS bundle written to the shared container — **not** a runtime network fetch of arbitrary remote code. This is consistent with the established React Native / Expo interpreted-JS model (interpreted code executed by the app's own scripting environment is permitted). The extension performs **no** download-and-eval of remote code.
- **Serialize/hydrate skew** under a JS rollback (see Option B cons).

## Revisit Conditions

- Apple's interpreted-code stance for app extensions changes, or a future design fetches engine code from the network at runtime (would require re-evaluating the App Review posture).
- JS rollbacks become routine, or state-shape divergence between the app modules and the extension engine is observed in practice (would reopen the higher-build-wins vs. app-authoritative ordering choice).

## Related
- Tasks: TASK-333
- ADRs: ADR-019 (on-device capture), ADR-020 (iOS capture — ScreenCaptureKit / ReplayKit), ADR-021 (parse engine as incremental pick-ledger — the byte-identical-engine premise), ADR-022 (Expo / EAS app shell)
