# iOS Build Pipeline — free macOS builds + install to iPhone from Windows

**TASK-334.** Build iOS `.ipa`s for free on a GitHub Actions macOS runner (`eas build --local`),
then install to the iPhone over-the-air (OTA) entirely from Windows — no Mac, no USB.

## Why this exists

ADR-022: the dev machine is Windows, so iOS builds normally go through EAS-hosted cloud
builds — which are metered on the free plan and can run out mid-draft-season. This repo is
**public**, and GitHub gives public repos **unlimited free Actions minutes on standard
runners, including `macos-latest`**. So we run the build on a macOS runner with
`eas build --local` (bypassing the EAS build quota) while EAS still supplies the iOS signing
credentials via an `EXPO_TOKEN` secret.

> **There is no build budget to ration.** The 10× macOS minute multiplier only applies to
> private-repo paid overages. Do not re-introduce a "N builds/month" limit — it does not exist
> for this repo while it is public.

## One-time setup

1. **Collaborator access** — the automation account `pheithoffklein` needs **Write + Admin**
   on `heithoffp/bestball` (Admin is required to create the repo secret). Repo → Settings →
   Collaborators → add `pheithoffklein` as **Admin**.
   *(Alternative: grant Write only and set the secret yourself — step 3.)*
2. **Expo access token** — create at `expo.dev` → Account Settings → **Access Tokens** →
   Create. This is the only secret the pipeline uses.
3. **Set the secret:**
   ```bash
   gh secret set EXPO_TOKEN --repo heithoffp/bestball   # paste the token when prompted
   ```
4. **Device UDID** — the target iPhone's UDID must be in the provisioning profile EAS builds
   against. The current device is already registered (prior EAS builds installed on it). For a
   **new** device: `cd mobile-app && npx eas-cli device:create`, open the URL it prints on the
   new iPhone to register, then rebuild so the profile includes it.

## Running a build

- **From the GitHub UI:** Actions → **iOS Build (local, macOS runner)** → Run workflow →
  pick `profile` (`development` default) → Run.
- **From the CLI:**
  ```bash
  gh workflow run ios-build.yml -f profile=development --repo heithoffp/bestball
  gh run watch --repo heithoffp/bestball          # follow to completion
  ```
- Outputs:
  - A workflow **artifact** `bbe-ios-<profile>-<run#>` containing `build.ipa`.
  - If `publish_release` is on (default): a **GitHub Release** `ios-build-<run#>` holding
    `build.ipa` + `manifest.plist`, and an **OTA install link** printed in the run's job
    summary.

## Installing to the iPhone (OTA, from Windows)

The `development` profile produces a device build signed for registered UDIDs, so it installs
over-the-air via an `itms-services` manifest — no USB, no re-signing, no 7-day expiry.

1. Open the finished run's **Summary** → copy the OTA install link
   (`itms-services://?action=download-manifest&url=…/manifest.plist`).
2. Open that link **in Safari on the iPhone** (AirDrop/message it to yourself, or use the
   plain install page below). Confirm the install prompt.
3. If iOS shows "Untrusted Developer": Settings → General → VPN & Device Management → trust the
   developer profile.

> Safari sometimes won't open a raw `itms-services:` URL pasted into the address bar. Wrapping
> it in a real link works. Minimal page you can host anywhere (or drop on GitHub Pages):
> ```html
> <a href="itms-services://?action=download-manifest&url=https://github.com/heithoffp/bestball/releases/download/ios-build-<run#>/manifest.plist">Install Best Ball Exposures</a>
> ```

**Fallback — Windows sideload:** if OTA ever fails, download the `.ipa` artifact and sideload
with Sideloadly or AltStore over USB. This needs a USB connection and (with a free Apple ID)
re-installing every 7 days, so OTA is preferred.

## Verifying the build reached the device

Open the app's **confidence hub** and confirm the reported engine matches what's committed
(currently `ENGINE_VERSION = task329.4`, `ENGINE_BUILD = 1`). A matching version proves the
pipeline delivered a fresh build — this is what unblocks on-device verification of TASK-329/331.

## How the build works (what the workflow does)

`macos-latest` runner (ships Xcode + CocoaPods) → checkout full repo → Node 20 → `npm ci` →
`npm run build:data` (compacts bundled CSVs; required before every EAS build) →
`eas build --platform ios --profile <profile> --local --output build.ipa`.

`ios/` is gitignored (managed/CNG workflow), so `eas build --local` runs `expo prebuild`
itself, and `@bacons/apple-targets` regenerates the `DraftBroadcast` + `DraftGlance` extension
targets during that prebuild. Signing credentials for team `WNGNQ89YJ2` and the two extension
bundle IDs are pulled from EAS using `EXPO_TOKEN`.

- Engine changes: run `npm run build:engine` and commit the generated engine **before**
  triggering a build — the bundled engine is committed, not built in CI.
- `build:engine` output is committed intentionally so CI has no bundling dependency.

## Security notes (public repo)

- Logs are world-readable. The workflow is **manual-only** (`workflow_dispatch`) so fork PRs
  never run with the secret.
- `EXPO_TOKEN` is used only via step-level `env:` and is auto-masked; it is never echoed.
- The published `.ipa` is publicly downloadable — acceptable for a dev build (not an App Store
  artifact). It cannot be installed on unregistered devices.
