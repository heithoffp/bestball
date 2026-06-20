# ADR-011: Port Eliminator Mode to the extension as a self-contained vanilla-JS overlay

**Date:** 2026-06-20
**Status:** Proposed

> Drafted in-loop by an autonomous **Level 3 (run-scoped)** hus-goal run (TASK-270).
> Status is **Proposed** pending the developer's end-of-run confirm/revise — it was **not**
> self-accepted.

---

## Context

ADR-010 added **Eliminator Mode** to the web app's Draft Assistant: a toggleable overlay that
swaps in a 3 QB / 5 RB / 6–7 WR / 3–4 TE roster-shape tracker, a bye-rainbow panel, per-candidate
bye/fade badges, and an in-context playbook — with the candidate board **annotated, not
reordered**. The developer now wants the same format support live on the actual draft page, in the
Chrome extension, with a *small floating window* for the extra Eliminator info.

The two surfaces are technically very different:

- **Web app:** React + CSS modules; imports a pure JS model (`eliminatorModel.js`) and JSON data
  (`eliminator-2026.json`) at build time; player `team` is the **expanded** name ("Minnesota
  Vikings"), so the model converts via `teamToAbbr`.
- **Extension:** **pure vanilla JS** — `content/draft-overlay.js` (~2,400 lines) injects DOM and
  inline CSS directly into the live Underdog/DraftKings page, with a floating "confidence hub" FAB
  panel and `chrome.storage.local` for persistence. There is **no React and no build-time module
  sharing** with the web app (separate Vite builds, separate `src/` trees). Player objects already
  carry `team` as an **NFL abbreviation** ("MIN"). Live picks arrive from `resolveCurrentPicks()`
  as `{name, position, round}` (no team); team is looked up from `playerTeamMap`, a portfolio-derived
  map, so **some picks and candidates have an unknown team** during a live draft.

The question is how to bring ADR-010's behavior to this surface without coupling two build systems
or contradicting the extension's vanilla-JS architecture.

## Decision

Port Eliminator Mode into the extension as a **self-contained vanilla-JS overlay**:

1. **Copy, don't share.** Duplicate `eliminator-2026.json` into `chrome-extension/src/data/` and
   write a fresh `chrome-extension/src/utils/eliminatorModel.js` whose `getByeWeek` treats `team`
   as an **abbreviation directly** (no `teamToAbbr` dependency). The extension owns its own copy of
   the model and data; no import from `best-ball-manager/`.
2. **Annotate, not reorder** (ADR-010 carried forward): Eliminator adds row **badges only** — the
   board is never re-sorted.
3. **A small separate floating window** carries the "extra info" (roster-shape tracker, bye-rainbow
   summary, collapsible playbook), distinct from the FAB confidence-hub panel. It is gated by a new
   toggle in the FAB panel, **default off**, persisted to `chrome.storage.local`, and produces
   **zero behavior change when off**.
4. **Graceful degradation on unknown teams:** where a player's team can't be resolved, bye-based
   annotations are simply omitted (the model already tracks `unknownByeCount`); name-based fade
   flags and position-only roster-shape counting always work.
5. **Accept data duplication** between web app and extension as the cost of a self-contained
   extension — no shared build, two snapshots to refresh.

## Alternatives Considered

### Option A: Self-contained vanilla-JS port (chosen)
Copy the data, reimplement the model in vanilla JS, render a floating window + badges.
- **Pros:** Matches the extension's existing architecture exactly (vanilla JS, inline CSS,
  `chrome.storage.local`); no cross-build coupling; fully additive and reversible behind one
  toggle; reuses the extension's existing pick/candidate pipelines (`resolveCurrentPicks`,
  `processRow`); team is already an abbreviation, so the model is *simpler* here than in the web app.
- **Cons:** The 2026 bye/fade snapshot now exists in two places and must be refreshed twice;
  the vanilla render diverges from the React `EliminatorPanel` component (shared semantics, separate
  code).

### Option B: Share the web-app model via a common package
Extract `eliminatorModel.js` + JSON into a shared module both builds import.
- **Pros:** Single source of truth for the bye/fade snapshot and model logic.
- **Cons:** The extension and web app are independent Vite builds with no current shared-package
  infrastructure; introducing a workspace/package boundary is a large structural change for one
  feature. The model would also have to abstract over *both* team formats (expanded vs. abbreviation),
  adding indirection that benefits neither side. Disproportionate to the task.

### Option C: Reuse the FAB panel for the extra info (no separate window)
Render the roster-shape/bye/playbook inside the existing confidence-hub panel.
- **Pros:** One less floating element; reuses existing panel styling.
- **Cons:** The FAB panel is a transient "open, verify, close, draft" hub (sync/auth/tournament).
  Eliminator info needs to stay **persistently visible while drafting** (it tracks roster shape pick
  by pick), which is a different interaction model. Overloading the panel muddies the confidence-hub
  purpose the panel was designed around.

## Consequences

### Positive
- **Architecturally consistent** with the extension; no new build machinery.
- **Reversible and low-risk:** the entire feature is gated behind one default-off boolean; when off,
  the overlay is byte-for-byte unchanged.
- **Degrades gracefully** in live drafts where team data is incomplete — the always-correct parts
  (fades, position shape) still work, and bye annotations appear as team data resolves.

### Negative
- **Duplicated snapshot:** `eliminator-2026.json` lives in both `best-ball-manager/src/data/` and
  `chrome-extension/src/data/`. The August roster-news refresh (already required by ADR-010) must
  now touch two files. This is documented in both files' `_README`/`as_of` fields.
- **Two implementations of the same model** will drift if one is changed without the other; they
  share semantics, not code.

## Revisit Conditions

- Bye-rainbow fidelity in a live draft is bounded by how many picks/candidates have a resolvable
  team; early in a draft (before portfolio data covers the players) bye annotations may be sparse.
  Acceptable — the feature is additive and the roster-shape/fade signals are unaffected.
- **Revisit when:** a third surface needs the same data (extract a shared package then — Option B
  becomes worth its cost); the extension gains a direct team source for board candidates (bye
  fidelity could then be improved); or the snapshot-refresh cadence becomes painful across two files
  (consider a generator that writes both).

## Related
- Tasks: TASK-270
- ADRs: ADR-010 (the web-app Eliminator Mode this mirrors)

---
*Drafted autonomously (run-scoped L3); awaiting developer confirm/revise.*
