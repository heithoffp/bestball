# TASK-223: Extension-driven update notifications (latest.json polling + UPD badge)

**Status:** Draft
**Priority:** P2

---

## Objective
Per ADR-007, Chromium-installed BBE extensions don't auto-update (load-unpacked has no update channel). Mitigation: extension background service worker polls https://bestballexposures.com/extension/latest.json on startup and ~once per day, compares the version field to chrome.runtime.getManifest().version, and when newer: sets a chrome.action 'UPD' badge and (on first detection per version) opens an /install#update page reusing the Chromium guided flow. Network-failure tolerant. Ship a release runbook step to keep latest.json in sync with each release. Runs uniformly on Chromium and Firefox as defense in depth even though Firefox already auto-updates.

## Dependencies
None

## Open Questions
<!-- Unknowns or decisions to resolve before planning. Delete if none. -->
