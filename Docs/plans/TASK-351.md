# TASK-351: Mobile Rankings overhaul: drag-and-drop board + true UD-vs-DK Compare (web parity)

**Status:** Approved
**Priority:** P2

---

## Objective
Replace the mobile Rankings tab's tap-and-chevron reordering with real drag-and-drop (drag handles, auto-scroll, tier rails) and replace the incorrect Compare stand-in (rank vs live ADP) with a true Underdog-vs-DraftKings side-by-side diff view, matching the intent of `Docs/Feature_Specs/Player_Rankings.md` adapted for touch.

**Scope decisions (developer, 2026-07-18):**
- Compare mode is an **interactive diff** — synced dual columns, rank-delta curves/badges, movers filter, tap-to-highlight counterpart. Reordering stays in the single-platform board. In-compare editing + mirror proposals deferred (candidate follow-up task).
- Library choice recorded here, no ADR: **`react-native-reorderable-list` pinned exactly to `0.18.1`** — the only actively-maintained (July 2026), FlatList-virtualized drag-reorder library compatible with Expo SDK 57 / RN 0.86 / Reanimated 4.5 + worklets / New Architecture. Rejected: `react-native-draggable-flatlist` (Reanimated-2 era, ~14 months unmaintained, no New-Arch validation); `react-native-sortables` v1.9.4 (strong compat story but not virtualized — all ~300 rows mounted — and has a known gesture-handler-2.x stuck-item bug on iOS New Arch). `react-native-sortables` is the designated fallback if reorderable-list fails on-device. Pure JS on top of already-installed gesture-handler/reanimated → no new native module, no EAS rebuild needed.

## Verification Criteria
1. On device, players on the board can be reordered by long-pressing a row's grip handle and dragging, with auto-scroll near the list edges; the new order Saves and comes back after app relaunch.
2. Tier rails are fully editable on mobile: tap a label to rename it inline, ✕ removes a break, a "+ Tier" pill between rows inserts one — and Save/Export produce the same CSV tier columns the web writes.
3. Compare shows Underdog and DraftKings boards side-by-side with synced scrolling, a movers filter, and tap-a-player rank-delta highlighting — the rank-vs-ADP delta list is gone.

## Verification Approach
Automated (Claude runs, reports output):
- `node mobile-app/scripts/test-rankings-board.mjs` exits 0 — pure-logic tests for `boardItems.js`: flat-item interleaving (dividers/insert-pills/players), reorder mapping from flat indices back to `{players, breaks}` including edge cases (drop above tier-1 rail, drop directly under a divider, drop at list end, break-owning player dragged away), and tier-label migration.
- Babel transform check on every new/changed `.jsx` file via `babel-preset-expo` (the project's established stand-in for lint — mobile-app has no lint script), plus `node --check` on plain `.js`/`.mjs` files.
- `grep` confirms the old compare stand-in (`compareRows`, "biggest disagreements first") no longer exists in `mobile-app/src/`, and `react-native-reorderable-list` appears in `package.json` with an exact (non-caret) version.
- `git diff --stat best-ball-manager/` is empty — web app untouched.

Manual (requires the developer, on-device via dev client):
1. Board: long-press grip → drag a player 10+ spots with auto-scroll; verify haptic/visual feedback and correct landing position.
2. Tier editing: rename a tier label, delete a break, insert a break mid-board; Save; force-quit and relaunch; verify order + tiers restored.
3. Compare: toggle Compare; verify synced scroll, movers filter steps, tap-to-highlight + Δ badge, and column source pills (Saved vs ADP fallback).
4. Regression: position views + search still filter; search shows the drag-paused notice; Export share sheet still works.

## Files to Change
| File | Action | Description |
|------|--------|-------------|
| `mobile-app/package.json` | Modify | Add `react-native-reorderable-list` pinned to exactly `0.18.1` |
| `mobile-app/app/_layout.jsx` | Modify | Wrap root in `GestureHandlerRootView` (required by gesture-handler; currently absent) |
| `mobile-app/src/screens/RankingsView.jsx` | Rewrite | Slim shell (arena-pattern): platform Segmented + Board/Compare toggle, seeds shared player state, dispatches to sub-views |
| `mobile-app/src/screens/rankings/BoardView.jsx` | Create | Drag-and-drop board: `ReorderableList` over flat items, row cards w/ grip handle, expand-on-tap detail + jump-to-rank input, toolbar (Save/Export/Reset), search + position chips |
| `mobile-app/src/screens/rankings/boardItems.js` | Create | Pure logic: `buildFlatItems(players, breaks, labels)`, `applyFlatReorder(flatItems, from, to)` → `{players, breaks, labels}`, break/label migration rules ported from web `handleDragEnd` |
| `mobile-app/src/screens/rankings/TierRail.jsx` | Create | Tier divider row (colored rail, inline-editable label, ✕ delete) + "+ Tier" insert pill row |
| `mobile-app/src/screens/rankings/CompareView.jsx` | Create | UD-vs-DK diff: two synced virtualized columns, source pills, movers filter (stepped chips: All/5+/10+/25+/50+), search, tap-to-highlight + Δ badge, scroll-lock toggle |
| `mobile-app/src/screens/rankings/CompareCurves.jsx` | Create | `react-native-svg` port of web CompareCurves math (Bézier per player, stroke width by \|Δrank\|, edge markers for off-screen counterpart) |
| `mobile-app/src/screens/rankings/buildPlayers.js` | Create | Port of web `components/PlayerRankings/buildPlayers.js` `buildPlayersFromSource` (canonical-name ids so UD/DK rows match across columns) |
| `mobile-app/src/theme.js` | Modify | Add `platformUd` / `platformDk` color tokens (web `--platform-ud`/`--platform-dk` equivalents) |
| `mobile-app/scripts/test-rankings-board.mjs` | Create | Node test harness for `boardItems.js` (same pattern as existing engine test scripts) |
| `Docs/Feature_Specs/Player_Rankings.md` | Modify | Document mobile behavior: drag board parity, mobile Compare = interactive diff (editing on boards), movers chips instead of slider |

## Implementation Approach

**Phase 1 — Foundation.** `npm install --save-exact react-native-reorderable-list@0.18.1` in `mobile-app/`; add `GestureHandlerRootView` at the root of `app/_layout.jsx` (wrapping the existing SafeAreaProvider tree); add platform color tokens to `theme.js`. Smoke-test with a trivial 5-item reorderable list before building on it (fallback trigger: if drag doesn't function in the dev client, switch to `react-native-sortables` per the fallback note and flag for re-approval of the perf trade-off).

**Phase 2 — Board logic (`boardItems.js` + tests).** The list rendered is a flat array interleaving tier dividers, "+ Tier" insert pills, and player rows (web `flatItems` pattern). Divider/pill rows never call `useReorderableDrag`, so only players drag. On `onReorderEnd(from, to)`, map flat indices back to model state: the dragged player's new position among player-items determines the new `rankedPlayers` order, and the divider immediately above the landing slot determines tier membership — reproducing the web's break-reassignment rules (break travels to the new first-player-of-tier; label migrates with it). All of this is pure-function logic with node tests; the component stays thin. Edge cases handled in tests: drop above the tier-1 rail (clamp below it), drop directly beneath a divider, drop at the very end, dragging the sole player of a tier away (break dissolves), dragging a break-owning player (break reassigns to the next player, web-identical).

**Phase 3 — BoardView.** Row = grip handle (long-press → `useReorderableDrag`) + rank + pos pill + name/team/bye/proj + ADP, matching current row styling; tap row body → expanded detail panel retaining the jump-to-rank input (typing a number remains the fast path for 100+-spot moves). Tier rails and insert pills rendered from flat items via `TierRail.jsx`; label tap → inline `TextInput` (Enter saves, blur saves, Escape-equivalent = cancel button). Drag enabled in Overall and position views (position-view drops anchor to the neighbor player id, then reorder the full list relative to that anchor, like the web); drag paused while searching with the web's notice line. Seeding: replace the current length-keyed `seededFor` guard with source-identity tracking (web's `prevInitialPlayersRef`), fixing missed re-seeds when saved and ADP sources have equal length. After a successful Save, push the saved rows into `PortfolioContext.setRankingsByPlatform` so the context and any TASK-348 background refresh agree with the just-saved board rather than clobbering it.

**Phase 4 — Compare diff.** Build both platforms' lists with `buildPlayers.js` (canonical-name ids → cross-platform matching). Two `FlatList` columns (~160pt each) with a ~56pt SVG gutter; scroll events (throttled via `onScroll`) drive curve recomputation exactly like the web's offset-based approach; scroll-lock on by default with a lock toggle. Movers filter as stepped chips (All / 5+ / 10+ / 25+ / 50+) — RN has no built-in slider and a new dependency isn't warranted. Tap a row → highlight it + counterpart, draw only that curve at full opacity with a ±Δ badge, auto-scroll the other column to the counterpart. Position chips + shared search apply to both columns. Header: platform-colored labels, Saved/ADP-fallback source pills, row counts.

**Phase 5 — Shell rewrite.** `RankingsView.jsx` becomes the shell (arena convention): platform Segmented (Underdog/DraftKings), Compare toggle chip, mounts BoardView or CompareView. All existing exports/saves keep flowing through `shared/utils/rankingsExport.js` unchanged — no `shared/utils` edits in this task.

**Phase 6 — Verification + spec.** Run the automated checks (Verification Approach), update the feature spec's mobile sections, then present the manual on-device checklist to the developer.

## Dependencies
- TASK-348 (mobile cache-first launch data, ADR-030) shares the rankings data layer in `PortfolioContext`. Not blocking, but the Save→context write-back in Phase 3 is designed to cooperate with its local-first + background-refresh flow. If TASK-348 lands mid-task, re-verify the seed/refresh interaction.

## Open Questions
- **Risk — 0.x API:** `react-native-reorderable-list` is explicitly API-unstable pre-1.0. Mitigation: exact-version pin, Phase-1 on-device smoke test before deep integration, `react-native-sortables@1.9.4` as fallback.
- **Risk — flat-list row count:** ~300 players + dividers + insert pills ≈ 600+ rows. FlatList windowing should handle it (current screen already renders 300+ rows fine); if insert-pill rows measurably hurt scroll perf, collapse them into a touch zone on the player row instead of standalone rows.
- **Deferred (candidate follow-up task):** in-Compare editing with mirror-edit proposals ("Apply to DK (+3)") once the drag foundation is proven.

## Handoff Notes
- Tried: full implementation (all 6 phases) completed 2026-07-18 — dependency pinned, GestureHandlerRootView added, boardItems logic + 36 node tests, BoardView with drag/tier editing, CompareView + CompareCurves (SVG diff), shell rewrite, feature spec updated.
- Result: all automated verification passes (node tests exit 0, babel transform clean on all 9 files, old compare stand-in gone, exact pin confirmed, web app untouched).
- Blocker: manual on-device verification (4 numbered steps in Verification Approach) requires the developer's dev client. The Phase-1 on-device drag smoke test is folded into manual step 1.
- Next step: developer runs the manual checklist; if drag fails on-device, fall back to react-native-sortables per plan.

---
*Approved by: developer (AskUserQuestion), 2026-07-18*
