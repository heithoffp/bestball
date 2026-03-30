# Interrogation Findings — Best Ball Portfolio Manager

**Date:** 2026-03-27
**Pass:** 1 (initial)

---

## Developer Input

> ADP scraping is manual but low-friction (~every 2 days). The primary gap is business
> knowledge — pricing strategy, promotion, go-to-market. "I have no business sense at all."

---

## Findings

| ID | Category | Severity | Blocks/Interactions | Aspiration | Description | Intentional? |
|----|----------|----------|---------------------|------------|-------------|-------------|
| F-001 | bottleneck | high | R2 | A6 | R2 is sole decision-maker for all domains — product, technical, AND commercial. Product and technical decisions are well-supported (R3, P10, A5, A6). Commercial decisions (pricing, positioning, promotion) have no supporting block, process, or information source. R2 self-identifies as having no business expertise, yet A6 (Commercial Viability) requires exactly that. | No |
| F-002 | gap | high | P8, A7 | A6 | No go-to-market process exists. The model has aspirational blocks for Subscription Flow (P8) and Landing Page (A7), but no process for the work that precedes them: competitive pricing analysis, positioning, channel strategy, launch planning. Building P8 and A7 without this is building outputs without a strategy. | No |
| F-003 | assumption | medium | A1, E1 | A7 | CSV upload is an acceptable onboarding experience for paying customers. Free tools can demand manual steps; paid products face higher UX expectations. The assumption that users will export CSVs and upload them may limit conversion, especially for less technical users. | No — not yet tested |
| F-004 | feedback-loop | medium | A3, R1 | A1, A4, A6 | No user feedback signal exists. Vercel Analytics (E3) provides page views, but there's no mechanism to learn which features users value, where they drop off, or what's confusing. FL1 (Draft-Analyze-Draft) is the core value loop, but we can't observe whether it's actually running for users. | No |
| F-005 | assumption | medium | P1, E1 | A7 | Underdog-first is sufficient for launch. The system is deeply coupled to Underdog's CSV format. If the addressable market on Underdog alone is too small for 500 subs, multi-platform (E5) becomes a launch requirement, not a future nice-to-have. This assumption hasn't been validated against market sizing. | No — not validated |
| F-006 | gap | medium | R2, P2 | A2, A5 | ADP collection has no automated fallback. If R2 is unavailable for a week, the ADP timeline develops gaps. Low urgency today but becomes a reliability concern for paying subscribers who expect consistent data freshness. | Partially — acknowledged as low-effort |
| F-007 | tension | low | P10, R2, R3 | A6 | Governance overhead vs. solo-dev velocity. FL3 (Governance-Development) is a balancing loop designed for team contexts. For a solo developer racing to a deadline (NFL Draft ~2026-04-25), the plan-approve-build cycle adds friction. Valuable for quality but may over-constrain pace. | Partially — Standard tier chosen deliberately |
| F-008 | boundary-issue | low | P6, E2 | A6 | Auth flow is partial — subscription requires it to be complete. P8 (Subscription) depends on P6 (Auth) being solid, but P6 is currently marked partial. The auth-to-payment chain has two incomplete links. | No |
| F-009 | gap | low | R2 | A6 | No competitive intelligence process. The model references competing with Best Ball Overlay but has no block or process for monitoring competitor features, pricing, or positioning. | No |
