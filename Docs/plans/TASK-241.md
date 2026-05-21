# TASK-241: Admin draft-board scraper — periodic UD fetch by draft_id

**Status:** Pending Approval
**Priority:** P3

---

## Objective
Build the **pipeline half** of admin-side draft-board backfill (per [ADR-008](../adr/adr-008-admin-side-ud-scraping-pipeline-for-draft-board-backfill.md)): a dedicated Chrome/Edge extension that runs in the developer's own browser, captures the UD Bearer token from a live UD session, periodically polls Supabase for distinct `draft_id`s in `extension_entries`, fetches `/v2/drafts/{id}` with cautious rate-limiting, and upserts the full board into a new `draft_boards_admin` table. **No customer-facing surface in this task** — RosterViewer's prefer-admin merge logic is deferred to a separate follow-up task.

## Verification Criteria

1. A new Supabase table `draft_boards_admin` exists with columns `draft_id text primary key`, `slate_title text`, `entry_count int`, `rounds int`, `picks jsonb`, `fetched_at timestamptz default now()`, and `source text default 'admin_scraper'`. RLS denies all client-side access; only the service role (used by the admin extension via the anon key + a `scraper` Supabase user, or via a service-role key embedded in the dev-only extension build) can read/write.
2. A new directory `admin-extension/` exists, mirroring the structure of `chrome-extension/` (Vite + @crxjs build, `src/`, `manifest.json`, `dist/`). It is **not** linked from any user-facing install page and is documented as developer-only.
3. The admin extension's `manifest.json` declares only the hosts it needs: `https://app.underdogfantasy.com/*`, `https://api.underdogfantasy.com/*`, `https://api.underdogsports.com/*`, and the project's Supabase URL.
4. After loading the admin extension unpacked, signing in to UD once, and triggering a scraper run (via popup button), the extension:
   - Queries Supabase for distinct `draft_id`s from `extension_entries` that do **not** already appear in `draft_boards_admin`.
   - Fetches up to **50** IDs per run, with **≥ 2000 ms** between requests and **±500 ms jitter**.
   - Skips any draft whose `slate_title` (from `extension_entries`) is not on the whitelist (initial allowlist: `BBM`, `Best Ball Mania`, `Smash Bros`, `Eliminator`, `Pomeranian`, `The Big Board`, `Puppy`, `Kitten` — verify against actual values in `extension_entries.slate_title` before final approval).
   - Persists each fetched board as a row in `draft_boards_admin` with `picks` shaped as `[{pick, round, slot, draftEntryId, userId, name, position, team}]`, plus `entry_count`, `rounds`, `slate_title`.
   - Logs each fetched/skipped ID to the extension's background console with the reason (`fetched`, `skipped-whitelist`, `skipped-already-cached`, `error-NNN`).
5. On a `429` or `5xx` response: the run doubles its inter-request delay, retries once, then halts that run. The next scheduled run resumes at the normal 2 s base pace.
6. On a `401` or `403` response: the run halts immediately, sets a `scraper_disabled_until_manual_reenable` flag in `chrome.storage.local`, and the popup surfaces a red banner ("Auth failed — sign in to UD and click Re-enable"). Subsequent scheduled runs are skipped until the developer clicks the re-enable button.
7. **Manual-run only for now.** No `chrome.alarms` registration; the only way to trigger a scraper run is the popup's "Run now" button. (Scheduled background runs are deferred to a follow-up task — see "Follow-up tasks" below.)
8. Re-running the scraper against the same set of `draft_id`s does **not** re-fetch any cached IDs (verified by inspecting console logs on a second run — all should report `skipped-already-cached`).
9. The popup displays: connected/disconnected state (UD token captured?), Supabase connection state, last run timestamp, count of new boards added on last run, count of total boards cached, and a "Run now" button.
10. **No customer-facing UI changes.** Web app (`best-ball-manager/`) source is **not modified** by this task. RosterViewer continues to render exactly as it does today.
11. `npm run lint` passes in `admin-extension/`. The main `chrome-extension/` and `best-ball-manager/` are unchanged and continue to build/lint clean.

## Verification Approach

1. **Supabase migration**
   - Run `supabase db push` against the local Supabase project, or apply the SQL manually to the hosted project via the SQL editor.
   - Confirm the table and RLS policies via `select * from information_schema.tables where table_name='draft_boards_admin'` and `select * from pg_policies where tablename='draft_boards_admin'`.
   - **Manual step:** Developer applies the migration to the hosted Supabase instance.

2. **Slate-title whitelist sanity check** (before approving)
   - Run `select distinct slate_title from extension_entries where slate_title is not null order by slate_title` against the hosted DB.
   - Confirm the allowlist values in the plan match real values. Adjust the plan before approval if the actual values differ. **Manual step.**

3. **Admin extension build**
   - `cd admin-extension && npm install && npm run build`. Verify `dist/` is produced without errors.
   - **Manual step:** Developer loads the unpacked `admin-extension/dist/` in Edge or Chrome (developer mode → Load unpacked).

4. **Live-session smoke test**
   - **Manual step:** Developer signs in to UD in the browser with the admin extension loaded. Open the extension popup; confirm the "UD token captured" indicator turns green within ~30 seconds.
   - **Manual step:** Click "Run now". Observe the background console (extension service worker console) and confirm:
     - At least one `fetched` log line.
     - At least one `skipped-whitelist` line (if any non-whitelisted slate is present).
     - Inter-request timing ≥ 2 s (visible from log timestamps).
   - Run a `select count(*) from draft_boards_admin` query in Supabase — confirm rows landed.

5. **Idempotency check**
   - Click "Run now" a second time. Confirm all log lines report `skipped-already-cached`. `select count(*) from draft_boards_admin` is unchanged.

6. **Whitelist enforcement**
   - Manually insert a fake `extension_entries` row with a private-slate title not on the allowlist. Click "Run now". Confirm the new row is logged as `skipped-whitelist` and no corresponding row appears in `draft_boards_admin`. Delete the fake row afterward.

7. **Rate-limit response handling** (best-effort, simulated)
   - The admin extension exposes a `__BBM_ADMIN_FORCE_429=true` toggle in `chrome.storage.local` for testing. With it set, the next request is intercepted in code and treated as if it returned 429. Confirm:
     - Inter-request delay doubles for that run.
     - One retry is attempted.
     - Run halts after the retry; the next alarm-driven run resumes at base pace.

8. **Auth failure handling** (simulated)
   - Manually clear `window.__BBM.token` from the injected bridge (or set `__BBM_ADMIN_FORCE_401=true`). Confirm the popup shows the red "Auth failed" banner, subsequent alarm runs do nothing, and clicking "Re-enable" clears the flag.

9. **Lint**
   - `cd admin-extension && npm run lint`. Must be clean.

10. **No customer-facing regression**
    - `cd best-ball-manager && npm run lint && npm run build`. Both pass.
    - `cd chrome-extension && npm run build`. Passes.

## Files to Change

| File | Action | Description |
|------|--------|-------------|
| `supabase/migrations/006_create_draft_boards_admin.sql` | Create | Create the `draft_boards_admin` table + RLS policies (deny anon, allow service role). |
| `admin-extension/package.json` | Create | Vite + @crxjs + @supabase/supabase-js (mirroring `chrome-extension/package.json`). |
| `admin-extension/vite.config.js` | Create | Same crxjs config pattern as `chrome-extension/vite.config.js`. |
| `admin-extension/manifest.json` | Create | MV3 manifest, narrow host_permissions (UD api hosts + Supabase URL), background service worker, `chrome.alarms` permission. |
| `admin-extension/src/background.js` | Create | Service worker; receives "Run now" messages from popup, owns retry/halt flags. No alarm registration. |
| `admin-extension/src/injected/ud-token-bridge.js` | Create | Lifted from `chrome-extension/src/injected/underdog-bridge.js` but **token capture only** — no entry sync logic. Exposes `window.__BBM_ADMIN.token` for the scraper. |
| `admin-extension/src/content/content.js` | Create | Inject `ud-token-bridge.js` into UD pages (world: MAIN), relay captured token to background via `chrome.runtime.sendMessage`. |
| `admin-extension/src/scraper/run.js` | Create | The core run loop: query Supabase for unfetched draft_ids, apply whitelist, fetch `/v2/drafts/{id}` one at a time with delay+jitter, upsert results, handle 401/403/429/5xx per ADR-008. |
| `admin-extension/src/scraper/whitelist.js` | Create | Exported `SLATE_TITLE_ALLOWLIST` array + `isWhitelisted(slateTitle)` helper. |
| `admin-extension/src/scraper/normalizePick.js` | Create | Shape a UD pick into `{pick, round, slot, draftEntryId, userId, name, position, team}` using the slot map derived from `draft.draft_entries`. |
| `admin-extension/src/utils/supabase.js` | Create | Supabase client (anon key + a dedicated `scraper` user, or service-role key — see Implementation Approach §1 for the decision). |
| `admin-extension/src/popup/popup.html` | Create | Status panel: UD token state, Supabase state, last-run summary, "Run now" button, auth-failure banner + Re-enable button. |
| `admin-extension/src/popup/popup.js` | Create | Wires popup UI to background state via `chrome.runtime.sendMessage`. |
| `admin-extension/src/popup/popup.css` | Create | Minimal styling, dev-only — no brand polish needed. |
| `admin-extension/.eslintrc.cjs` | Create | Lift from `chrome-extension/`. |
| `admin-extension/.gitignore` | Create | Ignore `dist/`, `node_modules/`. |
| `admin-extension/README.md` | Create | Developer-only docs: how to load, what it does, ADR-008 reference, safe-operation reminders. |
| `BACKLOG.md` (via hus-backlog after impl) | Modify | Add follow-up task "TASK-XXX: RosterViewer prefer-admin draft board over per-user". |

**Not modified:** `best-ball-manager/`, `chrome-extension/`. Both remain untouched.

## Implementation Approach

### 1. Supabase table + auth model

`supabase/migrations/006_create_draft_boards_admin.sql`:

```sql
create table if not exists public.draft_boards_admin (
  draft_id     text primary key,
  slate_title  text,
  entry_count  int,
  rounds       int,
  picks        jsonb not null,
  fetched_at   timestamptz not null default now(),
  source       text not null default 'admin_scraper'
);

alter table public.draft_boards_admin enable row level security;

-- Default deny: no anon or authenticated read/write.
-- The admin extension uses the service role key (embedded in the
-- developer-only build, never shipped to customers) to bypass RLS.
-- A future task will add a read policy when RosterViewer needs access.
```

**Auth decision — service-role key in admin extension.** Rationale: the admin extension is loaded unpacked by the developer only, never distributed. The key never lives on customer machines. Alternative considered (dedicated `scraper` Supabase auth user) is rejected because it requires storing a long-lived refresh token in `chrome.storage.local` and adds login UX. Service-role key in a `.env.local` consumed at build time is simpler and the threat model is the developer's own machine, which already has the same secrets.

**Open question for developer approval:** confirm comfort with bundling the service-role key into a locally-built, never-distributed extension. If not comfortable, fall back to the `scraper` user pattern (adds a popup login step).

### 2. Directory bootstrap

Create `admin-extension/` by copying the relevant skeleton from `chrome-extension/`:

- `package.json` — name `bbe-admin-scraper`, version `0.1.0`, identical dev dependencies to `chrome-extension/`.
- `vite.config.js` — same `@crxjs/vite-plugin` setup; entry points: background, content, popup.
- `manifest.json`:
  ```json
  {
    "manifest_version": 3,
    "name": "BBE Admin — Draft Board Scraper (Developer Only)",
    "version": "0.1.0",
    "description": "Internal developer tool. Not for distribution.",
    "host_permissions": [
      "https://app.underdogfantasy.com/*",
      "https://api.underdogfantasy.com/*",
      "https://api.underdogsports.com/*",
      "<SUPABASE_URL>/*"
    ],
    "permissions": ["storage"],
    "background": { "service_worker": "src/background.js", "type": "module" },
    "action": { "default_popup": "src/popup/popup.html" },
    "content_scripts": [{
      "matches": ["https://app.underdogfantasy.com/*"],
      "js": ["src/content/content.js"],
      "run_at": "document_start"
    }]
  }
  ```

### 3. Token capture (content + injected)

`src/injected/ud-token-bridge.js` — lifted from the existing `chrome-extension/src/injected/underdog-bridge.js`, **stripping out** entry-sync state. Keep only:
- The XHR wrapper that captures `Authorization` from the first UD API call.
- The host detection (`apiHost`).
- Expose `window.__BBM_ADMIN = { token, apiHost }`.

`src/content/content.js`:
- Inject `ud-token-bridge.js` into the page (world: MAIN) at document_start.
- Periodically read `window.__BBM_ADMIN.token` (via a small relay script also injected) and forward to background via `chrome.runtime.sendMessage({ type: 'ud_token', token, apiHost })`.

`src/background.js`:
- Listen for `ud_token` messages; persist `{ token, apiHost, capturedAt }` to `chrome.storage.local.bbe_admin_auth`.

### 4. Scraper run (`src/scraper/run.js`)

Single async function `runScraper()` invoked by "Run now" message from the popup. No scheduled runs in this task.

Steps:
1. Read `bbe_admin_auth` and `scraper_disabled_until_manual_reenable` from `chrome.storage.local`. If disabled, return early.
2. If no token, log `no-token` and return.
3. Query Supabase: `select draft_id, slate_title from extension_entries where draft_id not in (select draft_id from draft_boards_admin) and slate_title is not null limit 200`. (Limit higher than 50 so the whitelist filter still yields enough candidates.)
4. Filter to whitelisted slate titles.
5. Take first 50.
6. For each draft_id (sequentially):
   - Sleep `baseDelay + jitter()` where `baseDelay = 2000 ms` and `jitter() = Math.random() * 1000 - 500`. Apply this **before** every request (not just between requests).
   - `fetch(\`https://${apiHost}/v2/drafts/${draftId}\`, { headers: { Authorization: token } })`.
   - Handle response:
     - **2xx:** normalize via `normalizePick`, upsert row, increment local "fetched" counter.
     - **429 or 5xx:** double `baseDelay`, sleep, retry once. If retry also fails, halt this run (break loop).
     - **401 or 403:** set `scraper_disabled_until_manual_reenable=true`, halt run, surface popup banner via `chrome.runtime.sendMessage`.
     - **404:** log + skip (draft deleted).
     - **other:** log + skip.
7. Persist last-run summary to `chrome.storage.local.bbe_admin_last_run = { ts, fetched, skipped, errors }`.

`jitter()` is recomputed per request, **not** per run, so the sequence isn't a fixed pattern.

**Off-hours bias:** Not enforced by code in this task (no scheduler). The developer running the scraper manually is responsible for off-hours timing per ADR-008.

### 5. Whitelist (`src/scraper/whitelist.js`)

```js
export const SLATE_TITLE_ALLOWLIST = [
  'BBM',                      // Best Ball Mania
  'Best Ball Mania',
  'Smash Bros',
  'Eliminator',
  'Pomeranian',
  'The Big Board',
  'Puppy',
  'Kitten',
];

// Case-insensitive prefix match — UD often appends round/wave suffixes.
export function isWhitelisted(slateTitle) {
  if (!slateTitle) return false;
  const t = slateTitle.toLowerCase();
  return SLATE_TITLE_ALLOWLIST.some(w => t.startsWith(w.toLowerCase()));
}
```

The exact list will be confirmed via the Verification Approach §2 query before approval.

### 6. Pick normalization (`src/scraper/normalizePick.js`)

Mirrors what TASK-240's plan does in the customer extension, but standalone:

```js
export function normalizePicks(draft) {
  const picks = draft.picks ?? [];
  const entryCount = draft.entry_count ?? 12;
  const rounds = draft.rounds ?? Math.ceil(picks.length / entryCount);

  const slotByEntry = {};
  for (const e of (draft.draft_entries ?? [])) {
    const slot = e.pick_order ?? e.slot_index ?? null;
    if (slot != null) slotByEntry[String(e.id)] = slot;
  }

  const normalized = picks.map(p => ({
    pick:         p.number ?? p.pick_number ?? null,
    round:        p.round ?? null,
    slot:         slotByEntry[String(p.draft_entry_id ?? p.draftEntryId)] ?? null,
    draftEntryId: String(p.draft_entry_id ?? p.draftEntryId ?? ''),
    userId:       String(p.user_id ?? p.userId ?? ''),
    name:         p.appearance?.name ?? p.player_name ?? null,
    position:     p.appearance?.position ?? p.position ?? null,
    team:         p.appearance?.team_abbr ?? p.team ?? null,
  }));

  return { picks: normalized, entryCount, rounds };
}
```

If `pick_order`/`slot_index` are both missing, log a warning and skip the draft (do not store a board with null slots — TASK-240 surfaces the same risk; resolving the field name happens once, in either task).

### 7. Popup UI

Minimal — this is a developer dashboard, not a customer surface:
- "UD token: ✓ captured / ✗ missing" with timestamp.
- "Supabase: ✓ connected / ✗ error" with error string.
- "Last run: <ts> — fetched N, skipped M (whitelist W, cached C), errors E".
- "Total boards cached: <count>".
- "Run now" button (dispatches message to background).
- Red banner if `scraper_disabled_until_manual_reenable` is true, with "Re-enable" button.

### 8. Safety rails to surface in `admin-extension/README.md`
- "This extension is loaded unpacked in the developer's browser only. Never publish."
- "If UD sends a cease-and-desist or you observe account suspension, stop the scraper and trigger ADR-008's Revisit Conditions."
- "Service-role Supabase key lives in `.env.local`; never commit."
- "If you change the rate budget, you are violating ADR-008's binding constraints. Write a new ADR first."

### 9. Follow-up tasks (added after impl, before close)

After this task is implemented and verified, add to BACKLOG.md (via hus-backlog):

1. **RosterViewer — prefer admin-scraped draft board over per-user when available.** Wire the read path: when RosterViewer opens TASK-240's modal, first check `draft_boards_admin` (via a new RLS read policy or a Supabase RPC), fall back to the row's `draft_board` from `extension_entries`. Mirror-not-advisor still holds. Includes the dual-data-path test matrix (admin-only, user-only, both, neither) called out in ADR-008.
2. **Admin scraper — scheduled background runs via `chrome.alarms`.** Add the alarm-driven scheduler that this task deferred. Includes off-hours bias (09:00 / 15:00 / 21:00 / 03:00 UTC pattern), permission addition to manifest, and run-history persistence.

## Dependencies

- **ADR-008** (Accepted, 2026-05-21) — defines the binding rate/whitelist/halt constraints this plan implements.
- **TASK-240** — not a hard blocker for this task (this task writes to its own table and doesn't touch the customer extension), but the follow-up RosterViewer-merge task depends on TASK-240 having shipped first.

## Open Questions

1. **Service-role key embedding vs. dedicated `scraper` Supabase user.** Plan currently chooses service-role key bundled at build time in a never-distributed extension. Confirm before approval.
2. **Exact `slate_title` allowlist values.** Plan lists best-guess BBM-family titles; final list confirmed by running the `select distinct slate_title` query in Verification Approach §2. Adjust the plan before approval if the actual values differ materially.
3. ~~**Alarm period.**~~ Resolved: manual-run only for now, no scheduler. Scheduled runs deferred to a follow-up task.

---
*Approved by: PHK — 2026-05-21 (with revisions: manual-run only, no alarm; service-role key bundled OK; whitelist confirmed at smoke-test time)**
