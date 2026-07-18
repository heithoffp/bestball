# TASK-324: App Store readiness: review notes, privacy disclosures, distribution strategy

**Status:** Draft
**Priority:** P2

---

## Objective
Take the mobile app end-to-end from "builds on the pipeline" to "approved and held for launch" in one guided pass: (1) **finalize** all iOS release config, store-listing assets, and compliance answers; (2) **review** that prep for correctness (a deliberate second-pass audit before anything is submitted); and (3) **guide the developer step-by-step** through creating the App Store Connect record and submitting a production build with **"Manually release this version"** selected — so Apple's approval is banked ahead of the public launch and release becomes a one-click decision on the developer's schedule.

This still centers on the store posture the research flagged as the biggest non-technical risk: App Review notes explaining the screen-capture purpose (2.5.14 consent/indication), privacy nutrition labels (frames on-device only, derived picks only), age-rating questionnaire, 5.2.2 third-party-authorization contingency plan (Underdog outreach option), and a TestFlight beta path for early subscribers. It adds the concrete config finalization and the guided submission the developer asked to run now.

## Dependencies
None

## Open Questions
<!-- Unknowns or decisions to resolve before planning. Delete if none. -->

## Scope Items

### Finalize iOS release config in app.json/eas.json
- **Added:** 2026-07-15
- **Verification:** expo config shows aps-environment=production; eas.json submit.production has ascAppId + appleId + appleTeamId; version/buildNumber sane

### Audit + review the finalized prep for correctness
- **Added:** 2026-07-15
- **Verification:** second-pass review confirms no dev-only entitlements, bundle IDs for app + both extensions match ASC, no blocking guideline gaps

### Assemble store listing assets + compliance answers
- **Added:** 2026-07-15
- **Verification:** screenshots (required sizes), description/keywords/subtitle, support+privacy-policy URLs, age rating, export compliance (ITSAppUsesNonExemptEncryption=false) all present

### Guided first submission with Manually release selected
- **Added:** 2026-07-15
- **Verification:** developer creates ASC app record, submits production build, and confirms it reaches 'Pending Developer Release' (approved, held for manual launch)

### App Store screenshots: capture 6-frame sequence + Fable-composed marketing frames
- **Added:** 2026-07-18
- **Verification:** 6 finished App Store frames at iPhone 6.9 in dimensions (Dashboard, Exposures, Draft Assistant, ADP Tracker, Combos, Arena/Rankings), each with a one-line caption; produced by developer raw-capture then Fable composition; optional App Preview video noted as follow-on

**Approved 6-frame sequence** (first 3 carry the weight — they surface in search results / above the fold). Captions describe portfolio *state/capability* per the mirror-not-advisor principle; never prescribe.

| # | Screen to capture | Headline caption | Rationale |
|---|-------------------|------------------|-----------|
| 1 | Dashboard (populated portfolio overview) | "Your entire best-ball portfolio, at a glance" | Hero frame — communicates the one-stop shop. Must show a full, healthy dashboard, not an empty state. |
| 2 | Exposures table (sorted, % bars visible) | "Know your real exposure to every player" | Core differentiator + namesake; the "aha." |
| 3 | Draft Assistant (live draft view mid-draft) | "A live draft companion that keeps up with you" | Flagship interactive feature; signals it works during drafts. |
| 4 | ADP Tracker (a player's ADP timeline chart) | "Watch ADP move, on Underdog and DraftKings" | Depth + plants the multi-platform flag. |
| 5 | Combos (QB stack / dual-QB pair view) | "See every stack and correlation you're building" | Portfolio-level sophistication. |
| 6 | Arena (or Rankings drag board if Arena thin on mobile) | "Compare your builds in Best Ball Arena" | Community hook + aspirational close. |

**Capture notes:** portrait, full screen, clean status bar (full battery, no notification clutter); use populated/realistic demo data (esp. frame 1); same device size for all 6; scroll to the most information-dense state of each screen; shoot 2-3 candidates per tab for framing options. On-device iOS screenshots are fine — no Mac needed.

**Workflow:** developer captures raw screenshots -> hands to Fable for composition (background, optional device mockup, consistent caption typography, brand colors). Optional follow-on: a 15-30s App Preview video (real-device screen recording, `.mov`/`.mp4`, matching device dimensions).
