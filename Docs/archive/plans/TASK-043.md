<!-- Completed: 2026-03-31 | Commit: dc9101a -->
# TASK-043: Supabase data bridge

**Status:** Done
**Priority:** P1

---

## Objective

Design and implement the Supabase schema and read/write API that lets the Chrome extension write scraped portfolio data and lets the web app read it. This is the shared infrastructure that unblocks TASK-044 (scraper writes entries), TASK-045 (web app sync UX), and TASK-047 (overlay scoring reads exposure). Without this bridge, the extension and web app have no way to share data across origins.

## Key Decisions

**Data format: raw scraped rows**
Store raw Entry objects (entry_id, players array, tournament title, draft date) rather than pre-processed exposure data. The web app already has a processing pipeline (`helpers.js`) that can consume raw entry data. Storing raw data keeps the bridge simple and avoids coupling the schema to any particular analytics computation.

**Sync strategy: full replace per sync**
Each sync overwrites all rows for the user — delete all existing rows for user_id, then insert the new batch. Simpler than append/merge for v1; acceptable because the scraper reads all entries on each run.

**Auth: email/password via popup**
The extension popup gets a login form (email + password fields). On successful Supabase sign-in, the session is stored in `chrome.storage.local`. All subsequent Supabase calls from the extension use this session. The user uses the same credentials as their web app account.

**Supabase credentials in extension**
The Supabase URL and anon key are baked into the extension bundle at build time via Vite env vars (`.env` in `chrome-extension/`). The anon key is safe to bundle — it is designed to be a public client key, with RLS enforcing data access.

## Verification Criteria

1. SQL migration creates `extension_entries` table with correct schema and RLS policies.
2. `chrome-extension/src/utils/supabase.js` creates a Supabase client using `VITE_SUPABASE_URL` and `VITE_SUPABASE_ANON_KEY`.
3. `chrome-extension/src/utils/bridge.js` exports `writeEntries(entries)` — deletes all user rows and inserts the new batch. Returns `{ count }` on success.
4. `chrome-extension/src/utils/bridge.js` exports `getAuthSession()` — reads the stored session from Supabase's chrome.storage-backed auth.
5. `chrome-extension/src/utils/bridge.js` exports `signIn(email, password)` — calls `supabase.auth.signInWithPassword`, returns the session.
6. `chrome-extension/src/utils/bridge.js` exports `signOut()` — calls `supabase.auth.signOut`.
7. Popup shows a login form (email + password + Sign In button) when no session is stored.
8. Popup shows auth status (user email + Sign Out button) when a valid session is stored.
9. `best-ball-manager/src/utils/extensionBridge.js` exports `readExtensionEntries(userId)` — fetches all rows from `extension_entries` for the given user and returns them as an array of Entry objects.
10. `chrome-extension/.env.example` documents `VITE_SUPABASE_URL` and `VITE_SUPABASE_ANON_KEY`.
11. `npm run build` in `chrome-extension/` succeeds with the new files.

## Verification Approach

1. Read `docs/migrations/001_extension_entries.sql` — confirm table schema, RLS policy, and index.
2. Read `chrome-extension/src/utils/supabase.js` — confirm it creates a Supabase client from Vite env vars with `chrome.storage.local` as the auth storage backend.
3. Read `chrome-extension/src/utils/bridge.js` — confirm all 4 exports exist with correct signatures.
4. Read updated `chrome-extension/src/popup/popup.html` — confirm `auth-form` and `auth-info` divs are present.
5. Read updated `chrome-extension/src/popup/popup.js` — confirm conditional render based on session, sign-in and sign-out handlers wired up.
6. Read `best-ball-manager/src/utils/extensionBridge.js` — confirm `readExtensionEntries` queries `extension_entries` with correct column selection and user_id filter.
7. Run `cd chrome-extension && npm run build` — confirm it exits 0 and `dist/` is produced.
8. **Developer step:** Apply the SQL migration in the Supabase SQL editor. In the extension popup, sign in with a test account. Confirm popup switches to auth-info view showing the user's email.

## Files to Change

| File | Action | Description |
|------|--------|-------------|
| `docs/migrations/001_extension_entries.sql` | Create | SQL migration for `extension_entries` table + RLS policy + index |
| `chrome-extension/src/utils/supabase.js` | Create | Supabase client for extension — uses Vite env vars, chrome.storage.local as auth storage |
| `chrome-extension/src/utils/bridge.js` | Create | writeEntries, getAuthSession, signIn, signOut |
| `chrome-extension/src/popup/popup.html` | Modify | Add auth-form (email, password, sign-in button) + auth-info (email display, sign-out button) |
| `chrome-extension/src/popup/popup.js` | Modify | Conditional auth UI render; sign-in/sign-out handlers using bridge.js |
| `chrome-extension/package.json` | Modify | Add `@supabase/supabase-js` dependency |
| `chrome-extension/.env.example` | Create | Documents VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY |
| `best-ball-manager/src/utils/extensionBridge.js` | Create | readExtensionEntries(userId) — reads from extension_entries |

## Dependencies

TASK-042 (extension scaffold) — complete.

## Open Questions (resolved)

- **Raw vs processed:** Raw — web app processes via existing pipeline.
- **Full replace vs append:** Full replace — simpler for v1.
- **Auth mechanism:** Email/password in popup, session stored via chrome.storage.local-backed Supabase auth.
- **Credentials bundling:** Vite env vars baked into extension bundle at build time; anon key is safe to bundle.

---
*Approved by: developer, 2026-03-31*
