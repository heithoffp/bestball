# TASK-335: Event-driven Live Activity push policy — unfreeze the card far from the pick

**Status:** Pending Approval
**Priority:** P2
**Implements:** ADR-024

---

## Objective

Fix the reported bug where the Live Activity card **freezes whenever the user is not within 2–3 picks of their turn** — the pick counter, available-players list, and target rows stop updating, then resume only when the user gets close to picking.

Root cause (diagnosed via the TASK-331 frame recorder + replay harness, decided in ADR-024): far from the pick, every update was pushed at **APNs priority 5**, which iOS delivers "opportunistically" (deferred to save battery), so the card looked frozen; only within 3 picks did the extension switch to **priority 10** (immediate). Implement ADR-024's event-driven policy: **push priority 10 on each detected pick, floored to 3 s, and stay silent when nothing advanced.**

## Verification Criteria

1. **Offline push simulation over the real recording:** running the replay harness in push-sim mode on `frames-1784145340.jsonl` shows a priority-10 push on each `currentPick` advance (~44 events across the recording), **zero routine priority-5 pushes**, and **no push emitted on frames where nothing advanced** (idle/target-only frames).
2. **No engine/parse regression:** `npm run test:draft` stays green (the engine is untouched; the policy lives in the transport layer + a comment-only note in the JS entry).
3. **Developer (manual, next EAS build):** in a real draft the card updates promptly far from the pick (counter, available players, targets move as opponents pick); a slow-draft idle stretch produces no push spam; a crunch moment (on-clock) still lands immediately.

## Verification Approach

- **Criterion 1:** extend `scripts/replay-frames.mjs` with a `--push-sim` flag that feeds each frame through the **extension entry** (`BBEEngine.ingest`, so `changed`/`significant`/`glance.currentPick` are the real engine outputs) and applies the ADR-024 gate in JS, printing per-frame push decisions (`PUSH p10` / `skip`) and a summary (`N pushes, all p10, M idle frames skipped`). Run it on `frames-1784145340.jsonl` and confirm the counts: ~44 p10 pushes matching the `cp …->…` advances already seen in the plain replay, 0 p5, and every non-advancing frame skipped. This is a JS re-implementation of the Swift gate — a faithful proxy for the pure-function push decision, not the Swift binary itself.
- **Criterion 2:** `cd mobile-app && npm run test:draft`, report full output.
- **Criterion 3:** manual, requires the next EAS build. List the checks for the developer to confirm on device; do not mark Verified until confirmed.
- **Relay:** `deno check supabase/functions/live-activity-relay/index.ts` (type-check only; the change is a one-line expiration compute). The deploy (`supabase functions deploy live-activity-relay`) is a manual developer step per project convention — flag it, don't run it.

## Files to Change

| File | Action | Description |
|------|--------|-------------|
| `mobile-app/targets/draft-broadcast/FrameProcessor.swift` | Modify | Add `private var lastPushedPick = 0`. Replace the `significant ? 10 : 5` push gate in `ingest(_:)` with the ADR-024 gate: read `glance["currentPick"]`; push **priority 10** when `currentPick > lastPushedPick` (floored to 3 s) **or** on a `significant` transition (bypasses the floor so a crunch moment is never delayed); update `lastPushedPick` on each push; **no priority-5 path**. Rewrite the `// Priority-10 APNs budget…` header comment (lines ~11-12) and the inline push-gate comment to describe the event-driven policy and cite ADR-024. |
| `mobile-app/src/draft/extensionEngine.entry.js` | Modify | **Comment-only.** The glance already carries `currentPick` and `significant` is still computed and still meaningful (kept as the crunch/my-pick guarantee). Update the `// Change detection drives push pacing in Swift…` note in `buildResult()` to document the new event-driven contract (Swift pushes on `currentPick` advance or `significant`; p10 only). No functional change. |
| `supabase/functions/live-activity-relay/index.ts` | Modify | In `sendPush`, change `apns-expiration` from the hardcoded `"0"` to a short window: `String(Math.floor(Date.now()/1000) + 60)` so a briefly-deferred push still lands fresh instead of being discarded. Note the manual `supabase functions deploy live-activity-relay` requirement. |
| `mobile-app/scripts/replay-frames.mjs` | Modify | Add a `--push-sim` flag: route frames through the extension entry (`BBEEngine`) and apply the ADR-024 push gate, printing per-frame push decisions + a summary. Serves Criterion 1's offline check (extends the TASK-331 replay corpus to cover push behavior, not just engine state). |
| `mobile-app/docs/LIVE_SESSION_V1.md` | Modify | Document the event-driven push policy (trigger = detected pick, p10 immediate, 3 s floor, silent when idle, relay expiration window) with a pointer to ADR-024. |

## Implementation Approach

1. **FrameProcessor.swift (the fix).** In `ingest(_:)`, after obtaining `changed`/`significant`/`glance`:
   ```swift
   let pick = glance["currentPick"] as? Int ?? 0
   let newPick = pick > lastPushedPick
   let now = CFAbsoluteTimeGetCurrent()
   // ADR-024: push only on a real draft event. A newly-detected pick (currentPick
   // ratchets solely from board/ticker/carousel evidence — never OCR availability)
   // or a significant crunch/my-pick transition. Everything goes priority 10
   // (immediate); iOS defers priority-5 pushes, which froze the card far from the
   // pick. Significant bypasses the 3s floor so on-clock is never delayed; routine
   // pick detection is floored to coalesce autopick bursts into one newest-state
   // push. Nothing advanced -> no push: an idle slow draft costs zero budget.
   guard significant || (newPick && now - lastPushAt >= 3.0) else { return }
   lastPushAt = now
   lastPushedPick = max(lastPushedPick, pick)
   pushGlance(glance, priority: 10)
   ```
   Keep the existing `guard changed, let glance = …` (unchanged — it fetches the glance and matches prior behavior; `newPick`/`significant` both imply `changed` in practice). `lastPushedPick` starts at 0, so the first sync (armed/resume state, `currentPick ≥ 1`) pushes once, then tracks advances. No reset needed within a session; `finish()`/`setUp()` already bracket a session and the processor is recreated per broadcast.
2. **extensionEngine.entry.js.** Reword the `buildResult` pacing comment only. `significant` (enteredCrunch / myPickLanded / myPickEvent) is retained verbatim — it's now the "bypass the floor" guarantee rather than "the only thing that gets p10."
3. **Relay.** One-line change in `sendPush`; compute the expiration timestamp per call so each push carries a fresh 60 s window.
4. **replay-frames.mjs `--push-sim`.** Import the extension entry, `BBEEngine.init(config)` with the pool, then per frame call `BBEEngine.ingest(items)` and parse the result for `changed`/`significant`/`glance.currentPick`; apply the same gate (JS mirror of the Swift block) with a simulated monotonic clock derived from frame `t`; print decisions + summary. Reuses the exact JS change-detection so only the tiny gate is re-expressed.
5. **Docs.** Add a "Push policy (ADR-024)" subsection to LIVE_SESSION_V1.md.

## Dependencies

Implements **ADR-024**. Ships in the next EAS build alongside the other in-progress live-capture tasks (TASK-329, TASK-333). The relay change is independent and can deploy immediately (manual `supabase functions deploy`).

**Relies on `NSSupportsLiveActivitiesFrequentUpdates` (already `true` in `app.json:23`).** The policy is now priority-10-only, and p10 pushes count against the ActivityKit budget; this entitlement grants the higher budget that keeps a full fast draft (~216 p10 pushes) from being throttled. No app.json change — just noted here and in LIVE_SESSION_V1.md as a load-bearing dependency of the policy.

## Rollback Approach

Revert the commit. The Swift/JS changes are inert until the next EAS build; the relay change is reverted by redeploying the previous `index.ts` (`apns-expiration: "0"`). No data migration, no state format change.

## Related

- ADRs: ADR-024 (the decision), ADR-020 (capture topology — push-policy note revised), ADR-021 (engine), ADR-023 (engine hot-load).
- Tasks: TASK-331 (frame recorder + replay harness that diagnosed this), TASK-329 (players-tab capture).
