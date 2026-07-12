# TASK-318: Spike: iOS draft-capture feasibility (capture visibility, OCR accuracy, toolchain)

**Status:** Approved
**Priority:** P1

---

## Objective
Answer the go/no-go questions for the Mobile Live Draft Assistant (EPIC-08) before any
implementation: (1) does the Underdog iOS app remain visible to system screen capture or
does it blank/detect recording; (2) can Vision-grade OCR read the draft ticker and board
regions accurately enough for closed-pool fuzzy matching; (3) does ScreenCaptureKit on the
iOS 27 beta capture while the BBE app is backgrounded (ADR-020 gate); (4) does the
Windows→EAS→TestFlight toolchain work end to end (ADR-022 gate). Findings feed
ADR-019/020/021/022 ratification or revision.

> Research phase note: satisfied by the 2026-07-11 session's three parallel web-research
> agents (iOS platform capabilities, Android capabilities/policy, competitive + ToS
> landscape) plus direct codebase grounding (extension adapters, `draftModel.js`,
> `DraftFlowAnalysis.jsx`). Findings are condensed in `mobile-app/docs/RESEARCH_NOTES.md`.
> KB not compiled — research phase ran without KB context.

## Verification Criteria

The spike is complete when all four questions below have a recorded **PASS / FAIL /
PARTIAL** verdict with concrete evidence (video, screenshots, OCR transcripts, build logs)
written to `mobile-app/docs/SPIKE_RESULTS.md`, and each of ADR-019/020/021/022 has been
either ratified (status → Accepted) or flagged for revision based on the verdicts.

| # | Question | PASS means |
|---|----------|-----------|
| Q1 | Is the Underdog iOS app's draft room visible to system screen capture? | A screen recording of a live UD draft shows full draft-room content (no black/blank frames, no capture-detected UI change) |
| Q2 | Can Vision OCR read the pick data accurately enough? | ≥95% of player names in the recent-picks/ticker region are recoverable after closed-pool fuzzy matching, judged across ≥30 names from ≥10 screenshots; pick numbers legible |
| Q3 | Does ScreenCaptureKit keep delivering frames while the capturing app is backgrounded? | A test app's SCStream continues delivering frames ≥10 consecutive minutes while the UD app is foregrounded, on the iOS 27 beta |
| Q4 | Does the Windows→EAS→TestFlight loop work with custom native code? | An Expo dev client containing a stub Swift module (Expo Modules API) builds on EAS from the Windows machine and runs on the developer's iPhone |

## Verification Approach

The spike has four parts. **Parts A and B require zero code and no accounts — do them
first (one afternoon, one cheap draft entry).** Part D unblocks Part C. Parts C+D share
one test app.

### Part A — Capture visibility (developer + iPhone, ~30 min, no code)

1. Enter the cheapest available Underdog fast draft (e.g., $1 entry — treat the entry fee
   as spike budget; a draft you'd enter anyway also works).
2. Before the draft starts, open Control Center → long-press Screen Recording → confirm
   recording is running (built-in recorder, saves to Photos).
3. Draft normally through at least 3–4 of your own picks. While drafting, note any UD
   in-app reaction (warning toast, blanked panels — apps can observe
   `UIScreen.isCaptured`).
4. Stop recording; review the video in Photos.
5. **Record verdict Q1:** draft room fully visible → PASS. Black/blank/obscured content
   or UD behavior change → FAIL (this kills ADR-019's premise for UD-iOS; stop and
   reassess before Parts C/D — Part B still proceeds using screenshots, which use a
   different pipeline than capture).
6. *(Optional, 10 min, informs FEAT-028 scope later)*: repeat steps 2–5 inside the
   DraftKings app on any content-bearing screen.

### Part B — OCR accuracy via Shortcuts (developer + iPhone, ~1–2 h, no code)

Vision-framework OCR is testable without Xcode: the iOS **Shortcuts** app's
**"Extract Text from Image"** action runs the same Vision text recognition the app would
use.

1. During (or re-entering) drafts, capture **≥10 screenshots** covering: the recent-picks
   ticker mid-draft; the pick counter / on-the-clock banner; the My Team roster panel;
   the board/overview tab; the player list; at least one shot taken mid-animation
   (worst case); dark and light appearance if UD renders differently.
2. Build a one-action Shortcut: Receive images from Share Sheet → Extract Text from
   Image → Copy to Clipboard (or Append to Note). Run it on each screenshot; also
   cross-check a few with Photos' built-in Live Text selection.
3. For each screenshot, transcribe results into a table: region → expected text (read it
   yourself) → OCR output → verbatim match? → recoverable by fuzzy match against known
   player names (your judgment)?
4. **Record verdict Q2** per the ≥95% criterion, noting per-region quality (ticker vs
   roster panel vs board) — this directly shapes the ADR-021 template regions.
5. Save every screenshot to `mobile-app/spike/fixtures/` (transfer via
   iCloud/OneDrive) — they seed the TASK-321 parse-engine test corpus. Strip any
   personally sensitive content first (account balance is visible in some UD headers).

### Part C — ScreenCaptureKit background semantics (Claude + developer, the ADR-020 gate)

Prerequisites: Part D's toolchain, **iOS 27 beta on the test iPhone** (see Open
Questions — if the beta is declined, defer Part C to the public beta/GA and proceed with
everything else; Q1/Q2/Q4 verdicts are version-independent).

1. In the Part D test app, add a stub Swift module (Expo Modules API) that:
   presents `SCContentSharingPicker`; starts an `SCStream` for the selected content;
   logs a timestamped line per received frame batch (1 line/second is enough); exposes
   start/stop + a frame-count getter to JS.
2. On-device test script:
   a. Start capture in the test app; confirm frames arrive.
   b. Switch to the Underdog app; use it normally for ≥10 minutes.
   c. Return; read the frame log. Look for: continuous delivery, gaps, or termination —
      and any system UI (recording pill/indicator) behavior worth documenting.
   d. Repeat with the device screen locked briefly mid-capture (expect stop — confirm).
3. Stretch goal (informs TASK-322): while capture is running and the app is backgrounded,
   attempt a local `Activity.update()` on a stub Live Activity — does it apply without a
   push?
4. **Record verdict Q3.** FAIL → ADR-020 gets revised toward the ReplayKit
   broadcast-extension architecture before TASK-320 is planned; the epic proceeds either
   way (the fallback architecture is fully researched).

### Part D — Toolchain validation (Claude + developer, the ADR-022 gate)

1. Developer prerequisites (cannot be done by Claude):
   - Enroll in the **Apple Developer Program** ($99/yr; approval can take 1–2 days —
     start this first). See Open Question 3 (personal vs. business entity).
   - Create an **Expo** account (free tier suffices).
2. Scaffold a throwaway Expo app under `mobile-app/spike/` (this is scratch code — the
   real scaffold is TASK-319): `npx create-expo-app`, add one trivial local Expo Module
   in Swift (e.g., returns a string), configure `eas.json` with a development profile.
3. Register the iPhone (`eas device:create`), run
   `eas build --profile development --platform ios`, install via the QR/TestFlight
   flow, and confirm the JS↔Swift round-trip works on device.
4. **Record verdict Q4**, including honest notes on loop latency (minutes per native
   rebuild) — this calibrates ADR-022's cloud-Mac pressure-valve consequence.

### Wrap-up (Claude)

- Write `mobile-app/docs/SPIKE_RESULTS.md`: the four verdicts + evidence + surprises.
- Propose ADR status changes (Accepted or revision) for ADR-019/020/021/022 per the
  decision map below; present to the developer.
- Update TASK-319/320/321/322 draft plans with anything the spike changed.

**Verdict → decision map:**
- Q1 FAIL → ADR-019 premise broken for UD iOS: pivot discussion (manual-first product,
  Safari-extension channel, or Android-first) before any further EPIC-08 work.
- Q2 < 95% → ADR-021 revisited: larger capture regions, `.accurate` recognition mode
  (viable in-process per ADR-020), or region redesign. Only a severe miss (<80%) blocks.
- Q3 FAIL → ADR-020 revised to ReplayKit-broadcast-primary; TASK-320/322 replanned
  (50 MB budget + mandatory push relay return to the critical path).
- Q4 FAIL → ADR-022 revised (cloud Mac rental or borrowed Mac becomes a prerequisite);
  timeline impact flagged.

## Files to Change

| File | Action | Description |
|------|--------|-------------|
| `mobile-app/docs/SPIKE_RESULTS.md` | Create | Verdicts + evidence for Q1–Q4 |
| `mobile-app/spike/` | Create | Throwaway Expo app + stub Swift module (Parts C/D); `fixtures/` screenshot corpus (Part B) |
| `docs/adr/adr-019..022-*.md` | Modify | Status ratification or revision per verdicts (via hus-adr) |
| `docs/plans/TASK-319..322.md` | Modify | Draft-plan adjustments from spike findings (via hus-backlog) |

## Implementation Approach

Covered by the four-part Verification Approach above — this task IS its verification
(a spike produces knowledge, not product code). Sequencing:

1. **Today-able, no spend:** Part A + Part B (one draft entry, screenshots, Shortcuts).
   These two alone confirm or kill the product premise.
2. **Start in parallel:** Apple Developer Program enrollment (Part D prerequisite,
   has dead-time).
3. **Then:** Part D (toolchain), then Part C (needs D's app + the iOS 27 beta decision).
4. Wrap-up + ADR ratification.

Edge cases / cautions:
- UD may behave differently per screen — test capture specifically in the **draft room**,
  not just the lobby.
- Fast drafts only for this spike; slow drafts are a different session model by design
  (FEAT-030) and need no spike.
- Part C on a beta OS on a daily-driver phone is the riskiest prerequisite — see Open
  Question 1; everything else is deliberately independent of it.
- Screenshots may contain account details (balance, username) — scrub before committing
  fixtures to the repo.

## Dependencies
None (Part C soft-depends on the iOS 27 beta decision and Part D; Parts A/B/D have no
dependencies).

## Open Questions

1. **iOS 27 beta on the daily iPhone?** Q3 needs it now; alternatives are the public
   beta (typically July) or GA (~Sept). Deferring Part C is acceptable — ReplayKit is a
   researched fallback, so the epic isn't blocked, but ADR-020 stays Proposed until Q3
   is answered.
2. **Spike draft budget:** lowest-stakes UD fast-draft entries (e.g., $1–$5 total) for
   Parts A/B — confirm you're comfortable expensing a couple of entries to the spike.
3. **Apple Developer Program entity:** personal name vs. business entity — determines
   the App Store seller name later; enrollment under a business requires a D-U-N-S
   number (slower). Personal is fastest and can be migrated later.

---
*Approved by: PH — 2026-07-11*

## Decision

- **Question:** iOS 27 beta for Part C: daily iPhone now, or defer?
- **Chosen:** Install the dev beta on the daily iPhone now — Part C proceeds as soon as Part D toolchain passes
- **Decided by:** PH
- **Date:** 2026-07-11

- **Question:** Spike draft budget for Parts A/B?
- **Chosen:** Confirmed — $1–$5 total in cheapest UD fast-draft entries, expensed to the spike
- **Decided by:** PH
- **Date:** 2026-07-11

- **Question:** Apple Developer Program entity?
- **Chosen:** Personal enrollment (fastest approval; can migrate to a business entity later)
- **Decided by:** PH
- **Date:** 2026-07-11
