# Interrogation Findings — iOS Draft Assistant

**Pass 1:** 2026-05-13 (38 findings against initial model)
**Pass 2:** 2026-05-13 (27 findings against revised model, post pass-1 revisions)
**Total findings:** 65
**Status:** Converged. Pass 2 findings shifted from architecture gaps to specification gaps — the documented convergence signal. Pass 3 was recommended by the interrogating subagent but gated on resolving pending ADRs (F-025, F-027), and the developer elected to proceed to prioritization.

Both passes used fresh-context subagents to reduce confirmation bias.

---

## Pass 1 — Findings F-001 through F-038

### Q1: Where Are Decisions Made?

**F-001** | misalignment | high | P7, P8, A4, interactions #19–#22 | iA4 | The Analysis Engine produces "top-N recommendations" surfaced on the Dynamic Island as "recs" — prescriptive output, not state mirror. iA4 and parent A3 restrict computed opinions, but the surface contract still encodes advisor behavior. No rubric for what counts as mirroring vs. advising on a 2–3 slot Dynamic Island.

**F-002** | bottleneck | medium | P5, P6, A1 | iA1, iA2 | Ambiguity resolution concentrates in P5 with no escalation. P5 must finalize every pick because P6 consumes resolved events — no "low-confidence pending" state for the Surface to express. Decision authority for correctness sits in one block with no human-in-the-loop unless the user notices.

**F-003** | gap | medium | R2, L5 | iA6 | "When to publish a new ROI/template config" is an undocumented developer decision. R2 is the sole decider for changes affecting every active user mid-slate, with no decision-support telemetry feeding the choice.

### Q2: What Assumptions Does the Model Rely On?

**F-004** | assumption | high | P2, P3, P4, iA2 | iA2 | 3–5s latency budget treated as aspirational property with no checkable artifact. No per-stage allocation, no test/benchmark block. Hoped for, not measured.

**F-005** | assumption | high | P4, P2, A6, S1 | iA7 | Two simultaneous unproven assumptions (50MB memory headroom AND recognizer speed at `.accurate`) treated as a single checkable constraint. No "fast-path / accurate-path" decision block.

**F-006** | assumption | high | P2, E3, E7, #30 | iA3, iA1 | Entire system viability hinges on Apple approving a Broadcast Upload Extension whose sole purpose is observing a DFS app's screen. No fallback path modeled if rejected.

**F-007** | assumption | medium | P3, L1 | iA2, iA7 | Frame-diff motion detection assumes visual change in ROI corresponds to pick event. Underdog/DK have animations, ticker scrolling, count-downs that produce motion without picks. No "motion ≠ pick" classifier; L1 failure mode unmitigated.

**F-008** | assumption | medium | A5, P5 | iA1, iA5 | A5 assumes player pool is known, current, and complete at draft start. No handling for late roster moves, injury drops, rookies, duplicate names across platforms. No "unknown player" branch.

**F-009** | assumption | medium | P10, A3, #25–#26 | iA1 | Sync modeled as pull-on-launch + push-on-end with caching. Assumes user opens app shortly before drafting; stale exposures if app was open for hours.

**F-010** | assumption | medium | R1, #1–#3 | iA1 | Flow assumes drafter starts BBE first, then switches to Underdog/DK. Real behavior — opening platform app, joining draft, *then* wanting the assistant — has no entry path.

**F-011** | assumption | low | A4, E4, iA4 | iA4 | Assumes Dynamic Island users interpret "recs" as mirror state. No labeling/copy contract enforces this.

### Q3: Where Is Value Created? Where Is Waste?

**F-012** | waste | medium | A6 | iA7 | A6 is "ephemeral" but modeled as P2 writes / P3 reads. If frame-diff is gating, buffering frames that fail the diff produces memory pressure without value. Retention policy and capacity unmodeled.

**F-013** | waste | low | #29 | iA1 | Completed-draft results pushed to E6 but the consumer and decision/value enabled are not specified. Risks being write-only.

**F-014** | waste | low | P9, #23–#24 | iA4 | Override events are high-signal ("OCR got it wrong here") but consumed once and discarded. No feedback path from override frequency to ROI config quality.

### Q4: Where Does Feedback Exist?

**F-015** | feedback-loop | high | L5, P9, P11, R2 | iA6 | L5 chain reliability pre-revision: OCR fails → user notices (~50%) → reports (~20%) → diagnosed (~70%) → fix in time (~30%) → ≈ 2%. Loop functionally broken even before considering missing telemetry leg.

**F-016** | feedback-loop | high | P5, P9, P6, L4 | iA1, iA4 | L4 has no signal back to P5's matching confidence or P4's recognizer behavior. Override corrects one event, doesn't improve matching for rest of draft, doesn't train future drafts.

**F-017** | feedback-loop | high | P4, P5, A2, E6 | iA6 | No telemetry from S1/S2 back to E6. iA3 privacy stance complicates any telemetry leg, but absence of *any* low-PII signal means developer has zero in-the-wild visibility. Privacy aspiration in tension with operability aspiration with no documented resolution.

**F-018** | feedback-loop | medium | L1, P3 | iA2, iA7 | L1 (OCR throttling) lacks observable signal. No metric fed anywhere — developer cannot tune threshold without local profiling.

**F-019** | feedback-loop | medium | P8, E4, L2 | iA1 | ActivityKit throttle drops are silent. If P8 fires inside throttle window the update is lost; drafter sees stale Dynamic Island and system doesn't know.

**F-020** | feedback-loop | medium | iA2 | iA2 | No latency-feedback loop. System could timestamp each stage and surface budget burn but iA2 is a one-time pre-build check per architecture doc.

### Q5: Misaligned Incentives

**F-021** | misalignment | high | P7, A4, iA4 vs iA1 | iA4 | Subscription retention rewards visible "value moments" on Dynamic Island. Cheapest such moment is a confident recommendation. Structural pressure pushes surface toward advisor behavior, opposing iA4.

**F-022** | misalignment | medium | R2, L5 | iA6 | Remote-config maintenance falls entirely on solo developer. Sunday slate OCR breakage at 2am → user experiences failure, developer bears asymmetric remediation cost.

**F-023** | misalignment | medium | P4, iA2 vs iA7 | iA2, iA7 | Accuracy trades against latency and memory inside P4. Model picks `.accurate` upstream but provides no escape valve — no per-ROI tiering.

### Q6: Tensions, Ownership, Bottlenecks

**F-024** | bottleneck | high | S1 internals | iA2, iA7 | 50MB extension is the serialization point for every pick. Capture/diff/OCR/match-prep all serialize within one process. Any stage stalling cascades into budget burn. No parallelism, no graceful degradation.

**F-025** | tension | high | iA3 vs iA6 | iA3, iA6 | Privacy-first ("no frame data leaves phone") is operationally clean but eliminates telemetry that would drive iA6 config refresh. No middle ground modeled.

**F-026** | boundary-issue | high | A1 | iA2 | A1 is IPC choke point. SQLite write latency, fsync behavior, Darwin notification coalescing are platform-determined and unbenchmarked. Treated as free hop; often dominant latency contributor.

**F-027** | boundary-issue | high | E5 → P1 | iA1, iA2 | Main app foregrounded is not guaranteed during draft. ActivityKit updates from fully-suspended app have stricter constraints than model implies. "Analysis in main app" choice may be invalidated by iOS background execution reality.

**F-028** | tension | medium | iA5, L5, P4, A2 | iA5 | Underdog and DK UIs evolve independently. iA5 + iA6 compound: 2x templates, 2x breakage events. No prioritization rubric for "which platform first when both break Sunday morning."

**F-029** | tension | medium | A3 | iA1 | A3 spans S5 (sync) and S3 (analysis). Ownership documented, staleness policy isn't. No TTL, version, "warn user: portfolio data is N hours old."

**F-030** | bottleneck | medium | R2, E7, L5 | iA6, iA1 | Solo-developer SPOF for App Store releases, remote-config updates, incident response. Sunday-slate operability depends on one human's availability.

### Q7: Unencoded Methods

**F-031** | unencoded-method | high | R2, P4, A2 | iA6 | ROI/template authoring is manual: screenshots → measure pixels → hand-code template → deploy. Iterative method lives entirely in developer's head.

**F-032** | unencoded-method | high | P5, A5, R2 | iA6, iA1 | Fuzzy-match tuning curated manually. No regression suite of "real OCR strings → expected player." No method to replay a draft's OCR stream against a candidate matcher change.

**F-033** | unencoded-method | medium | parity with Chrome extension, P7 | iA5 | P7 logic ("same as Chrome extension") is duplicated work manually kept in sync between web/extension/iOS. BBE's `utils/` is JS, not Swift — parity method is "rewrite by hand."

**F-034** | unencoded-method | medium | R2, latency profiling | iA2 | "Profile this before building anything else" is a method (instrument → capture timings → analyze → identify hotspot) entirely unencoded. No CI step for per-build latency regression.

**F-035** | unencoded-method | medium | iA5, R2 | iA5 | "Detect which platform is being captured" is implicit. Platform-detection method not modeled; user implicitly assumed to tell the app (violates parent A2 zero-config).

**F-036** | unencoded-method | medium | draft replay UX | iA1 | Draft replay/postmortem ("here is what assistant saw pick by pick") is a natural extension of mirror philosophy. UX is unmodeled.

**F-037** | unencoded-method | low | P11, A2 versioning | iA6 | Config rollback is unmentioned. Bad ROI push → developer reverts file → clients re-fetch. Method should be first-class, not ad-hoc.

**F-038** | unencoded-method | low | R1, session lifecycle | iA1 | Pre-draft warmup (sync fresh, permission granted, broadcast healthy, ROI version matches platform version) is a checklist performed implicitly. Formal pre-draft health check block missing.

---

## Pass 2 — Findings F-039 through F-065 (post-revision)

### Q1: Decisions

**F-039** | gap | high | P12, A7, #33–#36 | iA3, iA6 | Consent for diagnostic uploads has no owning decision block. Model does not specify when consent is solicited, who presents the UI, who records the decision, where the consent record is stored, or whether revocable. Without this, P12/A7 cannot legally fire and L5's telemetry leg silently fails.

**F-040** | misalignment | medium | R2, #32, #36, #42 | iA6 | R2 is sole consumer of three feedback streams (A8, A7, P14 proposals) and sole publisher of A2 updates. Decision throughput at R2 is gating factor for L5, L7, operational durability. Model maps authority but not capacity.

**F-041** | gap | medium | P14 → A2 (#42) | iA6 | P14 "proposes ROI updates" but model does not say who approves before promotion to A2. Decision ownership for promoting calibration captures to production config undefined.

**F-042** | misalignment | medium | P9, A9, P5, L6 | iA4, iA1 | L6 treats every R1 override as ground truth. Genuine OCR error vs. dismissed-correct-match vs. misclick are indistinguishable. Without confidence/policy filter, A9 can poison P5 within a draft.

### Q2: Assumptions

**F-043** | assumption | high | P13, P14, A8 | iA7, iA2 | P13 cross-cutting and P14 in S1 implicitly assume code can be instantiated inside 50MB ceiling without measurable overhead. No budget allocation for instrumentation/calibration code within S1.

**F-044** | assumption | high | P15 → P4 (#39) | iA5 | Chicken-and-egg: platform detection itself requires OCR-ish vision work; incorrect detection silently selects wrong ROIs (systematic mismatch, not no-match — harder to detect). No P15 fallback when confidence low; P15 failure indistinguishable from platform UI churn (which would trigger L5).

**F-045** | assumption | medium | A9, L6 | iA1 | A9 described as "per-draft" implying ephemerality but persistence semantics unspecified. If per-draft, L6 cannot reinforce across drafts and reinforcing label overstates scope. If cross-draft, conflicts with caveat. Lifecycle unspecified.

**F-046** | assumption | medium | P16, #40–#41 | iA1, iA2 | P16 assumes user opens companion app and triggers health check before joining draft. Many users will switch directly from notification/home screen. Trigger contract not specified: hard precondition or advisory?

**F-047** | assumption | medium | A1 schema, P6, P9 | iA1, iA4 | A1 `confidence`/`status` schema implicitly assumes consumers treat `pending` differently from `confirmed`. Contract unspecified: does P7 recompute on `pending` (fast, noisy) or only `confirmed` (correct, adds latency)? Schema change without consumer-behavior spec is half-encoded.

### Q3: Waste

**F-048** | waste | medium | A8, #32 | iA2 | A8 records per-stage latency on every pick but only consumer is R2 viewing dev surface. No in-app consumer (e.g., balancing action throttling P3 when budget burns hot). L7 is R2-mediated offline tuning — A8's per-pick granularity wasted.

**F-049** | waste | low | P12, A7 | iA3 | P12 buffers continuously but #35 only uploads on consent. If denied (likely default per iA3), A7 accumulates unconsumed data on-device — battery/storage/CPU spent on telemetry that never leaves. No retention or eviction policy.

**F-050** | gap | medium | A6 | iA3, iA7 | A6 labeled "ephemeral" but no retention spec. Inside 50MB extension, unbounded CMSampleBuffer queue is memory-pressure crash risk. Revision did not address despite pass 1 S1 resource concerns.

### Q4: Feedback

**F-051** | feedback-loop | high | L5 revised chain | iA6 | Chain reliability with telemetry leg: 0.95 × 0.95 × 0.30 (consent) × 0.90 × 0.50 (R2 SLA) × 0.70 × 0.95 ≈ **7.7%**. Revision improved from ~2% but leaves loop functionally unreliable. Weakest links now consent rate and R2 review SLA, neither addressed.

**F-052** | feedback-loop | medium | L7 | iA2 | L7 labeled "balancing" but corrective leg is manual, asynchronous, post-hoc. A true balancing loop would have in-band response (auto-throttle, degrade gracefully). Cannot prevent live latency excursion during a draft.

**F-053** | feedback-loop | medium | P15 | iA5 | No loop validates P15 detection accuracy. Wrong-platform symptom is OCR mismatch — which is *also* L5's signal for ROI churn. No attribution; L5 corrective signal ambiguous.

**F-054** | feedback-loop | medium | P16, #41 | iA1 | P16 warnings flow to R1 but no feedback path showing whether user acted. Cannot tell if "battery low" was heeded, ignored, or rendered moot. Pre-draft health is one-shot announcement with no closure.

### Q5: Incentives

**F-055** | misalignment | high | A7, #35, iA3 vs iA6 | iA3, iA6 | Diagnostic leg only works if meaningful fraction of users consent — but iA3 is also marketing/App Store positioning. Product incentivized to advertise privacy-first while operationally needing upload consent. Structurally embedded in L5; sharpens pending ADR F-025.

**F-056** | misalignment | medium | P14 | iA6 | P14 "dev-only" means calibration channel for new platform UI scales with developer availability, not user base. When Underdog ships UI change at 9pm Sunday, R2 is only recovery path. Incentive: cheapest fix during UI churn is to bypass model controls (hardcode ROI hotfix), eroding operational discipline.

### Q6: Tensions, Boundaries

**F-057** | tension | high | P13, P14 in S1 | iA7 | P13 and P14 both place code in 50MB-ceilinged extension. P14 labeled "dev-only" but model doesn't specify compile-out vs. runtime-gated. If runtime-gated, calibration tool steals memory from OCR in production. Instrumentation aspirations directly conflict with iA7.

**F-058** | boundary-issue | high | P13 cross-cutting, A8 | iA2 | P13 spans extension/main-app process boundary. Requires two code paths sharing a clock and write surface. IPC contract for cross-process timing unspecified; clock skew between processes is known iOS gotcha that would silently corrupt A8 measurements.

**F-059** | boundary-issue | medium | A9 (S2), P9 (S4), P5 (S2) | iA1 | L6's loop crosses S4 → S2 with no specified IPC. App Intents have own lifecycle and may not have main-app process context. Reliability of P9 → A9 writes unspecified.

**F-060** | tension | medium | P15 in S1 | iA5, iA7 | P15 must run in S1 to select active ROIs before OCR but consumes same constrained budget. Model doesn't specify lightweight heuristic vs. true classifier — large memory/latency implications.

**F-061** | boundary-issue | medium | pending ADR F-027 | iA2 | Revision pushed *more* code (P13, P14, P15) into S1 while *also* adding state-semantics complexity (A1 schema, L6) that argues against extension residence. Design pressures pull in opposite directions; ADR sharpened, not resolved.

### Q7: Unencoded Methods

**F-062** | unencoded-method | medium | #36 R2 review | iA6 | "R2 reviews diagnostics → publishes config" is encoded as one interaction but is in practice a structured triage method (cluster events, identify drift, reproduce on dev device, author calibration, publish, confirm). Highest-value operational workflow; warrants its own block.

**F-063** | unencoded-method | medium | UI-churn detection | iA6 | "Underdog/DK shipped a UI update" event has no representation. Currently detected by external observation (forums, beta, user reports). Formal release-monitoring block would let L5 close before next draft cycle rather than after first user-impact.

**F-064** | unencoded-method | low | pre-publish A2 validation | iA6 | Publishing config via P11 → A2 has no validation step. Regression-replay method (run proposed config against recorded sessions) is unencoded. Without it, bad config push breaks every active user simultaneously.

**F-065** | unencoded-method | low | shared analytics core | iA1, iA4 | Pass 1 F-033 reinforced: existing web Draft Assistant already runs correlation/exposure/leverage scoring; iOS P7 is described as porting that logic but contract between implementations is not encoded. Version skew will produce divergent recommendations for same portfolio.

---

## Summary

- **Total findings:** 65 (38 + 27)
- **By severity:** 21 high, 36 medium, 8 low
- **Convergence:** Pass 2 shifted findings from architecture gaps to specification gaps — the documented convergence signal. Pass 3 deferred pending ADR resolution.

**Pending ADRs reinforced by interrogation:**
- **F-025 / Privacy ⟷ Operability:** L5 telemetry leg structurally embedded in revision; consent rate quantified as dominant reliability bottleneck (F-051, F-055). Resolve before further L5 investment.
- **F-027 / Wakeability:** Revisions sharpened the boundary tension — more code pushed into S1 (P13, P14, P15) while state-semantics complexity argues against extension residence (F-043, F-057, F-061).
