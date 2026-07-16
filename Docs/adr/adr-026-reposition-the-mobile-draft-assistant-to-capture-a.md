# ADR-026: Reposition the Mobile Draft Assistant to Capture-and-Guide Only

**Date:** 2026-07-16
**Status:** Accepted

---

## Context

The mobile Draft Assistant (`mobile-app/src/screens/DraftAssistantView.jsx`) was built by TASK-339 as a "live-session-first" analytics surface. While a live capture session runs (screen broadcast → on-device OCR → `DraftState`, per ADR-019/020/021), the tab renders a full analytics engine ported from the web app:

- An **Available Players** candidate list with per-player Path / Correlation / Global exposure metrics.
- **RB/QB/TE strategy viability** cards (`rosterArchetypes`, `stackAnalysis`).
- The **Eliminator bye rainbow** (`eliminatorModel`) and **playoff-stack / falling-knife** badges (`playoffStacks`).
- A **"My Picks" board** subview that re-displays the roster the capture has accumulated.
- A **demo draft** (`startDemoSession` / `demoSync`) that replays a bundled OCR fixture through the real UI.

In practice the developer wants the mobile tab to do one job well: **capture the live draft** (username-anchored slot detection per TASK-328 populates the roster, which matters most for multi-day slow drafts). The in-app re-display and analysis of that roster is redundant on a phone during a live draft — the drafter is already looking at Underdog, and the full portfolio analytics are available on the other tabs (and the web app) once rosters sync. The demo, likewise, is onboarding scaffolding that now competes with the primary "start recording" action.

This is a phone-context product decision, not a limitation: the small screen and the fact that the user is actively drafting in another app mean the highest-value mobile surface is a **confidence hub** (is it recording? did it find my slot? are my picks landing?) plus **onboarding guidance**, not a second analytics dashboard.

## Decision

Reposition the mobile Draft Assistant tab to **capture + guide only**. It will contain exactly three things: (a) live-capture record/session functionality, (b) plain-language explanations of how capture works, and (c) guidance diagrams (e.g. "select your username in the banner to populate your roster — especially for slow drafts").

Remove from the mobile tab: the demo draft, the "My Picks" board, and the entire in-app live analytics engine (candidate list, strategy cards, Eliminator, stack/falling-knife badges, player search). The **web** Draft Assistant (`DraftFlowAnalysis.jsx`) is unaffected and retains full analytics — an intentional platform divergence.

## Alternatives Considered

### Option A: Capture + guide only (chosen)

Strip the mobile tab to recording, explanations, and diagrams.

- **Pros:** Matches how the tab is actually used on a phone mid-draft; makes "start recording" and "is it working?" the unmistakable focus; removes a large surface of ported analytics code that must be kept in lockstep with the web source; simplest confidence hub.
- **Cons:** Mobile and web Draft Assistants now diverge in capability; a user who wants live per-pick analysis on their phone can't get it here; some recently-built TASK-339 UI is discarded.

### Option B: Keep the live analytics, remove only demo + "My Picks" board

Trim the obvious remnants but keep the Available Players analytics.

- **Pros:** Preserves the live per-pick "mirror" on mobile; smaller deletion.
- **Cons:** The developer's stated intent is that in-app roster re-display/analysis is unnecessary on mobile; keeps the mobile port coupled to the web analytics pipeline (ongoing lockstep maintenance per CLAUDE.md); leaves the tab visually heavy during a moment when the user is looking at Underdog, not BBE.

### Option C: Make the analytics an optional, collapsed drawer

Default to capture + guide, hide analytics behind an expander.

- **Pros:** Keeps both audiences; non-destructive.
- **Cons:** Retains all the maintenance cost of Option B for a feature the developer judged unnecessary on mobile; adds UI complexity; defers rather than makes the decision.

## Consequences

### Positive

- The mobile tab becomes a focused capture + confidence hub; "start recording" is the clear primary action.
- Large removal of ported analytics code from the mobile Draft Assistant reduces the web↔mobile lockstep surface for this tab.
- Onboarding shifts from an interactive demo to lightweight, always-visible guidance diagrams — less state, fewer code paths.

### Negative

- Deliberate feature divergence between platforms: mobile Draft Assistant ≠ web Draft Assistant. This must be documented so it isn't later "fixed" as an accidental gap.
- Live per-pick analysis is no longer available on mobile during a draft.
- The demo path (used as a no-device onboarding preview) is retired; first-time users rely on guidance diagrams and a real session instead.

### Risks

- The shared analytics utils (`rosterArchetypes`, `stackAnalysis`, `playoffStacks`, `eliminatorModel`) remain in `mobile-app/shared/` because other tabs consume them; only the Draft Assistant's consumption is removed. Removing the utils themselves is out of scope and would break other tabs.
- `sessionController.js` demo code paths (`startDemoSession`, `demoSync`, demo timer, `state.demo`) are retired; care is needed so removing them doesn't disturb the live session engine or any test/fixture that references them.
- **Revisit if:** users report they genuinely want live per-pick analysis on the phone, or if mobile becomes the primary drafting surface (rather than a companion to Underdog). At that point Option C (collapsible analytics) becomes the natural path back.

## Related

- Tasks: TASK-339 (live-session-first overhaul being repositioned), TASK-328 (username-anchored slot detection)
- ADRs: ADR-002 (mirror-not-advisor), ADR-019 / ADR-020 / ADR-021 (mobile capture pipeline), ADR-022 (mobile app shell), ADR-025 (push on presence transitions)

---
*Approved by: Developer, 2026-07-16*
