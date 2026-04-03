# Interrogation Findings — Best Ball Portfolio Manager

**Initial pass:** 2026-03-27
**Delta pass:** 2026-04-03

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

---

## Findings

### Initial Pass (2026-03-27)

| ID | Category | Severity | Blocks/Interactions | Aspiration | Description | Status |
|----|----------|----------|---------------------|------------|-------------|--------|
| F-001 | bottleneck | high | R2 | A6 | R2 is sole decision-maker for all domains — product, technical, AND commercial. Commercial decisions have no supporting block, process, or information source. | **Resolved** — FEAT-021 complete |
| F-002 | gap | high | P8, A7 | A6 | No go-to-market process exists. Building outputs without a strategy. | **Resolved** — FEAT-021 deliverables cover this |
| F-003 | assumption | medium | A1, E1 | A7 | CSV upload is an acceptable onboarding experience for paying customers. | **Partially Resolved** — Extension scraper eliminates CSV for Underdog; other platforms still CSV |
| F-004 | feedback-loop | medium | A3, R1 | A1, A4, A6 | No user feedback signal exists. Can't observe whether the core value loop is running. | **Resolved** — TASK-010 added feature-level usage analytics |
| F-005 | assumption | medium | P1, E1 | A7 | Underdog-first is sufficient for launch. Market sizing not validated. | **Open** |
| F-006 | gap | medium | R2, P2 | A2, A5 | ADP collection has no automated fallback. | **Open** |
| F-007 | tension | low | P10, R2, R3 | A6 | Governance overhead vs. solo-dev velocity. 22 days to deadline. | **Open** |
| F-008 | boundary-issue | low | P6, E2 | A6 | Auth flow is partial — subscription requires it complete. | **Resolved** — Auth fully complete |
| F-009 | gap | low | R2 | A6 | No competitive intelligence process. One-time analysis done, no ongoing monitoring. | **Partially Resolved** |

### Delta Pass (2026-04-03)

| ID | Category | Severity | Blocks/Interactions | Aspiration | Description | Intentional? |
|----|----------|----------|---------------------|------------|-------------|-------------|
| F-010 | gap | High | P9, P11, A9 | A1, A3 | **No confidence layer in the extension.** Sync progress is invisible — user sees no indication of what's happening, what succeeded, or what failed. Connectivity failures are silent (user must refresh blindly). No way to verify setup is correct before drafting. The floating icon (TASK-100) should serve as a "confidence hub" — sync status, connectivity health, tournament selection, settings — so the user can open it, verify, close, and draft with trust. | No |
| F-011 | gap | High | P9, A9 | A2, A3 | **No tournament selection in the overlay.** User can't choose which tournaments feed the exposure/correlation data shown during a draft. Portfolio context is all-or-nothing. During a live draft, the user needs to scope analysis to specific tournament types. | No |
| F-012 | tension | Medium | A9, A2 | A3 | **Two UX surfaces competing for trust.** The popup (A2) and the floating overlay icon are both potential homes for status/settings. If state is split across popup and overlay panel, the user has to check two places. The overlay icon should be the single authority during drafts — the popup is for non-draft contexts only. | No |
| F-013 | gap | Medium | P9, P11, E2 | A4 | **No reconnection/retry UX.** When Supabase connection drops or the extension loses sync, there's no visible recovery path. User doesn't know if a refresh will fix it, if they need to re-authenticate, or if the service is down. Error states need to be actionable. | No |
| F-014 | unencoded-method | Medium | P9, P2 | A4 | **Overlay start/stop on SPA navigation is manual.** TASK-103 identified but not built. Overlay can show stale state when navigating between Underdog pages. | No |
| F-015 | assumption | Low | P4, P9 | A5 | **Interaction 32 was wrong.** Original model assumed overlay would use scoring engine. ADR-002 made Mirror-Not-Advisor unconditional — overlay shows portfolio data only. Corrected in delta. | Yes — ADR-002 |
