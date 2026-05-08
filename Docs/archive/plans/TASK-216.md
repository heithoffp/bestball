<!-- Completed: 2026-05-08 | Commit: pending -->
# TASK-216: Decide and execute Firefox distribution strategy (AMO listed vs. unlisted self-distribution signing)

**Status:** Done
**Priority:** P2

---

## Objective
Choose between AMO listed distribution and unlisted self-distribution signing for the Firefox `.xpi`, document the decision in an ADR amendment or new ADR, and execute the chosen path so a Mozilla-signed `.xpi` is available before TASK-213 ships the `/install` page.

## Decision
**Unlisted self-distribution signing.** Rationale:
- ADR-005 already commits to a self-hosted, browser-detecting `/install` page. Public AMO discoverability adds zero funnel value when every Firefox user is routed through `/install` anyway.
- Unlisted goes through Mozilla's automated signing pipeline (typically minutes) with a much lighter human review than AMO listing — significantly lower risk of a "gambling" classification incident matching the Chrome Web Store rejection.
- Updates ride our self-hosted update manifest (already required by TASK-213 for Chromium), keeping a single update channel rather than splitting between AMO auto-update and self-host.
- AMO listing can still be pursued later if discoverability becomes valuable; unlisted does not foreclose that option.

## Verification Criteria
1. A decision record exists: either an amendment to ADR-005 or a new ADR documenting Firefox unlisted self-distribution as the chosen path, with rationale and rejected alternatives.
2. A Mozilla developer account (addons.mozilla.org) exists and is accessible.
3. A Firefox-compatible `manifest.json` variant exists (or the existing manifest is confirmed cross-browser compatible) with `browser_specific_settings.gecko.id` and `update_url` pointing to `https://bestballexposures.com/updates.json` (Firefox uses a JSON manifest, not Chromium's XML).
4. A signed `.xpi` is produced via `web-ext sign --channel=unlisted` and downloaded locally with a versioned filename matching the extension's `version` field.
5. Installing the signed `.xpi` in Firefox (drag onto `about:addons` or via direct URL) succeeds without "this add-on could not be verified" warnings.
6. The Firefox release process is documented in the existing extension build pipeline notes (parallel to TASK-215's Chromium pipeline) so future versions can be re-signed without re-discovering the steps.

## Verification Approach
1. **Automated checks:**
   - Confirm presence of ADR amendment or new ADR file.
   - Diff the Firefox manifest against the Chromium one and confirm `browser_specific_settings.gecko.id` and `update_url` are set.
   - Confirm the signed `.xpi` artifact lands at the expected path with the expected version in its filename.
2. **Manual steps the developer must perform** (Mozilla account creation and signing require interactive auth):
   - Create / log in to addons.mozilla.org developer account.
   - Generate API credentials (JWT issuer + secret) at https://addons.mozilla.org/developers/addon/api/key/.
   - Run `web-ext sign --api-key=... --api-secret=... --channel=unlisted` and report the output.
   - Drag the signed `.xpi` onto a real Firefox `about:addons` page and confirm install succeeds with no signing warning. Report observed behavior.
3. **Confirmation gate:** Verified=Yes only after the developer confirms the manual steps.

## Files to Change
| File | Action | Description |
|------|--------|-------------|
| `docs/adr/adr-005-self-host-the-chrome-extension-with-browser-detecting.md` | Modify | Append amendment confirming Firefox path = unlisted self-distribution; or create new ADR-006 if amendment is too large |
| `chrome-extension/manifest.firefox.json` (or `manifest.json`) | Create / Modify | Firefox-compatible manifest with `browser_specific_settings.gecko.id` and `update_url` for `updates.json` |
| `chrome-extension/build/` or equivalent build script | Modify | Add a Firefox build target that emits an `.xpi` (zipped extension dir, `.xpi` extension) alongside the existing `.crx` |
| `docs/extension-release.md` (or wherever TASK-215 documented the pipeline) | Modify | Add Firefox signing steps: `web-ext sign --channel=unlisted`, where credentials live, where signed `.xpi` is stored |
| `BACKLOG.md` | Modify | Status updates via `backlog.sh` |

## Implementation Approach
1. **Read TASK-215 artifacts** to understand the existing Chromium build/sign pipeline so the Firefox path mirrors its conventions (versioning, output paths, secret storage).
2. **Manifest preparation:**
   - Inspect current `chrome-extension/manifest.json`. Firefox supports MV3 but with caveats (background scripts behave differently). If the extension uses a service worker, add a Firefox-compatible event-page fallback under `browser_specific_settings`.
   - Add `browser_specific_settings.gecko.id` (e.g., `bbe-extension@bestballexposures.com`).
   - Add `browser_specific_settings.gecko.update_url` pointing to `https://bestballexposures.com/updates.json`.
   - Decide between (a) a single unified manifest if Firefox + Chromium can share it, or (b) a Firefox-specific manifest copied at build time. Option (a) preferred if feasible.
3. **Build the `.xpi`:** an `.xpi` is a ZIP of the extension directory renamed. Add a `build:firefox` script (or extend the existing build) that produces `bestballexposures-extension-<version>.xpi`.
4. **Sign via web-ext:**
   - Install `web-ext` as a dev dependency (`npm i -D web-ext`).
   - Developer obtains API credentials from AMO.
   - Developer runs `web-ext sign --source-dir=<built-dir> --api-key=$AMO_JWT_ISSUER --api-secret=$AMO_JWT_SECRET --channel=unlisted`.
   - Mozilla returns a signed `.xpi`. Store it alongside the `.crx` in the same versioned-artifacts location used by TASK-215.
5. **ADR update:** amend ADR-005 with a "Firefox distribution sub-decision" section documenting unlisted choice, rejected AMO listed alternative, and signing-key custody. (If amendment grows past ~30 lines, promote to ADR-006 instead.)
6. **Release docs:** add a Firefox section to the extension release pipeline doc covering the credential location, the sign command, where the artifact is stored, and how to test the signed `.xpi` locally.
7. **Out of scope (handed to TASK-213):** writing the `/install` page Firefox flow, hosting the `.xpi` on the public CDN URL, and authoring `updates.json`.

## Dependencies
None.

## Open Questions
- **Does the existing manifest use any Chromium-only APIs?** Confirmed during step 2 inspection; polyfill (`webextension-polyfill`) added if needed.
- **Single manifest vs. per-browser manifest at build time?** Default to single manifest if no incompatibilities surface.
- **AMO escalation if unlisted signing is denied:** Contingency only — fall back to AMO listed submission with the same artifact and accept the longer review timeline.

---
*Approved by: Patrick — 2026-05-08*
