<!-- Completed: 2026-05-06 -->
# TASK-202: Admin comp Pro script + comp_expires_at column

**Status:** Done
**Priority:** P2

---

## Objective
Add a dedicated `comp_expires_at` column to `public.profiles` and a top-level `scripts/grant-pro.mjs` admin script so the developer can grant or revoke Pro access by email — bypassing Stripe — without overloading the existing `beta_expires_at` semantics.

## Verification Criteria
1. Migration `004_add_comp_expires_at.sql` runs cleanly against a fresh DB and is idempotent (uses `add column if not exists`). After running, `public.profiles.comp_expires_at` exists as a nullable `timestamptz`.
2. RLS continues to allow users to read their own profile including the new column (no new policy needed because existing select policy is row-scoped).
3. `SubscriptionContext.jsx` selects both `beta_expires_at` and `comp_expires_at`, and `tier === 'pro'` resolves true if EITHER is in the future (or an active subscription exists). Existing beta-only paths still work (a profile with only `beta_expires_at` set still grants Pro).
4. `node scripts/grant-pro.mjs <email>` (no second arg) sets `comp_expires_at` to `2099-12-31T23:59:59Z`, prints the resolved user id and the new expiry, and exits 0.
5. `node scripts/grant-pro.mjs <email> 90` sets `comp_expires_at` to ~90 days from now.
6. `node scripts/grant-pro.mjs <email> revoke` clears `comp_expires_at` to NULL.
7. Running the script with a non-existent email exits non-zero with a clear "user not found" message and does NOT create a profiles row.
8. Running the script without `SUPABASE_URL` or `SUPABASE_SERVICE_ROLE_KEY` in `.env.local` exits non-zero with a clear missing-env message.
9. `.env.local` is gitignored at the repo root so the service-role key cannot be committed accidentally.
10. After granting comp to a logged-in user, the app's tier flips to `pro` on next page load.

## Verification Approach
Steps Claude can run:
- `node --check scripts/grant-pro.mjs` to confirm the script parses.
- Read-back of `SubscriptionContext.jsx` to confirm the select includes `comp_expires_at` and the tier derivation handles it.
- Read-back of `.gitignore` to confirm `.env.local` is ignored.

Steps requiring the developer:
- Apply migration `004_add_comp_expires_at.sql` in the Supabase SQL Editor (or via CLI).
- Place `SUPABASE_URL` and `SUPABASE_SERVICE_ROLE_KEY` in `.env.local`.
- Run `cd scripts && npm install` once to install script deps.
- Run `node scripts/grant-pro.mjs heithoff.patrick@gmail.com 1` and confirm success output.
- Refresh the app and confirm Pro features unlock.
- Run `node scripts/grant-pro.mjs heithoff.patrick@gmail.com revoke` and confirm Pro clears on next refresh.
- Spot-check: bogus email exits non-zero; missing env var exits non-zero with a clear message.

## Files to Change
| File | Action | Description |
|------|--------|-------------|
| `supabase/migrations/004_add_comp_expires_at.sql` | Create | `alter table public.profiles add column if not exists comp_expires_at timestamptz;` plus a column comment. |
| `best-ball-manager/src/contexts/SubscriptionContext.jsx` | Modify | Select `comp_expires_at` alongside `beta_expires_at`; derive `isCompActive`; include in `tier === 'pro'` derivation. Expose `compExpiresAt` / `isCompActive` on the context. |
| `scripts/grant-pro.mjs` | Create | Admin CLI: lookup user by email via `supabase.auth.admin.listUsers`, upsert `profiles` row with `comp_expires_at`. |
| `scripts/package.json` | Create | ESM package declaring `@supabase/supabase-js` and `dotenv` so script deps are isolated from the app bundle. |
| `.gitignore` (repo root) | Modify | Add `.env.local` and `.env.*.local`. |

## Implementation Approach

### 1. Migration (`supabase/migrations/004_add_comp_expires_at.sql`)
```sql
alter table public.profiles
  add column if not exists comp_expires_at timestamptz;

comment on column public.profiles.comp_expires_at is
  'Promotional comp access (creators, support cases). Independent of beta_expires_at and Stripe subscriptions. NULL = no comp.';
```
No new RLS policy: the existing "Users can read own profile" policy is row-scoped and covers all columns. The admin script uses the service-role key, which bypasses RLS.

### 2. SubscriptionContext changes
- Extend the `profiles` select to `'beta_expires_at, comp_expires_at'`.
- Add:
  ```js
  const compExpiresAt = profile?.comp_expires_at ? new Date(profile.comp_expires_at) : null;
  const isCompActive = compExpiresAt ? compExpiresAt > new Date() : false;
  ```
- Update tier derivation:
  ```js
  const tier = !user
    ? 'guest'
    : hasActiveSubscription || isBetaActive || isCompActive
      ? 'pro'
      : 'free';
  ```
- Add `compExpiresAt`, `isCompActive` to the context value for future use.

Beta paths are untouched. The only behavioural change: anyone with `comp_expires_at` in the future also becomes Pro.

### 3. `scripts/grant-pro.mjs`
Header comment documents usage. Pseudocode:
```
loadEnv from <repoRoot>/.env.local via dotenv
require SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY -> exit 1 if missing
parse args: email (required), modeArg (optional: positive integer days | 'lifetime' | 'revoke')
default modeArg = 'lifetime' (2099-12-31T23:59:59Z)
admin = createClient(url, serviceKey, { auth: { autoRefreshToken:false, persistSession:false }})

findUserByEmail(email):
  page=1; perPage=200
  loop: { data } = admin.auth.admin.listUsers({ page, perPage })
        match = data.users.find(u => u.email?.toLowerCase() === email.toLowerCase())
        if match return match
        if data.users.length < perPage return null
        page++

if !user -> exit 1 "user not found"

compExpiresAt = mode==='revoke' ? null
              : mode==='lifetime' ? '2099-12-31T23:59:59Z'
              : new Date(Date.now() + days*86400000).toISOString()

await admin.from('profiles').upsert({ id: user.id, comp_expires_at: compExpiresAt }, { onConflict: 'id' })

print: user.id, email, comp_expires_at (or 'revoked')
```
Edge cases:
- Email matched case-insensitively.
- Non-numeric, non-`lifetime`, non-`revoke` second arg → usage message + exit 1.
- `days` must parse to a positive integer.
- Supabase errors surface verbatim with exit 1.

### 4. `scripts/package.json`
```json
{
  "name": "best-ball-scripts",
  "private": true,
  "type": "module",
  "dependencies": {
    "@supabase/supabase-js": "^2.45.0",
    "dotenv": "^16.4.5"
  }
}
```
Developer runs `cd scripts && npm install` once. Script deps stay separate from the app bundle.

### 5. `.gitignore` (repo root)
Append:
```
# Local env files (service role keys, secrets)
.env.local
.env.*.local
```

## Dependencies
None.

## Open Questions / Notes

- **ADR recommendation.** Adding a second comp dimension separate from `beta_expires_at` is a small but non-obvious schema decision and changes how `tier` is derived. I recommend a short ADR ("Comp access modeled separately from beta access") so future maintainers don't re-conflate the two when beta ends. Happy to author after this task is approved.
- **Realtime updates.** The existing realtime channel filters on the `subscriptions` table only, so a comp grant won't auto-flip a user mid-session — they'll see Pro on next page load. Adding a `profiles` channel is doable but out of scope here.
- **Admin UI.** A future task could surface comp status in `AccountSettings` and add an admin-only grant UI. Not in scope; the script is sufficient for current needs (creator comps, support cases).
- **Service-role key handling.** Read from `.env.local` only; the key is never imported by Vite or shipped to the browser. The script lives at repo root (outside `best-ball-manager/`) specifically so Vite's env scanner cannot see it.

---
*Approved by: <!-- developer name/initials and date once approved -->*
