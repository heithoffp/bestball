# TASK-012: Secure environment variables and secrets management

**Status:** Pending Approval
**Priority:** P1
**Feature:** FEAT-003

---

## Objective
Verify that Supabase credentials are properly secured for production and clean up redundant local env files. Investigation shows the repo already follows best practices (`.env` gitignored, `.env.example` with placeholders, graceful fallback) — this task is verification + minor cleanup, not a security remediation.

## Findings (Open Questions Resolved)
1. **Supabase anon key NOT in git history** — `.env` was already in `.gitignore` and never committed. No key rotation needed.
2. **Vite `VITE_` prefix confirmed** — env vars are embedded at build time via `import.meta.env`. Vercel build-time environment variables are sufficient.
3. **`.env.example` already exists** with empty placeholders and is tracked in git.
4. **`supabaseClient.js` already handles missing vars** — returns `null` when unconfigured, enabling guest mode fallback.

## Verification Criteria
1. `.env` and `.env.local` are NOT tracked in git (`git ls-files` returns nothing for them).
2. `.env.example` exists with empty placeholder values and IS tracked in git.
3. `npm run build` succeeds in `best-ball-manager/` (no env var errors).
4. Redundant `.env.local` file is deleted.
5. Vercel project has `VITE_SUPABASE_URL` and `VITE_SUPABASE_ANON_KEY` configured (developer confirms — cannot verify programmatically).

## Verification Approach
1. Run `git ls-files best-ball-manager/.env best-ball-manager/.env.local` — expect no output for `.env` or `.env.local`, only `.env.example`.
2. Run `cat best-ball-manager/.env.example` — expect `VITE_SUPABASE_URL=` and `VITE_SUPABASE_ANON_KEY=` with empty values.
3. Run `npm run build` in `best-ball-manager/` — expect clean build with no errors.
4. Confirm `best-ball-manager/.env.local` no longer exists on disk.
5. **Developer step:** Confirm Vercel environment variables are set for Production and Preview environments. If not already configured, set them in the Vercel dashboard.

## Files to Change
| File | Action | Description |
|------|--------|-------------|
| `best-ball-manager/.env.local` | Delete | Redundant — contains same credentials as `.env` |

## Implementation Approach
1. Delete `best-ball-manager/.env.local` — it duplicates `.env` and adds confusion about which file is canonical for local dev.
2. Run `npm run build` in `best-ball-manager/` to confirm the build succeeds (Vite will use `.env` for local builds).
3. Ask developer to verify Vercel environment variables are configured.

## Dependencies
None

---
*Approved by: <!-- developer name/initials and date once approved -->*
