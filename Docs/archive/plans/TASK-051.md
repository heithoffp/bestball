<!-- Completed: 2026-04-01 | Commit: 26c7181 -->
# TASK-051: User needs audit — map portfolio questions to app + extension features, identify gaps

**Status:** Approved
**Priority:** P2

---

## Objective

Enumerate the questions best-ball drafters ask before, during, and after drafts — split into post-draft (web app) and live-draft (extension) — map each to the current feature that answers it, rate coverage, and produce a gap list that drives Pre-Launch Polish prioritization.

## Verification Criteria

1. `docs/plans/TASK-051-audit.md` exists with two sections: **Post-Draft** and **Live-Draft**.
2. Every question has a mapped feature (web app tab or extension screen, or "None") and a coverage rating: `Full` / `Partial` / `None`.
3. A consolidated gap list is present — all questions rated `Partial` or `None` collected together.
4. Each gap either maps to an existing BACKLOG task (ID noted) or has a new BACKLOG task created for it.

## Verification Approach

1. Read `docs/plans/TASK-051-audit.md` — confirm two sections exist, all rows have a feature mapping and coverage rating.
2. Read `BACKLOG.md` — confirm new tasks exist for gaps that had no prior coverage.
3. No code execution needed — this is a doc and backlog update task.

## Files to Change

| File | Action | Description |
|------|--------|-------------|
| `docs/plans/TASK-051-audit.md` | Create | Structured audit table: two sections (post-draft, live-draft), columns: Question, Feature, Coverage, Gap Notes |
| `BACKLOG.md` | Modify | New tasks added for each identified gap with no existing coverage |

## Implementation Approach

**Step 1 — Post-draft question enumeration**

Think from the perspective of a drafter reviewing their portfolio between sessions or at season start. Enumerate questions across these categories:
- Exposure: who do I own too much / too little of?
- ADP value: where did I get value vs. reach?
- Roster construction: what does my positional profile look like? Do I have roster imbalance?
- Uniqueness / differentiation: how different are my rosters from each other?
- Strategy: what archetypes am I running? Am I diversified?
- ADP trends: who is rising or falling in ADP?
- Combo / correlation: who do I stack, and is that risky?
- Roster health: do I have issues with any single roster?

**Step 2 — Live-draft question enumeration**

Think from the perspective of a drafter sitting in a live Underdog best-ball draft. Enumerate questions across:
- Pick selection: who should I pick here given my current roster?
- Exposure awareness: am I about to over-expose on a player?
- Roster shape: what positions do I still need?
- ADP context: is this player available at value right now?
- Strategy: does this pick fit my intended archetype?
- Urgency: who might be gone by my next pick?

**Step 3 — Feature mapping**

For each question, identify the current feature that answers it:
- Web app tabs: Dashboard, Exposure Table, ADP Time Series, Draft Flow Analysis, Combo Analysis, Roster Construction, Roster Viewer, Player Rankings
- Extension: popup (tier display), overlay scaffold (TASK-046/047, not yet built)
- Rate coverage: `Full` (question is clearly answered), `Partial` (some data present but incomplete or buried), `None` (no feature addresses this)

**Step 4 — Write audit doc**

Create `docs/plans/TASK-051-audit.md` with:
- Section 1: Post-Draft questions table
- Section 2: Live-Draft questions table
- Section 3: Gap list (all Partial + None rows consolidated)

**Step 5 — Create BACKLOG tasks for gaps**

For each gap in Section 3:
- Check if an existing BACKLOG task or ROADMAP feature already addresses it — if so, note the ID
- If no existing task covers it, create a new BACKLOG task with a Draft plan

## Dependencies

None

---

*Approved by: <!-- developer name/initials and date once approved -->*
