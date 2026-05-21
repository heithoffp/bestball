# BBE Admin Scraper (Developer Only)

Implements **TASK-241** under the binding constraints of **[ADR-008](../docs/adr/adr-008-admin-side-ud-scraping-pipeline-for-draft-board-backfill.md)**.

## What this is

A separate Chrome/Edge extension that runs in the developer's own browser. It captures the UD Bearer token from a live session, then on-demand fetches `/v2/drafts/{id}` for distinct draft IDs harvested from `extension_entries` in Supabase, and upserts the full board into the `draft_boards_admin` table.

## What this is NOT

- **Not for distribution.** Never publish. Never link from any user-facing page.
- **Not scheduled.** Manual "Run now" only in this version. Scheduled runs are a planned follow-up.
- **Not a customer-facing surface.** The web app does not read this table yet.

## Setup

1. Copy `.env.example` to `.env.local` and fill in the Supabase URL and **service-role** key.
2. `npm install`
3. `npm run build`
4. In Edge or Chrome, open the Extensions page → Developer mode → Load unpacked → select `admin-extension/dist/`.
5. Sign in to UD (`app.underdogfantasy.com`). The popup will show a green "UD token captured" indicator within ~30 seconds.

## Operation

Open the popup, click **Run now**. The scraper:

- Queries Supabase for distinct `entry_id`s from `extension_entries` not already in `draft_boards_admin`.
- Filters to the slate-title allowlist (`src/scraper/whitelist.js`).
- Fetches up to 50 IDs, **≥ 2 s** between requests with **±500 ms jitter**.
- Upserts results.
- Halts on 401/403 until you click **Re-enable**. Doubles delay + retries once on 429/5xx, then halts that run.

## Safety rails (binding per ADR-008)

- **Do not raise the rate budget.** 1 req / 2 s base + jitter, ≤ 50 IDs per run. Changing this requires a new ADR.
- **Do not extend discovery.** This scraper reads draft IDs *only* from `extension_entries`. Crawling UD leaderboards or enumerating drafts is explicitly out of scope.
- **Do not relax the slate-title allowlist** without confirming the new value is public (visible to any authenticated UD account).
- **Service-role key lives in `.env.local`.** Never commit it.
- **Off-hours bias is your responsibility** when running manually. Avoid US prime-time (4–10 pm ET) windows.

If UD sends a cease-and-desist or you observe account suspension, **stop the scraper** and trigger ADR-008's Revisit Conditions.

## Files

- `src/injected/ud-token-bridge.js` — page-context XHR wrapper that captures the Bearer token.
- `src/content/content.js` — content-script relay of token to background.
- `src/background.js` — service worker; receives "Run now" from popup, dispatches the scraper.
- `src/scraper/run.js` — the run loop (queue, rate-limit, retry, halt-on-auth).
- `src/scraper/whitelist.js` — slate-title allowlist.
- `src/scraper/normalizePick.js` — UD pick → table row shape.
- `src/utils/supabase.js` — Supabase client (service-role key from `.env.local`).
- `src/popup/` — dev-only dashboard UI.
