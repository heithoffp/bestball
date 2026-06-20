# TASK-270: Port Eliminator Mode into the Chrome extension

**Status:** Approved (Level 3 auto-executed — run-scoped elevation)
**Priority:** P2
**Plan format:** Lightweight (Express)

---

## Objective
Mirror website TASK-269/ADR-010 in the vanilla-JS Chrome extension: a toggle in the FAB
confidence-hub panel, a small **draggable** floating draft window showing the **bye rainbow only**
(bye week[s] per position), and per-candidate row badges (curated macro-fade flags, late-bye
W13/14 indicator, same-position bye-clash). Default off; persisted to `chrome.storage.local`;
zero behavior change when off.

## Refinement (developer feedback, 2026-06-20)
After the first cut the developer scoped the window down: (a) the floating window is
**drag-and-drop movable** with its position persisted; (b) the **roster-shape tracker is removed**;
(c) the window shows **only the bye rainbow** — no warning lines (rainbow breaks, early-bye stacks,
late-bye/unknown notes) and **no playbook**; (d) **W15/16/17 playoff-stack badges are suppressed**
while Eliminator Mode is on (matching the website's TASK-269 behavior); (e) hovering a shared-bye
chip (`×2`/`×3`) shows a popup of the players sharing that position's bye week.

## Decision
Per **ADR-011** (Proposed, drafted in this run): the extension gets a **self-contained vanilla-JS
port** — copy `eliminator-2026.json` and write a fresh `eliminatorModel.js` whose `getByeWeek`
treats `team` as an abbreviation directly (no `teamToAbbr` import; extension player.team is already
"MIN"). ADR-010's **annotate-not-reorder** principle is preserved (badges only, no board re-sort).
The "extra info" lives in a **separate small floating window** (distinct from the FAB panel), gated
by a default-off toggle in the FAB panel and persisted to `chrome.storage.local`. Where a player's
team can't be resolved (`playerTeamMap` miss), bye-based annotations are omitted (model tracks
`unknownByeCount`); name-based fades and position-only roster-shape always work.

The verifier must confirm the diff reflects this: (a) a persisted toggle gates all Eliminator UI;
(b) with the toggle off, the existing overlay/row injection is unchanged (zero behavior change);
(c) the candidate board is annotated, not reordered; (d) the model treats team as an abbreviation
and degrades gracefully on unknown teams.

## Files to Change
- **NEW** `chrome-extension/src/data/eliminator-2026.json` — copy of the web-app snapshot (bye-week
  map keyed by team abbr + roster-shape targets + fade list + playbook), with an `_README` noting
  it is the extension's own copy (refresh in lockstep with the web-app copy). The model file imports
  the whole snapshot; the window now renders only the bye data, but the file is kept verbatim from
  the web-app copy for lockstep refresh.
- **NEW** `chrome-extension/src/utils/eliminatorModel.js` — self-contained vanilla ESM port:
  `getByeWeek` (abbr-direct), `getByeTier`, `isLateBye`, `getFadeInfo`, `analyzeRosterShape`,
  `analyzeByeRainbow`, `getEliminatorFlags`, plus exported constants. (The window only consumes
  `analyzeByeRainbow`; `getEliminatorFlags` drives the row badges.)
- **EDIT** `chrome-extension/src/content/draft-overlay.js` — `eliminatorEnabled` state (persisted);
  Eliminator toggle row in `injectFloatingButton`; Pro-gating in `applyTierGate`; **draggable**
  bye-rainbow window (create/update/remove + `makeEliminatorWindowDraggable` + persisted
  `eliminatorWindowPos` + `attachByeChipHovers` shared-bye popup); per-candidate badge in
  `processRow`/`updateRowMetrics`; **playoff-stack suppression** in `applyPlayoffStackBadge` when
  Eliminator is on; window refresh in `resolveCurrentPicks`; lifecycle hooks in
  `startOverlay`/`stopOverlay`/`handleUrlChange`/`initDraftOverlay`; injected CSS.

## Verification
Deterministic:
1. `cd chrome-extension && npm run build` — production bundle succeeds (Vite/@crxjs compiles the new
   JSON/JS and the edited content script; catches import/syntax errors). **This is the auto-stop key.**
2. `cd chrome-extension && npx eslint src/content/draft-overlay.js src/utils/eliminatorModel.js`
   — no errors on the changed/added source files.

Design-bearing (independent verifier sub-agent): confirm the diff reflects ADR-011 / ADR-010 —
default-off persisted toggle gates all Eliminator UI; off-state leaves existing overlay behavior
unchanged; board annotated not reordered; model treats team as abbreviation and omits bye
annotations on unknown teams; Eliminator logic matches the strategy (3/5/6-7/3-4 shape, W13/14
premium byes, same-position bye collision = rainbow violation, curated fades flagged).

## Notes
- Extension `player.team` is an NFL abbreviation; current picks (`resolveCurrentPicks`) carry no
  team, so team is resolved via `playerTeamMap` (portfolio-derived) — unknowns degrade gracefully.
- Per-row Eliminator badges render through `processRow`, which only sweeps when the Pro overlay is
  active; the floating window is the always-available "extra info" surface.
- Data is a 2026-06-19 snapshot duplicated from the web app (ADR-011 accepts the duplication);
  refresh both copies for August roster news.
