# Systems Model — iOS Draft Assistant (Proposed)

**Created:** 2026-05-13
**Last revised:** 2026-05-13 (Pass 1 interrogation → revision: added telemetry, latency-budget, override-learning, calibration, platform-detection, and pre-draft-health blocks)
**Status:** Fully aspirational — the iOS app does not exist; this models the architecture proposed in `docs/draft-assistant-architecture.md`.
**Parent system:** Best Ball Exposures (BBE) — see `docs/systems-model/model.md`.

**Pending ADRs (flagged during pass 1 interrogation, deferred to Step 8):**
- F-027 / wakeability: should analysis stay in the main app, or partly inside the broadcast extension? Affects S1/S2/S3 boundaries and the 50MB ceiling.
- F-025 / privacy ⟷ operability: should the app support consented diagnostic uploads to make L5 (config-update loop) viable, or strictly honor iA3?

This model is scoped to the proposed iOS Draft Assistant. The BBE web backend, Underdog/DraftKings apps, and Apple platform services are treated as current externals; everything internal to the iOS app is aspirational.

---

## Diagrams

| Diagram | Altitude | When to use |
|---------|----------|-------------|
| `top-level-abstract.d2` | Quickview | Orient yourself — what is this thing, end-to-end |
| `top-level.d2` | Detailed | Trace specific blocks and interactions |
| `aspirational.d2` | Detailed overlay | See which pieces are net-new vs. extending existing BBE |
| `subsystems/capture-recognition.d2` | Subsystem detail | OCR pipeline internals (memory-constrained extension) |
| `subsystems/surface.d2` | Subsystem detail | Live Activity / Dynamic Island update flow |

---

## Vision & Aspirations

Inherited from the BBE top-level model (A1, A3, A5, A7) and refined for the iOS surface.

| ID | Aspiration | Derivation |
|----|-----------|-----------|
| iA1 | Live in-draft portfolio awareness on iOS | Derived from BBE A1 (One-Stop Portfolio Awareness) + A5 (Draft-Time Speed) |
| iA2 | Sub-clock latency (3–5s end-to-end, within Underdog's 30s pick timer) | Unique — iOS-specific real-time constraint |
| iA3 | Privacy-first: all OCR on-device, no frame data leaves the phone | Unique — App Store review + user trust |
| iA4 | Mirror, not advisor — surface state in the Dynamic Island, never auto-draft | Derived from BBE A3 (Mirror, Not Advisor) |
| iA5 | Multi-platform parity (Underdog first, DraftKings second) | Derived from BBE A7 (Platform Reach) |
| iA6 | Resilient to platform UI churn — remote-updatable ROIs and templates without App Store releases | Unique — operational durability |
| iA7 | Battery- and resource-respectful on a memory-constrained extension (~50MB ceiling) | Unique — iOS platform constraint |

---

## Block Inventory

All iOS-internal blocks are **Aspirational**. Externals are **Current**.

### Roles (Blue)

| ID | Name | State | Subsystems |
|----|------|-------|-----------|
| R1 | iOS Drafter (end user, drafting on phone) | Current | — |
| R2 | Developer | Current | — |

### Processes/Tools (Purple)

| ID | Name | State | Subsystem |
|----|------|-------|-----------|
| P1 | Companion App Orchestrator | Aspirational | S2 |
| P2 | Broadcast Capture (ReplayKit upload extension) | Aspirational | S1 |
| P3 | Frame-Diff Motion Detector | Aspirational | S1 |
| P4 | Vision OCR Pipeline | Aspirational | S1 |
| P5 | Player Fuzzy-Match Resolver | Aspirational | S2 |
| P6 | Draft State Engine | Aspirational | S2 |
| P7 | Analysis Engine (correlation / exposure / leverage) | Aspirational | S3 |
| P8 | Live Activity Updater (ActivityKit) | Aspirational | S4 |
| P9 | App Intent Handlers (manual override) | Aspirational | S4 |
| P10 | Website Sync Client | Aspirational | S5 |
| P11 | Remote Config Fetcher | Aspirational | S5 |
| P12 | Diagnostic Reporter (PII-scrubbed, consented uploads) | Aspirational | S5 |
| P13 | Stage Timer (instruments capture → activity-update) | Aspirational | cross-cutting (S1+S2+S3+S4) |
| P14 | ROI Calibration Mode (dev-only in-app tool) | Aspirational | S1 |
| P15 | Platform Detector (auto-classify frame source) | Aspirational | S1 |
| P16 | Pre-Draft Health Check (sync / permission / config / battery) | Aspirational | S2 |

### Artifacts (Green)

| ID | Name | State | Subsystem |
|----|------|-------|-----------|
| A1 | App Group Shared Store — events now carry `confidence` + `status` (pending \| confirmed \| overridden) | Aspirational | S2 |
| A2 | ROI / Template Config (versioned) | Aspirational | S5 |
| A3 | Synced Portfolio Data (exposures, correlations, lineup pools) | Aspirational | S5 |
| A4 | Dynamic Island Live Activity (UI surface) | Aspirational | S4 |
| A5 | Player Pool Cache | Aspirational | S2 |
| A6 | Captured Frame Buffer (`CMSampleBuffer` stream, ephemeral) | Aspirational | S1 |
| A7 | Diagnostic Telemetry Stream (PII-scrubbed events) | Aspirational | S5 |
| A8 | Per-Stage Latency Budget + Measurements | Aspirational | cross-cutting |
| A9 | Match Confidence Registry (per-draft alias overrides learned from P9) | Aspirational | S2 |

### External Systems (Orange)

| ID | Name | State |
|----|------|-------|
| E1 | Underdog iOS App | Current |
| E2 | DraftKings iOS App | Current |
| E3 | Apple ReplayKit System | Current |
| E4 | Apple ActivityKit / Dynamic Island | Current |
| E5 | Darwin Notification Center (IPC) | Current |
| E6 | BBE Web Backend (Supabase / Vercel) | Current |
| E7 | App Store Review (Apple) | Current |

---

## Subsystems

| ID | Name | Member Blocks | Rationale |
|----|------|--------------|-----------|
| S1 | Capture & Recognition | P2, P3, P4, A6, E3 | Runs inside the broadcast extension — memory-bounded. Sole job: pixels → text. |
| S2 | State Resolution | P1, P5, P6, A1, A5, E5 | Lives in the main app process. Turns raw OCR strings into a coherent draft state machine. |
| S3 | Decision / Analysis | P7, A3 | Recomputes recommendations against synced portfolio data on state change. |
| S4 | Surface | P8, P9, A4, E4 | Renders state and recommendations on the Dynamic Island; handles user overrides. |
| S5 | Backend Sync & Config | P10, P11, A2, A3, E6 | Brings portfolio data and operational config down from the website; pushes results back. |

**Boundary-straddling blocks:**
- **A3 (Synced Portfolio Data)** is owned by S5 (pulled in from website) but read by S3 (analysis).
- **A1 (App Group Store)** is the canonical IPC boundary — written by S1 (via extension's process boundary) and read by S2 (main app). Owned by S2.

---

## System Boundary

**Internal (we design and build):** R1 (user — interaction design), R2, P1–P11, A1–A6.

**External (we integrate with, do not own):** E1–E7.

The boundary is also a *process* boundary — the broadcast extension (S1) is its own OS process with a ~50MB memory ceiling, separated from the main app (S2–S4) by the App Group store (A1) and Darwin notifications (E5).

---

## Interaction Map

| # | From → To | Label | State |
|---|-----------|-------|-------|
| 1 | R1 → P1 | starts draft assist | Aspirational |
| 2 | P1 → E3 | requests broadcast (RPSystemBroadcastPickerView) | Aspirational |
| 3 | R1 → E3 | confirms screen broadcast | Aspirational |
| 4 | E1/E2 → E3 | screen pixels | Current |
| 5 | E3 → P2 | delivers CMSampleBuffer frames | Aspirational |
| 6 | P2 → A6 | buffers frames | Aspirational |
| 7 | P2 → P3 | submits frame for diff | Aspirational |
| 8 | P3 → P4 | triggers OCR on change | Aspirational |
| 9 | P4 → A2 | reads ROI / template config | Aspirational |
| 10 | P4 → P5 | recognized strings | Aspirational |
| 11 | P5 → A5 | fuzzy-matches against player pool | Aspirational |
| 12 | P5 → A1 | writes resolved pick events | Aspirational |
| 13 | A1 → E5 | fires Darwin notification | Aspirational |
| 14 | E5 → P1 | wakes main app | Aspirational |
| 15 | P1 → P6 | invokes state engine | Aspirational |
| 16 | P6 → A1 | reads new events, writes updated state | Aspirational |
| 17 | P6 → P7 | requests recompute on state change | Aspirational |
| 18 | P7 → A3 | reads portfolio targets / correlations | Aspirational |
| 19 | P7 → P8 | top-N recommendations | Aspirational |
| 20 | P8 → E4 | pushes Live Activity update | Aspirational |
| 21 | E4 → A4 | renders Dynamic Island content | Aspirational |
| 22 | A4 → R1 | displays recs, exposure delta, warnings | Aspirational |
| 23 | R1 → P9 | taps App Intent button (override / dismiss) | Aspirational |
| 24 | P9 → A1 | writes override into state | Aspirational |
| 25 | P10 → E6 | pulls portfolio data on launch | Aspirational |
| 26 | E6 → A3 | populates synced data | Aspirational |
| 27 | P11 → E6 | fetches ROI/template config | Aspirational |
| 28 | E6 → A2 | publishes versioned config | Aspirational |
| 29 | P10 → E6 | pushes completed-draft results | Aspirational |
| 30 | E7 ↔ P2 | review constraint (capture API scrutiny) | Current (as boundary constraint) |
| 31 | P13 → A8 | writes per-stage timing on every pick cycle | Aspirational |
| 32 | A8 → R2 | surfaces latency budget burn (dev surface) | Aspirational |
| 33 | P5 → P12 | confidence / match-quality metrics (PII-scrubbed) | Aspirational |
| 34 | P12 → A7 | buffers diagnostic events | Aspirational |
| 35 | A7 → E6 | uploads on user consent | Aspirational |
| 36 | E6 → R2 | dev-facing diagnostic dashboards | Aspirational |
| 37 | P9 → A9 | writes override events | Aspirational |
| 38 | A9 → P5 | reads learned aliases on next match | Aspirational |
| 39 | P15 → P4 | selects active ROI set per detected platform | Aspirational |
| 40 | P10 → P16 | invokes pre-draft health check on draft start | Aspirational |
| 41 | P16 → R1 | warns user (stale sync / battery low / config mismatch) | Aspirational |
| 42 | P14 → A2 | proposes ROI updates from in-draft calibration capture | Aspirational |

### Inter-subsystem interfaces

| From | To | Interaction(s) | Mechanism |
|------|----|----------------|-----------|
| S1 | S2 | 12, 13 | Writes to App Group store (A1) + Darwin notification (E5) |
| S2 | S3 | 17 | In-process function call (same app) |
| S3 | S4 | 19 | In-process call → ActivityKit update |
| S5 | S2 | 26 | Populates A3 / A5 on app launch |
| S5 | S1 | 28 | Config (A2) is read by extension at start of broadcast |
| S4 | S2 | 24 | App Intent writes back into A1 |

---

## Feedback Loops

| ID | Type | State | Description |
|----|------|-------|-------------|
| L1 | Balancing | Aspirational | **OCR throttling loop.** Frame-diff motion detector (P3) suppresses OCR calls when pixels are stable — balances accuracy against the extension's memory/CPU ceiling. Breaks if motion detector misclassifies static frames as moving (false positives → OCR overload). |
| L2 | Balancing | Aspirational | **Live Activity rate limiter.** Apple throttles ActivityKit updates; P8 must batch state changes to ~1 update per pick. Balances UI freshness against platform throttle. Broken if P8 fires on every OCR result rather than per pick event. |
| L3 | Reinforcing | Aspirational | **State coherence loop.** Each resolved pick by P5/P6 narrows the player pool for the next round of OCR matching (eliminated players can be deprioritized) — reinforces match accuracy over the course of a draft. |
| L4 | Balancing | Aspirational | **Override correction loop.** When R1 corrects state via P9 App Intents, P6 reconciles and analysis (P7) recomputes — balances OCR error against user agency. Requires P5/P6 to gracefully accept manual overrides without re-asserting wrong state on next OCR pass. |
| L5 | Reinforcing | Aspirational (revised) | **Config-update loop (with telemetry leg).** P5 emits confidence/match-quality metrics → P12 → A7 → E6 → R2 reviews diagnostics → R2 publishes new ROI/template config via P11 → A2 → P4 picks up on next broadcast. Pass-1 finding F-015 noted this loop's end-to-end reliability was ~2% without telemetry; the diagnostic leg is intended to close that gap. |
| L6 | Reinforcing | Aspirational | **Override-learning loop.** R1 → P9 → A9 → P5 reads learned aliases on next match → fewer mismatches on similar strings later in the same draft. Within-draft reinforcement; cross-draft persistence is a follow-on design question. |
| L7 | Balancing | Aspirational | **Latency feedback loop.** P13 timestamps each stage → A8 records measurements vs. budget → R2 tunes P3 sampling rate / P4 recognition level / P5 fuzzy thresholds. Continuous validation of iA2 rather than a one-time pre-build check. |

---

## Known Hard Parts (from architecture doc)

These are flagged upfront — they become inputs to interrogation rather than findings.

- **Latency budget** (iA2): 3–5s end-to-end on a 30s clock. Must be profiled before building.
- **Extension memory ceiling**: ~50MB for S1. Forces analysis to live in main app.
- **OCR fragility**: platform UI updates break ROI coordinates → driver for L5 and iA6.
- **App Store review risk**: ReplayKit + DFS-adjacent → driver for iA3.
- **Battery**: continuous capture + OCR is heavy. Needs session caps and auto-stop.
- **Permission flow**: 2-tap confirmation per session, no "always allow."

---

## Notes

- This model intentionally treats the iOS app as a standalone system rather than a subsystem of BBE, because (a) no top-level BBE subsystem inventory currently includes it and (b) the iOS-specific constraints (process boundaries, memory ceiling, ActivityKit throttle) dominate the design enough to warrant their own modeling frame. If/when this becomes a committed product line, consider promoting it into the BBE top-level model as subsystem `S-iOS` and folding A3/E6 into the parent's existing artifact/external inventory.
