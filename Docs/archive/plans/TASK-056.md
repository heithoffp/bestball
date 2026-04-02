<!-- Completed: 2026-04-01 | Commit: 26c7181 -->
# TASK-056: Scrub Draft Scoring exception — Vision_and_Scope, TASK-051-audit, draftScorer.js

**Status:** Done
**Priority:** P2

---

## Objective

Remove all remnants of the Draft Assistant scoring exception from documentation and dead code, per ADR-002. Three mechanical changes across two docs and one source file. No logic changes — this is documentation cleanup and dead code removal.

## Dependencies

- ADR-002 (Accepted) — authoritative decision record for this change

## Verification Criteria

1. `best-ball-manager/src/utils/draftScorer.js` does not exist
2. No file in `best-ball-manager/src/` contains an import of `draftScorer`
3. `Docs/Vision_and_Scope.md` Section 2.2.4 contains no scoring or "opinionated" language
4. `Docs/Vision_and_Scope.md` Section 2.3 Principle #1 contains no exception clause
5. `docs/plans/TASK-051-audit.md` Section 2 header contains no "explicit exception" language
6. LD-01 and LD-09 rows in TASK-051-audit.md reflect data-only overlay scope (no scoring coverage)

## Verification Approach

1. `grep -r "draftScorer" best-ball-manager/src/` — expect zero matches
2. Read `Docs/Vision_and_Scope.md` lines covering Section 2.2.4 and Principle #1 — confirm language
3. Read `docs/plans/TASK-051-audit.md` Section 2 header and LD-01, LD-09, LD-05, LD-12 rows — confirm language

## Files to Change

| File | Change |
|------|--------|
| `Docs/Vision_and_Scope.md` | Update Section 2.2.4 and Principle #1 exception clause |
| `docs/plans/TASK-051-audit.md` | Update Section 2 header note and LD-01, LD-05, LD-09, LD-12 rows |
| `best-ball-manager/src/utils/draftScorer.js` | Delete |

## Implementation Approach

### 1. `Docs/Vision_and_Scope.md`

**Section 2.2.4 — Draft Assistant:**
- Remove: "**The one place the app is opinionated.** Strategy-aware candidate scoring during live drafts, balancing projected value, portfolio diversification, and archetype viability. Users accept computed opinions here because they need to make a decision in 30 seconds."
- Replace with: Live-draft data companion — surfaces exposure %, ADP, and trend context for available players during live drafts. Consistent with Mirror-Not-Advisor: data only, no scoring or ranked recommendations.

**Section 2.3 Principle #1 — Mirror, Not Advisor:**
- Remove the exception paragraph: "**Exception:** The Draft Assistant and Roster Viewer are permitted to use computed scores and grades. Mid-draft speed requires opinionated recommendations, and individual roster evaluation benefits from composite grading. Portfolio-level views remain descriptive."
- The principle stands alone, unconditional.

### 2. `docs/plans/TASK-051-audit.md`

**Section 2 header note:**
- Remove: "*Note: The Draft Assistant (draftScorer.js) is the explicit exception to Mirror-not-Advisor in this app — it is permitted to produce scored candidate lists and flag strategy kills. LD questions marked In Scope for the overlay must stay within that exception: show scores and flags, do not prescribe picks.*"
- Replace with: "*Note: Per ADR-002, the draft overlay is a data companion only — it surfaces exposure %, ADP, and trend context. No scoring or ranked candidate lists. All LD questions must stay within Mirror-Not-Advisor: show factual data, do not prescribe picks.*"

**LD-01** ("What is the draft score for each available player given my current roster?"):
- Coverage: `None` → scoring feature will not exist
- Notes: update to reflect that the overlay shows exposure/ADP data per player, not a computed draft score

**LD-09** ("What is the ranked candidate list by composite draft score?"):
- Coverage: `None` → no scoring, no ranked list
- Notes: out of scope per ADR-002; overlay shows data, user ranks candidates themselves

**LD-05** ("Does this pick kill my intended archetype strategy?"):
- Keep Coverage and Scope as-is
- Notes: clarify that strategy kill detection is descriptive (binary archetype viability state), not a pick recommendation — consistent with Mirror-Not-Advisor

**LD-12** ("Is this player a strategy kill for my current archetype path?"):
- Same treatment as LD-05

### 3. `best-ball-manager/src/utils/draftScorer.js`

Delete the file. Confirmed zero imports across the codebase — safe to remove.
