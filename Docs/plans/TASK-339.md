# TASK-339: Mobile Draft Assistant overhaul: live-session-first UX, retire manual pick entry

**Status:** Approved
**Priority:** P2

---

## Objective

Rebuild the mobile Draft Assistant module around the now-proven live draft session so the live
capture flow **is** the assistant: remove manual pick entry and both draft-slot selectors
(auto slot detection via the username anchor works reliably), make the Underdog username a
required — and remembered — setup field, and replace the current text-heavy collapsible panel
with a show-don't-tell flow (visual setup steps, a demo draft that runs the real live UI on
sample data, and one-time coach marks that label the columns and badges in place).

> Research note: KB not compiled — research phase ran without KB context. Code research was
> performed inline (no subagents, per developer instruction): `DraftAssistantView.jsx`,
> `LiveSessionPanel.jsx`, `app/(tabs)/draft.jsx`, `src/draft/sessionController.js`,
> `src/draft/draftFeed.js`, `src/components/ScreenScaffold.jsx`.

## Verification Criteria

1. **Setup is username-first and slot-free.** Opening the Draft Assistant with no active
   session shows a full setup screen — a visual 3-step "how it works" strip, a required
   username field (prefilled from the last session), and a Start button disabled until a
   username is entered. No slot selector exists anywhere in the module.
2. **Live capture is the only input path.** After starting, the user is guided record →
   switch-to-Underdog with visual (not paragraph) guidance, and the assistant view (status
   header, player window with metrics, strategy cards, My Picks) updates only from the
   capture feed. There is no way to manually draft, undo, or clear picks.
3. **A first-timer learns by seeing.** "Try a demo draft" runs the real live UI on sample
   data before ever recording, and one-time coach marks label the status header, the
   Path/Corr/Global metric columns, and the stack/warning badges — then never appear again.

## Verification Approach

- **Automated:**
  - `cd mobile-app && npm run test:draft` passes — proves the capture/parse line is untouched
    by the UI overhaul.
  - Grep gate: `handleSelect|handleUndo|Clear board|setDraftSlot|slotChoice|slotBtn` has zero
    hits under `mobile-app/src/screens/` and `mobile-app/app/`; `usernameChoice.trim() || null`
    (the optional-username fallback) no longer exists.
  - Static review: `app/(tabs)/draft.jsx` help sheet no longer mentions Draft Slot or the
    manual draft board.
- **Requires the developer (on-device, EAS dev/preview build):**
  1. Cold-open Draft tab → setup screen renders; Start disabled with empty username; enter
     BIRDENTHUSIAST → Start enabled.
  2. "Try a demo draft" → live UI plays through sample picks with coach marks; end demo →
     back to setup; relaunch → coach marks do not reappear.
  3. Real slow-draft session: start → record → draft in Underdog → status header shows
     pick/round/up-in-N and auto-detected slot chip; player window and My Picks track the
     board; End returns to setup with username remembered.
  4. Expo Go / non-native build: setup screen shows the existing "needs the EAS build"
     warning row and Start stays disabled (graceful).

## Files to Change

| File | Action | Description |
|------|--------|-------------|
| `mobile-app/src/screens/DraftAssistantView.jsx` | Rewrite | Feed-only assistant: delete manual pick entry (tap-to-draft, undo, clear, toast), slot pills, and dual-path round derivation; keep analytics (metrics, strategy cards, eliminator, tournament filter, search-as-lookup, read-only My Picks); row tap now toggles the correlation breakdown |
| `mobile-app/src/screens/LiveSessionPanel.jsx` | Rewrite | Becomes the in-session status layer only: LIVE header, record CTA + preflight, presence/reset rows, warnings; slot row and idle explainer removed; Demo/Debug/Frames tucked into an expanded-only tools row |
| `mobile-app/src/screens/draft/AssistantSetup.jsx` | Create | Full-screen setup/welcome: visual 3-step strip (username → record → draft in Underdog), required username input (prefilled), Start CTA, "Try a demo draft" ghost CTA, capability warnings, one-line privacy note |
| `mobile-app/src/screens/draft/CoachMarks.jsx` | Create | One-time sequential overlay labels (status header, metric columns, badges); persisted flag `bbe.assistantIntroSeen` |
| `mobile-app/app/(tabs)/draft.jsx` | Modify | Help sheet rewritten for the new layout (columns, badges, session lifecycle); Draft Slot / manual-board sections removed |
| `mobile-app/src/draft/sessionController.js` | Modify | Export `getRememberedUsername()`; `startSession()` refuses to start without a username; add a demo-session path that reuses `demoSync()` without requiring a broadcast |
| `mobile-app/README.md` | Modify | Draft Assistant tab description updated to live-session-first |
| `mobile-app/docs/LIVE_SESSION_V1.md` | Modify | UI section updated (setup screen, required username, no slot selector) |

## Implementation Approach

1. **Session controller groundwork** (`sessionController.js`)
   - Export `getRememberedUsername()` → `readSharedValue(USERNAME_KEY)` so the setup screen
     prefills the last-used / auto-learned username.
   - `startSession()` sets `lastError` and returns `false` when called without a username
     (belt-and-braces behind the UI gate). The remembered-username fallback remains for
     warm restarts and board resets.
   - Add `startDemoSession(inputs)`: starts a session flagged `demo` (skips the broadcast
     handoff; Live Activity optional) and drives `demoSync()` on a short interval so the
     full live UI plays with sample picks. `endSession()` cleans it up identically.

2. **AssistantSetup screen** (new; replaces the collapsed idle card — it owns the tab when
   no session is active)
   - Visual 3-step strip: icon + 2–4-word label each — (1) `@` "Your Underdog username",
     (2) record dot "Start & record", (3) phone/arrow "Draft in Underdog". No paragraphs.
   - Username: large input, `autoCapitalize="characters"`, prefilled via
     `getRememberedUsername()`; single line of microcopy ("Exactly as it appears in the
     draft room"). Start CTA disabled until non-empty (trimmed).
   - Primary CTA "Start live session" → existing preflight explainer → broadcast picker.
   - Ghost CTA "Try a demo draft" → `startDemoSession()`.
   - Keep the existing capability warning rows (EAS build, Live Activities disabled) and the
     one-line privacy statement; the preflight modal is unchanged.

3. **In-session layer** (`LiveSessionPanel.jsx` rewrite)
   - Awaiting-capture state: large record button plus a two-icon visual (record → Underdog),
     one sentence max; preflight modal retained.
   - Status header: LIVE dot, `P· R·`, color-coded "up in N" pill, slot chip ("Slot 7 · auto")
     appearing once detected, tracking-username chip. All slot-conflict UI deleted (no manual
     slot → no conflict); `learnedUsername` row simplified.
   - Presence rows (waiting to enter room / left room + Reset) and resume row kept verbatim
     (TASK-336 behavior). Demo/Debug/Frames move behind the expanded state; End stays visible.

4. **DraftAssistantView rewrite**
   - Delete: `draftSlot` state + slot pills, `handleSelect`/`handleUndo`/clear-board/toast,
     `feedActive` dual-path logic (`currentRound` comes from the feed only), manual
     empty-state copy.
   - Keep: tournament filter, search (metric lookup only), strategy cards + eliminator mode,
     candidate window with Path/Corr/Global/ADP/Avg, stack + playoff + falling-knife +
     breaks-plan badges, My Picks list (read-only, from feed).
   - Row tap toggles the correlation breakdown (was a tiny hit target; drafting-by-tap is gone
     so the whole row is safe to use).
   - Session-active-but-no-sync-yet renders a lightweight waiting state (pulse skeleton +
     "waiting for the draft board"), not an empty player list.

5. **Coach marks** (new, deliberately minimal)
   - Three sequential dismissible callouts anchored by `onLayout` measurements: status header
     ("your pick clock"), metric row ("share of your rosters: path / with your picks /
     everywhere"), badges ("stacks & warnings"). Tap anywhere advances; flag
     `bbe.assistantIntroSeen` in AsyncStorage; shown on first live **or** demo session.

6. **Tab + help** (`draft.jsx`)
   - Help sheet rewritten: session lifecycle (start → record → draft), column glossary,
     badge glossary. "Draft Slot" and manual Draft Board sections removed.

7. **Docs** — `mobile-app/README.md` and `docs/LIVE_SESSION_V1.md` updated to describe the
   live-first module.

Out of scope: `DraftExplorerView.jsx` and `DraftBoardModal.jsx` (used by Combos / Rosters),
the web Draft Assistant, the capture/parse engine itself.

## Dependencies

None blocking. Builds on TASK-328 (username slot anchor), TASK-336 (presence/reset), and the
merged live-capture line. On-device verification needs an EAS dev/preview build.

## Open Questions

1. **Roadmap/ADR drift — RESOLVED (2026-07-16):** developer chose *no ADR, roadmap note
   only*. The FEAT-030/EPIC-08 wording update is captured as TASK-340.
2. **Demo availability off-device:** if `demoSync()` proves to need the native module, the
   demo CTA is hidden on non-native builds (setup screen still renders with the existing
   warning row).

## Handoff Notes

- **Tried (2026-07-16):** full implementation landed — sessionController (username guard,
  `getRememberedUsername`, `startDemoSession`), AssistantSetup, CoachMarks, useSessionInputs,
  LiveSessionPanel rewrite (status layer only), DraftAssistantView rewrite (feed-only),
  draft.jsx help, README + LIVE_SESSION_V1 docs.
- **Result:** all automated verification passed — esbuild parse of all touched files clean;
  grep gates clean (no manual-entry / slot-selector code in the module); `npm run test:draft`
  shows only the two slow-draft glance-format failures that also fail on clean main
  (pre-existing, captured as TASK-341 — not caused by this task).
- **Blocker:** the four on-device manual verification steps (plan §Verification Approach)
  need the developer's EAS dev/preview build.
- **Next step:** developer runs the on-device steps; then reflection → Done → archive.

---
*Approved by: developer (AskUserQuestion), 2026-07-16*
