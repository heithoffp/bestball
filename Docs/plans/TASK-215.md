# TASK-215: Set up extension build and release pipeline with secure key management

**Status:** Pending Approval
**Priority:** P1

---

## Objective
Produce a reproducible local build/release pipeline for the BBE Chrome extension that emits a signed `.crx`, an `updates.xml` snippet, a git release tag, and a changelog entry from a single npm command. This task produces release artifacts only — TASK-213 owns where they get hosted.

## Verification Criteria
- Running `npm run release -- --version=1.0.4` from `chrome-extension/` produces, in a `releases/` output directory: `bestballexposures-extension-1.0.4.crx`, `bestballexposures-extension-1.0.4.zip` (unsigned source bundle), and `updates-1.0.4.xml` (a single `<app>` block ready to merge into the live `updates.xml`).
- `manifest.json` and `package.json` both have their `version` fields bumped to the requested version after the script succeeds.
- The script fails fast with a clear error if `BBE_CRX_PRIVATE_KEY_PATH` is missing from `.env` or the key file does not exist.
- The script fails fast if the working tree is dirty or the version already exists as a git tag.
- A git tag `extension-v1.0.4` is created locally (not pushed) and `CHANGELOG.md` (in `chrome-extension/`) gains a new entry header for that version.
- Re-running the script with the same version is idempotent in dry-run mode and refuses in normal mode (tag already exists).
- The signed `.crx` installs cleanly on Edge via drag-drop to `edge://extensions` and reports version 1.0.4.
- `chrome-extension/RELEASE.md` documents (a) how to generate the initial signing key, (b) where the working copy lives (`.env` + key file), and (c) the offline-backup procedure with a checklist the developer ticks on first use.
- `.env` and `*.pem` are confirmed to be gitignored under `chrome-extension/`.

## Verification Approach
Automated steps Claude runs and reports:
1. `npm run build` in `chrome-extension/` — confirm clean Vite build of the `dist/` tree.
2. `npm run release -- --version=1.0.4 --dry-run` — confirm script reports the actions it would take without mutating files; output should list expected artifacts and the offline-backup reminder.
3. Inspect generated `releases/bestballexposures-extension-1.0.4.crx` exists and is non-zero size; `unzip -l` of the embedded zip should match expected manifest paths.
4. `git status` after a real (non-dry) run on a throwaway version — confirm only `manifest.json`, `package.json`, and `CHANGELOG.md` are modified, plus `releases/` artifacts created.
5. `git tag --list extension-v*` — confirms tag creation.
6. Negative tests: rename the key file temporarily and rerun → expect a non-zero exit with a clear error citing `BBE_CRX_PRIVATE_KEY_PATH`. Restore. Run with a dirty working tree → expect refusal.

Manual steps requiring the developer:
1. Generate the `.crx` private key once (`openssl genrsa -out bbe-extension.pem 2048`) and place it at the path referenced by `BBE_CRX_PRIVATE_KEY_PATH`. Record the resulting extension ID (derived from the public key) — this becomes the permanent extension identity for self-hosted updates.
2. Tick the offline-backup checklist in `RELEASE.md`: copy of `bbe-extension.pem` exists in (a) 1Password (or equivalent password manager) and (b) at least one offline medium (USB, encrypted external drive, or printed paper backup with the PEM contents). **Without this step, the project is one disk failure away from bricking auto-updates for every installed user.**
3. Drag the produced `.crx` onto `edge://extensions` and confirm install succeeds and version reads `1.0.4`.

## Files to Change
| File | Action | Description |
|------|--------|-------------|
| `chrome-extension/scripts/release.mjs` | Create | Node script orchestrating build → version bump → zip → CRX sign → updates.xml snippet → git tag → changelog. Supports `--version`, `--dry-run`. |
| `chrome-extension/scripts/lib/crx-pack.mjs` | Create | Thin wrapper around the `crx` npm package (or `crx3` lib) to produce a signed `.crx` from a directory and a private key. |
| `chrome-extension/scripts/lib/updates-xml.mjs` | Create | Emits a single `<app appid="...">` block with `<updatecheck codebase="..." version="..."/>` ready to merge into the hosted manifest. Codebase URL pattern is parameterized via env (`BBE_CRX_DOWNLOAD_URL_TEMPLATE`) since TASK-213 picks the host. |
| `chrome-extension/package.json` | Modify | Add `release` and `release:dry` npm scripts; add devDependency on `crx3` (or equivalent) and `dotenv`. |
| `chrome-extension/.env.example` | Create | Documents required keys: `BBE_CRX_PRIVATE_KEY_PATH`, `BBE_EXTENSION_ID`, `BBE_CRX_DOWNLOAD_URL_TEMPLATE`. |
| `chrome-extension/.gitignore` | Modify (or create) | Ensure `.env`, `*.pem`, and `releases/` are ignored. |
| `chrome-extension/CHANGELOG.md` | Create | Keep-a-changelog format; release script appends new version header at the top. |
| `chrome-extension/RELEASE.md` | Create | Operator runbook: one-time key generation, offline-backup checklist (prominent), normal release flow, recovery procedure if the working `.env` is lost. |

## Implementation Approach

### 1. Signing key bootstrap (one-time, manual, documented in RELEASE.md)
Developer runs `openssl genrsa -out bbe-extension.pem 2048`, places the file outside the repo (e.g. `~/.bbe/bbe-extension.pem`), and sets `BBE_CRX_PRIVATE_KEY_PATH` in `chrome-extension/.env` to that absolute path. The script derives the extension ID from the public key on first run and prints it; developer records it in `.env` as `BBE_EXTENSION_ID` so subsequent runs verify nothing has drifted. **The runbook makes the offline-backup step a hard checklist line item with the rationale from ADR-005 inlined.**

### 2. Release script flow (`scripts/release.mjs`)
1. Load `.env` via `dotenv`. Fail with explicit message if `BBE_CRX_PRIVATE_KEY_PATH` is missing or unreadable.
2. Parse `--version` (semver) and `--dry-run`.
3. Pre-flight checks (abort on any failure):
   - Working tree clean (`git status --porcelain` empty).
   - Tag `extension-v<version>` does not already exist.
   - Version is strictly greater than the current `manifest.json` version.
4. Run `npm run build` (Vite) → produces `dist/`.
5. Bump version in `manifest.json` and `package.json` (write to `dist/manifest.json` too if Vite hasn't already mirrored it).
6. Zip `dist/` → `releases/bestballexposures-extension-<version>.zip` (source bundle, useful for sideload/debug and as the pre-image of the CRX).
7. Sign → `releases/bestballexposures-extension-<version>.crx` using `crx3` lib + the private key. Verify the resulting CRX's embedded extension ID matches `BBE_EXTENSION_ID`; mismatch is a fatal error (means wrong key).
8. Generate `releases/updates-<version>.xml` from the template using `BBE_CRX_DOWNLOAD_URL_TEMPLATE` (e.g. `https://bestballexposures.com/extension/bestballexposures-extension-{version}.crx`).
9. Prepend a new `## [<version>] - YYYY-MM-DD` section to `CHANGELOG.md` (developer fills in entries before tagging — script leaves a `TODO: fill in changes` placeholder and aborts the tag step if the placeholder is still present, unless `--allow-empty-changelog` is passed).
10. `git add` the bumped manifests + changelog, commit with `chore(extension): release v<version>`, tag `extension-v<version>` (no push — TASK-213 / future hosting work decides push timing).
11. Print a final summary including the absolute path to artifacts, the updates.xml snippet, and a reminder to verify the offline backup is current.

`--dry-run` performs steps 1–4 read-only and prints what 5–10 would do without mutating files or git state.

### 3. Edge cases
- First release ever (no prior `extension-v*` tag): allowed; pre-flight only checks the *target* tag doesn't exist.
- Key file present but wrong (different extension ID): caught at step 7; fatal with explicit "this key produces extension ID X, but .env declares Y" message. This is the safety net for the catastrophic scenario where the original key is lost and a new one was generated — alerting the developer that proceeding would break auto-update for all existing users.
- `dist/` stale from a prior build: script always runs `npm run build` fresh; never reuses an existing `dist/`.

### 4. Out of scope (deferred)
- **Firefox `.xpi` packaging and signing** → TASK-216 (AMO listed vs. unlisted decision pending).
- **Hosting `.crx` and `updates.xml`** → TASK-213. This task only emits artifacts to `releases/`; how they get to BestBallExposures.com is TASK-213's problem.
- **CI integration** → explicitly rejected for now (developer chose local-only). Revisit if release cadence increases or a second maintainer joins. Captured here so it's not silently re-litigated.
- **Install-funnel analytics** → TASK-219.

## Dependencies
None. (TASK-213 consumes the artifacts this task produces but does not block it.)

## Open Questions
- **Key storage trade-off (acknowledged, not blocking):** `.env` + offline backup is the simplest workable solution at solo-dev scale. The risk surface is "developer's laptop dies AND offline backup is also lost" — mitigated by the runbook checklist requiring backup verification. If the project grows a second maintainer, revisit migrating the source-of-truth to a shared secret manager (1Password team vault, Bitwarden, or similar). Not an ADR on its own; recorded here against future need.
- **Auto-update poll cadence** is set inside `updates.xml` consumers (the installed extensions), not the script. Default Chrome/Edge poll is ~5 hours; we accept that.

---
*Approved by: <!-- pending -->*
