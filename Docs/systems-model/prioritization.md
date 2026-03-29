# Prioritization — Best Ball Portfolio Manager

**Date:** 2026-03-27
**Weights:** Default (no adjustments)

---

## Themes

### T1: Commercial Strategy Gap
**Contributing findings:** F-001 (high), F-002 (high), F-009 (low)
**Summary:** The system has no process, expertise, or information source for commercial decisions — pricing, positioning, promotion, competitive analysis. This is the largest structural gap given the 500-subscriber target. Building subscription infrastructure (P8) and a landing page (A7) without a commercial strategy is building outputs without direction.
**Aspirations affected:** A6

### T2: User Insight Blindness
**Contributing findings:** F-004 (medium), F-003 (medium), F-005 (medium)
**Summary:** No mechanism exists to observe how users interact with the product — which features they use, where they drop off, or whether the core value loop (FL1) is running. Two key assumptions (CSV upload is acceptable for paid users; Underdog-only is sufficient market) remain unvalidated. Without user signals, pricing, promotion, and feature prioritization are guesswork.
**Aspirations affected:** A1, A2, A6

### T3: Auth-to-Payment Chain Completion
**Contributing findings:** F-008 (low)
**Summary:** The auth flow (P6) is partial, and subscription (P8) depends on it being complete. The chain R1 → P6 → E2 → P8 → E4 has two incomplete links. Revenue can't flow until both are built.
**Aspirations affected:** A6

### T4: Operational Resilience
**Contributing findings:** F-006 (medium)
**Summary:** ADP collection depends entirely on R2 running a scraper every ~2 days. Paying subscribers expect consistent data freshness. A gap during developer unavailability degrades the product.
**Aspirations affected:** A1, A6

### T5: Governance Calibration
**Contributing findings:** F-007 (low)
**Summary:** Standard-tier governance adds friction for a solo developer with a ~29-day deadline. The balancing loop (FL3) is working but may over-constrain velocity for the commercial launch sprint.
**Aspirations affected:** A6

---

## Scoring Matrix

| Theme | Risk (25%) | Competency (20%) | Documentation (5%) | Relevancy-Current (25%) | Relevancy-Aspirational (15%) | Effort-inv (10%) | **Weighted** |
|-------|-----------|-----------------|-------------------|------------------------|-----------------------------|--------------|----|
| T1: Commercial Strategy | 5 | 5 | 5 | 4 | 5 | 2 | **4.45** |
| T2: User Insight | 3 | 4 | 4 | 3 | 5 | 3 | **3.55** |
| T3: Auth-Payment Chain | 4 | 3 | 3 | 4 | 4 | 2 | **3.55** |
| T4: Operational Resilience | 2 | 3 | 3 | 2 | 3 | 4 | **2.60** |
| T5: Governance Calibration | 2 | 3 | 2 | 3 | 2 | 4 | **2.65** |

---

## Tier Assignments

### Tier 1 — Address Now
- **T1: Commercial Strategy Gap** (4.45) — Without pricing/positioning/promotion strategy, everything built for A6 risks being misdirected.

### Tier 2 — Address Soon
- **T2: User Insight Blindness** (3.55) — Instrument analytics before or at launch. Validates assumptions F-003 and F-005.
- **T3: Auth-Payment Chain** (3.55) — Already tracked as FEAT-001/FEAT-002. Pricing decisions from T1 should inform tier gating.

### Tier 3 — Address Later
- **T5: Governance Calibration** (2.65) — Revisit if velocity feels constrained.
- **T4: Operational Resilience** (2.60) — Automate ADP scraping before scaling to paying users.

---

## Integration Recommendations

| Theme | Maps to Existing? | Recommendation |
|-------|-------------------|----------------|
| T1 | No | Add new feature to EPIC-01: "Commercial Strategy & Positioning" — sequenced before FEAT-002 and FEAT-014 |
| T2 | Partially (FEAT-003) | Expand FEAT-003 to include feature-level usage analytics beyond page views |
| T3 | Yes (FEAT-001, FEAT-002) | Add dependency note: FEAT-002 should consume T1 pricing decisions before implementation |
| T4 | Loosely (FEAT-003) | No immediate action; revisit before paid launch |
| T5 | No (process, not code) | No roadmap change; developer can adjust governance tier if needed |
