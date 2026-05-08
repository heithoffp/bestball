# BBE Extension — Release Runbook

This runbook covers the local-only release pipeline (TASK-215). It produces a signed `.crx`, an `updates.xml` snippet, and a git tag from a single npm command.

> **Why this runbook exists:** Per [ADR-005](../docs/adr/adr-005-self-host-the-chrome-extension-with-browser-detecting.md), we self-host the extension. **Losing the `.crx` signing key bricks auto-update for every installed user — there is no recovery path except asking everyone to uninstall and reinstall under a new extension ID.** Treat the key like a production database password.

---

## One-time setup

### 1. Generate the signing key

```bash
openssl genrsa -out ~/.bbe/bbe-extension.pem 2048
chmod 600 ~/.bbe/bbe-extension.pem
```

Place the key **outside** the repo. The path above is a suggestion; anywhere not under `chrome-extension/` works.

### 2. Configure `.env`

In `chrome-extension/.env`, set:

```
BBE_CRX_PRIVATE_KEY_PATH=/absolute/path/to/bbe-extension.pem
BBE_EXTENSION_ID=                          # leave blank for the first run
BBE_CRX_DOWNLOAD_URL_TEMPLATE=https://bestballexposures.com/extension/bestballexposures-extension-{version}.crx
```

### 3. Discover the extension ID

Run a dry release once:

```bash
cd chrome-extension
npm run release:dry -- --version=1.0.4
```

It will fail at the "verifying signing key matches declared extension ID" step and print the **derived** ID. Copy that ID into `.env` as `BBE_EXTENSION_ID`. From this point on the script will refuse to sign with any other key — the safety net against the catastrophic "wrong key" mistake.

### 4. Offline backup checklist (DO NOT SKIP)

Before running your first real release, confirm **all three** items below. Initial each line.

- [ ] **Password-manager copy.** PEM contents stored in 1Password (or equivalent) under an item titled `BBE Extension — CRX Signing Key`. Item description includes the extension ID and the date the key was created.
- [ ] **Cold offline copy.** PEM written to a USB stick, encrypted external drive, or printed on paper, kept physically separate from your primary working machine.
- [ ] **Recovery test.** From a clean checkout (or a different machine), restore the key from the password manager, set `BBE_CRX_PRIVATE_KEY_PATH` to point at it, and run `npm run release:dry -- --version=<next>`. Confirm the derived ID matches the production extension ID.

If any of these is missing, **do not ship a release**. The risk surface is "Patrick's laptop dies AND no offline copy exists" — in that scenario every installed user is bricked with no recovery.

Re-verify the cold offline copy at least every 6 months.

---

## Normal release flow

```bash
cd chrome-extension
git status                                      # must be clean
npm run release:dry -- --version=1.0.4         # preview
# Edit CHANGELOG.md and replace "TODO: fill in changes" for 1.0.4
npm run release -- --version=1.0.4             # for real
```

Outputs land in `chrome-extension/releases/`:
- `bestballexposures-extension-1.0.4.crx` — signed, ready to host
- `bestballexposures-extension-1.0.4.zip` — unsigned source bundle
- `updates-1.0.4.xml` — single `<app>` block to merge into the hosted `updates.xml`

A local git commit + tag `extension-v1.0.4` is created. **The script does not push** — push timing is decided as part of the hosting workflow (see TASK-213).

### Sanity-check the build

Drag `bestballexposures-extension-1.0.4.crx` onto `edge://extensions` (with Developer mode on). Confirm it installs and the version displays as `1.0.4`. This is the closest single-step proof that the artifact is well-formed.

---

## Recovery scenarios

### "My `.env` is gone but the project laptop is fine"
The key file referenced by `.env` is what matters, not `.env` itself. Recreate `.env` from `.env.example` and re-point `BBE_CRX_PRIVATE_KEY_PATH` at the existing key file.

### "The key file is gone but my password-manager copy is intact"
Restore the PEM from 1Password to its expected path, then continue. Verify `npm run release:dry` shows the same extension ID before signing anything.

### "Both the working copy AND the password-manager copy are gone"
This is the bricked-auto-update scenario. Options:
1. Generate a new key. Update `BBE_EXTENSION_ID` to the new derived ID. Ship a new release. **Existing users will not auto-update** — they must manually reinstall under the new extension ID. Plan a coordinated migration via TASK-218.
2. There is no option 2.

This scenario is the entire reason for the offline-backup checklist above. Take that section seriously.

---

## Firefox `.xpi` signing (TASK-216)

Per [ADR-005](../docs/adr/adr-005-self-host-the-chrome-extension-with-browser-detecting.md) (Firefox sub-decision), Firefox builds use **unlisted self-distribution signing** — Mozilla signs the artifact for hosting on bestballexposures.com without a public AMO listing.

### One-time setup

1. **Mozilla developer account** — create or log in at https://addons.mozilla.org/developers/.
2. **Generate API credentials** — at https://addons.mozilla.org/developers/addon/api/key/, create a JWT issuer + secret. These are bearer credentials; treat like a password.
3. **Add to `.env`** — set `AMO_JWT_ISSUER` and `AMO_JWT_SECRET` (see `.env.example`).
4. **Manifest already configured** — `manifest.json` carries `browser_specific_settings.gecko.id = bbe-extension@bestballexposures.com` and `update_url = https://bestballexposures.com/updates.json`. Chrome ignores this block; Firefox requires it.

### Signing flow (run after `npm run release`)

```bash
cd chrome-extension
npm run build                    # produces dist/ — sign:firefox reads from here
npm run sign:firefox             # web-ext sign --channel=unlisted
```

Output lands in `chrome-extension/releases/` as a `.xpi` named by web-ext. Rename to `bestballexposures-extension-<version>.xpi` for consistency with the `.crx` naming.

### Sanity-check the build

In a real Firefox profile, drag the signed `.xpi` onto `about:addons` (or open the file directly). It should install without the *"this add-on could not be verified"* warning. If you see that warning, the `.xpi` is unsigned — the signing call did not complete.

### Recovery scenarios

- **Lost AMO credentials.** Regenerate at the AMO API key page. Old credentials immediately invalidate. No effect on previously signed artifacts.
- **Mozilla rejects unlisted signing.** Rare for unlisted (automated review). If it happens — likely a "gambling" classification matching the Chrome Web Store rejection — fall back to AMO listed submission (`--channel=listed`) and accept the longer review timeline. The same artifact and credentials work for both channels.
- **gecko.id collision.** If `bbe-extension@bestballexposures.com` is already registered to a different account, change the ID in `manifest.json` (this changes the Firefox-side extension identity — installed users would need to reinstall, but at the time of TASK-216 there are zero installed Firefox users).

---

## Publishing to bestballexposures.com (per release)

After producing the signed artifacts above, publish them through the web app's static hosting.
Per [ADR-007](../docs/adr/adr-007-chromium-distribution-zip-load-unpacked-with-extension.md),
Chromium auto-update is no longer in scope — Chromium users install via ZIP + Developer Mode
"Load unpacked" and re-install on update via the `/install#update` flow.

Layout under `best-ball-manager/public/extension/`:

| File | Source |
|------|--------|
| `bestballexposures-extension-<version>.zip` | Copy from `chrome-extension/releases/` (Chromium load-unpacked install) |
| `bestballexposures-extension-<version>.xpi` | Copy from `chrome-extension/releases/` (renamed from web-ext output) |
| `updates.json` | Firefox auto-update manifest — append a new entry to `addons["bbe-extension@bestballexposures.com"].updates[]` with the new version, `update_link`, and `update_hash` |
| `latest.json` | TASK-223 update-notification channel — bump the `version` field, set `released` to today's date, update `chromium_zip` and `firefox_xpi` URLs to the new artifacts |

The `.crx` and `updates.xml` files from earlier releases are no longer produced or hosted —
they are dead per ADR-007 (Chromium policy blocks consumer drag-drop install of self-hosted
CRX, and self-hosted Chromium auto-update was tied to that signed-CRX path).

`update_hash` for the `.xpi` is the sha256 of the signed file. Compute with PowerShell:

```powershell
Get-FileHash -Algorithm SHA256 best-ball-manager\public\extension\bestballexposures-extension-<version>.xpi
```

Format as `"sha256:<lowercase hex>"`.

**SPA-rewrite guard.** `best-ball-manager/vercel.json` has an identity rewrite `{"source": "/extension/(.*)", "destination": "/extension/$1"}` that must remain ahead of the catch-all `/(.*)` → `/index.html` rewrite. Without it, Vercel returns the SPA `index.html` for binary requests and auto-update breaks silently. Re-verify on a Vercel preview deploy before promoting.

Commit the `public/extension/` and `vercel.json` changes alongside whatever other web-app changes are in flight, then deploy via Vercel as usual.

## Out of scope here

- CI-driven releases → deferred. Re-evaluate if release cadence increases or a second maintainer is added.
