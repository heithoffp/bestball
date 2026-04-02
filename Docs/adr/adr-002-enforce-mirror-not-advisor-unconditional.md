# ADR-002: Enforce Mirror-Not-Advisor as an Unconditional Rule — Remove Draft Scoring

**Date:** 2026-04-01
**Status:** Accepted

---

## Context

The app was built around a core design principle: *Mirror, Not Advisor* — show portfolio state descriptively, never prescribe actions or judge quality. This principle was documented in `Vision_and_Scope.md` with one explicit exception: the Draft Assistant (implemented in `DraftFlowAnalysis.jsx` and supported by `draftScorer.js`) was permitted to compute scored candidate lists and flag strategy kills during live drafts.

The rationale for the exception was pragmatic: live best-ball drafts run on 30-second clocks. At that speed, the argument was that users need an opinionated recommendation to act on, not raw data they have to interpret themselves.

Two factors changed the calculus:

1. **`draftScorer.js` was never integrated.** The file was written but never imported into any component. The exception was never shipped. The "Draft Assistant" in the web app already operates without scoring — it surfaces exposure %, ADP delta, co-occurrence, and archetype classification. That's all descriptive data.

2. **The exception undermines the product identity.** Even a narrowly scoped advisory mode introduces an inconsistency that's hard to explain to users ("we never tell you what to do — except here"). It also creates pressure to expand: if scoring is acceptable in one context, the boundary must be defended at every future feature decision. Removing the exception entirely closes that pressure valve.

## Decision

Remove all draft scoring and advisory outputs. The Mirror-Not-Advisor principle applies unconditionally across the entire app, including live-draft contexts. `draftScorer.js` will be deleted. TASK-047 (Draft overlay scoring) will be cancelled. The draft overlay (TASK-046) will be repurposed as a live data companion — surfacing factual context (exposure %, ADP, trend) without scoring or ranking candidates.

## Alternatives Considered

### Option A: Keep Scoring as an Explicit Live-Draft Exception (Previous Design)
Retain the exception. Users get opinionated candidate rankings during live drafts. Implement TASK-047.
- **Pros:** Potentially more actionable during 30-second pick clocks; differentiates from pure data tools; `draftScorer.js` already written.
- **Cons:** Creates a product identity inconsistency ("mirror, except when we're not"). `draftScorer.js` was never shipped and has open integration questions. Advisory outputs require the app to implicitly assert it knows better than the user — which erodes trust when the recommendation is wrong. Scope creep risk: scoring in one place creates pressure to score elsewhere.

### Option B: Remove Scoring Entirely — Hard Mirror Everywhere (Chosen)
No scoring anywhere. Draft overlay shows data only. Mirror-Not-Advisor is unconditional.
- **Pros:** Consistent product identity, easier to explain and market. No trust-eroding "black box" scores. Removes 305 lines of unshipped complexity. Advisory pressure is permanently closed. Live-draft data (exposure %, ADP, trend) is still genuinely useful — users can interpret it in 30 seconds.
- **Cons:** Users don't get a ranked candidate list during drafts. The overlay requires more user interpretation. Some competitive tools offer scoring, so this may be perceived as a feature gap by users who want recommendations.

## Consequences

### Positive
- Mirror-Not-Advisor becomes unconditional and fully enforceable — no case-by-case judgment calls needed.
- Product messaging is simpler and more credible: "we show you what is, you decide what to do."
- `draftScorer.js` (305 lines, never shipped) is removed — no dead code, no maintenance burden.
- TASK-047 is cancelled — no work needed to integrate scoring into the overlay.
- The overlay (TASK-046) becomes a focused data companion: exposure %, ADP, trend. Simpler scope, faster to build.

### Negative
- Users who want scored pick recommendations during live drafts won't get them from this app.
- If a competitor ships live-draft scoring and users request it, the decision must be re-examined — there's no "just turn it on" path since `draftScorer.js` will be gone.

### Risks
- User feedback during draft season may reveal that raw data is insufficient at live-draft speed, creating pressure to re-introduce scoring. If that happens, revisit this ADR rather than adding advisory outputs ad hoc.

## Related
- Tasks: TASK-046 (repurposed overlay scaffold), TASK-047 (cancelled)
- ADRs: none

---
*Approved by: Patrick H. — 2026-04-01*
