# TASK-213: Implement self-hosted extension distribution with browser-detecting install flow

**Status:** Draft
**Priority:** P1

---

## Objective
Chrome Web Store permanently rejected the extension as gambling and will not reinstate the developer account (per ADR-005). Without a working distribution channel, no users can onboard. Build /install page on BestBallExposures.com that detects browser and routes to the appropriate flow: Chrome/Chromium guided 4-step (download .crx, open chrome://extensions, enable Developer Mode, drag-drop), Edge one-click .crx, Firefox one-click signed .xpi, Safari/mobile/unknown unsupported message. Set up versioned hosting for .crx and signed .xpi binaries. Implement self-hosted updates.xml so installed extensions auto-update. Get Firefox .xpi Mozilla-signed (unlisted distribution if AMO rejects). Add transparency note explaining the Web Store situation. Related: ADR-005.

**Deferred from initial scope:** Install-funnel analytics moved to TASK-219 — meaningless at current ~20-user scale; revisit when volume justifies.

## Dependencies
None

## Open Questions
<!-- Unknowns or decisions to resolve before planning. Delete if none. -->
