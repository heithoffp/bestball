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

### Manifest `update_url` and Edge enablement friction (surfaced 2026-05-08)

During TASK-215 smoke testing, dragging the signed `bestballexposures-extension-1.0.4.crx` onto `edge://extensions` installed the extension but left the enable toggle grayed out, with the warning *"This extension is not from any known source, and may have been added without your knowledge."* No "Allow" or "Enable" button surfaced on the extension's details panel.

This contradicts ADR-005's "Edge: direct .crx link, one-click install via Edge's native handler." The ADR's claim needs to be tested empirically as part of this task — Edge may require additional manifest fields, registry/policy entries, or user actions that are not "one-click."

Things to investigate and resolve as part of TASK-213's plan:

1. **Add `"update_url": "https://bestballexposures.com/updates.xml"` to `manifest.json`.** Self-hosted Chromium extensions without an `update_url` are flagged as "unknown source" and disabled by default. This is also a hard requirement for self-hosted auto-update to function at all — `updates.xml` is meaningless if no installed extension is configured to poll it. Bump the extension version to 1.0.5 after this manifest change and produce a fresh signed CRX via the TASK-215 pipeline.
2. **Test the enable flow on Edge end-to-end** with the new manifest. Determine whether Edge still requires the user to click through a confirmation, what that confirmation looks like, and whether it's truly "one-click" or a multi-step acknowledgment. If multi-step, the `/install` page must walk Edge users through it explicitly — this is no longer a one-click flow.
3. **Test the same flow on Chrome** (drag-drop to `chrome://extensions` with Developer Mode on). Document the actual click count required.
4. **Revisit ADR-005's Edge claim** if testing shows the install is materially worse than promised. If Edge ends up at 3+ clicks, the ADR's "one-click Edge" alternative-considered framing was wrong, and the cost/benefit of self-hosting vs. other options shifts. May warrant a follow-up amendment to ADR-005 noting the actual install friction.

These decisions cannot be deferred — TASK-213 cannot ship without them. Capture them in the full plan when this task is started.
