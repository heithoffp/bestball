# Prioritization — iOS Draft Assistant

**Created:** 2026-05-13
**Inputs:** 65 findings from `interrogation.md` (passes 1 + 2)

> **Framing caveat.** The iOS Draft Assistant is not in ROADMAP.md and has no committed build decision. "Address Now" below means "if you decide to pursue iOS, these are decision-gating before any code." Several Tier-1 themes are themselves prerequisites to a go/no-go decision.

---

## Themes

Findings grouped into 12 themes covering the 65 individual findings:

| Theme | Findings | Summary |
|-------|----------|---------|
| T1. L5 Config-Update Loop Reliability | F-003, F-015, F-017, F-031, F-037, F-039, F-040, F-041, F-051, F-055, F-056, F-062, F-063, F-064 | Even with the telemetry leg added in revision, end-to-end loop reliability is ~7.7%. Consent flow, R2 throughput, UI-churn detection, regression-replay, rollback all unencoded. |
| T2. Latency as a Continuous Property (iA2) | F-004, F-018, F-020, F-026, F-034, F-043, F-048, F-052, F-058 | iA2 is hoped for, not measured. No per-stage budget enforced in-band. A8 only consumed offline. P13 cross-process timing unsolved. SQLite/Darwin hop unbenchmarked. |
| T3. Mirror vs. Advisor on Dynamic Island | F-001, F-011, F-021 | "Recommendations" framing on tiny surface structurally pushes toward advisor behavior; opposes iA4 and parent A3. |
| T4. S1 Extension Memory Budget | F-005, F-007, F-012, F-023, F-024, F-043, F-050, F-057, F-060 | 50MB ceiling treated as if instrumentation/calibration/platform-detection are free. A6 retention unspecified. No graceful degradation. |
| T5. Override-Learning Specification | F-002, F-014, F-016, F-042, F-045, F-047, F-059 | L6 contract underspecified: poisoning risk, persistence semantics, App Intent IPC, A1 schema consumer behavior. |
| T6. Zero-Config Principle ↔ iOS Reality | F-008, F-009, F-010, F-035, F-046, F-054 | Parent A2 zero-config violated by broadcast permission flow (2-tap/session, no entry path from Underdog), implicit platform selection, P16 advisory-only contract. |
| T7. Privacy ⟷ Operability (pending ADR F-025) | F-017, F-025, F-039, F-049, F-055 | Hard tension between iA3 marketing positioning and L5 operational viability. Now structurally embedded after revision. |
| T8. Wakeability / S1 Boundary (pending ADR F-027) | F-027, F-043, F-057, F-058, F-061 | Main-app analysis assumption vs. iOS background execution reality. Sharpened by revision-added S1 residents. |
| T9. Solo-Developer Operational Risk | F-022, F-030, F-040, F-056 | R2 is single point of failure for L5, App Store releases, incident response. Decision throughput unmapped. |
| T10. Platform Parity Discipline | F-028, F-033, F-044, F-053, F-060, F-063, F-065 | 2x ROI maintenance, JS↔Swift analytics duplication, platform detection ambiguity, no shared analytics contract. |
| T11. App Store Approval as External Constraint | F-006 | Entire viability on a binary external decision with no Plan B. |
| T12. Pre-Draft Health / Confidence Hub | F-038, F-046, F-054 | P16 is advisory and one-shot; no closure on whether warnings were heeded. |

---

## Scoring

6-dimension matrix (1–5 each). Weighted score = OR·0.25 + Comp·0.20 + Doc·0.05 + RelCurr·0.25 + RelAsp·0.15 + Effort·0.10. Higher = higher priority.

| Theme | Outstanding Risk | Competency | Documentation | Relevancy (current) | Relevancy (aspirational) | Effort (inverse) | **Weighted** |
|-------|:---:|:---:|:---:|:---:|:---:|:---:|:---:|
| T2 Latency | 5 | 5 | 5 | 5 | 5 | 3 | **4.80** |
| T7 Privacy ⟷ Op (ADR) | 5 | 4 | 5 | 5 | 5 | 4 | **4.70** |
| T11 App Store Plan B | 5 | 5 | 5 | 5 | 5 | 2 | **4.70** |
| T8 Wakeability (ADR) | 5 | 4 | 5 | 5 | 5 | 3 | **4.60** |
| T4 S1 Memory Budget | 5 | 4 | 4 | 5 | 5 | 3 | **4.55** |
| T1 L5 Config Loop | 5 | 5 | 5 | 4 | 5 | 2 | **4.45** |
| T3 Mirror vs. Advisor | 4 | 3 | 4 | 5 | 5 | 4 | **4.20** |
| T9 Solo-Dev Risk | 4 | 4 | 5 | 4 | 5 | 2 | **4.00** |
| T6 Zero-Config ↔ iOS | 3 | 4 | 4 | 4 | 4 | 3 | **3.65** |
| T5 Override Spec | 3 | 3 | 4 | 3 | 4 | 4 | **3.30** |
| T10 Platform Parity | 3 | 3 | 4 | 3 | 4 | 2 | **3.10** |
| T12 Pre-Draft Health | 2 | 3 | 4 | 2 | 3 | 4 | **2.65** |

---

## Tier Assignments

### Tier 1 — Address Now (decision-gating before any iOS build)

These themes must resolve before code commitment. Three of the six are themselves decisions, not implementation.

| Theme | Score | Why "now" |
|-------|:---:|-----------|
| **T11 App Store Plan B** | 4.70 | Binary external constraint. Should be answered (or at minimum: scoped) before any build investment. *Action: write a one-page risk note covering rejection probability, TestFlight-only fallback, Mac Catalyst alternative.* |
| **T7 Privacy ⟷ Op (ADR F-025)** | 4.70 | Hard tension structurally embedded in L5. Determines whether the entire telemetry leg is viable. *Action: draft ADR via hus-adr.* |
| **T8 Wakeability (ADR F-027)** | 4.60 | Determines S1/S2 boundary. Revisions sharpened this — pushing more code into the extension while making state semantics more main-app-dependent. *Action: draft ADR via hus-adr.* |
| **T2 Latency** | 4.80 | Architecture doc itself says "profile this before building anything else." Until measured, every other claim is speculative. *Action: scoped prototype task — bare ReplayKit + Vision + ActivityKit ping, log end-to-end latencies across a real Underdog draft.* |
| **T4 S1 Memory Budget** | 4.55 | Co-prerequisite with T2. The 50MB ceiling is the dominant architectural constraint and revisions added load (P13, P14, P15) without budgeting. *Action: incorporate into T2 prototype — measure memory under load.* |
| **T1 L5 Config-Update Loop** | 4.45 | Loop reliability ~7.7% even revised. Gates iA6 (UI-churn resilience). T7 (privacy ADR) is upstream of this. *Action: defer detailed design until T7 resolves; then design consent flow + R2 SLA + regression-replay.* |

### Tier 2 — Address Soon (post-MVP, but before scale)

| Theme | Score | Why "soon" |
|-------|:---:|-----------|
| **T3 Mirror vs. Advisor** | 4.20 | Dynamic Island copy and recommendation framing affect both product positioning and App Store review tone. Worth deciding before first screenshots are shot but does not gate prototype. |
| **T9 Solo-Dev Operational Risk** | 4.00 | Once the loop exists, R2 throughput becomes the bottleneck. Could be mitigated by automation (T1) or by deciding upfront not to ship until a more robust ops model exists. |
| **T6 Zero-Config ↔ iOS** | 3.65 | iOS forces a 2-tap permission flow per session — the parent A2 principle needs an iOS-specific reframe. Worth doing before App Store screenshots; doesn't gate prototype. |

### Tier 3 — Address Later (deferred)

| Theme | Score | Why "later" |
|-------|:---:|-----------|
| **T5 Override-Learning Spec** | 3.30 | L6 contract gaps. Important but only once override events exist; prototype can stub. |
| **T10 Platform Parity** | 3.10 | Architecture doc itself says "start with one platform, ship it, then add the second." T10 only matters at platform-2 boundary. |
| **T12 Pre-Draft Health** | 2.65 | Polish layer over the core loop. Useful for retention; not viability-gating. |

---

## Integration Recommendations (preview of Step 8)

Based on the tier assignment, the following actions are recommended:

1. **Two ADRs via hus-adr:** F-025 (privacy/operability resolution) and F-027 (wakeability / S1 boundary). These are structural and gate Tier-1 work.
2. **One scoped prototype task via hus-backlog:** "iOS latency + memory feasibility prototype" — addresses T2 + T4 together. Outcome is a go/no-go signal on whether the architecture can hit iA2 within iA7.
3. **One risk note via docs/:** App Store rejection scenarios + fallback options (T11). Not an ADR — exploratory document.
4. **No ROADMAP changes yet:** iOS is not on the roadmap and should not be added until the ADRs + prototype land. Step 8 should *not* propose adding an iOS epic prematurely.
5. **No BACKLOG churn for Tier 2/3:** Document them in this file; revisit only if iOS becomes a committed roadmap item.

Key meta-finding: the systems-model pass surfaced enough load-bearing unknowns that **the right next step is decision work, not implementation work**.
