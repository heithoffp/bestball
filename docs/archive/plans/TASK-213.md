<!-- Completed: 2026-05-08 | Commit: pending -->

# TASK-213: Implement self-hosted extension distribution with browser-detecting install flow

**Status:** Pending Approval (revised after ADR-007)
**Priority:** P1

---

## Plan revision history

- **v1 (approved 2026-05-08):** Chromium = signed `.crx` drag-drop with `update_url`-driven auto-update; Firefox = signed `.xpi`. Implemented and shipped to production.
- **v2 (this revision, 2026-05-08):** ADR-007 supersedes the Chromium portion. Empirical testing of v1 surfaced `CRX_REQUIRED_PROOF_MISSING` on Edge — Chromium policy fundamentally blocks consumer drag-drop install of self-hosted CRX. Chromium switches to ZIP + Developer Mode "Load unpacked." Firefox portion of v1 verified working in production (Firefox 1.0.5 install confirmed end-to-end) and is unchanged.

## Objective

Ship `/install` on BestBallExposures.com with a browser-detecting flow that delivers each user the install path their browser actually supports: signed `.xpi` for Firefox (one-click, auto-updates), and ZIP + load-unpacked for every Chromium browser (multi-step, no auto-update). Update CTAs across the dashboard and landing page to route through `/install`. Set up the static `latest.json` endpoint that TASK-223 will consume for update notifications.

## Verification Criteria

1. **Hosted artifacts under `/extension/`** — `https://bestballexposures.com/extension/bestballexposures-extension-1.0.5.xpi` returns 200 with `application/x-xpinstall`. `https://bestballexposures.com/extension/bestballexposures-extension-1.0.5.zip` returns 200 with `application/zip`. `https://bestballexposures.com/extension/updates.json` returns 200 with `application/json`. `https://bestballexposures.com/extension/latest.json` returns 200 with `application/json` and contains `{"version": "1.0.5"}` plus the install URLs (see Implementation Approach for shape).
2. **Chromium `.crx` and `updates.xml` removed.** Per ADR-007, `bestballexposures-extension-1.0.5.crx` and `updates.xml` no longer exist under `/extension/` — they were broken and hosting them was misleading. Old 1.0.3 zip remains removed.
3. **Firefox install flow works end-to-end.** *Already verified in v1 production testing* — confirmed installs without "could not be verified" warning; extension version reads `1.0.5` in `about:addons`. Re-verification only needed if anything in the Firefox sub-view of `/install` changes.
4. **Chromium install flow works end-to-end.** Following the on-screen guided steps in Chrome (Developer Mode off as starting state), the user can complete a full install: download `.zip` → unzip → open `chrome://extensions` → toggle Developer Mode → click **Load unpacked** → select unzipped folder → see extension at version `1.0.5`. Same flow works on Edge against `edge://extensions`. Click count + any unexpected friction documented in this plan post-test.
5. **`/install` routes correctly per browser.** Chrome / Edge / Brave / Arc → Chromium guided ZIP + load-unpacked sub-view (single unified sub-view; no Edge-specific shortcut since Edge has no advantage here). Firefox → one-click `.xpi` button. Safari / mobile / unknown → "desktop browser required" message. Transparency note on every variant. `/install#update` (hash-targeted variant for the future TASK-223 update-notification deeplink) renders the user's-browser sub-view with an "It's time to update — your installed version is older than the latest" banner above the steps; the banner is silent (not rendered) when there is no `#update` hash.
6. **CTAs across the app point at `/install`.** Dashboard empty-state CTAs, LandingPage `EXTENSION_URL`, demo banner, and the header `InstallExtensionButton` all link to `/install`. (Already done in v1 — verification is a re-grep to confirm no Web Store URLs remain in `Dashboard.jsx`, `LandingPage.jsx`, `App.jsx`, `InstallExtensionButton.jsx`.)
7. **`RELEASE.md` reflects ADR-007 publishing flow.** Runbook documents: copy `.zip` (Chromium) and `.xpi` (Firefox) to `public/extension/`, regenerate `updates.json` (Firefox auto-update, with new sha256), regenerate `latest.json` (TASK-223 mitigation channel). The `.crx` + `updates.xml` step from v1 is removed.

## Verification Approach

**Automated (Claude runs):**

- `cd best-ball-manager && npm run lint && npm run build` — must pass.
- `npm run dev`, then curl each artifact URL under `/extension/` (`bestballexposures-extension-1.0.5.zip`, `bestballexposures-extension-1.0.5.xpi`, `updates.json`, `latest.json`) — expect 200 with non-`text/html` content-type. `bestballexposures-extension-1.0.5.crx` and `updates.xml` should return 404 in production (after the Vercel deploy).
- After Vercel deploy: `curl -I` against the four production URLs above to confirm 200 + correct content-types. `curl -I` against the removed `.crx` / `updates.xml` URLs to confirm 404.
- `grep -rn "chromewebstore.google.com\|cnljeadelfnabalcdongglhfhiceakaj" best-ball-manager/src` — should return no hits except in `llms-full.txt` / `llms.txt` if those still mention it (those are TASK-214 scope).

**Manual — requires the developer:**

1. **Firefox** (already done in v1 testing) — re-confirm the Firefox sub-view still renders correctly after this revision's UI changes; smoke-test install only if the Firefox view itself is touched.
2. **Chrome ZIP + load-unpacked.** Fresh Chrome profile, navigate to production `/install`, follow the on-screen 6-step flow as a first-time user. Record the click count, any friction (e.g., does the OS unzip the file automatically when downloaded? Does Chrome warn about the download? Does selecting the *outer* folder give the standard "manifest file is missing" error?). Verify extension installs and version reads `1.0.5` in `chrome://extensions`.
3. **Edge ZIP + load-unpacked.** Same as Chrome but on `edge://extensions`. Verify Edge does not surface the `CRX_REQUIRED_PROOF_MISSING` error path (it shouldn't — we no longer offer a `.crx`).
4. **`/install#update` deeplink.** Visit `/install#update` directly. Confirm the "your installed version is older than the latest" banner renders. (TASK-223 will exercise this from the extension; this verification confirms the banner exists for that future use.)
5. **Unsupported browsers.** Open `/install` in Safari (or with a Safari user-agent override) and on a mobile browser. Confirm the unsupported message renders.

If Chrome's ZIP unzip + load-unpacked flow has any friction we did not anticipate (e.g., automatic unzip on macOS giving a pre-unzipped folder, or Edge's "Load unpacked" file picker behaving differently from Chrome's), update the on-screen copy and screenshots before marking the task Verified.

## Files to Change

| File | Action | Description |
|------|--------|-------------|
| `best-ball-manager/public/extension/bestballexposures-extension-1.0.5.crx` | Delete | Per ADR-007, no longer a viable distribution artifact for Chromium |
| `best-ball-manager/public/extension/updates.xml` | Delete | Auto-update for Chromium is dead per ADR-007 |
| `best-ball-manager/public/extension/bestballexposures-extension-1.0.5.zip` | Create | Copy from `chrome-extension/releases/` (already exists from the v1 release pipeline run) |
| `best-ball-manager/public/extension/latest.json` | Create | `{ "version": "1.0.5", "released": "2026-05-08", "install_url": "https://bestballexposures.com/install", "chromium_zip": "https://bestballexposures.com/extension/bestballexposures-extension-1.0.5.zip", "firefox_xpi": "https://bestballexposures.com/extension/bestballexposures-extension-1.0.5.xpi" }` — TASK-223 polls this. |
| `best-ball-manager/src/components/InstallPage.jsx` | Modify | Replace Chromium drag-drop sub-view with the ZIP + load-unpacked guided 6-step flow. Merge the previously-separate Chrome and Edge sub-views into a single Chromium sub-view (since both have identical install paths now). Add the `/install#update` banner. Update the transparency note copy to reflect the actual reason (Chromium policy blocks self-hosted CRX) without going into VerifyCrx3 detail. |
| `best-ball-manager/src/components/InstallPage.module.css` | Modify | Add styling for the update banner. Existing styles for guided-step layout reused. |
| `best-ball-manager/src/utils/browserDetect.js` | Modify | Collapse `chrome` and `edge` callers down to a shared `chromium` flow — keep the discriminator for analytics/copy hints, but routing logic in `InstallPage.jsx` no longer differentiates them. |
| `chrome-extension/RELEASE.md` | Modify | Replace the v1 publish-to-bestballexposures.com section with the ADR-007 layout: `.zip` + `.xpi` + `updates.json` + `latest.json`. Drop `.crx` + `updates.xml` steps. |

## Implementation Approach

### Step 1 — Strip dead Chromium artifacts

Remove `best-ball-manager/public/extension/bestballexposures-extension-1.0.5.crx` and `updates.xml`. Both are misleading hosted artifacts that don't function for any consumer browser per ADR-007.

### Step 2 — Add ZIP and `latest.json` to hosting

Copy `chrome-extension/releases/bestballexposures-extension-1.0.5.zip` (produced by the v1 release pipeline run; already on disk) to `best-ball-manager/public/extension/`.

Create `best-ball-manager/public/extension/latest.json`:

```json
{
  "version": "1.0.5",
  "released": "2026-05-08",
  "install_url": "https://bestballexposures.com/install",
  "chromium_zip": "https://bestballexposures.com/extension/bestballexposures-extension-1.0.5.zip",
  "firefox_xpi": "https://bestballexposures.com/extension/bestballexposures-extension-1.0.5.xpi"
}
```

This is the contract TASK-223's background-worker poller reads. Schema is intentionally small — adding fields later is non-breaking; renaming fields is.

### Step 3 — Rewrite the Chromium sub-view in `InstallPage.jsx`

Collapse the existing `<ChromeGuidedView />` and `<EdgeView />` into a single `<ChromiumView />`:

```
1. Download the extension
   [Download .zip (1.0.5) — gold button]
   "After download, unzip the file. On Mac the OS unzips automatically — note the folder it left behind."
2. Unzip the file (if it didn't unzip on its own)
   "You should end up with a folder named bestballexposures-extension-1.0.5/ containing manifest.json and other files."
3. Open your browser's extensions page
   [chrome://extensions]   [Copy] — code block with copy button (existing pattern)
   "Edge users: paste edge://extensions instead."
4. Turn on Developer mode
   "Toggle in the top-right of the extensions page. Don't worry about the warning that appears — Developer mode is required for any self-hosted extension."
5. Click "Load unpacked"
   "Button appears in the top-left after Developer mode is on."
6. Select the unzipped folder
   "Pick the folder you got from step 2 (the inner folder containing manifest.json, not the outer download folder)."
```

Detection: `detectBrowser()` returns `chrome` / `edge` / `chromium-other` — all three render `<ChromiumView />`. The discriminator is preserved for two reasons: (a) future analytics on per-browser conversion, (b) potential copy hints (e.g., "Edge users…" line above) that key off the result.

Update the transparency `<details>` copy:

> Best Ball Exposures was rejected from the Chrome Web Store under a policy classification we disagree with. Chrome and Edge block one-click installs of extensions hosted outside the Web Store, so the install is a few extra steps. The extension itself is identical to what we'd ship to the Web Store.

(No mention of `VerifyCrx3` or `CRX_REQUIRED_PROOF_MISSING` — that's developer-internal detail.)

### Step 4 — `/install#update` banner

Read `window.location.hash` once on mount. When it equals `#update`, render a banner above the per-browser sub-view:

```
[Info icon] It's time to update Best Ball Exposures
Your installed version is older than the latest. Follow the steps below to install the new version on top of your existing one.
```

The banner is silent (not rendered) when no `#update` hash. This is the deeplink target TASK-223 will direct outdated users to via the background-worker notification.

Below the steps for the Chromium sub-view, when `#update` is present, also surface a brief "do I need to remove the old version first?" line: *"No. Loading the new unpacked folder replaces the old one — your saved settings stay put."* (Chromium re-uses the extension ID derived from the manifest's `key`/folder, so reloading from a different unzipped folder of the same extension overwrites cleanly. We have no `key` field, so this isn't strictly true across folder paths — flag for testing during Step 5 and adjust copy if Chromium treats the new folder as a fresh extension.)

### Step 5 — Browser detection collapse

In `browserDetect.js`, no API changes — return values stay the same. Callers in `InstallPage.jsx` consolidate:

```js
const chromium = ['chrome', 'edge', 'chromium-other'].includes(browser);
```

This is the only routing change. The discriminator is preserved.

### Step 6 — `RELEASE.md` update

Replace the "Publishing to bestballexposures.com" section authored in v1 with the ADR-007 layout:

| File | Source |
|------|--------|
| `bestballexposures-extension-<version>.zip` | Copy from `chrome-extension/releases/` |
| `bestballexposures-extension-<version>.xpi` | Copy from `chrome-extension/releases/` |
| `updates.json` | Firefox auto-update — append new entry to `addons["bbe-extension@bestballexposures.com"].updates[]` with new version, `update_link`, `update_hash` |
| `latest.json` | Bump `version` field; update both URLs to point at the new artifacts |

Drop `.crx` and `updates.xml` from the table. Note explicitly: "Chromium auto-update is no longer in scope — see ADR-007."

### Step 7 — Empirical testing

Manual verification per the table above. Specifically watch for:
- Edge "Load unpacked" file picker behavior — does it match Chrome's? Document if not.
- Chromium's "do I need to remove the old version first" reload behavior — confirm the copy in Step 4's banner is accurate, or update if folder-swapping creates a new extension ID.
- The Chrome download warning ("file is not commonly downloaded") on `.zip` files — current Chrome may or may not warn on `.zip`; document and adjust the copy if needed.

If anything in Chromium reality differs from what the on-screen copy claims, fix the copy before marking the task Verified.

## Dependencies

- ADR-007 (Accepted) — provides the strategy decision this plan implements.
- ADR-006 (Firefox unlisted self-distribution signing) — provides the Firefox path which is unchanged from v1.
- TASK-215 (extension build/release pipeline) — produces the `.zip` referenced here.
- TASK-216 (Firefox unlisted signing) — produces the `.xpi`.

## Risks and Open Questions

- **Folder-swap reload behavior on Chromium.** Without a `key` field in the manifest, Chrome derives the extension ID from the unpacked folder's path. If the user unpacks the new release to a different path than the old one, Chrome treats it as a new extension. Confirm this empirically during Step 7 and update the update-flow copy accordingly. If folder-swap reload is broken, an additional "Remove the old version first" step is required for the `#update` flow — add it then.
- **Chrome "potentially harmful download" warning on `.zip`.** Chrome sometimes warns on `.zip` downloads from non-commonly-downloaded sources. If observed, document the override ("click Keep") in the on-screen copy.
- **macOS auto-unzip.** macOS Safari auto-unzips `.zip` downloads by default (Chrome may or may not, depending on version and settings). Step 2 of the guided flow needs to handle both "you have a .zip — unzip it" and "you have an already-unzipped folder — use that." Current copy attempts both — refine after macOS Chrome testing.
- **Stale 1.0.4 installs in the wild.** ~20 users on 1.0.4 today. They installed via the old `InstallExtensionButton` modal flow (1.0.3 zip + load-unpacked). Once we ship 1.0.5 hosting + TASK-223, those users will get the update notification and follow the new `/install#update` flow. No special migration is needed beyond TASK-218 communication.
- **Install-funnel analytics** remain deferred to TASK-219.
- **Comprehensive Web Store link sweep** remains TASK-214 scope; this revision does not expand it.

---

> Please review and reply **approved** to proceed, or provide feedback to revise.

*Approved by: Patrick — 2026-05-08 (v1 plan, before ADR-007 revision)*
