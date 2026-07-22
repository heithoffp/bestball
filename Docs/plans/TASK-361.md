# TASK-361: Supabase Disk IO reduction, round 2

**Status:** Approved (developer approved in-session, 2026-07-22)
**Priority:** P1
**Created:** 2026-07-22

## Objective

Eliminate the recurring Supabase Disk IO budget depletion warnings by removing the four
remaining consumers identified in the 2026-07-22 deep dive (follow-up to TASK-315/316):

1. **Realtime WAL pollers** — the only published table is `public.subscriptions`, consumed
   solely by the `postgres_changes` channel in `SubscriptionContext.jsx` (checkout-completion
   refresh). The pollers have accrued 9.1M queries / ~12.7h execution since the March stats
   reset — the top sustained load on the instance.
2. **`draft_boards_admin` TOAST detoasting** — 59 MB of `picks` JSONB (4,055 boards × ~15 KB)
   repeatedly detoasted by full-`picks` fetches and by `picks->0->>name` availability checks
   (extension `readBoardIds()`), which detoast the whole array to read one name.
3. **`arena_teams` dead space** — 33 MB heap + 4.9 MB indexes for 502 live rows after the
   BBM7-only purge (2026-07-22); leaderboard queries average 772 ms crawling empty pages.
   Two backup tables (`arena_teams_backup_20260722` 34 MB, `arena_matches_backup_20260722`)
   add dead weight.
4. **Per-row RLS re-evaluation** — `auth.uid()` and `arena_beta_mode()` /
   `arena_email_allowed()` evaluated per row instead of once per query (3.3M index scans on
   the 1-row `arena_config`; `auth_rls_initplan` advisor warnings on every table). Plus
   three unindexed FKs on `arena_matches` and two never-used indexes on `subscriptions`.

## Verification Criteria

1. Supabase performance advisors report **zero `auth_rls_initplan` warnings** and no
   unindexed-FK findings for `arena_matches`.
2. `arena_teams` total relation size (heap + indexes) is **under 1 MB**, and the Realtime
   WAL-poller queries **stop accruing calls** in `pg_stat_statements` after the publication
   change deploys.
3. The subscription tier still refreshes correctly after a Stripe checkout (manual test) and
   the extension's post-sync board backfill still converges (repeated syncs skip usable
   boards) without detoasting `picks`.

## Verification Approach

- **Phase 1:** After `VACUUM FULL` + `REINDEX`, run
  `SELECT pg_size_pretty(pg_total_relation_size('public.arena_teams'))` → expect < 1 MB.
  Confirm backup tables dropped (or retention window documented if deferred).
- **Phase 2:** Confirm `pg_publication_tables` no longer lists `public.subscriptions`;
  snapshot the WAL-poller call counts in `pg_stat_statements`, re-check after ≥1 hour with
  the web app open → counts unchanged. Manual checkout-flow test: complete (or simulate via
  Stripe test webhook) a checkout, confirm the tier updates on the success redirect and on
  window refocus without a page reload.
- **Phase 3:** Re-run `get_advisors(performance)` → zero `auth_rls_initplan` lints; run
  `EXPLAIN` on an `arena_teams` leaderboard select as `authenticated` → `arena_beta_mode()`
  appears as an InitPlan, not a per-row filter call. RLS behavior unchanged: anon sees only
  `enrolled = true` rows; authenticated users see enrolled + own rows.
- **Phase 4:** With the maintained availability column in place, `readBoardIds()` query
  plan touches no TOAST (`EXPLAIN (ANALYZE, BUFFERS)` shows no toast reads); extension
  rebuilt (`cd chrome-extension && npm run build`) and a repeat sync skips complete boards.
- **Overall:** `npx playwright test` passes; watch the Disk IO budget graph in the Supabase
  dashboard for one week post-deploy — no depletion warnings.

## Files to Change

| File | Change |
|------|--------|
| DB (maintenance, no migration) | `VACUUM FULL` + `REINDEX` on `arena_teams`; drop `arena_teams_backup_20260722` / `arena_matches_backup_20260722` after developer confirms the BBM7 purge is final |
| `supabase/migrations/020_*.sql` (new) | Drop `public.subscriptions` from `supabase_realtime` publication; rewrite all `auth_rls_initplan`-flagged policies to `(select auth.uid())` / `(select arena_beta_mode())` / `(select arena_email_allowed())`; add covering indexes for `arena_matches.team_a_id/team_b_id/winner_id`; drop `idx_subscriptions_apple_original_transaction_id` and `idx_subscriptions_stripe_customer_id`; add maintained board-availability column (e.g. `first_pick_name text` or `usable boolean`) on `draft_boards_admin` + one-time backfill |
| `best-ball-manager/src/contexts/SubscriptionContext.jsx` | Remove the `postgres_changes` channel; replace with one-shot refetch on checkout success redirect + refetch-on-window-focus |
| `chrome-extension/src/utils/bridge.js` | `readBoardIds()` selects the maintained column instead of `picks->0->>name`; `writeBoards()` populates it; rebuild dist |
| `best-ball-manager/src/utils/draftBoards.js` | Delete uncalled `fetchAvailableBoardIds()` (verify no callers first); mirror availability-column usage if any web path needs it |
| `mobile-app/shared/utils/draftBoards.js` | Keep in lockstep with the web copy (port snapshot rule) |
| Supabase dashboard (manual) | Disable Realtime for the project once the publication is empty |

## Implementation Approach

Ship in four phases, ordered so each is independently verifiable and reversible:

1. **Storage reclaim (SQL maintenance, no code):** `VACUUM FULL public.arena_teams; REINDEX
   TABLE public.arena_teams;` (locks table for seconds at current size — acceptable at
   current traffic). Drop the two backup tables only after developer confirmation.
2. **Kill the Realtime poller:** client change in `SubscriptionContext.jsx` first (refetch on
   success redirect + `visibilitychange`/focus listener while a `checkout_pending` flag is
   set), deploy, then `ALTER PUBLICATION supabase_realtime DROP TABLE public.subscriptions;`
   and disable Realtime in project settings.
3. **RLS constant-cost migration:** one migration wrapping all flagged policy expressions in
   scalar subqueries (initplan evaluation), plus the three `arena_matches` FK indexes and the
   two `subscriptions` index drops. Identical behavior, only evaluation cost changes —
   references ADR-017 (Arena public-launch hardening) since it touches launched Arena gates.
4. **TOAST diet:** add the maintained availability column + backfill, switch extension
   `readBoardIds()` to it, rebuild the extension, delete dead `fetchAvailableBoardIds()`
   from web + mobile-shared copies.

Rollback: each phase is a single revert (client commit revert; `ALTER PUBLICATION ... ADD
TABLE` + re-enable Realtime; policy-restore migration; column is additive and ignorable).

## Verification Results (2026-07-22)

- **Phase 1:** `arena_teams` 38 MB → **984 kB** total (744 kB heap + 232 kB indexes) after
  `VACUUM FULL` (which also rebuilt indexes — separate REINDEX unnecessary). Backup tables
  dropped 2026-07-22 with developer approval (BBM7 purge confirmed final).
- **Phase 2:** `pg_publication_tables` shows no `public` tables — `subscriptions` removed.
  WAL-poller baseline for post-deploy comparison (`pg_stat_statements` queryid → calls):
  `-5556204937419350620` → 4,910,623; `-1900756740005770185` → 3,085,876;
  `-1631547114752225130` → 1,111,443. Manual: checkout-flow test + dashboard Realtime
  disable after Vercel deploy.
- **Phase 3:** Performance advisors report **zero `auth_rls_initplan`** and zero
  `unindexed_foreign_keys` lints (remaining INFO items: backup tables pending drop; the
  three new FK indexes trivially flagged unused at age zero). `EXPLAIN` as `anon` on
  `arena_teams` shows `arena_beta_mode()` as `InitPlan 1` — once per query.
- **Phase 4:** `first_pick_name` backfilled 4,055/4,055 rows; extension rebuilt
  (`npm run build` OK); dead `fetchAvailableBoardIds()` removed from web + mobile-shared.
- **Overall:** web production build passes; ESLint clean for all touched files (7
  pre-existing findings in untouched files). **Plan deviation (better):** the generated
  column made the planned `writeBoards()` change unnecessary — Postgres computes the
  column on write. **Plan deviation (gap):** `npx playwright test` finds no tests — the
  web app has no e2e suite (CLAUDE.md reference is stale); captured as TASK-362. Lint +
  build substitute as automated verification.

## Dependencies
None

## Notes

- Prior art: TASK-315/316 (2026-07-09) shipped the slim-boards Storage artifact +
  `arena_teams.featured`; `realDraftData.js` already reads the artifact. This task clears
  the remaining tail.
- If warnings persist after all four phases, fallback is a compute upgrade — not expected,
  as the sustained load is self-inflicted rather than organic traffic.
- Edge-function deploys are not expected, but any migration touching Arena behavior gates
  should be smoke-tested against the live Arena (beta_mode=false) after `supabase db push`.
