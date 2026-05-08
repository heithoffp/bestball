# TASK-213: Implement self-hosted extension distribution with browser-detecting install flow

**Status:** Approved
**Priority:** P1

---

## Objective

Ship `/install` on BestBallExposures.com so users on Chrome, Edge, Firefox, and other Chromium browsers can install the BBE extension directly from our domain. Wire `.crx` and `.xpi` binaries plus self-hosted update manifests into Vercel static hosting so installed extensions auto-update without Web Store involvement. Resolve the open Edge "unknown source" friction by adding a Chromium `update_url` to the manifest. Goal is the most seamless flow each browser allows — true one-click on Edge/Firefox, polished guided 4-step on Chrome/Chromium.

## Verification Criteria

1. **Manifest + 1.0.5 release exists.** `chrome-extension/manifest.json` carries top-level `"update_url": "https://bestballexposures.com/updates.xml"` (in addition to the existing `gecko.update_url`). Version is `1.0.5` in `manifest.json`, `package.json`, and `CHANGELOG.md`. `chrome-extension/releases/` contains signed `bestballexposures-extension-1.0.5.crx`, signed `bestballexposures-extension-1.0.5.xpi`, and `updates-1.0.5.xml`.
2. **Hosted artifacts land in production.** `https://bestballexposures.com/extension/bestballexposures-extension-1.0.5.crx`, `.../bestballexposures-extension-1.0.5.xpi`, `.../updates.xml`, and `.../updates.json` all return 200 with the expected MIME types (`application/x-chrome-extension`, `application/x-xpinstall`, `application/xml`, `application/json`). The stale `bestballexposures-extension-1.0.3.zip` is removed from `public/extension/`.
3. **Edge install no longer grays out.** Dragging the 1.0.5 `.crx` onto `edge://extensions` produces an enable toggle that is *not* grayed out as "unknown source." Click count from drag-drop to installed-and-enabled is recorded in the plan's testing notes.
4. **Chrome guided flow works end-to-end.** A new user following the 4 on-screen steps at `/install` (in Chrome with Developer Mode off as the starting state) successfully installs 1.0.5 with no off-screen tribal knowledge required. Click count + any "Keep" override on the download warning is documented.
5. **Firefox one-click install works.** Opening the 1.0.5 `.xpi` in Firefox produces the standard Mozilla install confirmation (no "this add-on could not be verified" warning), and the extension installs and runs after a single confirmation click.
6. **Auto-update works from self-hosted manifests.** With 1.0.5 installed, publishing a 1.0.6 build to `public/extension/` and updating `updates.xml`/`updates.json` causes both Chromium ("Update" button on `chrome://extensions`) and Firefox (`about:addons` → check for updates) to pick up 1.0.6.
7. **`/install` route renders correctly per browser.** The page is reachable at `/install`, detects Chrome / Edge / Brave / Arc / Firefox / Safari / mobile / unknown, renders the matching sub-view, and exposes the transparency note ("Why isn't this on the Chrome Web Store?") as an expandable section. The Dashboard and LandingPage primary "Install Extension" CTA points at `/install` instead of the Web Store URL.
8. **No SPA-rewrite regression.** `vercel.json` does not 200-with-`index.html` for any URL under `/extension/` — file extensions `.crx`, `.xpi`, `.xml`, `.json` are served as their actual content.

## Verification Approach

The criteria split into automated checks Claude can run and manual install testing the developer must perform on real browsers.

**Automated (Claude runs and reports output):**

- `cd chrome-extension && npm run release:dry -- --version=1.0.5` — confirms manifest update_url is in place and signing key still matches the declared extension ID. Expected: dry-run completes without the "verifying signing key matches declared extension ID" failure mode from RELEASE.md.
- `cd chrome-extension && npm run release -- --version=1.0.5` — produces the signed `.crx`, `updates-1.0.5.xml`, and `.zip` in `releases/`. Expected exit 0 and the three artifacts present.
- `cd chrome-extension && npm run sign:firefox` — produces the signed `.xpi`. Expected exit 0 and a renamed `bestballexposures-extension-1.0.5.xpi` in `releases/`.
- `cd best-ball-manager && npm run build` — confirms the new `/install` route compiles and the production bundle includes `InstallPage.jsx`.
- `cd best-ball-manager && npm run lint` — must pass.
- `cd best-ball-manager && npm run dev`, then curl `http://localhost:5173/extension/bestballexposures-extension-1.0.5.crx -I` and the `.xpi`, `updates.xml`, `updates.json` URLs. Expected: 200 with non-`text/html` content-type for each. This is the local proxy for the `vercel.json` SPA-rewrite check before deploy.
- After Vercel deploy: `curl -I https://bestballexposures.com/extension/bestballexposures-extension-1.0.5.crx` (and the other three artifact URLs) — expected 200 with correct content-types.

**Manual — requires the developer (browser install flows cannot be automated by Claude):**

1. **Edge install.** Open `edge://extensions`, enable Developer Mode, drag `bestballexposures-extension-1.0.5.crx` onto the page. Confirm: enable toggle is *not* grayed out, no "unknown source / may have been added without your knowledge" warning. Record the exact click count from drag to enabled-and-running. Report findings — the `/install` Edge sub-view copy must match reality.
2. **Chrome install.** In a fresh Chrome profile (or after removing any existing BBE extension), navigate to the production `/install` page. Follow the 4 on-screen steps as a first-time user would. Record click count, note any download-warning ("Keep" / "Discard") behavior, and confirm the extension is installed and active afterward.
3. **Firefox install.** In Firefox, navigate to `/install`, click the Firefox install button. Confirm Mozilla's standard signed-extension confirmation appears (not the "could not be verified" warning), accept, confirm extension is active in `about:addons`.
4. **Auto-update test.** Bump to 1.0.6 in a throwaway branch, run the release pipeline, push only the new artifacts + updated `updates.xml`/`updates.json` to Vercel, force "check for updates" on each browser, confirm 1.0.6 is picked up.
5. **Unsupported-browser sub-view.** Visit `/install` on Safari (or with a Safari user-agent override) and on a mobile browser. Confirm the unsupported-browser message renders with desktop-browser recommendation and a link back to the dashboard.

**Iteration expected.** If Edge still surfaces an "unknown source" warning after the manifest fix, investigate whether additional manifest fields (e.g., `key` field, web_accessible_resources adjustments) or a registry/policy entry is needed, and update the plan with findings before continuing. If Edge cannot be made truly one-click, update the Edge sub-view copy on `/install` to reflect the actual click sequence and file an ADR-005 amendment per the original draft's Open Question step 4.

## Files to Change

| File | Action | Description |
|------|--------|-------------|
| `chrome-extension/manifest.json` | Modify | Add top-level `update_url` (Chromium auto-update); bump `version` to `1.0.5` |
| `chrome-extension/package.json` | Modify | Bump `version` to `1.0.5` |
| `chrome-extension/CHANGELOG.md` | Modify | Add `1.0.5` entry — "Adds Chromium self-hosted auto-update via update_url; fixes Edge 'unknown source' install warning" |
| `chrome-extension/releases/bestballexposures-extension-1.0.5.crx` | Create | Output of `npm run release` |
| `chrome-extension/releases/bestballexposures-extension-1.0.5.xpi` | Create | Output of `npm run sign:firefox`, renamed from web-ext default |
| `chrome-extension/releases/updates-1.0.5.xml` | Create | Output of `npm run release` |
| `chrome-extension/releases/bestballexposures-extension-1.0.5.zip` | Create | Output of `npm run release` |
| `best-ball-manager/public/extension/bestballexposures-extension-1.0.5.crx` | Create | Copy from `chrome-extension/releases/` |
| `best-ball-manager/public/extension/bestballexposures-extension-1.0.5.xpi` | Create | Copy from `chrome-extension/releases/` |
| `best-ball-manager/public/extension/updates.xml` | Create | Chromium update manifest pointing at the hosted `.crx` |
| `best-ball-manager/public/extension/updates.json` | Create | Firefox update manifest pointing at the hosted `.xpi` (with signed hash) |
| `best-ball-manager/public/extension/bestballexposures-extension-1.0.3.zip` | Delete | Stale artifact from before self-host distribution |
| `best-ball-manager/vercel.json` | Modify | Add explicit rewrite exclusion or static-asset rule for `/extension/(.*)` if local SPA-rewrite test shows binaries are caught by the catch-all |
| `best-ball-manager/src/App.jsx` | Modify | Add `<Route path="/install" element={<InstallPage />} />` |
| `best-ball-manager/src/components/InstallPage.jsx` | Create | Browser-detecting install flow (Chrome guided, Edge/Firefox direct, Safari/mobile unsupported, transparency note) |
| `best-ball-manager/src/components/InstallPage.module.css` | Create | Styles per project convention |
| `best-ball-manager/src/utils/browserDetect.js` | Create | UA + `navigator.userAgentData` parsing → `'chrome' \| 'edge' \| 'chromium-other' \| 'firefox' \| 'safari' \| 'mobile' \| 'unknown'` |
| `best-ball-manager/src/components/Dashboard.jsx` | Modify | Replace direct Web Store CTA with `/install` link |
| `best-ball-manager/src/components/LandingPage.jsx` | Modify | Replace direct Web Store CTA with `/install` link |
| `best-ball-manager/public/screenshots/install-chrome-step{1..4}.png` | Create | Screenshots for the Chrome guided 4-step flow (taken from a real Chrome install) |

## Implementation Approach

### Step 1 — Manifest fix and 1.0.5 release

Edit `chrome-extension/manifest.json` to add `"update_url": "https://bestballexposures.com/updates.xml"` at the top level (sibling to `manifest_version`, `name`, `version`). Chrome reads this to poll for updates; Firefox ignores top-level `update_url` and uses `browser_specific_settings.gecko.update_url` (already present).

Bump `version` to `1.0.5` in `manifest.json` and `package.json`. Add a `CHANGELOG.md` entry. From `chrome-extension/`:

```
npm run release:dry -- --version=1.0.5     # sanity-check key + manifest
npm run release -- --version=1.0.5         # produces signed .crx, updates-1.0.5.xml, .zip
npm run sign:firefox                       # produces signed .xpi
```

Rename the web-ext output to `bestballexposures-extension-1.0.5.xpi`.

### Step 2 — Hosting layout

Copy the four production artifacts into `best-ball-manager/public/extension/`:

- `bestballexposures-extension-1.0.5.crx`
- `bestballexposures-extension-1.0.5.xpi`
- `updates.xml` — built from `updates-1.0.5.xml` content. Chromium spec: a `<gupdate>` element with `<app appid="<extension-id>"><updatecheck codebase="https://bestballexposures.com/extension/bestballexposures-extension-1.0.5.crx" version="1.0.5"/></app>`. Future releases append/replace the version + codebase; this file is the manifest the browser polls.
- `updates.json` — Firefox AMO unlisted spec: `{ "addons": { "bbe-extension@bestballexposures.com": { "updates": [ { "version": "1.0.5", "update_link": "https://bestballexposures.com/extension/bestballexposures-extension-1.0.5.xpi", "update_hash": "sha256:<sha256 of the .xpi>" } ] } } }`. Compute the sha256 with PowerShell `Get-FileHash` or `openssl dgst -sha256`.

Delete `bestballexposures-extension-1.0.3.zip`.

Run `npm run dev` and curl `http://localhost:5173/extension/...` for each artifact. If any returns `text/html` (i.e., the SPA rewrite caught it), update `vercel.json`:

```json
"rewrites": [
  { "source": "/extension/(.*)", "destination": "/extension/$1" },
  { "source": "/(.*)", "destination": "/index.html" }
]
```

(Vercel matches rewrites in order; the `/extension/(.*)` identity rewrite short-circuits the catch-all.) Vite's dev server doesn't apply `vercel.json` rewrites, so the local check is necessary but not sufficient — re-verify on a Vercel preview deploy.

### Step 3 — `/install` page

`utils/browserDetect.js` exports `detectBrowser()`:

1. If `navigator.userAgentData?.brands` is available, look for `"Microsoft Edge"`, `"Google Chrome"`, `"Chromium"`. Edge announces both `"Microsoft Edge"` and `"Chromium"` — match Edge first.
2. Fallback to UA string: `/Edg\//` → edge, `/Chrome\//` AND not Edge → chrome (further refine with `navigator.brave` for Brave; treat Brave/Arc/Vivaldi/Opera as `chromium-other`), `/Firefox\//` → firefox, `/Safari\//` AND not Chromium → safari.
3. Mobile detection: `/Android|iPhone|iPad|iPod/i.test(ua)` → mobile (regardless of engine — even Chrome on Android can't drag-drop install).
4. Default → unknown.

Brave is identified by `navigator.brave?.isBrave?.()`; Arc by UA `/Arc\//` plus rendering hints; both fall into `chromium-other` and use the Chrome guided flow. Edge is the only Chromium variant we trust to give a smoother flow.

`InstallPage.jsx` renders a hero ("Install Best Ball Exposures") plus a sub-view chosen by `detectBrowser()`:

- **Chrome / chromium-other:** Numbered 4-step card with a screenshot per step. Step 1 has a primary download button → `/extension/bestballexposures-extension-1.0.5.crx`. Step 2 shows `chrome://extensions` in a copyable code block (chrome:// URLs cannot be linked from web content — the user must paste it). Step 3 shows the Developer Mode toggle in screenshot form. Step 4 instructs drag-drop and includes the "click Keep if Chrome warns about the download" override note. Below the steps, a callout: "Already installed? Skip this — Chrome will auto-update from our server."
- **Edge:** Single primary "Install for Edge" button → direct `.crx` download. Below, a brief "What happens next" line describing the actual click sequence (filled in after empirical testing in the verification step). Do not hardcode "one-click" until verified.
- **Firefox:** Single primary "Install for Firefox" button → direct `.xpi` download. Mozilla intercepts the download and shows its built-in install confirmation; copy says "Firefox will ask you to confirm — click Add."
- **Safari / mobile / unknown:** Friendly card: "BBE's extension supports desktop Chrome, Edge, and Firefox. Open BestBallExposures.com on a desktop browser to install." Three browser logos. Link back to `/`.

A collapsible `<details>` at the bottom of every sub-view: **"Why isn't this on the Chrome Web Store?"** Plain-language copy: "We were rejected from the Chrome Web Store under a category we disagree with. Rather than fight a losing appeal, we're distributing the extension directly. The install is a few extra clicks on Chrome, but the extension itself is identical and updates automatically." No internal-doc link.

Add a route in `App.jsx` (`<Route path="/install" element={<InstallPage />} />`). The page is publicly accessible (no auth wrapper) — install is the pre-signup funnel.

### Step 4 — CTA touch-up (light TASK-214 preview)

Update the most user-facing CTAs to point at `/install` so the page ships usable end-to-end:

- `Dashboard.jsx` — "Install Extension" button.
- `LandingPage.jsx` — primary install CTA.

Leave the other 14 grep hits for TASK-214's full sweep. This is intentional partial coverage so TASK-213 ships a coherent install flow without bleeding into the full link-refactor scope.

### Step 5 — Empirical browser testing

Run the manual install tests from the Verification Approach. Update the Edge and Chrome sub-view copy to match observed click counts. If Edge is still gated as "unknown source," diagnose (likely candidates: missing `key` field in manifest, or an Edge-specific policy requirement) and update the plan before moving on. If Edge cannot be made truly one-click, file an ADR-005 amendment via hus-adr noting the actual install friction and revisiting the cost/benefit framing.

## Dependencies

None. TASK-215 (build pipeline) and TASK-216 (Firefox signing) — both `Done` — are prerequisites that are already satisfied.

## Open Questions

- **Edge `key` field.** If adding `update_url` alone doesn't fix the gray-toggle, the next thing to try is adding a `"key"` field (the public half of the signing key) to `manifest.json` so Edge can verify the extension's identity matches its update channel. Will resolve during Step 5 testing.
- **`vercel.json` rewrite.** Whether the catch-all rewrite traps non-HTML files under `/extension/` is a Vercel runtime question we can only fully answer on a preview deploy. Step 2 includes the explicit rewrite as a defensive measure if the local curl check or the preview shows HTML being returned for binaries.
- **Update manifest cadence.** This plan ships 1.0.5 only. Future releases will need to update `updates.xml` and `updates.json` as part of the release runbook — that runbook update is in scope for TASK-213 (add a "Step 6" to `chrome-extension/RELEASE.md` covering "copy artifacts to `public/extension/`, update `updates.xml`, update `updates.json` with new sha256, deploy"). Not tracked as a separate task.

### Risks (non-goals, surfaced explicitly)

- **Install-funnel analytics** are deferred to TASK-219 — no tracking pixels added here.
- **Existing-user migration comms** are TASK-218's responsibility — no email blast triggered by this task.
- **Full Web Store link refactor** is TASK-214's scope — only Dashboard + LandingPage CTAs are updated here.
- **No "one-click Edge" claim** in copy until verified empirically. The Edge sub-view ships with whatever click count testing produced.

---

> Please review and reply **approved** to proceed, or provide feedback to revise.

*Approved by: Patrick — 2026-05-08*
