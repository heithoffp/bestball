# ADR-025: Push on target-list changes and room-presence transitions

**Date:** 2026-07-16
**Status:** Accepted

---

## Context

ADR-024 fixed the "card freezes far from the pick" defect with an event-driven push
policy: priority-10 on a detected pick (`currentPick` advance, 3 s floor) or a
significant crunch/my-pick transition, silent otherwise. It accepted an explicit
trade-off: *"Target-list changes that occur without a pick advancing are delayed until
the next pick's push (≤ one pick stale)."*

The 2026-07-16 recorded session (`frames-1784198568.jsonl`, TASK-331 recorder) proved
that bound wrong for the product's primary slow-draft flow. Joining a draft already at
pick 89, the only pushes were session start and one board glance (a `currentPick` 1→89
advance) — sent while just 21 picks were known and before any availability inference
ran, so the card showed near-top-of-pool names (Jahmyr Gibbs tier). The players-tab
scan then marked 89 players gone and completely reshaped the targets, but
**availability-only changes never advance `currentPick` and never classify
significant** — so no push fired, and in a slow draft the next pick can be hours away.
The card sat on stale elite names indefinitely: not "≤ one pick stale," but unbounded
in wall-clock terms exactly when the user most needs corrected targets.

TASK-336 also introduces room-presence states (`waiting` / `away`) whose transitions
are the product's "entered / left the draft room" notification — they must deliver
immediately — and a reset-for-next-draft flow where the app bumps a config epoch and
the extension re-initializes its engine mid-broadcast.

## Decision

Keep ADR-024's event-driven, priority-10-only, silent-when-idle architecture, with the
gate in `FrameProcessor.swift` (per the recorded TASK-336 decision declining a JS
relocation), and extend the trigger set to three:

1. **Significant transition** (no floor): crunch (on-clock / on-deck / ≤3 picks), my
   pick landed, **or a room-presence flip** (entered/left the draft room — computed by
   the engine with hysteresis and a frame-quiet `tick`).
2. **New pick detected** (3 s floor): unchanged from ADR-024.
3. **Target list changed** (15 s floor): the glance's `targets` array differs from the
   **last pushed** targets. This is what un-freezes a mid-draft resume; measuring
   against the last push (not the last frame) coalesces a players-tab scroll burst
   into one corrected update.

On a config-epoch re-init (board reset), all push bookkeeping (`lastPushedPick`,
`lastPushedTargets`, `lastPushAt`) resets — a prior draft's pick 89 must not suppress
the next draft's pick 5.

## Alternatives Considered

### Option A: Add targets-changed (15 s floor) + presence triggers in Swift (chosen)

- **Pros:** Fixes the unbounded staleness with one bounded, push-relative trigger;
  presence transitions deliver the left-room notification instantly; preserves
  ADR-024's budget properties (idle drafts still cost zero; the 15 s floor caps
  availability-flicker churn at ≤4 pushes/min worst case — observed ~8 pushes over the
  71 s resume burst, then silence). Verified offline via the `--push-sim` replay
  mirror.
- **Cons:** Push-policy changes still require an EAS build (gate lives in native code).

### Option B: Move the push verdict into the JS engine (hot-loadable)

- **Pros:** Future policy tuning ships via ADR-023 hot-load with no native rebuild;
  policy becomes directly unit-testable.
- **Cons:** Blurs the engine/transport boundary ADR-024 deliberately kept ("engine
  stays pure"); more moving parts across the JSC bridge. **Declined by the developer
  in the TASK-336 plan decision.**

### Option C: Treat any glance change as significant (push everything, 3 s floor)

- **Pros:** Simplest; nothing can ever be stale.
- **Cons:** Re-opens ADR-024's Option D failure — OCR availability flicker (the
  recorded session oscillates a marked/cleared player every few frames) would push
  continuously and risk exhausting the frequent-updates budget, bringing the freeze
  back via throttling.

### Option D: Periodic p10 refresh while targets are dirty (e.g. every 30 s until pushed)

- **Pros:** Similar effect to Option A with time-based reasoning.
- **Cons:** Needs a timer in the extension (ADR-024 chose event-driven precisely to
  avoid this); the 15 s-floored dirty-check achieves the same bound using frames that
  already arrive.

## Consequences

### Positive

- A roster-glance + players-scroll mid-draft resume corrects the Live Activity within
  ~15 s — verified against the recorded session (corrected Dowdle-tier targets push
  11 s after the stale board-glance push).
- Leaving/entering the draft room pushes immediately; the `away` card doubles as the
  reset affordance for back-to-back slow drafts.
- Idle behavior unchanged: no state change → no push.

### Negative

- Availability-inference flicker now *can* generate pushes (bounded to one per 15 s) —
  ADR-024 had structurally excluded it from the push path.
- The recorded-session push count rises from 2 to 8; each maps to a real event (entry,
  exit ×2, corrections), but total volume per draft is modestly higher.

### Risks

- Sustained availability oscillation (a player repeatedly marked/cleared at the window
  edge) could push every 15 s while the user browses the players tab.

## Revisit Conditions

- On-device `apnd` logs show budget throttling (`priority(0), budget(0)`) during a
  normal session → raise the 15 s floor or add a dirty-stability requirement (targets
  must persist N frames before pushing).
- The presence `tick` path runs on duplicate frames; if a future capture transport
  stops delivering buffers for static screens entirely, the away flip would stall —
  re-evaluate with the ScreenCaptureKit transport (ADR-020).

## Related

- Tasks: TASK-336 (implementation + replay verification), TASK-335 (ADR-024
  implementation), TASK-331 (frame recorder used for diagnosis).
- ADRs: **Supersedes ADR-024** (trigger set revised; architecture retained), ADR-020
  (capture topology), ADR-023 (engine hot-load / config handoff).

---
*Approved by: developer (AskUserQuestion "Approved"), 2026-07-16*
