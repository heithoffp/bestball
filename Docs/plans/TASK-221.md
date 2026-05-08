# TASK-221: Audit and remediate innerHTML usage in extension content script (XSS hardening)

**Status:** Draft
**Priority:** P2

---

## Objective
Mozilla AMO validator flagged 5 unsafe innerHTML assignments in chrome-extension/src/content/content.js (visible in TASK-216 sign run on 2026-05-08, lines 1/21/53/60). These are in production content scripts that run on Underdog and DraftKings draft pages. Review each call site, replace with textContent or DOMPurify-sanitized assignment where dynamic content is involved. Warnings only today (do not block Firefox signing) but represent real security risk surface in third-party page contexts.

## Dependencies
None

## Open Questions
<!-- Unknowns or decisions to resolve before planning. Delete if none. -->
