# ADR-007: Chromium distribution via ZIP + load-unpacked, with extension-driven update notifications

**Date:** 2026-05-08
**Status:** Accepted

---

## Context

[ADR-005](adr-005-self-host-the-chrome-extension-with-browser-detecting.md) (Accepted 2026-05-08) committed to self-hosting the BBE extension on bestballexposures.com with a browser-detecting install flow that included **Edge "one-click `.crx` install"** and **Chrome "guided 4-step drag-drop"**, plus self-hosted auto-update via `updates.xml`. Empirical testing during TASK-213 verification has shown those Chromium claims are wrong.

**Empirical finding.** Dragging signed BBE 1.0.5 `.crx` onto `edge://extensions` returned `"Package is invalid: 'CRX_REQUIRED_PROOF_MISSING'"`. Two independent sources confirmed this is Chromium policy, not a manifest issue:

- Plasmo's deep-dive on the error: drag-drop CRX on `chrome://extensions` runs `VerifyCrx3`, which requires *either* a Chrome Web Store publisher proof embedded in the CRX *or* enterprise policy (`ExtensionInstallAllowlist` + `ExtensionInstallSources`, configured as **Mandatory** not Recommended). No manifest field, no signing-key trick, no MIME-type fix bypasses this.
- Microsoft Learn's self-host troubleshooting docs route the same error to enterprise policy configuration. No consumer path is offered.

This invalidates three of ADR-005's four browser flows:

1. `.crx` self-distribution for Chromium consumers is fundamentally blocked. We cannot produce a CRX with a Web Store proof — the Web Store rejected us (per ADR-005's context).
2. The same `VerifyCrx3` check fires on every update polled via `update_url`, so self-hosted auto-update via `updates.xml` is also dead for Chromium.
3. Firefox is unaffected — separate Mozilla signing pipeline. The signed `.xpi` shipped per [ADR-006](adr-006-use-unlisted-self-distribution-signing-for-the-firefox.md) installs and runs correctly on Firefox 1.0.5 (confirmed during TASK-213 verification).

**Constraints shaping the new decision:**
- Web Store distribution is permanently denied (ADR-005).
- Enterprise policy (registry/GPO) is not a viable consumer-distribution path.
- Audience is overwhelmingly Chromium-based (Chrome dominant, Edge significant). Cutting Chromium kills the product.
- Firefox path works and should remain unchanged (per ADR-006).
- ~20 installed users today, scaling toward 500 subs by NFL 2026 — decisions made now must remain workable through that growth.

## Decision

Distribute on Chromium browsers via **ZIP + Developer Mode "Load unpacked"**:

- `/install` Chromium sub-view serves a downloadable `.zip` (the unsigned source bundle the existing release pipeline already produces).
- Guided multi-step flow: download → unzip → open `chrome://extensions` (or `edge://extensions`) → toggle Developer Mode → click **Load unpacked** → select the unzipped folder.
- No self-hosted auto-update on Chromium — load-unpacked extensions don't auto-update.

**Mitigation: extension-driven update notifications** as a substitute for the lost Chromium auto-update channel:

- Background service worker polls a static `https://bestballexposures.com/extension/latest.json` (we already host extension files there; one more file is trivial).
- Compares `latest.json`'s `version` field to `chrome.runtime.getManifest().version`.
- When a newer version exists: set a `chrome.action` badge ("UPD") and (on first detection per version) open a "new version available — here's how to update" page that reuses `/install`'s Chromium guided flow.
- Polls on extension startup and ~once per day. Network-failure tolerant — silent retry next cycle, no user-facing error.
- Implementation runs uniformly on Chromium and Firefox — defense in depth, even though Firefox already auto-updates from `updates.json`.

Firefox distribution unchanged: signed `.xpi` via Mozilla unlisted self-distribution signing per ADR-006, with self-hosted `updates.json` driving auto-update.

## Alternatives Considered

### Option A: ZIP + load-unpacked + extension-driven update notifications (chosen)
- **Pros:** Works for every Chromium browser, no enterprise policy required, no Web Store dependency. Update-notification fills the auto-update gap to the extent possible. Single uniform path for Chrome / Edge / Brave / Arc / Vivaldi / Opera. Cheap to operate (one static `latest.json` + small extension code).
- **Cons:** Multi-step install (5–6 user actions). Persistent "Developer mode" warning banner in Chrome — mild but real friction. No silent auto-update — user must repeat install on each release. Some users will balk at "Developer Mode."

### Option B: Continue trying to make `.crx` work
- **Pros:** Would preserve the ADR-005 vision if it could be salvaged.
- **Cons:** Empirically blocked by Chromium policy. No manifest-level workaround exists. Investing more time here is sunk-cost.

### Option C: Web Store re-application under a new account / rebrand (re-evaluation of ADR-005's Option C)
- **Pros:** Restores the most seamless install path if successful.
- **Cons:** Same risks ADR-005 already enumerated (account linking, gambling-classification re-trigger). Doesn't change the underlying policy that flagged best-ball as gambling. Slow (review timelines) and high-risk.

### Option D: CSV/clipboard import flow as primary roster-sync (re-evaluation of ADR-005's Option D)
- **Pros:** Eliminates extension dependency entirely. Immune to browser policy.
- **Cons:** Kills Draft Assistant entirely, materially worse onboarding UX, breaks "zero-config insights" principle. Forces a much larger product-strategy pivot — not warranted by install friction alone.

### Option E: Native installer (NSIS/MSI on Windows) that registers the extension via local enterprise policy
- **Pros:** Could yield a true one-click install on Windows.
- **Cons:** Windows-only (cuts Mac users entirely). Requires building, signing, and distributing an installer per OS. Enterprise policy paths are unstable across browser updates. Adds a code-signing certificate as a new operational dependency. Disproportionate cost for an audience already comfortable with manual extension installs.

### Option F: Web app banner via `externally_connectable` messaging (in lieu of in-extension update notifications)
- **Pros:** Branded in-dashboard "update available" banner.
- **Cons:** Only fires when user is on bestballexposures.com. Chromium-only — Firefox handles cross-origin messaging differently. Doesn't help when user is mid-draft on Underdog/DraftKings. Better as an optional layer *on top of* Option A's in-extension notification, not a substitute.

## Consequences

### Positive
- Working Chromium install path we control end-to-end — no dependency on Web Store policy, enterprise policy, or signing ceremonies we don't already perform.
- Update notifications keep installed users from drifting onto stale versions — partially compensates for the lost auto-update channel.
- A single static `latest.json` becomes the canonical "what's the latest BBE version" endpoint, useful beyond the extension (marketing, support).
- Reversible: if Chrome ever loosens drag-drop CRX policy or a Web Store path opens up, we can reintroduce `.crx` without retracting ADR-007.

### Negative
- Chromium onboarding is materially worse than ADR-005's stated 4-step drag-drop. Realistically 6 steps including unzip and "Load unpacked" file-picker. Conversion drop will be larger than ADR-005 estimated.
- Persistent Chromium "Developer mode" warning is a brand-trust irritation we cannot remove.
- Each release requires every Chromium user to manually re-install. Release cadence pressure increases — each release is a tax on every installed user, not just a download — suggesting we should batch fixes more aggressively than we would with auto-update.
- "Update available" notification adds new code paths in the extension (network call from background, badge state, notification-permission interactions) — small but real surface area.

### Risks
- **Chromium tightening Developer Mode further.** Google has periodically signaled they would like to retire Manifest V2 and load-unpacked. If load-unpacked is removed or further gated, we lose this path with no backup. Revisit if Google publishes a deprecation timeline.
- **Notification fatigue.** A poorly tuned "UPD" badge that fires too aggressively will train users to ignore it. Mitigate with a sensible polling cadence and clear copy on the update-instructions page.
- **`latest.json` as production dependency.** If Vercel serves stale `latest.json` (or it's misconfigured during a release), users may believe they're up-to-date when they aren't. Treat `latest.json` updates as part of the release runbook check.
- **Chromium update-notification UX is intrinsically inferior to true auto-update.** Some users will simply not update; we will support installed-version fragmentation we did not have to support with the Web Store.

## Revisit Conditions

- If Chrome introduces a policy-free CRX install path for self-hosted extensions.
- If a credible Web Store re-submission path opens (different platform support pivot, or a Mozilla-style policy change at Google).
- If Chromium removes Developer Mode load-unpacked — ADR-007 is no longer viable and we must choose between ADR-005's Option D and a new option.
- If installed-version fragmentation in production (visible via `latest.json` telemetry, once added) shows >25% of users running a release older than current-minus-one — indicating the notification UX needs strengthening or the strategy needs revisiting.

## Related

- **ADR-005** (self-host the Chrome extension) — left at `Accepted` per developer decision. ADR-005's "Edge: direct `.crx`, one-click install", "Chrome guided 4-step drag-drop", and "self-hosted `updates.xml` so installed extensions auto-update" claims are no longer in force for Chromium; ADR-007 takes precedence on the Chromium distribution path. Firefox portion of ADR-005 remains valid as written.
- **ADR-006** (Firefox unlisted self-distribution signing) — unchanged. Firefox is the only browser where ADR-005 + ADR-006 still operate as originally intended.
- **TASK-213** (in flight) — plan must be revised to use ZIP + load-unpacked for Chromium and drop the `.crx` hosting/auto-update verification criteria for Chromium. Firefox portion remains valid.
- **TASK-NNN** (to be added via hus-backlog after this ADR is accepted) — implement extension-driven update notifications (this ADR's mitigation).

---

*Approved by: Patrick — 2026-05-08*
