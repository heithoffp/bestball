# Apple Sign-In Client-Secret Rotation Runbook

**Owner artifacts:** `scripts/rotate-apple-secret.mjs`, `.github/workflows/rotate-apple-secret.yml` (TASK-347)

## Why this exists

The web OAuth flow for Sign in with Apple (web app + Chrome extension, ADR-029)
authenticates to Apple with a **client secret**: an ES256 JWT signed with the
Sign in with Apple `.p8` key. Apple caps its validity at **6 months**
(`exp ≤ iat + 15,777,000s`, measured by Apple's clock). If it lapses, Apple
sign-in on web and the extension fails until a new secret is set. Supabase does
**not** generate or rotate this secret — the dashboard stores whatever JWT you
give it.

The rotation pipeline: a monthly GitHub Actions cron mints a fresh ~5.5-month
secret from the `.p8` and `PATCH`es it into the Supabase Auth config via the
Management API (`external_apple_secret`). Monthly × 5.5 months of validity
means up to four consecutive missed runs still leave a working secret.

**Native mobile sign-in (`signInWithIdToken`) does not use this secret and is
never affected by rotation** — the script also PATCHes *only* the secret field,
so the client-ID list (mobile bundle ID) can't be touched.

## One-time setup

Prerequisite: the TASK-345 / [migration 029](migrations/029-social-signin-setup.md)
dashboard setup is complete (Services ID created, `.p8` key issued, Supabase
Apple provider enabled). The script refuses to rotate an unconfigured provider.

1. Create a **Supabase personal access token**: dashboard → Account → Access
   Tokens. (Note: PATs can be created with expiry — prefer no expiry for this
   automation, or diary the renewal.)
2. Set the four GitHub Actions secrets:

   ```bash
   gh secret set APPLE_SIGNIN_KEY_P8 --repo heithoffp/bestball < AuthKey_XXXXXXXXXX.p8
   gh secret set APPLE_SIGNIN_KEY_ID --repo heithoffp/bestball   # 10-char Key ID
   gh secret set APPLE_SERVICES_ID --repo heithoffp/bestball     # e.g. com.bestballexposures.web
   gh secret set SUPABASE_ACCESS_TOKEN --repo heithoffp/bestball # sbp_...
   ```

   (Team ID `WNGNQ89YJ2` and project ref `cwjorshxkbbxjvhqxdlh` are script
   defaults — both already public in this repo.)
3. For running the script locally, add the same four keys to repo-root
   `.env.local` (gitignored, like the existing `SUPABASE_SERVICE_ROLE_KEY`).
   Keep the `.p8` file itself out of the repo — `*.p8` is gitignored.
4. First rotation, attended (a known Management API issue can make
   `PATCH /config/auth` fail on projects using auth hooks —
   [supabase/supabase#36861](https://github.com/supabase/supabase/issues/36861)):

   ```bash
   gh workflow run rotate-apple-secret.yml --repo heithoffp/bestball -f dry_run=true
   gh run watch --repo heithoffp/bestball        # expect green: "preflight ok"
   gh workflow run rotate-apple-secret.yml --repo heithoffp/bestball -f dry_run=false
   gh run watch --repo heithoffp/bestball        # expect green: "Rotated ... expires <date>"
   ```

   Then sign in with Apple on the web app once to confirm the new secret is live.

## Routine operation

Nothing. The cron (3rd of each month, 06:17 UTC) re-mints and re-applies the
secret. GitHub emails the workflow author when a scheduled run fails.

## Failure triage

| Symptom | Cause | Fix |
|---------|-------|-----|
| Run fails: `missing required environment variable: X` | GitHub secret unset or misnamed | `gh secret set X --repo heithoffp/bestball` |
| Run fails: `GET auth config returned HTTP 401` | Supabase PAT expired/revoked | Create a new PAT, update `SUPABASE_ACCESS_TOKEN` |
| Run fails: `Apple provider is not configured` | TASK-345 dashboard setup incomplete, or provider was disabled | Complete/re-check migration 029 §3 |
| Run fails: `configured Apple client id does not match` | `APPLE_SERVICES_ID` secret disagrees with Supabase config | Fix whichever is wrong; the script refuses to guess |
| Run fails: `PATCH auth config returned HTTP 4xx/5xx` | Management API issue (see #36861) | Manual fallback below |
| No runs for months / cron shows disabled | Public-repo 60-day inactivity auto-disable (GitHub emails a warning first) | Actions tab → workflow → "Enable workflow"; dispatch one run manually |
| Apple sign-in on web suddenly failing with `invalid_client` | Secret lapsed (pipeline dead > ~5.5 months) | Manual fallback below, then fix the pipeline |

**Manual fallback** (bypasses the Management API): on your machine, with
`.env.local` populated:

```bash
node scripts/rotate-apple-secret.mjs --print-secret
```

Paste the printed JWT into Supabase dashboard → Authentication → Providers →
Apple → Secret Key. (`--print-secret` refuses to run inside CI so the secret
can never land in public Actions logs.)

## If the .p8 is lost or compromised

Revoke the key in the Apple Developer portal (Certificates, Identifiers &
Profiles → Keys) immediately, create a new Sign in with Apple key, then redo
one-time setup steps 2–4 with the new `.p8` and Key ID.
