# Interrogation Findings — Best Ball Portfolio Manager

**Initial pass:** 2026-03-27
**Delta pass 1:** 2026-04-03
**Delta pass 2:** 2026-04-06

---

## Developer Input (2026-03-27)

> ADP scraping is manual but low-friction (~every 2 days). The primary gap is business
> knowledge — pricing strategy, promotion, go-to-market. "I have no business sense at all."

## Developer Input (2026-04-03 — Delta)

> The overlay experience is getting closer but when syncing I have no clue what the progress
> is. The little icon of the overlay in the bottom left should contain all of the necessary
> info for the user to feel confident the system is setup properly how they want it. This can
> include settings (like which tournaments do I want to compare against while drafting) and
> connectivity status (sometimes I have to refresh and don't know why) and then once they are
> confident in the setup they simply close it and feel confident that everything is setup and
> synchronized properly.

## Developer Input (2026-04-06 — Delta)

> ADP collection could be automated, but that's pretty low priority and easy enough for me
> to do manually. What is urgent is refining the business plan / new user experience and
> shipping out the plan ASAP — within the next day or 2 it will be basically good to go.
> Seeing a lot of "free" tools being mentioned on subreddits like r/bestball — they seem
> decent but kind of half-baked (like have overlay but no website, or have website but it
> looks like AI slop). Want to make sure my message and use-case is crystal clear and that
> "best tool" on market just wins users over. Probably want to do a fine pass over business
> strategy and make sure I am making a compelling argument.

---

## Findings

### Initial Pass (2026-03-27)

| ID | Category | Severity | Blocks/Interactions | Aspiration | Description | Status |
|----|----------|----------|---------------------|------------|-------------|--------|
| F-001 | bottleneck | high | R2 | A6 | R2 is sole decision-maker for all domains — product, technical, AND commercial. Commercial decisions have no supporting block, process, or information source. | **Resolved** — FEAT-021 complete |
| F-002 | gap | high | P8, A7 | A6 | No go-to-market process exists. Building outputs without a strategy. | **Resolved** — FEAT-021 deliverables cover this |
| F-003 | assumption | medium | A1, E1 | A7 | CSV upload is an acceptable onboarding experience for paying customers. | **Mostly Resolved** — Extension scraper eliminates CSV for Underdog; DraftKings CSV also supported; Sleeper still CSV-dependent |
| F-004 | feedback-loop | medium | A3, R1 | A1, A4, A6 | No user feedback signal exists. Can't observe whether the core value loop is running. | **Resolved** — Vercel analytics (TASK-010) + FeedbackButton (P13) provide both passive and active signal |
| F-005 | assumption | medium | P1, E1 | A7 | Underdog-first is sufficient for launch. Market sizing not validated. | **Partially Resolved** — DraftKings support live; multi-platform no longer aspirational; market sizing still unvalidated |
| F-006 | gap | medium | R2, P2 | A2, A5 | ADP collection has no automated fallback. | **Open** — developer confirms low priority, manual process is acceptable |
| F-007 | tension | low | P10, R2, R3 | A6 | Governance overhead vs. solo-dev velocity. | **Open** |
| F-008 | boundary-issue | low | P6, E2 | A6 | Auth flow is partial — subscription requires it complete. | **Resolved** — Auth fully complete |
| F-009 | gap | low | R2 | A6 | No competitive intelligence process. One-time analysis done, no ongoing monitoring. | **Open** — more urgent now; free competitors appearing on r/bestball weren't in original analysis |

### Delta Pass 1 (2026-04-03)

| ID | Category | Severity | Blocks/Interactions | Aspiration | Description | Status |
|----|----------|----------|---------------------|------------|-------------|--------|
| F-010 | gap | High | P9, P11, A9 | A1, A3 | **No confidence layer in the extension.** Sync progress invisible, connectivity failures silent, no setup verification. | **Open** — demoted to Tier 2 priority; launch readiness takes precedence |
| F-011 | gap | High | P9, A9 | A2, A3 | **No tournament selection in the overlay.** Portfolio context is all-or-nothing. | **Open** |
| F-012 | tension | Medium | A9, A2 | A3 | **Two UX surfaces competing for trust.** Popup vs. floating icon for status/settings. | **Open** |
| F-013 | gap | Medium | P9, P11, E2 | A4 | **No reconnection/retry UX.** Connectivity failures have no visible recovery path. | **Open** |
| F-014 | unencoded-method | Medium | P9, P2 | A4 | **Overlay start/stop on SPA navigation is manual.** TASK-103 identified but not built. | **Open** |
| F-015 | assumption | Low | P4, P9 | A5 | **Interaction 32 was wrong.** Original model assumed overlay would use scoring engine. ADR-002 corrected this. | **Resolved** — model corrected |

### Delta Pass 2 (2026-04-06)

| ID | Category | Severity | Blocks/Interactions | Aspiration | Description | Intentional? |
|----|----------|----------|---------------------|------------|-------------|-------------|
| F-016 | gap | High | A7, P6, P8 | A6 | **No acquisition funnel exists.** FEAT-014 (Landing Page) is Not Started. There is no path from "discovers product on Reddit" → "understands value prop" → "signs up." Against competitors already posting on r/bestball, this is the most critical gap for commercial launch. | No |
| F-017 | assumption | High | P14, A3, P8 | A2, A6 | **Guest tier may be too restrictive to convert against free competitors.** Guest sees only Dashboard + Exposures. The product's differentiators (ADP tracking, draft assistance, combo analysis, cross-module navigation) are entirely behind Pro. Free competitors show everything for free. A potential subscriber can't experience the depth without paying first. | No — worth deliberate review |
| F-018 | gap | Medium | A3, P12 | A2 | **First-run experience is incomplete.** FEAT-012 (First-Run Experience) is Not Started. A new user with no CSV sees empty states. No sample data button. Contextual help (P12) is built but depends on loaded data. | No |
| F-019 | assumption | High | A7, P8 | A6 | **Competitive landscape shifting faster than expected.** Free tools on r/bestball weren't in the March 30 competitive analysis. Some have overlays, some have websites, all are half-baked — but "free and half-baked" competes differently than "nothing exists." The "why pay $20/mo?" argument needs to be sharper. | No |
| F-020 | gap | Medium | P14, A3 | A2, A6 | **Feature gating doesn't have a "taste" tier.** There's guest (Dashboard + Exposures) and pro (everything). No way for a visitor to preview the ADP tracker with sample data or see the draft assistant's value — the things that would make them say "I need this." A time-limited trial or sample-data preview could bridge this. | No |
