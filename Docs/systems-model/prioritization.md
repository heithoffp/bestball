# Prioritization — Best Ball Portfolio Manager

**Initial pass:** 2026-03-27
**Delta pass:** 2026-04-03
**Weights:** Default (no adjustments)

---

## Resolved Themes (from initial pass)

| Theme | Score | Resolution Date | How Resolved |
|-------|-------|----------------|--------------|
| T1: Commercial Strategy Gap | 4.45 | 2026-03-30 | FEAT-021 complete — pricing ($20/mo, 25% promos), positioning, channel strategy decided |
| T3: Auth-Payment Chain | 3.55 | 2026-03-30 | Full auth + Stripe Checkout + subscription management + feature gating live |
| T2: User Insight Blindness | 3.55 | 2026-04-01 | Feature analytics (TASK-010) + extension scraper eliminates CSV for Underdog. Residual: F-005 (Underdog-only assumption) still open |

---

## Active Themes

### T6: Extension Confidence & Trust (NEW)
**Contributing findings:** F-010 (high), F-011 (high), F-012 (medium), F-013 (medium)
**Summary:** The extension works technically but provides no feedback to the user about its state. Sync progress, connectivity health, tournament scoping, and error recovery are all invisible. The floating icon needs to become a "confidence hub" — the single place a user goes to verify everything is working before they draft. This is the primary UX gap between "extension works" and "extension feels trustworthy."
**Aspirations affected:** A1, A2, A3

### T7: Extension Lifecycle Management (NEW)
**Contributing findings:** F-014 (medium)
**Summary:** The overlay doesn't start/stop cleanly on SPA navigation. Without this, the overlay can show stale state or appear on non-draft pages. Already tracked as TASK-103.
**Aspirations affected:** A4

### T4: Operational Resilience (unchanged)
**Contributing findings:** F-006 (medium)
**Summary:** ADP collection depends entirely on R2 running a scraper every ~2 days. Paying subscribers expect consistent data freshness.
**Aspirations affected:** A1, A6

### T5: Governance Calibration (unchanged)
**Contributing findings:** F-007 (low)
**Summary:** Standard-tier governance adds friction for a solo developer with a deadline. The balancing loop (FL3) is working but may over-constrain velocity.
**Aspirations affected:** A6

### T2 (residual): Platform Assumption
**Contributing findings:** F-005 (medium)
**Summary:** Underdog-only market assumption still unvalidated against market sizing. Extension scraper resolved the UX concern (F-003) but not the market size question.
**Aspirations affected:** A7

---

## Scoring Matrix

| Theme | Risk (25%) | Competency (20%) | Docs (5%) | Relevancy-Current (25%) | Relevancy-Aspirational (15%) | Effort-inv (10%) | **Weighted** |
|-------|-----------|-----------------|-----------|------------------------|-----------------------------|--------------|----|
| T6: Extension Confidence | 4 | 5 | 4 | 5 | 5 | 2 | **4.35** |
| T7: Extension Lifecycle | 3 | 3 | 3 | 4 | 4 | 3 | **3.40** |
| T5: Governance Calibration | 2 | 3 | 2 | 3 | 2 | 4 | 2.65 |
| T4: Operational Resilience | 2 | 3 | 3 | 2 | 3 | 4 | 2.60 |
| T2 (residual): Platform | 2 | 3 | 2 | 2 | 4 | 3 | 2.55 |

---

## Tier Assignments

### Tier 1 — Address Now
- **T6: Extension Confidence & Trust** (4.35) — Without sync visibility, tournament selection, and connectivity status, the extension asks users to trust it blindly. This is the gap between "technically functional" and "commercially viable."

### Tier 2 — Address Soon
- **T7: Extension Lifecycle Management** (3.40) — SPA navigation handling. Already tracked as TASK-103.

### Tier 3 — Address Later
- **T5: Governance Calibration** (2.65) — Revisit if velocity feels constrained.
- **T4: Operational Resilience** (2.60) — Automate ADP scraping before scaling to paying users.
- **T2 (residual): Platform Assumption** (2.55) — Validate Underdog market size before investing in multi-platform.

---

## Integration Recommendations

| Theme | Maps to Existing? | Recommendation |
|-------|-------------------|----------------|
| T6 | Partially — TASK-100 covers the floating icon UI surface | Expand TASK-100 or create new tasks under FEAT-010: (1) sync progress indicator, (2) connectivity status with actionable error states, (3) tournament selection filter for overlay context. Consider a new feature "Extension Setup & Trust UX" under EPIC-03. |
| T7 | Yes — TASK-103 | Already tracked. No change needed. |
| Resolved | T1, T2 (mostly), T3 | Archive from active tracking. |
