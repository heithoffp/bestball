# TASK-342: Mobile Draft Assistant — strip to capture-and-guide only (ADR-026)

**Status:** Approved
**Priority:** P2

---

## Objective

Reposition the mobile Draft Assistant tab from a live-session analytics surface (TASK-339) to a **capture + guide** surface, per ADR-026. The tab keeps only live-capture record functionality, a session confidence hub, and plain-language guidance diagrams. The demo draft, the "My Picks" board, and the entire in-app analytics engine are removed. Users review their team on Underdog during the draft or in BBE's other tabs after sync.

## Verification Criteria

1. The Draft Assistant **setup screen** (no active session) shows the username field, "Start live session", and guidance diagrams — including the "select your username in the banner to populate your roster (especially for slow drafts)" tip — and has **no "Try a demo draft" button**.
2. With a **live session active**, the tab shows only the confidence hub (`LiveSessionPanel`) and a full-screen guide — **no Available Players list, no strategy/QB/TE cards, no Eliminator, no stack/falling-knife badges, no player search, no "My Picks" board, and no demo controls** anywhere in the tab.
3. The mobile app has **no dangling references** to the removed symbols (demo functions, analytics helpers, `CoachMarks`) and the draft parse/session engine is undisturbed (`npm run test:draft` passes).

## Verification Approach

- **Syntax check** every edited/created JS/JSX file: `node --check <file>` returns clean for `DraftAssistantView.jsx`, `AssistantSetup.jsx`, `LiveSessionPanel.jsx`, `sessionController.js`, and the new `CaptureGuide.jsx`.
- **Engine integrity:** `cd mobile-app && npm run test:draft` — the parser/replay/slow-draft suites must all pass (confirms the demo removal did not disturb the session engine).
- **Dead-reference sweep** (each must return no hits in `mobile-app/src`):
  - `grep -rn "startDemoSession\|demoSync\|state.demo\|demoTimer\|stopDemoTimer" src` → expect zero.
  - `grep -rn "CoachMarks\|introSeen\|markIntroSeen" src` → zero.
  - `grep -rn "checkStrategyViability\|analyzeStack\|analyzeByeRainbow\|analyzeCandidatePlayoffStack\|TournamentFilter\|subscribeDraftFeed" src/screens/DraftAssistantView.jsx` → zero (these leave the Draft Assistant; the utils themselves stay in `shared/`).
  - Confirm `import ... from './draft/CoachMarks'` no longer exists anywhere.
- **Import hygiene:** visually confirm no unused imports remain in the three modified screens (the strip-down removes many).
- **Developer manual step (requires simulator/device):** run `cd mobile-app && npm start` (or `npm run ios`), open the Draft Assistant tab, and confirm: (a) setup shows no demo button + the guidance diagrams; (b) starting a live session shows the hub + guide only, with none of the removed analytics/board/demo UI. This visual confirmation is the developer's to make — the tab needs a running app to observe.

## Files to Change

| File | Action | Description |
|------|--------|-------------|
| `mobile-app/src/screens/DraftAssistantView.jsx` | Modify | Remove the analytics engine (viability/metrics memos, strategy cards, Eliminator, Available Players FlatList, player search, "My Picks" board subview, Segmented toggle) and the CoachMarks intro flow. Reduce to: no session → `AssistantSetup`; active session → `LiveSessionPanel` + `CaptureGuide` in a full-screen scroll. Drop all now-unused imports/state. |
| `mobile-app/src/screens/draft/AssistantSetup.jsx` | Modify | Remove the "Try a demo draft" button and `handleDemo`/`startDemoSession` usage. Keep username field + Start live session. Render `CaptureGuide` for the guidance diagrams. |
| `mobile-app/src/screens/LiveSessionPanel.jsx` | Modify | Remove all demo rendering: DEMO badge/branch, "Replaying a real draft room" row, the "Demo" (`demoSync`) action button; simplify now-constant `!demo` guards. Keep record CTA, capture heartbeat, room presence/reset, warnings, Debug/Frames, End. |
| `mobile-app/src/draft/sessionController.js` | Modify | Retire demo code paths: delete `startDemoSession`, `demoSync`, `stopDemoTimer`, the `demoTimer`/`demo` state fields, `demo` from `getSnapshot()`, the `demo` param + `!demo` branches in `startSession`, and the demo lines in `endSession`. No engine behavior change. |
| `mobile-app/src/screens/draft/CaptureGuide.jsx` | Create | New icon-based guidance component (React Native Views + `lucide-react-native`), matching the existing `stepStrip` aesthetic: the capture flow, the username-in-banner → roster-populate tip (slow-draft callout), a "review your team on Underdog / after sync" note, and the on-device privacy reassurance. No raster assets. |
| `mobile-app/src/screens/draft/CoachMarks.jsx` | Delete | Sole consumer was `DraftAssistantView`; obsolete once the analytics anchors are gone. |

## Implementation Approach

1. **`CaptureGuide.jsx` (new).** Build a self-contained, presentational component — no session/portfolio state. Sections, styled like `AssistantSetup`'s hero/stepStrip:
   - **Flow diagram:** three icon nodes — *Start & record* (red dot) → *Draft in Underdog* (`Smartphone`) → *Picks captured automatically* (`Cast`/`Check`).
   - **Username-banner tip (the headline guidance):** an illustrative mini-diagram of a drafter card with an `@username` highlighted, captioned "Tap/anchor your username in the draft room banner so BBE locks your slot and fills your roster — especially useful for slow drafts you return to over days." (`AtSign` + `Anchor` icons.)
   - **Where to view your team:** short note — "Reviewing your roster? Open Underdog during the draft, or check your other BBE tabs once rosters sync." (`ExternalLink`/`LayoutGrid`.)
   - **Privacy reassurance:** reuse the on-device wording (`ShieldCheck`).
   Accept an optional `compact` prop if setup vs in-session need slightly different density; default to one shared layout.
2. **`sessionController.js`.** Delete `startDemoSession` and `demoSync`. Delete `stopDemoTimer` and the `demoTimer` field. Remove `demo` from the `state` object and from `getSnapshot()`. In `startSession`, drop the `demo = false` param and collapse the `!demo` guards so the username requirement and `writeSharedValue` always apply; update the TASK-328/339 comment to drop the "Demo sessions synthesize one" clause. In `endSession`, remove the `stopDemoTimer()` call and `state.demo = false`. Leave the parse/session engine, heartbeat, activity, presence, and reset logic untouched.
3. **`LiveSessionPanel.jsx`.** Remove `demo` from the destructured snapshot and drop the `phaseColor` demo branch. Delete the demo "Replaying a real draft room" `roomRow`, the DEMO title branch (always "LIVE"), and the "Demo"/`demoSync` action button. Since `demo` is always false now, simplify the `!demo &&` guards (render those rows unconditionally). Keep everything else (record CTA, capabilities, presence/reset, Debug/Frames/End, preflight + debug modals). Remove the `demoSync` import.
4. **`AssistantSetup.jsx`.** Remove `handleDemo`, the demo `Pressable`, the `Play` icon import (if unused after), and `startDemoSession` from the import. Keep the hero (username + step strip + Start live session + warnings + privacy). Render `<CaptureGuide />` below the hero so the guidance diagrams appear pre-session too.
5. **`DraftAssistantView.jsx`.** Reduce to a thin container:
   - Keep: `subscribeSession` to toggle setup vs in-session.
   - Remove: `usePortfolio`, `subscribeDraftFeed`, all analytics imports (`rosterArchetypes`, `stackAnalysis`, `playoffStacks`, `eliminatorModel`, `playoffSchedule`, `canonicalName`), `TournamentFilter`, `SearchBar`/`Segmented`, `AsyncStorage` eliminator toggle, `CoachMarks` (+ `introSeen`/`markIntroSeen`), and all associated state/memos/renderers (`checkStrategyViability`, `computeMetrics`, `candidatePlayers`, `searchResults`, `strategyStatus`, `StrategyCard`, `renderPlayerRow`, the board `ScrollView`, coach-mark refs/steps).
   - Result: `if (!sessionActive) return <AssistantSetup/>;` else render a full-screen `ScrollView` containing `<LiveSessionPanel/>` then `<CaptureGuide/>`. The tab now takes the whole screen with capture + guidance only.
6. **`CoachMarks.jsx`.** Delete the file after removing its import.
7. **Verify** per the Verification Approach (syntax check, `test:draft`, dead-reference greps), then hand the manual visual step to the developer.

**Edge cases / notes:**
- Do **not** remove the shared analytics utils in `mobile-app/shared/` — other tabs (Exposures, Combos, Rosters, etc.) consume them; only the Draft Assistant's *consumption* is removed.
- `DraftBoardModal.jsx` stays (used by `RostersView`, unrelated to this tab).
- `__fixtures__/underdogOcrFixture.js` becomes unused at runtime but is inert reference/test data — leave it (removing risks the `test:draft` harness and loses captured OCR evidence).
- The `bbe.assistantIntroSeen` / `bbe.eliminatorMode` AsyncStorage keys are simply no longer written/read; no migration needed.

## Dependencies

None. (ADR-026 is Accepted. Independent of the In-Progress TASK-339, which this repositions.)

## Open Questions

- Guidance visuals are built as **icon-based diagrams** (Views + lucide icons), consistent with the existing step strip and requiring no binary assets. If the developer later wants polished raster illustrations, that's a follow-up task — flagged, not blocking.

---
*Approved by: <!-- pending -->*
