<!-- Completed: 2026-07-14 | Commit: 10e1546 (base; TASK-327 changes uncommitted at close) -->
# TASK-327: Live Draft Session — remove screenshot capture mode, make live capture the sole path, add mid-draft resume detection

**Status:** Approved (explicit developer approval, 2026-07-14)
**Priority:** P2

---

## Objective
Live capture (ReplayKit broadcast → Vision OCR → shared JS engine in JSC → App Group → relay) is now proven working end-to-end on the developer's device and reacts to the live draft board. Remove the screenshot (Photos-sweep) fallback and the separate Shortcuts/deep-link OCR path entirely so **live capture is the only ingestion path**, and drop the `expo-media-library` dependency and Photos permission that only the screenshot path needed. Fold in **mid-draft resume detection**: when live capture joins a draft already in progress, surface it in the assistant panel. The engine already backfills board picks idempotently by overall pick number, so this is a matter of *exposing* the resume state (`picksAtStart` / `isResume`), not new capture logic.

## Verification Criteria
1. `npm run test:draft` passes all checks (rebuilds the JSC engine bundle first, so engine changes propagate to the extension bundle), including new resume-detection assertions.
2. New engine assertions pass: a mid-draft capture reports `isResume === true` with `picksAtStart` past round 1; a fresh round-1 capture reports `isResume === false`; a hydrated session preserves the resume flag across serialize→hydrate.
3. `npx expo export --platform ios` bundles the JS graph with no import/module error after `screenshotSync.js` and `app/draft-ocr.jsx` are deleted (no dangling imports).
4. No remaining references to `expo-media-library`, `screenshotSync`, `syncNow`, `ingestOcrText`, `photoAccess`, or `mode === 'shots'` in `src/` (grep clean).
5. `expo-media-library` is removed from `package.json` and the `app.json` plugin list, and the `photosPermission` string is gone; `npm install` reconciles the lockfile without error.
6. `LiveSessionPanel.jsx` idle state no longer shows a Live/Screenshots toggle or a "Sync now" button; the active state shows a resume banner when `status.isResume` is true; the panel bundles without JSX/import errors.
7. Docs (`docs/LIVE_SESSION_V1.md`, `mobile-app/README.md`) reflect a single live-capture path and the resume-detection behavior.

## Verification Approach
- **Automated (Claude, on Windows):**
  - `cd mobile-app && npm run test:draft` — all green, including new resume assertions and the existing checks + JSC bundle parity.
  - `cd mobile-app && npx expo export --platform ios` — full bundle graph compiles with the two files deleted and imports removed.
  - `git grep` for the removed symbols (`expo-media-library`, `screenshotSync`, `syncNow`, `ingestOcrText`, `photoAccess`, `'shots'`) under `mobile-app/src` and `mobile-app/app` returns nothing.
  - `cd mobile-app && npm install` completes and updates `package-lock.json`.
- **Developer manual (on device, EAS dev/preview build — no simulator on Windows):**
  1. Fresh EAS build; open Draft Assistant → Live Draft Session. Confirm only the live-capture flow exists (no mode toggle, no Sync-now).
  2. Start a **new** slow draft, arm capture — confirm no "resumed" banner appears at pick 1.
  3. Join a slow draft **already in progress**, arm capture, glance at the board once — confirm the ledger backfills and a "Resumed mid-draft — N picks already on the board" banner appears.
  4. Confirm the Photos permission prompt no longer appears anywhere in the session flow.
  Claude presents these as outstanding manual steps and will not mark Verified/Done until the developer confirms.

## Files to Change
| File | Action | Description |
|------|--------|-------------|
| `mobile-app/src/draft/screenshotSync.js` | Delete | Photos-sweep FrameSource — only the screenshot mode used it. |
| `mobile-app/app/draft-ocr.jsx` | Delete | Shortcuts/deep-link OCR-text route — removed per developer decision. |
| `mobile-app/src/draft/sessionController.js` | Modify | Drop the `mode` concept (always live). Remove `syncNow()`, `ingestOcrText()`, `state.photoAccess`, `state.mode`, `state.lastAutoSyncMs`, imports of `ensurePhotoPermission`/`fetchNewScreenshots` and `recognizeText`. Simplify `startSession`, the AppState handler, `pollExtension`, `absorbExtensionState`, and `endSession` to remove shots branches. Remove `mode`/`photoAccess` from `getSnapshot`. Keep `demoSync()`. Add a one-time resume log line. |
| `mobile-app/src/screens/LiveSessionPanel.jsx` | Modify | Remove the Live/Screenshots `Segmented` toggle + `mode` state, the "Sync now" button, the `photoAccess` warning, and all `isLiveMode` gating (always live). Disable Start when `!capabilities.nativeModule`. Rewrite idle helper copy to live-only and mention mid-draft backfill. Add a resume banner when `status.isResume`. Drop now-unused imports (`Segmented`, `Camera`). Keep the TASK-326 preflight modal. |
| `mobile-app/src/draft/sessionEngine.js` | Modify | Add `state.observedStartPick`, captured on the first ingest with real pick evidence. Expose `picksAtStart` and `isResume` (`picksAtStart > teams`) in `getStatus()`. Carry `observedStartPick` through `serialize()` (`osp`) / `hydrate()`. Change the `armed` glance headline from "Screenshot your draft to sync" to "Waiting for capture to start". |
| `mobile-app/scripts/test-draft-parser.mjs` | Modify | Add resume-detection assertions: positive (mid-draft fixture → isResume true), negative (synthetic round-1 board → isResume false), and hydrated-flag preservation. |
| `mobile-app/app.json` | Modify | Remove the `expo-media-library` plugin entry and its `photosPermission` string. |
| `mobile-app/package.json` | Modify | Remove the `expo-media-library` dependency; run `npm install` to reconcile the lockfile. |
| `mobile-app/docs/LIVE_SESSION_V1.md` | Modify | Mark screenshot mode + Shortcuts path removed; live capture is the sole path; document resume detection. |
| `mobile-app/README.md` | Modify | Update the "two capture modes" description to the single live-capture path + resume detection. |

## Implementation Approach
1. **Engine first (`sessionEngine.js`)** — add resume tracking and fix the armed headline. This is pure and the tests exercise it directly.
2. **Controller (`sessionController.js`)** — strip the shots path and mode branching; keep the live path and `demoSync`; add the one-time resume log.
3. **Panel (`LiveSessionPanel.jsx`)** — strip the toggle / Sync-now / photo warning; always-live UI; resume banner; Start disabled without native module.
4. **Delete** `screenshotSync.js` and `app/draft-ocr.jsx`.
5. **Config** — `app.json` plugin/permission removal; `package.json` dependency removal; `npm install`.
6. **Tests + docs** — add resume assertions, run `npm run test:draft`, then update the two docs.

### Notes / edge cases
- `textToItems` and `parseUnderdogScreen` stay — used by `demoSync()` and the test harness; only the *screenshot* and *Shortcuts* entry points are removed.
- `liveActivity.recognizeText` (native Vision OCR) becomes unused by the app (the extension does its own OCR); left in place as a harmless native capability rather than removing the native method this pass.
- Resume threshold: `picksAtStart > teams` (more than a full round already drafted) = a genuine in-progress join; a late-by-a-pick fresh draft stays `isResume=false`.
- `observedStartPick` must round-trip through the App Group handoff, so it is added to `serialize`/`hydrate` (the extension sets it; the app hydrates it).

## Dependencies
Relates to TASK-326 (preflight privacy modal — uncommitted, live-mode only; preserved by this task). No blocking dependencies.

---
*Approved by: Developer (explicit blanket approval, 2026-07-14) — "I auto approve any changes you do with your plan."*
