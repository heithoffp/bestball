# TASK-237: Risk note: iOS App Store rejection scenarios and fallbacks

**Status:** Draft
**Priority:** P1

---

## Objective
Short exploratory doc at docs/ios-app-store-risk.md covering: (a) probability/precedent for DFS-adjacent ReplayKit apps clearing App Store review; (b) framing mitigations (privacy policy stating on-device OCR only, no 'auto-pick' language, advisor-not-bot positioning); (c) fallback distribution options if rejected (TestFlight-only, Mac Catalyst, web-PWA degradation). Not an ADR - exploratory document. Addresses Tier-1 theme T11 / finding F-006: entire system viability hinges on a binary external decision with no Plan B currently modeled.

## Dependencies
None

## Open Questions
<!-- Unknowns or decisions to resolve before planning. Delete if none. -->
