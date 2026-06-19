# TASK-269: Eliminator Mode for the Draft Assistant

**Status:** Approved (Level 3 auto-executed — run-scoped elevation)
**Priority:** P2
**Plan format:** Lightweight (Express)

---

## Objective
Add a toggleable Eliminator-format layer to the Draft Assistant (`DraftFlowAnalysis.jsx`):
a roster-shape construction tracker (3 QB / 5 RB / 6–7 WR / 3–4 TE), bye-rainbow + late-bye
intelligence, macro-fade flags, and an in-context Eliminator playbook. Website only (not the
Chrome extension). Grounded in `../BestBall_Strategy` Eliminator analysis. Default off; persisted
to `localStorage`; zero behavior change when off.

## Decision
Per **ADR-010** (Proposed, drafted in this run): Eliminator support ships as a **toggleable
overlay** inside the existing Draft Assistant — not a separate tab, and the candidate board is
**annotated, not reordered** (keeps ADP-window sort). The verifier must confirm the code reflects
this: (a) a persisted toggle gates all Eliminator UI; (b) with the toggle off, the existing
archetype cards and player-list rendering are unchanged; (c) the board is not re-sorted in
Eliminator mode.

## Files to Change
- **NEW** `best-ball-manager/src/data/eliminator-2026.json` — team→bye-week map + metadata
  (late-bye tiers, bymageddon week, roster-shape targets, curated fade list, `as_of` snapshot date).
- **NEW** `best-ball-manager/src/utils/eliminatorModel.js` — pure functions: `getByeWeek`,
  `analyzeRosterShape`, `analyzeByeRainbow`, `getEliminatorFlags`, plus exported constants.
- **NEW** `best-ball-manager/src/components/EliminatorPanel.jsx` + `EliminatorPanel.module.css` —
  construction tracker + bye-rainbow + collapsible playbook.
- **EDIT** `best-ball-manager/src/components/DraftFlowAnalysis.jsx` — toggle state (persisted),
  render `EliminatorPanel` in place of archetype cards when on, per-candidate bye/fade badges.
- **EDIT** `best-ball-manager/src/components/DraftFlowAnalysis.module.css` — toggle + badge styles.

## Verification
Deterministic:
1. `cd best-ball-manager && npm run build` — production build succeeds (Vite compiles the new
   JSON/JS/JSX; catches import/syntax errors).
2. `cd best-ball-manager && npx eslint src/components/DraftFlowAnalysis.jsx src/components/EliminatorPanel.jsx src/utils/eliminatorModel.js`
   — no errors on the changed/added source files.

Design-bearing (independent verifier sub-agent): confirm the diff reflects ADR-010 — toggle gates
all Eliminator UI, off-state behavior is unchanged, board is annotated not reordered, and the
Eliminator logic matches the strategy source (3/5/6-7/3-4 shape; Week 13/14 = premium byes;
same-position bye collision = rainbow violation; curated fades flagged).

## Notes
- Reuse `teamToAbbr` from `utils/playoffStacks.js` (or `nflTeams.js`) — player `team` is the
  expanded name in the web app.
- Bye/fade data is a 2026-06-19 snapshot (documented in the JSON); refresh for August roster news.
