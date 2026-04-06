# Prioritization — Best Ball Portfolio Manager

**Initial pass:** 2026-03-27
**Delta pass 1:** 2026-04-03
**Delta pass 2:** 2026-04-06
**Weights:** Default (no adjustments)

---

## Resolved Themes (from initial and earlier delta passes)

| Theme | Score | Resolution Date | How Resolved |
|-------|-------|----------------|--------------|
| T1: Commercial Strategy Gap | 4.45 | 2026-03-30 | FEAT-021 complete — pricing ($20/mo, 25% promos), positioning, channel strategy decided |
| T3: Auth-Payment Chain | 3.55 | 2026-03-30 | Full auth + Stripe Checkout + subscription management + feature gating live |
| T2: User Insight Blindness | 3.55 | 2026-04-01 | Feature analytics (TASK-010) + extension scraper + feedback button (P13). Residual: F-005 partially resolved by DraftKings support |

---

## Active Themes

### T8: Acquisition Funnel & Discoverability (NEW — 2026-04-06)
**Contributing findings:** F-016 (high), F-019 (high)
**Summary:** The product has no public-facing presence. No landing page, no value proposition copy, no signup funnel from external discovery. Competitors are already posting on r/bestball — some with overlays, some with websites, all half-baked but visible. Without a landing page and clear messaging, the product doesn't exist to the market. This is existential for A6.
**Aspirations affected:** A6, A2

### T10: Commercial Strategy Refresh (NEW — 2026-04-06)
**Contributing findings:** F-019 (high), F-009 (low)
**Summary:** The March 30 competitive analysis (FEAT-021) didn't account for the free tools now appearing on r/bestball. The competitive landscape has shifted in one week. "Free and half-baked" is a different competitive dynamic than "nothing exists." Pricing ($20/mo vs. free), positioning ("best tool" vs. "free tool"), and the core value argument need a focused refresh. This must happen before or alongside the landing page — the strategy informs the messaging.
**Aspirations affected:** A6

### T9: Conversion Path & First Impression (NEW — 2026-04-06)
**Contributing findings:** F-017 (high), F-018 (medium), F-020 (medium)
**Summary:** Once a user arrives, can they understand the product's depth and decide to pay? Guest tier shows only 2 of 7 tabs. No sample data for empty-state exploration. Free competitors show everything. The gap between "arrives" and "converts" needs a bridge — whether a richer free tier, sample data preview, or time-limited trial. Can be iterated on post-launch but worth scoping now.
**Aspirations affected:** A2, A6

### T6: Extension Confidence & Trust (demoted from Tier 1)
**Contributing findings:** F-010 (high), F-011 (high), F-012 (medium), F-013 (medium)
**Summary:** The extension works technically but provides no feedback about its state. Sync progress, connectivity health, tournament scoping, and error recovery are all invisible. Still important UX debt, but secondary to getting visible in the market first. Developer priority has shifted to launch readiness.
**Aspirations affected:** A1, A2, A3

### T7: Extension Lifecycle Management (unchanged)
**Contributing findings:** F-014 (medium)
**Summary:** Overlay doesn't start/stop cleanly on SPA navigation. Tracked as TASK-103.
**Aspirations affected:** A4

### T4: Operational Resilience (unchanged)
**Contributing findings:** F-006 (medium)
**Summary:** ADP collection depends on R2 running a scraper manually. Developer confirms low priority — manual process is acceptable for now. Revisit before scaling to paying users.
**Aspirations affected:** A1, A6

### T5: Governance Calibration (unchanged)
**Contributing findings:** F-007 (low)
**Summary:** Standard-tier governance adds friction for a solo developer. The balancing loop (FL3) is working but may over-constrain velocity.
**Aspirations affected:** A6

---

## Scoring Matrix

| Theme | Risk (25%) | Competency (20%) | Docs (5%) | Relevancy-Current (25%) | Relevancy-Aspirational (15%) | Effort-inv (10%) | **Weighted** |
|-------|-----------|-----------------|-----------|------------------------|-----------------------------|--------------|----|
| **T8: Acquisition Funnel** | 5 | 5 | 3 | 5 | 5 | 2 | **4.60** |
| **T10: Strategy Refresh** | 4 | 3 | 4 | 5 | 4 | 4 | **4.05** |
| **T9: Conversion Path** | 4 | 3 | 3 | 5 | 4 | 3 | **3.90** |
| T6: Extension Confidence | 4 | 5 | 4 | 3 | 5 | 2 | **3.90** |
| T7: Extension Lifecycle | 3 | 3 | 3 | 2 | 4 | 3 | **2.90** |
| T5: Governance Calibration | 2 | 3 | 2 | 3 | 2 | 4 | **2.65** |
| T4: Operational Resilience | 2 | 3 | 3 | 2 | 3 | 4 | **2.60** |

---

## Tier Assignments

### Tier 1 — Address Now
- **T8: Acquisition Funnel & Discoverability** (4.60) — Without a landing page and public presence, the product doesn't exist to the market. Free competitors are already visible on r/bestball. This is the single highest-leverage gap.
- **T10: Commercial Strategy Refresh** (4.05) — Must happen before or alongside the landing page. The March 30 strategy needs updating for the new competitive reality. "Why pay $20/mo vs. free?" is the question the landing page must answer convincingly.

### Tier 2 — Address Soon
- **T9: Conversion Path & First Impression** (3.90) — Guest experience may not demonstrate enough value to convert against free alternatives. Sample data, richer free tier, or trial mode are potential bridges. Can iterate post-launch.
- **T6: Extension Confidence & Trust** (3.90) — Sync visibility, tournament selection, connectivity status. Important but not launch-blocking.

### Tier 3 — Address Later
- **T7: Extension Lifecycle Management** (2.90) — SPA navigation handling. Tracked as TASK-103.
- **T5: Governance Calibration** (2.65) — Revisit if velocity feels constrained.
- **T4: Operational Resilience** (2.60) — Automate ADP scraping before scaling to paying users.

---

## Integration Recommendations

| Theme | Maps to Existing? | Recommendation |
|-------|-------------------|----------------|
| **T8** | FEAT-014 (Landing Page) — Not Started | Highest priority. Needs task breakdown: value prop copy, screenshots/GIFs, competitor comparison, pricing display, signup CTA. Messaging must be informed by T10 strategy refresh. |
| **T10** | FEAT-021 (Commercial Strategy) — Marked Complete | Reopen for a refresh pass. Update competitive analysis with r/bestball free tools. Sharpen the "why pay?" narrative. Output feeds directly into T8 landing page copy. |
| **T9** | FEAT-012 (First-Run Experience) — Not Started | Sample data + empty state guidance. Also worth revisiting `featureAccess.js` tier boundaries — consider whether a sample-data preview mode for Pro tabs would improve conversion. |
| **T6** | FEAT-022 (Extension Setup & Trust UX) | Defer to post-launch. Still tracked, still important. |

**Recommended sequencing:** T10 (strategy refresh) → T8 (landing page) → launch → T9 (conversion iteration) → T6 (extension trust)
