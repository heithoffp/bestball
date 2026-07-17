# TASK-347: Automated Apple Sign-In client-secret rotation pipeline

**Status:** Pending Approval
**Priority:** P2

---

## Objective
Automate rotation of the Apple Sign-In OAuth client secret so the ADR-029 web OAuth flow (web app + Chrome extension Apple sign-in) never breaks from Apple's 6-month secret expiry. A scheduled GitHub Actions workflow generates a fresh ES256 client-secret JWT from the .p8 key and pushes it to the Supabase Auth provider config via the Supabase Management API. Native mobile `signInWithIdToken` is unaffected by rotation.

## Verification Criteria
1. Dispatching the workflow (dry_run=false) completes green, the Supabase Apple provider remains enabled with client ID `com.bestballexposures.web`, the run log shows the new expiry date, and no secret material appears anywhere in the log.
2. Apple sign-in via the web OAuth flow (web app or Chrome extension) succeeds immediately after a rotation run, and native mobile Apple sign-in still works.
3. A run with the Apple provider unconfigured or a required secret unset fails red with an actionable message naming what's missing — it never half-applies config or prints a secret value.

## Verification Approach

Local, runnable by Claude (no credentials needed):
- `node scripts/rotate-apple-secret.mjs --dry-run` with vars unset → expect exit 1 naming the first missing variable.
- Leak scan: `node scripts/rotate-apple-secret.mjs --dry-run 2>&1 | grep -Ei 'BEGIN PRIVATE|eyJ|sbp_'` must print nothing (with dummy env vars set, the minted JWT must still not be echoed).
- With dummy .p8 (locally generated throwaway P-256 key) + dummy IDs and no `SUPABASE_ACCESS_TOKEN`: JWT minting path exercises cleanly and fails at the preflight step naming `SUPABASE_ACCESS_TOKEN`.

Steps that require the developer (Apple Developer + Supabase + GitHub access):
1. Create a Supabase Personal Access Token (dashboard → Account → Access Tokens).
2. Set GitHub secrets:
   - `gh secret set APPLE_SIGNIN_KEY_P8 --repo heithoffp/bestball < AuthKey_XXXXXXXXXX.p8`
   - `gh secret set APPLE_SIGNIN_KEY_ID / APPLE_SERVICES_ID / SUPABASE_ACCESS_TOKEN --repo heithoffp/bestball`
3. Confirm the TASK-345 dashboard setup is done (Apple provider enabled with the Services ID).
4. First live rotation, attended (because PATCH /config/auth reportedly can fail on projects using auth hooks — supabase/supabase#36861):
   - `gh workflow run rotate-apple-secret.yml -f dry_run=true` → green; log shows config check passed.
   - `gh workflow run rotate-apple-secret.yml -f dry_run=false` → green; log shows `Rotated ... expires <date>`.
   - `gh run view --log | grep -Ei 'eyJ|BEGIN PRIVATE|sbp_'` → prints nothing.
5. Perform a real "Sign in with Apple" on the web app and on the mobile app to confirm both paths post-rotation.
6. `gh workflow view rotate-apple-secret.yml` shows the schedule registered and state "active".

## Files to Change
| File | Action | Description |
|------|--------|-------------|
| `scripts/rotate-apple-secret.mjs` | Create | Zero-dep Node 20 ESM script: mint ES256 client-secret JWT from .p8 via WebCrypto (mirrors `supabase/functions/live-activity-relay/index.ts:47-90`), preflight GET, PATCH `external_apple_secret`, read-back verify; `--dry-run` flag; optional dotenv via dynamic import |
| `.github/workflows/rotate-apple-secret.yml` | Create | Monthly cron + `workflow_dispatch(dry_run)`; public-repo security header per `ios-build.yml`; step-level `env:` secret mapping; `permissions: contents: read`; Node 20, no install step |
| `docs/Apple_Secret_Rotation_Runbook.md` | Create | One-time setup (Supabase PAT, `gh secret set` × 4), dry-run/dispatch instructions, failure triage, cron auto-disable recovery |
| `docs/migrations/029-social-signin-setup.md` | Modify | Correct the two lines implying Supabase generates the secret from the .p8 (it is a pre-generated JWT that expires ≤6 months); link the runbook |

## Implementation Approach

### 1. `scripts/rotate-apple-secret.mjs` (zero hard dependencies)
Follows `scripts/grant-pro.mjs` conventions (ESM, header usage comment, fail-fast helper). Dotenv is loaded via a guarded dynamic import of repo-root `.env.local` so the same script runs locally and in CI with **no npm install step**.

- **Inputs** (env): `APPLE_SIGNIN_KEY_P8` (PEM contents), `APPLE_SIGNIN_KEY_ID` (10-char Key ID), `APPLE_SERVICES_ID` (required explicitly — no default, so a misnamed secret fails loudly), `SUPABASE_ACCESS_TOKEN` (`sbp_...` PAT); `APPLE_TEAM_ID` defaults to `WNGNQ89YJ2` and `SUPABASE_PROJECT_REF` to `cwjorshxkbbxjvhqxdlh` (both already public in the repo). Missing vars → exit 1 printing only the variable **name**.
- **JWT mint:** header `{ alg: "ES256", kid }`; claims `iss`=Team ID, `sub`=Services ID (case-sensitive), `aud`=`https://appleid.apple.com`, `iat`=now−60s (clock-skew backdate), `exp`=iat+14,400,000s (~5.5 months — margin under Apple's hard 15,777,000s cap as measured by Apple's clock). Signed with the WebCrypto recipe already proven in `live-activity-relay` (pemToDer → importKey PKCS8 ECDSA P-256 → sign ECDSA/SHA-256 → base64url join); WebCrypto's raw r‖s signature is exactly what JWS ES256 requires, so no JWT library is needed.
- **Preflight GET** `https://api.supabase.com/v1/projects/{ref}/config/auth` (Bearer PAT): fail if non-200 (bad PAT); fail with "Apple provider not configured — complete TASK-345 / migration 029 first" if `external_apple_enabled` is false or `external_apple_client_id` is empty; fail if `external_apple_client_id !== APPLE_SERVICES_ID` (wrong-client guard). A loud red run is deliberate — a green no-op would mask a broken sign-in path. Response bodies are never printed (secret redaction on GET is undocumented); only whitelisted fields are logged.
- **`--dry-run`:** mint + preflight + print non-secret summary (claims, expiry ISO date, config check result), exit 0 without PATCHing.
- **PATCH** with body `{ "external_apple_secret": "<jwt>" }` **only** — partial update leaves `external_apple_client_id` / `external_apple_additional_client_ids` untouched, so the native mobile client-ID list can never be broken by this job. Non-200 → fail printing status code + error message field only, with a hint referencing supabase/supabase#36861 (auth-hooks PATCH gotcha) and the manual dashboard-paste fallback.
- **Read-back verify:** re-GET; assert enabled + client ID match (never compare the secret — may be redacted). Success output is a single non-secret line: `Rotated Apple client secret for <services-id>; expires <ISO date>`.
- **Output hygiene:** no code path — including error handlers — prints the .p8, the JWT, the PAT, or any raw API response body.

### 2. `.github/workflows/rotate-apple-secret.yml`
Modeled on `ios-build.yml`, including an equivalent SECURITY header comment (public repo → world-readable logs; secrets only via step-level `env:`, never interpolated into `run:` strings; no `pull_request` trigger so fork PRs never see secrets).

- **Triggers:** `schedule` monthly (`17 6 3 * *`, off-peak minute) + `workflow_dispatch` with boolean `dry_run` input. Monthly × ~5.5-month validity is self-healing: four consecutive missed months still leave a valid secret.
- `permissions: contents: read`; `concurrency: rotate-apple-secret`; `ubuntu-latest`; `timeout-minutes: 10`.
- Steps: checkout → setup-node 20 → `node scripts/rotate-apple-secret.mjs [--dry-run]` with the four secrets mapped via step-level `env:`. The only `run:` interpolation is the boolean input.
- **60-day auto-disable gotcha** (public repos: scheduled workflows disabled after 60 days without repo activity; runs alone don't count): documented in the header comment and runbook — GitHub emails a warning, re-enable is one click, and the 5.5-month runway means a disabled cron leaves months to notice. GitHub also emails on scheduled-run failure by default.

### 3. Documentation
- New `docs/Apple_Secret_Rotation_Runbook.md`: why rotation exists, one-time setup (PAT + the four `gh secret set` commands + local `.env.local` keys), dry-run and manual-dispatch instructions, failure triage (expired PAT, auth-hooks PATCH gotcha → manual dashboard paste, cron auto-disabled → re-enable in Actions tab), and the note that native mobile sign-in is unaffected.
- Fix `docs/migrations/029-social-signin-setup.md` lines 16 and 32: the Supabase dashboard takes a **pre-generated client-secret JWT** (which expires ≤6 months), not the raw .p8; point initial secret generation at this script/workflow and link the runbook.

### Sequencing
Script → workflow → docs. The script is locally testable with `--dry-run` before any CI exists.

## Dependencies
- Soft dependency on TASK-345: the code can merge before TASK-345's dashboard setup is complete (the preflight makes an unconfigured run fail loudly rather than half-configure), but the first live rotation requires the Services ID, .p8 key, and Supabase Apple provider enablement from TASK-345 / migration 029.

## Open Questions
- Rejected alternative — Supabase Edge Function on a pg_cron schedule: keeps rotation inside Supabase but requires storing the .p8 as a function secret plus a PAT with management-plane scope inside the data plane, and there is no precedent in this repo; GitHub Actions matches the existing `ios-build.yml` operational pattern.
- Rejected alternative — rotating only when expiry is near (state tracking): monthly unconditional re-mint is simpler, idempotent, and needs no stored state; two Management API calls a month is negligible.
- GET read-back may or may not redact `external_apple_secret` (undocumented) — the script treats it as sensitive either way and never compares or prints it.

---
*Approved by: <!-- developer name/initials and date once approved -->*
