<!-- Completed: 2026-05-06 | Commit: 9f54a5e -->
# TASK-200: Sideload extension stopgap (download zip + install instructions)

**Status:** Pending Approval
**Priority:** P2

---

## Objective
Give paying customers a way to install extension v1.0.3 manually while Chrome Web Store review is pending (1.0.3 was rejected citing the online-gambling policy after adding `underdogsports.com` host permissions for Underdog's domain rebrand). Add a header button next to Feedback that downloads the extension zip and walks the user through Chrome's load-unpacked flow. Designed to be removed cleanly once the store review completes.

## Verification Criteria
- New "Install Extension" button appears in the header toolbar immediately to the left of the Feedback button **for signed-in users only** (same gate as the Settings cog: `user && supabase`).
- Clicking opens a modal titled "Install Extension (Manual)" with a numbered 5-step walkthrough and a Download button.
- Download button triggers a browser download of `bestballexposures-extension-1.0.3.zip` (served from `/extension/...` on the deployed site).
- Steps include: download + unzip, open `chrome://extensions` (shown as copyable text since browsers block programmatic navigation to `chrome://`), enable Developer mode, click Load unpacked and select the unzipped folder, pin the extension.
- Production build (`npm run build`) emits the zip into `dist/extension/` and serving the resulting `dist/` exposes the file at `/extension/bestballexposures-extension-1.0.3.zip`.
- Removal is a single component delete + one import line + one folder delete.
- No changes to extension code or behavior.

## Verification Approach
1. `npm run lint` — passes with no new warnings on changed files.
2. `npm run dev` — open the app, confirm the Install Extension button is hidden when signed out and visible next to Feedback when signed in (developer manually verifies in browser).
3. Click the button — modal opens with the 5 steps; clicking Download triggers a save dialog for the zip; close button works; backdrop click closes.
4. `npm run build` then check `best-ball-manager/dist/extension/bestballexposures-extension-1.0.3.zip` exists.
5. `npm run preview` — verify the download still works against the production build (developer manual step).

## Files to Change
| File | Action | Description |
|------|--------|-------------|
| `best-ball-manager/public/extension/bestballexposures-extension-1.0.3.zip` | Create | Copy of `chrome-extension/bestballexposures-extension-1.0.3.zip` so Vite/Vercel serve it as a static asset. |
| `best-ball-manager/src/components/InstallExtensionButton.jsx` | Create | Header button + sideload instructions modal. |
| `best-ball-manager/src/components/InstallExtensionButton.module.css` | Create | Styles — reuses overlay/modal pattern from `FeedbackButton.module.css`. |
| `best-ball-manager/src/App.jsx` | Modify | Import and render `<InstallExtensionButton />` immediately before `<FeedbackButton />` (≈ line 304). |

## Implementation Approach

**1. Stage the zip as a static asset.**
Copy `chrome-extension/bestballexposures-extension-1.0.3.zip` into `best-ball-manager/public/extension/`. Files under `public/` are served verbatim by Vite and emitted to `dist/` on build, so the file is available at `/extension/bestballexposures-extension-1.0.3.zip` in both dev and production with no bundler config changes. Use the `bestballexposures-*` zip (current brand) rather than the legacy `bestball-*` zip.

**2. Component shape.**
Pattern-match `FeedbackButton.jsx`:
- Header button: text "Install Extension", reuses the `headerButton` styling pattern (own copy of the class to keep removal trivial).
- Modal scaffold (overlay + modal + header with X close, role="dialog", backdrop click closes) — copy the exact structure used by `FeedbackButton` so it matches visually.
- Body content is a static numbered list (no form, no async state).

Hardcode the version in a single constant near the top of the file:
```js
const EXTENSION_FILENAME = 'bestballexposures-extension-1.0.3.zip';
const EXTENSION_VERSION = '1.0.3';
```
Future version bumps = update both constants and replace the zip in `public/extension/`.

**3. Modal content (5 steps).**
1. **Download the extension** — primary `<a href="/extension/${EXTENSION_FILENAME}" download>` styled as a button. Text after: "Then unzip the file somewhere you can find it (e.g. Downloads)."
2. **Open Chrome's extensions page** — instruct user to paste `chrome://extensions` into the address bar. Render the URL inside a `<code>` element with a Copy button (uses `navigator.clipboard.writeText`). Note: browsers block JS from navigating to `chrome://` URLs, so a clickable link won't work — copy-paste is the standard guidance.
3. **Enable Developer mode** — toggle in the top-right of the extensions page.
4. **Load unpacked** — click the "Load unpacked" button and select the unzipped folder. Mention drag-and-drop the folder onto the page as an alternative.
5. **Pin the extension** — click the puzzle icon in Chrome's toolbar, then the pin next to Best Ball Exposures.

Add a short closing line: "Once Chrome Web Store review completes, you'll be able to install from the store and can remove this manual install."

**4. Wire into App.jsx.**
Add `import InstallExtensionButton from './components/InstallExtensionButton';` near line 21 and `<InstallExtensionButton />` immediately above `<FeedbackButton />` at line 304.

**5. Visibility.**
Gate the button on `user && supabase` (same condition that wraps the Settings cog at App.jsx:305). Affected paying customers are signed in to draft, so they see the affordance; signed-out visitors on the marketing surface don't see a "manual install" signal that something is broken with the normal store flow. No analytics — keep it minimal.

**6. Removal procedure (when store approval lands).**
- Delete `best-ball-manager/src/components/InstallExtensionButton.jsx` and `.module.css`.
- Delete `best-ball-manager/public/extension/`.
- Remove the import line and `<InstallExtensionButton />` from `App.jsx`.

## Dependencies
None.

## Open Questions
- **Customer comms (TASK-201).** Out of scope here; this task only ships the in-app affordance. The email/social messaging is TASK-201's responsibility.

---
*Approved by: <!-- developer name/initials and date once approved -->*
