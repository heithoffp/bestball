# TASK-334: Free iOS build pipeline: GitHub Actions macOS runner (eas build --local) + install-to-iPhone path from Windows

**Status:** Approved
**Priority:** P2

<!-- KB not compiled (no kb/index.md) — research phase ran without KB context. -->

---

## Objective
Stand up a GitHub Actions workflow on a `macos-latest` runner that runs `eas build --platform ios --profile <development|preview> --local`, bypassing the EAS-hosted build quota while still pulling EAS-managed iOS signing credentials via an `EXPO_TOKEN` secret, and uploads the resulting `.ipa` as a workflow artifact. Then close the loop from Windows to the developer's iPhone with a documented, USB-free install flow. First real use: ship the current `task329.4` engine to the device to unblock on-device verification of TASK-329/331.

## Key finding that reshapes this task
The repo `github.com/heithoffp/bestball` is **public**. GitHub grants public repos **unlimited free Actions minutes on standard runners, including `macos-latest`** (the 10× macOS multiplier only applies to private-repo paid overages). **The original "~2000 min/month, 4–8 builds/month budget" constraint is void** — builds are effectively free and unmetered. The constraint that *does* apply to a public repo is security of logs/secrets (see Open Questions).

## Verification Criteria
1. Triggering the `ios-build` workflow from the GitHub Actions UI (manual `workflow_dispatch`, profile = `development`) completes successfully on a macOS runner and produces a downloadable `.ipa` artifact — with `EXPO_TOKEN` never appearing in the public logs.
2. The developer can install that `.ipa` on their iPhone **entirely from Windows** (no Mac, no USB) via the documented path, and the app launches.
3. After install, the app's confidence hub reports the shipped engine (`ENGINE_VERSION = task329.4`, `ENGINE_BUILD = 1`) — proving the pipeline delivers a fresh build to the device.

## Verification Approach
- **Workflow runs green (automated + observed):**
  - After the secret + access prerequisites are in place, trigger the workflow via `gh workflow run ios-build.yml -f profile=development --repo heithoffp/bestball` and watch with `gh run watch`.
  - Confirm the run reaches the `upload-artifact` step and the job is green. Download with `gh run download` and confirm a `.ipa` file is present and non-trivial in size.
  - Grep the fetched run log (`gh run view --log`) for the token value / `EXPO_TOKEN` to confirm it is masked (`***`) and never printed.
- **Install path (developer, manual — no Mac/USB):** Documented steps executed by the developer on their iPhone. This step **requires the developer** and a physical device; Claude cannot perform it. Claude will present the exact steps and wait for confirmation.
- **Engine on device (developer, manual):** After install, developer opens the confidence hub and confirms it displays `task329.4` / build `1`. Confirms the whole loop end-to-end.
- Iteration expected: first workflow run will likely surface a signing/prebuild/CocoaPods issue; fix the YAML, re-trigger, repeat until green.

## Files to Change
| File | Action | Description |
|------|--------|-------------|
| `.github/workflows/ios-build.yml` | Create | macOS-runner workflow: manual `workflow_dispatch` (profile input), `eas build --local`, artifact upload. First CI in the repo. |
| `mobile-app/docs/IOS_BUILD_PIPELINE.md` | Create | End-to-end runbook: prerequisites (collaborator access, `EXPO_TOKEN`, device UDID registration), how to trigger, chosen install path, engine-version verification, public-repo security notes, and the free-vs-budget correction. |
| `docs/adr/` (ADR — via hus-adr) | Create (conditional) | Only if the install-path choice (OTA/`itms-services` vs. Windows sideload) is judged non-obvious/hard-to-reverse. Flagged for developer decision below. |

## Implementation Approach

### 1. Access & secrets prerequisites (developer + Claude)
- Developer grants GitHub account **`pheithoffklein`** **Write + Admin** collaborator access on `heithoffp/bestball` (Admin needed to create repo secrets). Alternatively: Write-only + developer sets the secret themselves.
- Developer generates an **Expo access token** at `expo.dev → Account Settings → Access Tokens`.
- Set it once: `gh secret set EXPO_TOKEN --repo heithoffp/bestball` (paste token). This is the **only** secret used.

### 2. Workflow (`.github/workflows/ios-build.yml`)
- **Triggers:** `workflow_dispatch` only (manual), with a `profile` input (choice: `development` default, `preview`). **No `pull_request` trigger** — on a public repo, fork PRs don't receive secrets and logs are public, so we never auto-build untrusted refs. (A `push` trigger on a named branch may be added later; start manual-only.)
- **Runner:** `macos-latest` (ships Xcode + CocoaPods + Fastlane; required because `--local` compiles natively).
- **Steps:**
  1. `actions/checkout` (full repo — `build:data` reads sibling `best-ball-manager/src/assets`).
  2. `actions/setup-node` Node 20 (Expo SDK 57 compatible; no `engines.node` pin exists). Enable npm cache.
  3. `npm ci` in `mobile-app/` (has `package-lock.json`). `eas-cli` is invoked via `npx eas-cli@latest` (or a pinned `>=14`) rather than a global install — honors `eas.json` `cli.version >= 14.0.0`.
  4. `npm run build:data` in `mobile-app/` (CLAUDE.md/README: run before every EAS build; sibling CSVs are present from checkout).
  5. `eas build --platform ios --profile <profile> --local --non-interactive --output ../build.ipa`, with `EXPO_TOKEN: ${{ secrets.EXPO_TOKEN }}` in `env`. `eas build --local` **runs `expo prebuild` itself** — `ios/` is gitignored (managed/CNG workflow), so `@bacons/apple-targets` regenerates the `DraftBroadcast` + `DraftGlance` extension targets during that prebuild. No separate prebuild step needed (add one only if a prebuild-ordering issue appears). Signing creds for team `WNGNQ89YJ2` and the two extension bundle IDs are pulled from EAS via the token.
  6. `actions/upload-artifact` with the `.ipa`.
- **Security:** never `echo`/`cat` the token; rely on Actions' automatic secret masking; keep `EXPO_TOKEN` in `env:` at the step level, not interpolated into a `run:` string.

### 3. Install-to-iPhone from Windows (chosen path — see Open Questions for the decision)
- **Recommended: ad-hoc OTA via `itms-services`.** The `development` profile (`distribution: internal`, `ios.simulator: false`) produces a device build signed against registered UDIDs. Host the `.ipa` + a generated `manifest.plist` at an HTTPS URL (GitHub Release asset or GitHub Pages — both public HTTPS, free), then open `itms-services://?action=download-manifest&url=<manifest-url>` in Safari on the iPhone to install. **100% Windows-side; no USB, no re-signing, no 7-day expiry.** The workflow can optionally auto-publish the `.ipa` + manifest to a Release to make this one-click.
- **Fallback: Windows sideload (Sideloadly/AltStore).** Requires USB + iTunes/AltServer, and free-Apple-ID re-signing expires in 7 days. Documented as backup only.
- **Load-bearing prerequisite for either OTA/ad-hoc install:** the target iPhone's **UDID must be registered** in the Apple Developer account and included in the provisioning profile EAS builds against. If it isn't, install will fail with "unable to install." Register via `eas device:create` (produces a registration URL to open on the iPhone), then ensure the dev/internal profile includes it. This is the most likely first-run blocker.

### 4. Runbook (`mobile-app/docs/IOS_BUILD_PIPELINE.md`)
Document: prerequisites (access, token, UDID), trigger command/UI, the chosen install flow step-by-step, confidence-hub engine-version check, public-repo security notes, and the "builds are free on public repos" correction so a future session doesn't re-introduce the phantom budget.

### 5. First use
Trigger a `development` build off `main` (engine `task329.4` / build `1` is already committed in `src/draft/generated/engineSource.js` and `targets/draft-broadcast/assets/engine.js`), install to device, verify the engine string in the confidence hub → unblocks on-device verification for TASK-329/331.

## Dependencies
None (blocking). Related: unblocks on-device verification of **TASK-329** and **TASK-331**; complementary to **TASK-333** (App-Group engine hot-load), which reduces how often a full rebuild is needed but does not replace it.

## Decisions (resolved at approval, 2026-07-15)
1. **Install path: ad-hoc OTA via `itms-services`** (developer-selected). Windows-side, no USB, no 7-day expiry; relies on the paid Apple Developer account. Host TBD at implementation — default **GitHub Release asset** (simplest, versioned); the workflow may auto-publish `.ipa` + `manifest.plist` to a Release. The dev `.ipa` becomes publicly downloadable — acceptable (dev build, not App Store artifact).
2. **UDID: already registered** (developer confirmed prior EAS builds installed on the device). No `eas device:create` step needed for the current device; runbook still documents it for future devices.
3. **No ADR.** The install-path choice is easily reversible (switch to sideload anytime), single-subsystem (mobile distribution), and not architecturally load-bearing — it does not meet the ADR gate. Revisit if distribution moves to App Store/TestFlight at scale.

## Handoff Notes
- Access prerequisite discovered during planning: `pheithoffklein` currently has **read-only** access to the repo (`push:false, admin:false`); needs Write+Admin (or Write + developer-set secret) before the workflow can be pushed and the secret created.
- Repo is **public** → macOS Actions minutes are free/unlimited; original budget section removed as void.

---
*Approved by: <!-- pending -->*
