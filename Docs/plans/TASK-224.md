# TASK-224: Pin Chromium extension ID by adding manifest.key field

**Status:** Draft
**Priority:** P2

---

## Objective
ADR-007 ships Chromium installs as ZIP + load-unpacked. Without a key field in manifest.json, Chromium derives the extension ID from the unpacked folder path — meaning if a user unzips a future release to a different path than their current install, Chromium treats it as a new extension and chrome.storage data does not carry over. Adding manifest.key (the public half of a generated keypair we control) pins the extension ID across all unpacked folder paths, making the TASK-223 update flow (re-run /install#update against the new zip) preserve user state reliably. Risk: choosing a key now is hard to reverse — every existing ~20 1.0.5 install would migrate to a new ID on the version that introduces the key, requiring a one-time TASK-218-style communication. Decision warrants an ADR. Deliverables: ADR for the key choice, generated keypair stored alongside the existing CRX signing key in the offline backup checklist, manifest.json updated with the key, /install#update copy updated to mention 'your settings move with you across versions', verify on Chrome and Edge that ID stays stable across folder paths.

## Dependencies
None

## Open Questions
<!-- Unknowns or decisions to resolve before planning. Delete if none. -->
