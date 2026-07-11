# ADR-021: Parse engine as incremental pick ledger with remote templates

**Date:** 2026-07-11
**Status:** Accepted

---

## Context

Screen capture (ADR-019/020) yields raw frames of the Underdog draft room. The
assistant needs structured `DraftState` (the contract already defined in
`chrome-extension/src/adapters/interface.js`: currentPick, currentRound, draftSlot,
availablePlayers, myPicks). Two hard realities shape how frames become state:

- **Full-board OCR is intractable.** The player list is a virtualized scroll of
  hundreds of names; the board view is a dense grid. OCR-ing "all remaining players"
  from any single frame is impossible, and stitching scrolls is fragile and slow.
- **UI redesigns are certain and recurring.** The Chrome extension's history proves
  it (CSS-module hash churn, selector breakage, the 2026-05 underdogsports.com domain
  rebrand). A visual parser hardcoded into app binaries would require a full App Store
  release cycle (days, plus review) for every break-fix, during draft season.

Two assets make a leaner design possible: BBE already ships per-slate player pools
(ADP data, refreshed continuously) and a battle-tested name normalizer
(`canonicalName.js` / `stableId()`); and a snake draft is fully determined by its
pick sequence — pool minus picks = remaining, slot + pick count = whose turn.

## Decision

The parse engine **reconstructs draft state incrementally instead of reading it
wholesale**: OCR only the recent-picks region of the screen, fuzzy-match each new
pick against the known slate player pool, and append to a monotonic **pick ledger**;
all other state (remaining players, current pick/round, picks-until-turn, user's
roster) is *derived* from the ledger plus the user's confirmed draft slot. Screen
geometry (regions of interest, text patterns, layout variants) lives in **remote
parse templates** — versioned JSON served from Supabase, updatable without an app
release. The engine reports per-pick confidence and degrades to manual pick entry
below threshold.

## Alternatives Considered

### Option A: Incremental pick ledger + remote templates (chosen)
- **Pros:** Shrinks the CV problem from "read a draft board" to "read the newest
  ticker entry" — a bounded region with a closed vocabulary (~600 known slate names),
  where fuzzy matching absorbs most OCR error; state stays consistent even when
  frames are missed (ledger gaps are detectable via pick numbering); redesign
  break-fixes ship as template updates in minutes, mirroring how the extension's
  `selectors` object isolates platform DOM knowledge today.
- **Cons:** Requires a recovery flow for mid-draft joins/app restarts (a "calibration
  sweep" where the user briefly opens the board view); wrong-slot input corrupts all
  derived state (mitigated: slot confirmed with one tap at session start, sanity-checked
  against observed "my pick" events).

### Option B: Full-state OCR per frame
Re-read everything visible each frame and rebuild state from scratch.
- **Pros:** Stateless — no ledger corruption risk, no recovery flow.
- **Cons:** Cannot see non-visible players (virtualized lists), so "remaining players"
  is unknowable from a single frame; enormous OCR load per frame (memory + latency
  budget blowout, especially under iOS constraints); far more surface area coupled to
  layout, so redesigns break more.

### Option C: Hardcoded native parsers per platform version
Bake screen geometry into Swift/Kotlin code.
- **Pros:** Simplest initial implementation; no template-serving infrastructure.
- **Cons:** Every UD redesign requires an app-store release during draft season;
  contradicts the lesson already paid for in the extension (selector isolation);
  makes DraftKings support a code fork rather than a data addition.

## Consequences

### Positive
- OCR accuracy requirements drop dramatically: matching against a closed candidate
  pool tolerates heavy character-level error ("J. Jeffrson" resolves cleanly).
- The engine's output is the existing `DraftState` contract, so mobile is a third
  adapter alongside Underdog/DraftKings web — downstream analytics
  (rosterArchetypes, stackAnalysis) consume it unchanged.
- Platform coverage scales as data: DraftKings = new template set + name-matching
  test fixtures, not a new engine.
- Confidence-scored degradation to manual entry means the product fails soft and
  visibly, never silently wrong — consistent with the confidence-hub philosophy.

### Negative
- BBE runs template infrastructure (authoring, versioning, serving via Supabase) and
  a screenshot-fixture test corpus that must be refreshed each season.
- The ledger model needs careful edge handling: simultaneous-pick bursts after
  autopick timeouts, traded/skipped picks, the user scrolling away from the ticker
  region mid-capture.
- Native parse code is written twice (Swift now, Kotlin later); the templates carry
  the shared knowledge, but drift between the two thin engines is possible.

### Risks
- If the Underdog app's recent-picks region proves unreliable to OCR (animation blur,
  truncated names, low contrast), the bounded-region premise weakens — the spike
  (TASK-318) measures exactly this on real draft screenshots before commitment.
- Template flexibility has limits: a redesign that removes the pick ticker entirely
  (not just moves it) requires engine changes, not just template changes.

## Revisit Conditions

- Spike OCR accuracy on the ticker region falls below ~95% post-fuzzy-match.
- Underdog ships a draft-room redesign that invalidates the region-based model.
- A sanctioned structured data source appears (ADR-019 revisit) — the ledger stays,
  but OCR ingestion would be replaced.

## Related
- Tasks: TASK-318 (spike), TASK-321 (parse engine)
- ADRs: ADR-019, ADR-020, ADR-022

---
*Approved by: PH — 2026-07-11*
