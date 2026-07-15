# TASK-329: Players-tab live capture: salvage frames under expanded Live Activity, divider-driven position, window-based availability

**Status:** Approved
**Priority:** P2

---

## Objective

Make the mobile Live Draft Assistant track reliably while the user sits on the Underdog **Players** tab: the picks-until countdown must stay current even when the expanded Live Activity covers the "UP IN N PICKS" header, and the Live Activity's top-available targets must always converge to what the Players screen actually shows.

**Evidence (2026-07-15 fast draft, `mobile-app/docs/debug_screenshots/`):** IMG_2805 shows the draft room reading "UP IN 4 PICKS" (with the gold "4 picks away" divider visible in the list) while the Live Activity pill shows a stale "11". `fastdraft.txt` shows the engine parked at P70/"up in 11" for a ~10-minute stretch, and the user's own round-12 pick missing from `myPicks` (11 picks at currentPick 138).

**Root causes (confirmed by code review + Node replay repro):**
1. **Whole-frame 'self' poisoning** — `underdogParser.js` classifies any frame containing expanded-Live-Activity content (`synced …`, target flags, roster bar) as `kind: 'self'`, and `sessionEngine.ingest()` discards it entirely. The Players rows and the "N picks away" divider *below* the overlay are perfectly valid but are thrown away with the frame. While the panel is expanded, capture is fully frozen.
2. **Divider fallback starved** — `sessionEngine.js` already prefers `picksUntil ?? picksAwayDivider`, and the divider is the single most reliable OCR signal in the evidence corpus (227 reads vs 216 for "UP IN" across 366 frames; it renders low on screen where nothing covers it). It never fires on these frames because of (1).
3. **Self-feedback hazard** — our own Live Activity headline "Up in 11 picks" matches the case-insensitive `upInPicks` pattern, so a softened guard that merely stopped discarding frames would ingest our own stale countdown as the header ticker.
4. **Mid-window drafted players never inferred gone** — availability inference only marks players with ADP *below the top visible row*. A player drafted whose ADP falls *between* visible rows (proven gone by the contiguous ADP-sorted list) stays "available" and lingers in the Live Activity targets.

## Verification Criteria

1. **Countdown survives the expanded overlay:** replaying a frame that has expanded-Live-Activity content on top of a Players list with a "4 picks away" divider advances the session to "up in 4" (the repro that previously stayed frozen at "up in 11").
2. **Targets converge to the visible list:** after one clean Players-tab frame, a player whose ADP falls inside the visible window but who is not in the visible rows (drafted mid-window) is excluded from the Live Activity targets; the targets match the top of the visible list.
3. **No self-feedback regression:** a screen showing only our Live Activity (no draft-room content) still contributes nothing — no ledger, countdown, or availability changes, and our own "Up in N picks" headline is never read as the draft-room ticker.

## Verification Approach

- `cd mobile-app && npm run test:draft` — extended regression suite passes, including new fixtures:
  - `SELF_OVERLAY_WITH_PLAYERS_LIST` (overlay lines + rows + divider): expect `kind: 'players'`, `picksAwayDivider: 4`, `obs.picksUntil` **not** taken from the overlay headline, currentPick ratchets via the divider rung math.
  - Window-inference fixture: rows with a deliberate ADP gap → the gap player lands in `inferredGone`, disappears from `getGlance().targets`, and is cleared again when a later frame shows him visible.
  - Existing `SELF_ACTIVITY_OVERLAY` fixture (pure overlay, no draft content): still fully inert.
- Re-run the stuck-capture repro script (session at P70/up-in-11, ingest the IMG_2805-shaped frame) and show the glance goes to "Up in 4 picks".
- `npm run build:engine` succeeds; `targets/draft-broadcast/assets/engine.js` contains the bumped `ENGINE_VERSION` (`task329.1`).
- **Developer (manual):** EAS build + install (the engine bundle ships inside the native broadcast extension — Metro updates do NOT reach it), then run a fast draft parked on the Players tab with the Live Activity expanded periodically; confirm the pill countdown tracks the divider and targets match the visible list. Export the debug bundle if anything looks off.

## Files to Change

| File | Action | Description |
|------|--------|-------------|
| `mobile-app/src/draft/underdogParser.js` | Modify | Replace whole-frame 'self' poisoning with overlay **excision**; emit `bottomVisibleAdp` (+ unmatched-row count) in `obs.availability` |
| `mobile-app/src/draft/sessionEngine.js` | Modify | Add window-based inferred-gone marking alongside the existing below-top inference |
| `mobile-app/src/draft/__fixtures__/underdogFastDraftFixture.js` | Modify | Add `SELF_OVERLAY_WITH_PLAYERS_LIST` + window-gap fixtures (modeled on IMG_2805 / fastdraft.txt) |
| `mobile-app/scripts/test-draft-parser.mjs` | Modify | Assertions for excision, divider ratchet, window inference, self-inert regression |
| `mobile-app/src/draft/extensionEngine.entry.js` | Modify | Bump `ENGINE_VERSION` to `task329.1` |
| `mobile-app/targets/draft-broadcast/assets/engine.js` | Modify | Rebuilt artifact via `npm run build:engine` |

## Implementation Approach

**1. Overlay excision in `parseUnderdogScreen` (replaces the early-return 'self' guard):**
- Keep the existing detection signals (`selfSynced` strong; `selfFlag` / `selfRosterBar` weak, ≥2 weak = detected).
- When detected **and bounding boxes exist**: the expanded Live Activity is a top-anchored card, so compute `overlayBottom = max(y + h)` across all self-signal lines and drop every line with `y ≤ overlayBottom + margin (~0.02)`. Everything below (player rows, divider, tab bar) parses normally.
- When detected **without boxes** (string input): drop lines matching self patterns plus the overlay's other content shapes — the `BB EXPOSURES` brand line, target rows (`/^(QB|RB|WR|TE)\s*[·•.]\s/`), and the sentence-case `Up in N picks` headline (Underdog renders its header ALL-CAPS; ours is sentence case, so an exact-case match distinguishes them).
- Return `kind: 'self'` only if nothing meaningful remains after excision (preserves current behavior for a pure overlay screen, e.g. over the lock screen or a blurred background where the rest OCRs as garbage).
- This also closes the self-feedback hazard: the overlay's own headline/targets/roster bar are excised before the header scan, so they can never masquerade as the draft-room ticker or as available rows (which today would also wrongly *clear* inferred-gone marks).

**2. Window-based availability inference in `sessionEngine.ingest`:**
- Parser adds `bottomVisibleAdp` (ADP of the last confident row) and `unmatchedInWindow` (count of `stats.unmatchedNames` on this frame) to `obs.availability`. Existing confidence gates stay: ≥6 rows with ADP, ≤1 sort inversion, no detail accordion.
- Engine, whenever `obs.availability` exists (any scroll position — the visible window of an ADP-sorted list is self-evidencing, unlike the below-top inference):
  - mark `inferredGone` for every pool player at a seen position with `topVisibleAdp + 0.05 < adp < bottomVisibleAdp − 0.05` who is not among the visible canonicals;
  - skip the window pass when `unmatchedInWindow ≥ 2` (a garbled frame would false-mark players; they'd self-heal, but cheap to avoid);
  - keep the existing below-top inference and its `topVisibleAdp ≤ currentPick + 12` gate unchanged (it requires the list to be at its top; the window pass does not).
- Existing self-healing stays: any player visible in a later frame is removed from `inferredGone` (`sessionEngine.js:292`).
- No change to the divider plumbing — `headerPicksUntil = picksUntil ?? picksAwayDivider` and the anchored-slot rung ratchet already work (proven in the repro); the excision in step 1 is what lets those frames reach it.

**3. Fixtures + tests:** model the new fixtures directly on the IMG_2805 screenshot and `fastdraft.txt` OCR lines (overlay block, 9 player rows, "4 picks away" divider between Alec Pierce and Dak Prescott). Add the window-gap case (e.g. a pool player at ADP 75.2 absent from the visible 73.8–85.4 rows).

**4. Engine bump + rebuild:** `ENGINE_VERSION = 'task329.1'`, `npm run build:engine`. Call out in the completion notes that an **EAS rebuild is required** before on-device behavior changes (stale-bundle trap per ADR-022 / project memory).

**Edge cases handled:**
- Compact Dynamic Island pill (not expanded): frame has no self signals; divider fallback already covers a covered/garbled header.
- Overlay expanded over the Board tab: excision leaves board cells parsing as today.
- Divider absent (user scrolled past it): no change from today — carousel/ticker evidence still ratchets when the frame is not poisoned.
- Both header and divider visible: existing precedence (header first) kept; they agree in practice since UD derives both from the same state.

**Out of scope (captured separately):** attributing the user's *own* pick while they stay on the Players tab (missing round-12 pick in the fastdraft evidence) — needs confirm-card/queue-diff inference and is tracked as its own task.

## Dependencies

None (builds on TASK-328's anchored-slot + divider plumbing, already merged).

## Open Questions

- Considered having `getGlance()` targets read directly from the last-seen visible rows instead of the pool-minus-gone computation; rejected — it would bypass the user's rank order and the ledger, and fixes 1–2 make the existing computation converge to the visible list anyway.
- No ADR proposed: this refines behavior inside the ADR-021 capture architecture (monotonic ledger, derived state) without changing any structural decision.

## Scope Items

### Position-agnostic availability inference on provably-unfiltered lists (+ roster-bar signal hardening)
- **Added:** 2026-07-15 (approved via AskUserQuestion after on-device iteration 1)
- **Context:** debug_2.txt / IMG_2807 — mid-draft resume at P65 showed Brock Bowers / Trey McBride / Colston Loveland (all TEs, all long drafted) as the top Live Activity targets. The "conservative for unseen positions" rule (TASK-328) never marks a position that has no visible row, so with a QB/RB/WR-only window at ADP ~66, every TE below ADP 66 stayed "available". Also the roster-bar self-signal missed a garbled separator (`QB 1 - RB 2 • WR 3 • TE 0`).
- **Change:** when a Players frame's visible rows span ≥3 distinct positions the list is provably unfiltered — both inference passes then apply to every position. 1–2 positions seen keeps the position-scoped behavior (chip-filter protection). `selfRosterBar` accepts `-` as a separator. Engine `task329.2`.
- **Verification:** `npm run test:draft` — the old "conservative for unseen positions" check is deliberately inverted (Bowers inferred gone from an unfiltered 3-position window; top available = top of the visible list); garbled roster bar still detected as a self signal.

### Roster-panel guard (drafter-card roster view must not feed availability)
- **Added:** 2026-07-15 (approved via AskUserQuestion after debug3.txt)
- **Context:** debug3.txt frames t=…875/876 — tapping a drafter card opens a roster panel (position groups + "ADP"/"Pick" unit labels). It classified `kind: 'players'` with 6 matched rows and slipped the ≤1-inversion gate, making it eligible for availability inference; its rows also cleared inferred-gone marks, which for an opponent's roster view can resurrect drafted players into targets.
- **Change:** ≥2 standalone `Pick` unit labels (never present on the real Players list) → `kind: 'roster'`: no availability inference, and its rows do not clear inferred-gone marks. Header/carousel signals in the same frame still ratchet. Engine `task329.3`.
- **Verification:** `npm run test:draft` — roster fixture (modeled on debug3) classifies `roster`, produces no availability, and a previously-inferred-gone player listed on a roster panel stays gone.

### Slow-draft frame-recording fixes (lobby false on-clock, garble-proof excision, carousel last-pick names)
- **Added:** 2026-07-15 (developer requested fixes after recording `frames-1784120786.jsonl` via the TASK-331 recorder — first defects diagnosed and proven entirely by local replay, no extra live draft)
- **Context:** three defects in the recording:
  1. The UD **home screen's tagline** "Your players. Your picks." matched the `onTheClock` pattern inside the header zone → the Live Activity flashed "You're on the clock!" at P1 for the whole lobby browse (frames #2–#11; on-device log `capture • P1 • up in 0`).
  2. **Excision defeated by garbles** (frames #1/#5): roster-bar zeros OCR'd as letter O ("QB 0 - RB O - WR O • TE O", merged "QBO") and the headline garbled/truncated ("fou're on the clo....") — neither matched its self pattern, so the excision region stopped at the "synced" line and our own target rows (Gibbs/Robinson/Chase) parsed as visible player rows.
  3. **Slow-draft carousel completed cards** show the drafter's LAST pick as an abbreviated name under the label ("6.4 | 64" + "J. Tyson") — matched as Players rows via the initial-form rule, clearing inferred-gone marks every frame and resurrecting just-drafted players into the targets (the user's own Jordyn Tyson pick surfaced as the #1 target; caused the gone-count flapping in frames #13–#24).
- **Change:** `onTheClock` rejects the plural (`YOUR PICK(?!S)`); `selfRosterBar` accepts `[0-9O]` digits with optional-space label merge; `selfHeadline` accepts a garbled leading capital + truncation ("?ou're on the clo…", "?racking • R1 • P1"); the rows loop skips single-initial `F. Surname` forms (double initials like "A.J. Brown" stay eligible — the Players list renders full names, abbreviations are carousel/confirm-card artifacts). Engine `task329.4`.
- **Verification:** `npm run test:draft` green with 11 new checks over three new fixtures (`UD_HOME_SCREEN`, `SELF_OVERLAY_GARBLED_HOME`, `SLOW_PLAYERS_LASTPICK_CARDS`); replaying `frames-1784120786.jsonl` now shows lobby frames inert (no pu=0), overlay frames excised/self, stable gone count, and targets converging to the visible list top (Jayden Daniels / Drake Maye / Joe Burrow — the drafted Tyson/Warren correctly gone).

## Handoff Notes

- All three iterations implemented + automated verification green on 2026-07-15; engine bundle now `task329.3` (excision + divider ratchet, position-agnostic inference on ≥3-position lists, roster-panel guard).
- On-device iteration 1 (debug_2.txt) surfaced the TE-targets blind spot → scope item 1. On-device iteration 2 (debug3.txt) ran the OLD `task329.1` bundle (no rebuild had happened), but surfaced the roster-panel hazard → scope item 2.
- Iteration 3 (2026-07-15, slow-draft frame recording): three parser fixes above, engine bundle now `task329.4`. Slow-draft completed carousel cards ("6.4 | 64" + "J. Tyson") are also a clean own-pick/opponent-pick ledger source — noted as evidence on TASK-330/332, not implemented here.
- **Blocker for closing:** EAS build + install with `task329.4`, then verify: countdown tracks the divider under the expanded Live Activity; targets match the visible Players-list top on a mid-draft join; roster-panel taps don't corrupt targets; no false on-the-clock while browsing the UD lobby.

---
*Approved by: developer (AskUserQuestion "Approved"), 2026-07-15*
