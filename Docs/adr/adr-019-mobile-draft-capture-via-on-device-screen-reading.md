# ADR-019: Mobile draft capture via on-device screen reading

**Date:** 2026-07-11
**Status:** Accepted

---

## Context

The Mobile Live Draft Assistant (EPIC-08) must observe the state of a live best-ball
draft happening in the **native Underdog (later DraftKings) mobile app** — picks made,
picks until the user's turn, players remaining — so it can surface glanceable portfolio
context (iOS Live Activity / Android overlay). Unlike the web draft room, there is no
DOM to read: the draft happens inside a third-party native app the assistant cannot
instrument.

Constraints and facts established by research (2026-07):

- **No public API exists** for Underdog or DraftKings draft state.
- The Chrome extension already proves Underdog has a **private REST API**
  (`api.underdogsports.com`, `/v2/drafts/{id}`) and captures the user's Bearer token
  in-page to call it (`chrome-extension/src/injected/underdog-bridge.js`).
- **Underdog's public stance** (May 2025, responding to the ETR/Solver controversy):
  *"We do not allow scripts, we do not allow strain on our APIs, we do not allow
  automation. We do allow suggestions and overlays and have for quite a while."*
  Their ToS §6 prohibits automated access "other than manually accessing the
  publicly-available portions of the Services through a browser."
- DraftKings' ToS bans off-site scripts and screen scrapers outright and has a
  cease-and-desist precedent (SuperLobby, 2016), though best-ball overlay tools
  operate openly without enforcement today.
- Both mobile OSes offer a **user-initiated, system-consented screen capture pipeline**
  (iOS: ReplayKit broadcast / ScreenCaptureKit; Android: MediaProjection), with
  shipping App Store/Play precedents that capture + OCR other apps' screens in real
  time (iTranscreen screen translator on iOS; screen translators and a poker HUD on
  Android).
- Users' UD/DK accounts hold real money. Any design that handles their platform
  credentials or session tokens carries account-security and liability weight.

## Decision

The mobile assistant obtains draft state **exclusively by reading the user's own
screen on the user's own device** (system screen-capture APIs + on-device OCR), never
by calling Underdog/DraftKings APIs — neither from the mobile app nor from BBE servers.
Only **derived draft state** (pick ledger deltas — player identity, pick number) may
leave the device, and only to power the user's own Live Activity; raw frames never
leave the device.

## Alternatives Considered

### Option A: On-device screen capture + OCR (chosen)
The OS-sanctioned capture pipeline feeds an on-device OCR/parse engine; the platform's
servers see zero additional traffic.
- **Pros:** Fits squarely inside Underdog's publicly tolerated category ("suggestions
  and overlays"); zero API load on the platforms; no credentials or tokens handled;
  works identically for any platform we can see (UD, DK, future); explicit per-session
  OS consent dialog gives an unambiguous user-authorization story for app review.
- **Cons:** Computer-vision fragility — UI redesigns break parsing (mitigated by
  ADR-021); heavier engineering than an API client; iOS requires a server hop for
  Live Activity pushes (extension can't update activities directly); capture dies on
  screen lock.

### Option B: API watcher using the user's session token
Reuse the extension's token-capture trick: obtain the user's Underdog Bearer token
(login WebView or extension handoff), then poll `/v2/drafts/{id}` — from the device
or from a BBE server — for perfect structured draft state.
- **Pros:** Perfect data fidelity, no OCR, trivially cheap to parse; device-independent
  (server could watch a draft regardless of where the user drafts).
- **Cons:** Directly inside Underdog's explicitly banned categories (automation, API
  strain) and DK's scraper ban; server-side polling from BBE IPs with harvested user
  tokens is detectable and could get **users' real-money accounts** flagged or banned —
  an unacceptable risk to push onto subscribers; handling tokens for money-holding
  accounts makes BBE a security liability; single API change breaks everything with
  no graceful degradation.

### Option C: Manual pick entry (Spike Week model)
User taps each pick into the BBE app as it happens; no capture at all.
- **Pros:** Zero platform risk, zero CV work, ships fastest; proven by Spike Week's
  Mobile Draft Hacker.
- **Cons:** Fails the product dream — a 30s fast-draft clock leaves no time to
  transcribe picks *and* think; me-too feature with no differentiation. Retained as
  the **degradation fallback** when OCR confidence drops, not the primary mechanism.

### Option D: Safari Web Extension (mobile-web drafting)
Port the Chrome extension content script to iOS Safari; works only when the user
drafts on underdog.com in mobile Safari, not the native app.
- **Pros:** Reuses proven DOM-reading code; structured data, no OCR.
- **Cons:** Most mobile drafting happens in the native apps, so it misses the core
  audience; iOS extension background-worker lifecycle is documented-unreliable.
  Possible future *additive* channel, not the foundation.

## Consequences

### Positive
- BBE's compliance posture is the strongest available: the assistant only ever looks
  at pixels the user is already looking at, with OS-level consent — the mobile
  equivalent of the overlay category Underdog has publicly tolerated.
- No user credentials or tokens are ever collected, stored, or transmitted.
- Privacy story for app review is clean: frames processed on-device, discarded
  immediately, only derived pick data (player names/pick numbers) uploaded.
- The capture layer is platform-agnostic at the architecture level — adding DraftKings
  or a future platform is a parse-template addition, not a new integration.

### Negative
- We own a computer-vision parsing engine and its maintenance burden for the life of
  the feature (every UD/DK draft-screen redesign is a break-fix event).
- iOS Live Activity updates require a push relay (Supabase Edge Function → APNs),
  adding server infrastructure an API-less design would otherwise not need.
- Screen capture cannot survive device lock; multi-day slow drafts get an on-demand
  session model rather than continuous watching.

### Risks
- Either platform could add screen-capture countermeasures (iOS `isCaptured` blanking,
  Android `FLAG_SECURE`) at any time — a kill switch outside our control. TASK-318
  (spike) tests the current state; ongoing monitoring required each platform-app release.
- App Store 5.2.2 (third-party service authorization) or Google Play's gambling
  "companion functionality" clause could block distribution regardless of capture
  mechanism — a distribution risk, tracked at the epic level.

## Revisit Conditions

- Underdog or DraftKings publishes a public API or a sanctioned partner program
  (Option B's compliance objection dissolves — revisit immediately).
- The spike (TASK-318) finds capture blocked (black frames / blanked content) on the
  Underdog iOS app — the foundation fails and Options C/D become the fallback product.
- Underdog's tolerance posture changes (public statement or enforcement against
  screen-reading tools).

## Related
- Tasks: TASK-318 (feasibility spike)
- ADRs: ADR-020 (iOS capture API), ADR-021 (parse engine), ADR-022 (app shell)

---
*Approved by: PH — 2026-07-11*
