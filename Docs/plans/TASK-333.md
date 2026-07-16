# TASK-333: Broadcast extension hot-loads engine.js from the App Group (decouple parser fixes from EAS builds)

**Status:** Approved — implemented, on-device verification pending
**Priority:** P2

---

## Objective
Let parser/engine fixes reach the ReplayKit broadcast extension through the normal JS-update path (Metro dev-client reload today; production OTA later if `expo-updates` is added) instead of a full EAS native build. The app writes its current engine bundle into the App Group at session start; `FrameProcessor` prefers that copy when its build number is newer than the one baked into the extension *and* it passes an integrity check, falling back to the bundled asset otherwise.

## Verification Criteria
1. After a parser tweak + `npm run build:engine` + a **Metro JS reload only (no EAS build)**, starting a live session makes the extension run the new engine — `LiveSessionPanel`/`exportDebug` reports the bumped `ENGINE_VERSION` and the fix is reflected in parsing.
2. When no valid App Group copy exists (fresh install, cleared container, or a corrupt/partial write), the extension still starts and runs its **bundled** engine — capture is never bricked by the hot-load path.
3. `engine.js` and the new generated `engineSource.js` stay in lockstep with the engine source: regenerating them leaves the git tree clean (the sync guard fails loudly if a build was skipped).

## Verification Approach
Automated (run before the on-device pass):
- `cd mobile-app && npm run build:engine` — regenerates both `targets/draft-broadcast/assets/engine.js` and `src/draft/generated/engineSource.js`; `git status --porcelain` on those two paths is empty when source is unchanged (the sync guard).
- `cd mobile-app && npm run test:draft` — the engine still bundles and the parser fixtures pass; extend it (or add a sibling check) to assert `engineSource.js` exists, exports `ENGINE_SOURCE`/`ENGINE_BUILD`/`ENGINE_VERSION`, and that `ENGINE_SOURCE` is byte-identical to `assets/engine.js`.
- Sanity-eval unit: evaluating `ENGINE_SOURCE` in a bare JS context exposes `globalThis.BBEEngine.build` (integer) and `.version` (string) matching the generated exports — this is the exact check Swift performs, run in Node so it's verifiable off-device.

Manual / on-device (requires the developer + iPhone; **needs the one EAS build below first**):
1. Build **once** on EAS with the new `FrameProcessor` + native `writeSharedFile` (this is the last native rebuild the engine will require).
2. Make a trivial, observable parser change; `npm run build:engine`; bump `ENGINE_BUILD` + `ENGINE_VERSION`.
3. Reload JS over Metro only — **do not** run EAS again.
4. Start a Live Session, tap record, confirm Start Broadcast, draft.
5. Confirm: the confidence-hub/debug export shows the new `ENGINE_VERSION`, and the parser behavior reflects the change.
6. Fallback check: delete the app / clear the container so no App Group engine exists, start a session, confirm capture still runs on the bundled engine and `engine` in the result reads the bundled version.

## Files to Change
| File | Action | Description |
|------|--------|-------------|
| `mobile-app/src/draft/extensionEngine.entry.js` | Modify | Add monotonic `ENGINE_BUILD` integer beside `ENGINE_VERSION`; expose both as `globalThis.BBEEngine.build` / `.version` so an evaluated context is self-describing. |
| `mobile-app/scripts/build-extension-engine.mjs` | Modify | After emitting `assets/engine.js`, also emit committed `src/draft/generated/engineSource.js` exporting `ENGINE_SOURCE` (the IIFE text), `ENGINE_VERSION`, `ENGINE_BUILD`. |
| `mobile-app/src/draft/generated/engineSource.js` | Create | Generated: engine text-as-string + version/build, imported into the app JS bundle. Committed like `assets/engine.js`. |
| `mobile-app/modules/bbe-draft-native/ios/BBEDraftNativeModule.swift` | Modify | Add `writeSharedFile(name, contents)` / `readSharedFile(name)` writing/reading the App Group container. |
| `mobile-app/src/draft/liveActivity.js` | Modify | Wrap the new native functions (no-op when the module is absent, matching the existing pattern). |
| `mobile-app/src/draft/sessionController.js` | Modify | In `startSession()`, write `ENGINE_SOURCE` to the App Group file and `ENGINE_BUILD`/`ENGINE_VERSION` to UserDefaults keys before the extension's `setUp` runs. |
| `mobile-app/targets/draft-broadcast/FrameProcessor.swift` | Modify | In `setUp()`, resolve the engine source: read the App Group copy + build, compare to the bundled build, sanity-eval the winner in a throwaway `JSContext`, adopt if valid & newer, else fall back to the bundled asset; log which ran. |
| `mobile-app/scripts/test-draft-parser.mjs` | Modify | Add the `engineSource.js` sync/exports assertions (sync guard). |
| `mobile-app/docs/LIVE_SESSION_V1.md` | Modify | Update the engine-version handshake section to describe hot-load + fallback. |
| `mobile-app/docs/ARCHITECTURE.md` | Modify | Note the App Group engine hot-load path and its build-ordering/integrity rules. |
| `docs/adr/adr-0NN-*.md` | Create | ADR (via hus-adr) — executing JS outside the extension bundle + version-ordering + fallback semantics. **Prerequisite; drafted and approved separately.** |

## Implementation Approach
1. **Engine identity (monotonic build).** `ENGINE_VERSION` (e.g. `task329.4`) has no orderable form, so "newer" is undefined. Introduce `ENGINE_BUILD` — a plain integer bumped with every engine change alongside the human-readable version. Attach both to the engine object (`BBEEngine.build`, `BBEEngine.version`) so any evaluated copy is self-describing without parsing comments. This is the load-bearing design point deferred to the ADR.
2. **Make the engine text part of the app JS bundle.** `build:engine` currently emits only the IIFE at `assets/engine.js` (shipped inside the *native* extension bundle, hence the rebuild tax). Add a second output — `src/draft/generated/engineSource.js` — that exports the same text as a JS string plus the version/build. Because it's ordinary app JS, it updates via Metro reload now (and production OTA later if `expo-updates` is adopted) — that is the whole mechanism by which the engine can change without a native build.
3. **Transport via App Group file.** Engine text is ~40 KB. Write it to a file in the App Group container (`engine-hotload.js`) via a new thin native `writeSharedFile`, keeping the small version/build markers in UserDefaults for a cheap pre-check. A file (rather than a UserDefaults blob) matches how the frame-log recorder already uses the container and keeps the KV store lean. Written in `startSession()` — the guaranteed-fresh point: the app writes, *then* the user taps record, *then* the extension process launches and `setUp()` reads it, so timing is always correct (the extension is a fresh process each broadcast).
4. **Extension resolve-with-fallback.** In `setUp()`: read the App Group build marker; if it exists and is `>` the bundled `ENGINE_BUILD`, load that source, else use the bundled asset. Then **sanity-eval the chosen source in a throwaway `JSContext`** and require `globalThis.BBEEngine` to exist with a matching integer `build` and a `version` string (and that `init` is callable) before committing to it. Any failure — missing file, partial write, eval exception, build mismatch — falls back to the bundled asset. The bundled asset is thus the always-safe floor. The result JSON already carries `engine`, so `LiveSessionPanel` automatically shows whichever engine actually ran.
5. **Sync guard.** Mirror the `build:data` discipline: `test:draft` (or a sibling check) asserts `engineSource.js` exists, its `ENGINE_SOURCE` is byte-identical to `assets/engine.js`, and its exported build/version match the entry file — so a skipped `build:engine` fails CI/local rather than silently shipping stale text.
6. **Docs.** Update `LIVE_SESSION_V1.md` (engine-version handshake) and `ARCHITECTURE.md` to describe the hot-load path, the build-ordering rule, and the fallback.

**One-time native cost:** this change *itself* ships a new `FrameProcessor` and a new native `writeSharedFile`, so it needs **one** final EAS build to land. After that build, engine changes are JS-reload-only.

## Dependencies
- **ADR (blocking):** executing interpreted JS sourced outside the extension's own signed bundle (App Review / JavaScriptCore posture), the monotonic-build ordering rule, and fallback semantics. To be drafted via hus-adr and approved before code.

## Open Questions
1. **Build ordering vs. the serialize/hydrate contract.** The app absorbs the extension's serialized state, so the app-side engine modules and the extension engine should agree on state shape. "Extension picks the higher build" is robust against a *stale* App Group copy but, in a JS rollback, would run the extension one build ahead of the rolled-back app modules. Alternative: "app is always authoritative — prefer any valid App Group copy regardless of build," which stays consistent with the app modules but trusts prompt app writes. This is the core ADR decision; plan currently assumes **higher-build-wins** per the task objective's "newer" wording.
2. **No `expo-updates` today.** The realistic update path is a Metro dev-client reload (exactly how app-side JS is iterated now), not production OTA. The mechanism works identically the day `expo-updates` is added; the plan does not add it.

## Handoff Notes
- **Tried:** Implemented all seven steps. `ENGINE_BUILD = 1` added to `extensionEngine.entry.js` and exposed as `BBEEngine.build`/`.version`; `build:engine` now also emits `src/draft/generated/engineSource.js` (committed); native `writeSharedFile`/`readSharedFile` added; `startSession()` writes `engine-hotload.js` + `bbe.engineBuild`/`bbe.engineVersion`; `FrameProcessor.setUp()` resolves engine via build-compare + sanity-eval + bundled fallback; `test:draft` gained the hot-load sync guard.
- **Result (automated, green):** `npm run test:draft` all checks pass (incl. new hot-load bundle checks); `npm run build:engine` is deterministic and regenerates both artifacts; `npx expo export --platform ios` compiles the full JS bundle graph with the new import.
- **Blocker:** Criteria 1 & 2 are on-device and need **one** EAS build to ship the new `FrameProcessor` + native `writeSharedFile` — and the free EAS quota is the very constraint (see TASK-334 for the free build pipeline). Swift could not be compiled on Windows; the first device build is the real gate.
- **Next step:** After the one EAS build lands, run the on-device pass in Verification Approach (parser tweak → `build:engine` → Metro reload only → confirm the extension reports the new `ENGINE_VERSION`; then clear the container to confirm bundled fallback). Then present the Reflection and close.

---
*Approved by: developer (plan + ADR-023), 2026-07-15*
