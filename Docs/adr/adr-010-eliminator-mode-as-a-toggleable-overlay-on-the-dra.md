# ADR-010: Eliminator Mode as a toggleable overlay on the Draft Assistant

**Date:** 2026-06-19
**Status:** Proposed

> Drafted in-loop by an autonomous **Level 3 (run-scoped)** hus-goal run (TASK-269).
> Status is **Proposed** pending the developer's end-of-run confirm/revise — it was **not**
> self-accepted.

---

## Context

The Draft Assistant (`DraftFlowAnalysis.jsx`) is the product's single *opinionated* tab. Under
the project's **mirror-not-advisor** principle, computed opinions are confined to the Draft
Assistant and the Roster Viewer; everywhere else the app describes portfolio state without
prescribing. Any Eliminator drafting aid therefore belongs in the Draft Assistant.

The developer wants live-draft support tailored to the **Underdog Eliminator** format. Eliminator
is weekly head-to-head *survival*: a 6-of-12 Week-1 pod (a double-up where you only need to beat
the median), then 1v1 weeks with back-loaded payouts. This inverts season-long best-ball logic in
ways the current Draft Assistant actively works against:

- **Floor over ceiling** — the existing tab models RB/QB/TE *archetypes* (Hero/Zero/Hyper-Fragile,
  Elite/Core/Late) tuned for season-long GPP upside, not weekly survival.
- **A fixed roster shape** — the Eliminator meta has converged on **3 QB / 5 RB / 6–7 WR / 3–4 TE**;
  the current tab has no shape target.
- **Bye weeks as a first-class lever** — late (Week 13/14) byes and a staggered "bye rainbow" (no
  two same-position players sharing a bye) decide deep survival; the app carries no bye data at all.
- **Systematic fades** — late-developing rookies and contingent/injury-return backs whose value
  lands *after* the elimination weeks are traps the current board cannot flag.

Source analysis lives in the sibling repo `../BestBall_Strategy`
(`analysis/eliminator/eliminator-draft-strategy-2026.md`, `eliminator-rankings-2026.md`, and the
KB Eliminator cluster). That repo also produces a Python *value-space* re-rank of the board, with
an explicit caveat that it is "a decision aid, not gospel" and that onesies (QB/TE) should be
drafted **by round window, not by value rank.**

## Decision

Ship Eliminator support as a **toggleable overlay inside the existing Draft Assistant tab**,
persisted to `localStorage`. When the toggle is **off**, the tab behaves exactly as it does today.
When **on**, it overlays four format-specific aids:

1. An **Eliminator roster-shape construction tracker** (3 QB / 5 RB / 6–7 WR / 3–4 TE), which
   replaces the season-long RB/QB/TE archetype cards.
2. A **bye-rainbow panel** plus per-candidate **bye badges** — late byes (Week 13/14) highlighted as
   premium, and same-position bye **collisions** flagged as rainbow violations.
3. **Macro-fade flags** drawn from a curated rookie / contingent-back list.
4. A collapsible **in-context Eliminator playbook** (the live-draft quick reference).

The candidate list keeps its existing ADP-window sort and is **annotated, not reordered**.

New, self-contained modules carry the logic and data: `src/data/eliminator-2026.json`
(team→bye map + metadata snapshot) and `src/utils/eliminatorModel.js` (pure analysis functions),
with UI in a new `EliminatorPanel.jsx` and toggle-gated additions to `DraftFlowAnalysis.jsx`.

## Alternatives Considered

### Option A: Toggleable overlay inside the Draft Assistant (chosen)
A mode switch that swaps the strategy cards and annotates the existing board.
- **Pros:** Zero behavior change when off (safe, fully reversible); reuses the existing
  pick/player/team pipeline and `teamToAbbr`; keeps all draft tooling in one place; ships as
  additive, self-contained modules; honors mirror-not-advisor (opinions stay in the opinionated tab).
- **Cons:** `DraftFlowAnalysis.jsx` grows another mode to reason about; some conditional branching
  in the component.

### Option B: A separate "Eliminator" tab
A dedicated tab parallel to the Draft Assistant.
- **Pros:** Clean separation; no conditional logic in the existing tab.
- **Cons:** Duplicates the entire draft-board UI (player window, snake math, search, tournament
  filter, correlation); splits the user's attention across two near-identical screens; far more
  code and a second surface to keep in sync; contradicts the dashboard-first, minimal-surface goal.

### Option C: Live re-rank of the player board by an in-app Eliminator value model
Reproduce the Python value-space model in JS and re-sort the board.
- **Pros:** Surfaces the full adjusted ordering directly.
- **Cons:** The value-space model (smoothed `V(slot)`, five percentage multipliers, hand-curated
  fade list) is not faithfully reproducible in-app and would drift from the canonical generator;
  worse, a literal value-rank sort **contradicts the strategy's own guidance** — it pulls onesies
  "too early" because it cannot encode "wait, QB is deep and replaceable." The docs explicitly say
  to draft onesies by round window, not value rank.

## Consequences

### Positive
- **Reversible and low-risk:** off by default-shape means the tab is unchanged for non-Eliminator
  users; the whole feature is gated behind one boolean.
- **No runtime coupling** to the Python strategy repo — the bye map and fade list are baked into a
  static JSON snapshot the app already knows how to bundle (mirrors `playoff-schedule-2026.json`).
- **Bye data becomes available in-app** for the first time, reusable by future features.

### Negative
- The bye map and fade list are a **2026-06-19 snapshot**; they must be refreshed as roster news
  firms up (Eliminator rewards drafting late on near-final information). This is documented inline
  in the data file with a `_README`/`as_of` field.
- **Annotate-not-reorder** means the board does not show the model's full value re-rank. This is a
  deliberate trade-off (Option C) — the in-context playbook and onesie guidance carry the "when to
  draft" intent instead.

### Risks
- The curated fade list is hand-maintained and will not catch every late-developing rookie or
  contingent back; it is intentionally overridable by the drafter's own read.
- **Revisit when:** Eliminator-specific ADP becomes ingestable (re-rank may then be worth it); the
  bye/fade snapshot needs a refresh cadence or scraper; or a second contest format wants the same
  treatment (extract a shared "format mode" abstraction rather than a second bespoke overlay).

## Related
- Tasks: TASK-269
- ADRs: —

---
*Drafted autonomously (run-scoped L3); awaiting developer confirm/revise.*
