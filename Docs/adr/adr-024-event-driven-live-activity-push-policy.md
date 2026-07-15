# ADR-024: Event-driven Live Activity push policy

**Date:** 2026-07-15
**Status:** Accepted

---

## Context

During live draft capture, the Live Activity card **froze whenever the user was not within 2–3 picks of their turn** — the pick counter, available-players list, and target rows all stopped updating, then resumed the moment the user got close to picking.

The TASK-331 frame recorder + replay harness isolated the cause. Replaying a real captured draft (`frames-1784145340.jsonl`, 207 frames) through the exact engine the extension runs shows the engine tracking the **whole** draft correctly — `currentPick` ratchets 1 → 46, the ledger grows to 38, targets and roster update continuously, including deep in the "far from my pick" stretches. **Parsing is not the freeze.** The freeze is in push delivery.

The broadcast extension (`FrameProcessor.swift`) sent APNs **priority 10 only for "significant" transitions** (`picksUntil` 0–3, or a pick landing on the user's roster) and **priority 5 for everything else**, paced to one push per 3 s. Apple's WWDC23 session "Update Live Activities with push notifications" is explicit about what those priorities mean:

- **Priority 5** — "Low priority updates are delivered **opportunistically**… the Live Activities might **not be updated immediately**." (Deferred to conserve battery; does **not** count against the update budget.)
- **Priority 10** — "High priority updates are **delivered immediately**." (Counts against a finite, device-adaptive budget.)

So far from the pick, every update went out at priority 5 → deferred by iOS → the card looked frozen. Within 3 picks it flipped to priority 10 → immediate → "unfroze." This was faithful to ADR-020's stated policy ("the update policy must prioritize 'you're on the clock' moments over routine board movement"). That policy note is what this ADR revises.

Secondary aggravator: the relay (`live-activity-relay/index.ts`) sets `apns-expiration: "0"` ("deliver now or discard"), so a deferred priority-5 push can be dropped entirely rather than delivered late.

`NSSupportsLiveActivitiesFrequentUpdates` is already `true` in `app.json`, so the app is entitled to the higher (but still finite) frequent-updates budget.

## Decision

Adopt an **event-driven push policy**: push **priority 10 on a real draft event, and stay silent otherwise.**

- **Trigger = a new pick detected**, defined as `glance.currentPick` advancing beyond the last pushed pick. `currentPick` only ratchets from real pick evidence (board cells, ticker, carousel); availability/OCR inference never moves it (`sessionEngine.js` availability pass), so "`currentPick` advanced" is a faithful "new pick landed" signal.
- Also push priority 10 on **significant transitions** (on-clock / on-deck / ≤3 picks / your pick landed) as an explicit guarantee — these coincide with a pick advancing, but the OR ensures a crunch moment is never missed.
- A **3 s floor** between priority-10 pushes coalesces a rapid autopick burst into a single push carrying the newest full-snapshot state.
- **Nothing advanced → no push.** An idle slow draft costs zero budget; the card's "synced N s ago" line self-ticks in SwiftUI without any push.
- **Drop the routine priority-5 opportunistic fills.** Target-only changes (availability-inference flicker) ride along on the next pick's priority-10 glance, at most one pick stale.
- **Relay hardening:** change `apns-expiration` from `0` to a short window (~60 s) so a briefly-deferred push still lands fresh rather than being discarded.

All pacing/priority logic lives in the transport layer (`FrameProcessor.swift`); the engine stays pure and just reports `currentPick` in the glance.

## Alternatives Considered

### Option A: Event-driven priority-10 on pick detection, floored (chosen)

Push p10 when `currentPick` advances or a significant transition fires; 3 s floor; silent when idle.

- **Pros:** Self-paces to the draft's real tempo; every push is a change the user cares about, delivered immediately; zero budget cost while idle; on the measured draft it's both fresher *and* lower-volume than the status quo.
- **Cons:** A pathological ultra-fast autopick draft could still approach the frequent-updates budget; target-only refreshes lag by up to one pick.

### Option B: Status quo — p10 near-pick only, p5 elsewhere, paced 3 s

- **Pros:** Minimizes priority-10 budget usage; matches the original ADR-020 note.
- **Cons:** This *is* the bug — the p5 tracking updates are deferred and the card freezes far from the pick. Fails the core requirement.

### Option C: Fixed-interval p10 refresh (e.g., one every ~10 s far from pick)

- **Pros:** Simple time-based cap; predictable budget ceiling.
- **Cons:** Burns budget on a slow draft that isn't moving (pushes every 10 s with no new information); still lags a fast draft (a pick can land 9 s before its refresh). The draft's own event stream is the better clock — which is what Option A uses.

### Option D: Make every changed frame priority 10, paced 3 s

- **Pros:** Simplest possible change; maximally fresh.
- **Cons:** ~20 p10/min sustained (including on OCR availability flicker with no real pick) risks exhausting the budget on long drafts → throttling → the freeze returns later, harder to diagnose.

## Consequences

### Positive

- The card updates promptly far from the pick — the reported freeze is resolved.
- Push volume tracks the draft: ~4.7 p10/min on the measured fast draft, near-zero while a slow draft idles.
- OCR availability flicker no longer generates pushes, so it can't amplify into budget burn.
- Engine stays transport-agnostic; the policy is one well-commented block in `FrameProcessor.swift`.

### Negative

- Target-list changes that occur *without* a pick advancing are delayed until the next pick's push (≤ one pick stale).
- The relay change requires a manual `supabase functions deploy live-activity-relay` (per project convention) and is only observable on the next EAS build.

### Risks

- **Budget ceiling on extreme drafts.** Grounded in the captured fast draft: **44 pick-advance events over 9.4 min = ~4.7 p10/min, ~12/min peak burst** (floored). A full 216-pick fast draft extrapolates to ~4.7/min average. A degenerate all-autopick draft could burst faster; the 3 s floor bounds it, and Apple restores budget automatically (up to 24 h).
- **Expiration window tuning.** 60 s is a starting value; if updates ever arrive stale, shorten it.

## Revisit Conditions

- On-device logs (`apnd`) show budget throttling (`priority(0), budget(0)`) during a normal-speed draft → raise the 3 s floor or coalesce more aggressively.
- Live Activity updates arrive noticeably stale → shorten the relay `apns-expiration` window.
- A future capture transport (e.g., the ScreenCaptureKit in-process path from ADR-020) removes the relay hop → re-evaluate whether pacing still belongs in the transport layer.

## Related

- Tasks: TASK-329 (players-tab live capture), TASK-331 (frame recorder used to diagnose this), TASK-335 (implementation of this policy).
- ADRs: ADR-019 (capture mechanism), **ADR-020 (capture topology — this ADR revises its push-policy note)**, ADR-021 (parse engine as pick ledger), ADR-023 (engine hot-load).

---
*Approved by: developer (AskUserQuestion "Approved"), 2026-07-15*
