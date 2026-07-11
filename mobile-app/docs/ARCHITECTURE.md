# Mobile Live Draft Assistant — Architecture

Status: design (2026-07-11), pre-spike. Decisions recorded in ADR-019/020/021/022;
this doc is the working elaboration. If a statement here conflicts with an ADR, the
ADR wins.

## Product shape

The user drafts **in the Underdog app**, exactly as they do today. BBE runs alongside:

- **Glance layer** (the differentiator): iOS Live Activity in the Dynamic Island /
  lock screen showing picks-until-turn, top available players by the user's own
  rankings, and archetype/stack flags — visible while the Underdog app is foregrounded.
- **Full assistant** (tap-through): the BBE app's draft screen with complete portfolio
  context — the mobile port of the web Draft Assistant, fed automatically instead of
  by manual taps.
- **Fail-soft**: when capture or OCR confidence degrades, the UI says so and offers
  manual pick entry. Never silently wrong (confidence-hub philosophy).

Fast drafts are the continuous-capture product. **Slow drafts are on-demand**: UD's own
turn notification arrives → user opens BBE → short capture session (or none) → pick →
close. No persistent multi-day capture exists on either platform (see RESEARCH_NOTES).

## Four layers

```
┌──────────────────────────────────────────────────────────────┐
│ PRESENTATION                                                  │
│  iOS: Live Activity (Dynamic Island / lock screen / Watch     │
│       Smart Stack via supplementalActivityFamilies)           │
│  Android (future): floating bubble → expandable panel         │
│  Both: full Draft Assistant screen in the RN app (deep link)  │
├──────────────────────────────────────────────────────────────┤
│ ANALYTICS (shared JS package — ported from web, not rewritten)│
│  rosterArchetypes, stackAnalysis, playoffStacks,              │
│  eliminatorModel, canonicalName + portfolio from Supabase     │
├──────────────────────────────────────────────────────────────┤
│ PARSE ENGINE (thin native per platform, template-driven)      │
│  frame diff → ROI crop → OCR → closed-pool fuzzy match →      │
│  pick ledger → DraftState                                     │
├──────────────────────────────────────────────────────────────┤
│ CAPTURE (native per platform)                                 │
│  iOS: ScreenCaptureKit (iOS 27+), FrameSource abstraction     │
│       keeps a ReplayKit broadcast-extension fallback possible │
│  Android (future): MediaProjection foreground service         │
└──────────────────────────────────────────────────────────────┘
```

## The load-bearing idea: reconstruct, don't read (ADR-021)

Never OCR the whole board. A snake draft is fully determined by its pick sequence:

- **Slate player pool** comes from BBE's existing ADP data (bundled/served per slate).
- OCR only the **recent-picks region**; each new pick is fuzzy-matched against the pool
  (~600 known names — heavy OCR error is recoverable) via the same normalization as
  `chrome-extension/src/utils/canonicalName.js`.
- Picks append to a **monotonic ledger**. Everything else is derived:
  remaining = pool − ledger; current pick/round = ledger length; picks-until-turn =
  snake math from the user's slot (confirmed with one tap at session start, then
  sanity-checked against observed picks landing on the user's roster panel).
- Ledger gaps are *detectable* (pick numbering) → triggers a **calibration sweep**
  (user briefly opens the board tab; we re-read what's visible) or manual confirm.

### Parse templates (remote config)

The mobile analog of the extension adapters' `selectors` object. Versioned JSON in
Supabase, fetched+cached at session start, describing per platform/app-version:

```jsonc
{
  "platform": "underdog",
  "min_app_version": null,
  "regions": {
    "pick_ticker":   { "rect_pct": [0.0, 0.06, 1.0, 0.14], "kind": "recent_picks" },
    "clock_banner":  { "rect_pct": [0.0, 0.00, 1.0, 0.06], "kind": "on_clock" },
    "my_roster":     { "rect_pct": [0.0, 0.55, 1.0, 1.00], "kind": "roster_panel", "requires_tab": "myteam" }
  },
  "patterns": { "pick_line": "..." },
  "version": 1
}
```

Exact region set is spike/fixture-driven (TASK-318 Part B tells us which regions OCR
well). UD redesign → template update in minutes, no app release. DraftKings support =
a second template set + fixtures, same engine.

### DraftState contract

The engine outputs the shape already defined in
`chrome-extension/src/adapters/interface.js` (`DraftState`: currentPick, currentRound,
draftSlot, availablePlayers, myPicks). Mobile is effectively a third platform adapter;
the analytics layer consumes it unchanged.

## iOS data flow

**Foreground (BBE app open, e.g., user tapped through):** capture → parse → ledger →
analytics → RN UI + local `Activity.update()`. No server involved.

**Background (user is in the Underdog app — the main case):**

```
UD app on screen
  → SCStream frames (~1 fps, frame-diff gated) in the BBE process   [spike Q3 gate]
  → parse → ledger append (local)
  → IF app has runtime while capturing: local Activity.update()      [spike Q3 stretch]
    ELSE: POST pick-delta → Supabase Edge Function → APNs
          (apns-push-type: liveactivity, ≤4 KB content-state)
  → Live Activity re-renders
```

If spike Q3 fails (no background frames), the architecture reverts to the ReplayKit
broadcast-extension shape: extension process captures + parses (≤50 MB, downscale +
`.fast` Vision), writes ledger to the App Group, POSTs deltas → Edge Function → APNs.
Same layers, different process topology — this is why `FrameSource` and the parse
engine must not assume which process they run in.

### Live Activity design

| Surface | Content |
|---------|---------|
| Minimal (island, crowded) | picks-until-turn count |
| Compact leading/trailing | "P47 · 3 away" / top-value player badge |
| Expanded (long-press) | top 3 available by user rankings + archetype status + stack flag |
| Lock screen | same as expanded (≤160 pt height) |
| Tap anywhere | deep link → in-app assistant |

**Update policy (throttle-aware — hard requirement, see RESEARCH_NOTES §iOS):**
- priority 10 (immediate): "you're ≤3 away", "you're on the clock", your pick confirmed
- priority 5 (best-effort): routine board movement between your turns
- respect `ActivityAuthorizationInfo().frequentPushesEnabled`; set
  `NSSupportsLiveActivitiesFrequentUpdates`
- activities hard-cap at 8 h; end the activity at draft end with a summary state
  (dismissal-date a few minutes out)

### Push relay (Supabase Edge Function)

`live-activity-relay`: authenticated POST {activity push token, delta, glance payload} →
APNs HTTP/2 (p8 token auth, topic `bundleID.push-type.liveactivity`). APNs p8 key lives
in Supabase secrets, never in the app. Scope shrinks (or disappears) if local background
updates work — spike Q3 stretch goal answers this.

## Session lifecycle

1. User taps **Start draft session** in BBE (or from a Home Screen quick action).
2. Confirm slot (1 tap), pick tournament/slate if ambiguous; slate pool loads.
3. `SCContentSharingPicker` consent (system UI, per-session by design).
4. `Activity.request()` starts the Live Activity (app is foregrounded here — required).
5. User switches to UD and drafts. Glance layer updates per the policy above.
6. Auto-stop: draft complete detected (ledger full), long inactivity, or user stops.
   Screen lock kills capture (both platforms) — resume = calibration sweep.

## Security & privacy invariants (ADR-019 — do not weaken)

- Raw frames never leave the device; never persisted beyond the parse window.
- No UD/DK credentials or tokens are ever read, stored, or transmitted.
- Only derived draft state (player id, pick number, slot) leaves the device, and only
  to the user's own Live Activity via BBE's relay.
- Capture runs only during explicit user-started sessions; UD-only regions parsed.

## Android (future, FEAT-032)

Same layers; capture = MediaProjection FGS (per-session consent, single-app capture
mode), OCR = ML Kit, presentation = SAW overlay bubble; everything on-device (no push
relay needed). Go/no-go: FLAG_SECURE test of UD/DK Android apps. Play's gambling
"companion functionality" clause is the distribution risk to resolve before building.

## Open design questions (park until post-spike)

- Slate identification: infer from screen (tournament name in header) vs. user pick-list.
- Multi-draft concurrency (UD allows parallel fast drafts): v1 = one session at a time.
- Watch Smart Stack surface: free with `supplementalActivityFamilies` — verify rendering.
- Autopick burst handling: N picks land in one frame after a timeout — ledger must
  accept batched appends in ticker order.
