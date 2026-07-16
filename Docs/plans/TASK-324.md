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
