# TASK-318 Spike Results

Go/no-go evidence for EPIC-08 (Mobile Live Draft Assistant). Plan:
`docs/plans/TASK-318.md`. Each question gets a **PASS / FAIL / PARTIAL** verdict with
concrete evidence. Verdict → decision map is in the plan.

| # | Question | Verdict | Gates |
|---|----------|---------|-------|
| Q1 | Underdog iOS draft room visible to system screen capture? | **PENDING** | ADR-019 premise |
| Q2 | Vision OCR reads pick data ≥95% (post fuzzy match)? | **PENDING** | ADR-021 regions |
| Q3 | ScreenCaptureKit delivers frames while app backgrounded (iOS 27 beta)? | **PENDING** | ADR-020 architecture |
| Q4 | Windows→EAS→TestFlight loop works with custom Swift? | **PENDING** | ADR-022 toolchain |

---

## Q1 — Capture visibility (Part A)

**Verdict: PENDING**

- Method: Control Center screen recording during a live UD fast draft (≥3–4 own picks).
- Evidence: <!-- link/describe the recording; note any UD in-app reaction -->
- DraftKings (optional): <!-- if tested -->

## Q2 — OCR accuracy (Part B)

**Verdict: PENDING**

- Method: iOS Shortcuts "Extract Text from Image" (Vision framework) over ≥10 screenshots,
  ≥30 player names; fuzzy-match recoverability judged against the known player pool.
- Fixtures: `mobile-app/spike/fixtures/`
- Results table:

| Screenshot | Region | Expected text | OCR output | Verbatim? | Fuzzy-recoverable? |
|------------|--------|---------------|------------|-----------|--------------------|
| | | | | | |

- Per-region notes (ticker vs roster panel vs board — shapes ADR-021 templates):

## Q3 — ScreenCaptureKit background semantics (Part C)

**Verdict: PENDING** <!-- blocked on Part D toolchain + iOS 27 beta decision (plan Open Question 1) -->

- Method: SCContentSharingPicker + SCStream in the spike app; frame-log while UD is
  foregrounded ≥10 min; lock-screen behavior; recording-indicator observations.
- Evidence: <!-- frame log excerpts, timestamps, gaps -->
- Live Activity stretch goal (local update while backgrounded): <!-- if attempted -->

## Q4 — Windows→EAS→TestFlight toolchain (Part D)

**Verdict: PENDING**

- Method: `mobile-app/spike/` dev-client build on EAS from the Windows machine;
  JS↔Swift round-trip on device (App.tsx "Call Swift" button).
- Evidence: <!-- build link/log, screenshot of the Swift hello string -->
- Loop latency (queue + build minutes per native change): <!-- calibrates ADR-022 -->

---

## Surprises / notes

<!-- anything unexpected, per-part -->

## ADR disposition (filled at wrap-up)

| ADR | Proposed action |
|-----|-----------------|
| ADR-019 | |
| ADR-020 | |
| ADR-021 | |
| ADR-022 | |
