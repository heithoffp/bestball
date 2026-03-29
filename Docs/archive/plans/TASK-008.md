<!-- Completed: 2026-03-27 | Commit: b11d0b7 -->
# TASK-008: Create vercel.json with production configuration

**Status:** Approved
**Priority:** P1
**Feature:** FEAT-003

---

## Objective

Add a `vercel.json` configuration file that hardens the Vercel deployment for a commercial product: SPA rewrites, security headers (CSP, X-Frame-Options, HSTS), immutable caching for static assets, and a documented note of required environment variables.

## Verification Criteria

1. `best-ball-manager/vercel.json` exists and is valid JSON.
2. `npm run build` completes without errors from the `best-ball-manager/` directory.
3. The SPA rewrite rule is present (`/*` → `/index.html`).
4. Security headers are present on the `/**` route: `X-Frame-Options`, `X-Content-Type-Options`, `Referrer-Policy`, `Content-Security-Policy`.
5. An immutable cache header (`Cache-Control: public, max-age=31536000, immutable`) is set on the `/assets/*` route.
6. A comment block at the top of the file (or an adjacent note) lists the Supabase env vars that must be configured in the Vercel dashboard.

## Verification Approach

1. Run `cat best-ball-manager/vercel.json` and confirm all five header keys are present and the rewrite rule exists.
2. Run `cd best-ball-manager && npm run build` — expect exit code 0, no errors.
3. Run `python -m json.tool best-ball-manager/vercel.json` (or `node -e "JSON.parse(require('fs').readFileSync('best-ball-manager/vercel.json','utf8'))"`) to confirm valid JSON.

Steps 1–3 can be run by Claude. No developer action required for verification.

## Files to Change

| File | Action | Description |
|------|--------|-------------|
| `best-ball-manager/vercel.json` | Create | Vercel deployment config with SPA rewrites, security headers, and asset caching |

## Implementation Approach

1. Create `best-ball-manager/vercel.json` with the following structure:

   **Build config** — not strictly required since Vercel auto-detects Vite, but explicit is better:
   ```json
   "buildCommand": "npm run build",
   "outputDirectory": "dist",
   "installCommand": "npm install"
   ```

   **Rewrites** — single SPA catch-all so direct URLs and refreshes work:
   ```json
   "rewrites": [{ "source": "/(.*)", "destination": "/index.html" }]
   ```
   Note: rewrites must come after any explicit static file matches, which Vercel handles automatically.

   **Headers** — two route blocks:
   - `/**` (all routes): security headers
     - `X-Frame-Options: DENY` — prevents clickjacking
     - `X-Content-Type-Options: nosniff` — prevents MIME sniffing
     - `Referrer-Policy: strict-origin-when-cross-origin`
     - `Content-Security-Policy`: permissive initial policy:
       ```
       default-src 'self';
       script-src 'self' 'unsafe-inline' https://vercel.live;
       style-src 'self' 'unsafe-inline';
       connect-src 'self' https://*.supabase.co wss://*.supabase.co https://vitals.vercel-insights.com https://*.vercel-analytics.com https://accounts.google.com;
       img-src 'self' data: https://*.googleusercontent.com;
       frame-src https://accounts.google.com;
       ```
       Add a `// TODO: tighten CSP when Stripe is integrated` comment nearby (in a companion README note, not in the JSON itself since JSON has no comments).
   - `/assets/*`: asset caching
     - `Cache-Control: public, max-age=31536000, immutable`

   **Env var documentation** — add a `vercel-env-vars.md` note in `best-ball-manager/` (or as a comment in CLAUDE.md) listing:
   - `VITE_SUPABASE_URL` — Supabase project URL (Settings → API)
   - `VITE_SUPABASE_ANON_KEY` — Supabase anon/public key (Settings → API)
   These must be set in the Vercel dashboard under Project → Settings → Environment Variables for Production (and optionally Preview).

2. Keep the file minimal — no preview-specific branch overrides at this stage (can add when CI/CD is set up in TASK-011).

## Dependencies

None

## Open Questions

- CSP uses `'unsafe-inline'` for scripts/styles to avoid breaking Vite's inline injection. This is acceptable short-term; can be replaced with nonces after evaluating Vite CSP plugin options.
- Custom domain configuration is out of scope — managed via the Vercel dashboard, not vercel.json.

---
*Approved by: developer — 2026-03-27*
