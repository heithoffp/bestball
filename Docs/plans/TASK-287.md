# TASK-287: Arena migration 012 + private-beta build (lead/consolidated plan)

**Status:** Pending Approval
**Priority:** P2

---

> **Consolidated plan.** This is the lead plan for the Best Ball Arena private-beta
> build (ADR-014 + ADR-015). It covers TASK-287 (migration 012), **TASK-288**
> (auto-registration ingestion), **TASK-289** (leaderboard visibility),
> **TASK-294** (private-beta allowlist gate), and **TASK-293** (the `opt_out` flip,
> folded into the migration). Those task files reference this one for detail.
> **Deferred (not in this build):** TASK-290 (board-team takedown) and TASK-291
> (privacy/ToS) — they gate the future `beta_mode = false` *public* launch, not this
> beta deploy (ADR-015).

## Objective

Ship the complete Best Ball Arena opt-out machine to production as a **private beta**:
every synced team — the user's own entries **and** the other 11 participant-captured
board rosters per pod — auto-registers into the blind vote pool and the Elo
leaderboard, but **every Arena surface is restricted to an email allowlist** (the
developer's `heithoff.patrick+*@gmail.com` accounts) so no third-party roster is
exposed publicly. Schema, RLS, Edge Functions, ingestion, and the frontend gate land
together; the `opt_out` flip is included; public-launch guardrails stay deferred.

## Verification Criteria

1. **Migration 012 applies cleanly** on top of 011 (idempotent, re-runnable), yielding:
   `arena_teams.user_id` nullable, `entry_id` nullable, new `source` / `draft_id` /
   `board_entry_ref` / `board_user_hash` columns; the two partial unique indexes
   (owned + board); column-scoped client SELECT that **excludes** `board_entry_ref`
   and `board_user_hash`; `arena_config.beta_mode = true`, `arena_eligibility_mode = 'opt_out'`,
   and a seeded `beta_allowlist`.
2. **Board dedup works:** inserting the same `(board_entry_ref, platform)` twice
   conflicts (one row); two `source='owned'` rows for different users with the same
   `entry_id`/`platform` coexist.
3. **Client cannot read raw UD board ids:** `select board_entry_ref from arena_teams`
   as `authenticated`/`anon` is rejected (no column grant); `select id, display_snapshot, elo …`
   still works subject to RLS.
4. **Beta RLS gate:** with `beta_mode = true`, an allowlisted authenticated user reads
   the full pool; a non-allowlisted authenticated user and `anon` read **zero** rows.
5. **Edge Functions gate:** `arena-pair` / `arena-vote` / `arena-register` return `403`
   for guests and non-allowlisted users while `beta_mode = true`; an allowlisted user
   gets a pairing that **can include board (NULL-user) teams** (the `.neq` exclusion bug
   is fixed) and can vote.
6. **Guardrail #3:** `arena-register` refuses to create a `board` row whose `draft_id`
   has no `draft_boards_admin` row with `source='extension'`.
7. **Auto-registration:** visiting the Arena as an allowlisted user with synced rosters
   creates `source='owned'` rows for own entries and `source='board'` rows for the other
   11 seats per captured pod (own seat excluded), each with a frozen anonymized snapshot
   and no owner identity in client-readable columns.
8. **Leaderboard:** `getLeaderboard()` returns auto-registered teams without an
   `enrolled = true` filter (board + owned both appear).
9. **Frontend gate:** the Arena tab and `/arena` route are present for an allowlisted
   signed-in user and absent (route redirects) for everyone else, including guests.
10. **Build is clean:** `npm run build` and `npm run lint` pass in `best-ball-manager/`.

## Verification Approach

**Claude can run now (this session):**
- `cd best-ball-manager && npm run lint && npm run build` → both exit 0, no new errors.
- Static SQL review of `012_*.sql` for idempotency (`if not exists` / `drop … if exists` /
  `do $$ … $$` guards), grant correctness, and that no statement references a column it
  hasn't created.
- Deno type sanity for the Edge Functions (review-level; full `deno check` needs the
  developer's toolchain).

**Developer runs (deploy + live verification — Docker / linked Supabase / Vercel):**
1. `supabase db push` (applies 011 then 012) → expect zero errors. Inspect:
   `\d public.arena_teams` (nullable `user_id`/`entry_id`, new columns), `\dp public.arena_teams`
   (no `board_entry_ref`/`board_user_hash` in the `anon`/`authenticated` SELECT grant),
   `select arena_eligibility_mode, beta_mode, beta_allowlist from arena_config;` →
   `opt_out`, `true`, `{heithoff.patrick@gmail.com}`.
2. Deploy functions: `supabase functions deploy arena-pair arena-vote arena-register`;
   set secrets `ARENA_TOKEN_SECRET`, confirm `SB_SERVICE_ROLE_KEY` present.
3. Deploy frontend to `main` (Vercel).
4. Smoke test signed in as `heithoff.patrick+beta@gmail.com`: Arena tab visible → it
   auto-registers → leaderboard shows owned + board teams → a pairing can surface a board
   team → a vote records and moves Elo.
5. Confirm a non-allowlisted account (or guest) sees **no** Arena tab and that direct
   `GET /arena` redirects; confirm a direct `arena-pair` call without an allowlisted JWT
   returns `403`.

This plan is **not** considered Verified until the developer confirms the live steps
(it ships SQL/RLS/Edge-Function behavior that cannot be fully exercised without a deploy).

## Files to Change

| File | Action | Description |
|------|--------|-------------|
| `supabase/migrations/012_arena_board_teams_and_beta_gate.sql` | Create | Schema for board teams (nullable `user_id`/`entry_id`, `source`, `draft_id`, service-role-only `board_entry_ref`/`board_user_hash`), partial unique indexes, column-scoped SELECT grant, `arena_config.beta_mode`/`beta_allowlist`, `arena_beta_mode()`/`arena_email_allowed()` helpers, RLS rewrite, and the `opt_out` + `beta_mode=true` config set (TASK-287/289/293/294). |
| `supabase/functions/_shared/arena.ts` | Modify | Add `normalizeEmail()` port + `betaGate(req, admin)` helper: reads `arena_config` (beta_mode, allowlist) via service_role, resolves caller email, returns allow/deny. |
| `supabase/functions/arena-pair/index.ts` | Modify | Fix NULL-user board exclusion (don't drop board rows for logged-in voters); add beta gate (reject guests + non-allowlisted when `beta_mode`). |
| `supabase/functions/arena-vote/index.ts` | Modify | Add beta gate (reject guests + non-allowlisted when `beta_mode`). |
| `supabase/functions/arena-register/index.ts` | Create | Service-role ingestion: upsert owned + board `arena_teams` rows from client-built snapshots; beta-gated; guardrail #3 check against `draft_boards_admin.source='extension'`. |
| `supabase/config.toml` | Modify | Register `arena-register` with `verify_jwt = false`. |
| `best-ball-manager/src/utils/arenaBeta.js` | Create | `isArenaBetaUser(email)` (mirrors `authorPreview.js` normalize + allowlist) — frontend convenience gate. |
| `best-ball-manager/src/App.jsx` | Modify | Hide the `arena` tab + guard/redirect the `/arena` route unless `isArenaBetaUser(user?.email)`. |
| `best-ball-manager/src/utils/arenaSnapshot.js` | Modify | Add `buildBoardTeams(boardPicks, ownDraftEntryId)` → anonymized board-team snapshots (group by `draftEntryId`, exclude own seat). |
| `best-ball-manager/src/utils/arenaClient.js` | Modify | Add `registerArenaTeams({ownedTeams, boardTeams})`; drop the `.eq('enrolled', true)` filter in `getLeaderboard()` (TASK-289). |
| `best-ball-manager/src/components/Arena.jsx` (+ arena subcomponents as needed) | Modify | On mount, for an allowlisted signed-in user with synced data, call `registerArenaTeams` once per session; suppress guest-vote affordances during beta. |
| `docs/migrations/arena-data-model.md` | Modify | Document the 012 board-team model, the beta gate, and the deferred public-launch limitations. |

## Implementation Approach

**Order matters — build bottom-up so each layer can be reasoned about before the next.**

### 1. Migration 012 (`supabase/migrations/012_arena_board_teams_and_beta_gate.sql`)
- All statements idempotent (`alter table … add column if not exists`, `drop … if exists`,
  `create index if not exists`, guard constraint adds in `do $$ begin … exception when
  duplicate_object then null; end $$`).
- `arena_teams`: `alter column user_id drop not null`; `alter column entry_id drop not null`;
  add `source text not null default 'owned' check (source in ('owned','board'))`,
  `draft_id text`, `board_entry_ref text`, `board_user_hash text`.
- Drop the old `unique (user_id, entry_id, platform)` constraint; create
  `create unique index if not exists arena_teams_owned_uniq on public.arena_teams
  (user_id, entry_id, platform) where source = 'owned';` and
  `… arena_teams_board_uniq … (board_entry_ref, platform) where source = 'board';`.
- **Grants:** revoke the broad `select` and re-grant **column-scoped** SELECT to
  `anon, authenticated` over every column **except** `board_entry_ref`, `board_user_hash`.
  Keep the existing column-scoped INSERT/UPDATE for `authenticated` (owned rows only —
  do not add board columns). `service_role` keeps full DML.
- `arena_config`: `add column if not exists beta_mode boolean not null default true`;
  `add column if not exists beta_allowlist text[] not null default array['heithoff.patrick@gmail.com']::text[]`;
  then `update arena_config set arena_eligibility_mode='opt_out', beta_mode=true where id=true;`
  (folds the TASK-293 flip; `beta_mode=false` public launch stays out).
- Helpers (both `security definer`, `stable`, `set search_path = public`):
  - `arena_beta_mode()` → `select beta_mode from arena_config where id`.
  - `arena_normalize_email(text)` → lowercase, strip a `+tag` from the local part (mirror
    `authorPreview.normalizeEmail`).
  - `arena_email_allowed()` → `arena_normalize_email(auth.jwt()->>'email')` is a member of
    `(select beta_allowlist from arena_config where id)`; returns false when no JWT/email.
- **RLS rewrite** on `arena_teams`:
  - Drop the two 011 SELECT policies; create:
    - authenticated: `using (case when arena_beta_mode() then arena_email_allowed()
      else (enrolled = true or user_id = auth.uid()) end)`.
    - anon: `using (case when arena_beta_mode() then false else true end)`
      (post-beta public `opt_out` shows the whole board; during beta anon sees nothing).
  - Keep the owner-only INSERT/UPDATE policies but scope them to `source = 'owned'`
    (`with check (user_id = auth.uid() and source = 'owned')`), so a client can never
    create or mutate a board row — board rows are service-role-only.

### 2. Edge Functions
- `_shared/arena.ts`: add `arenaNormalizeEmail()` and `betaGate(req, admin, anonKey, createClient)`
  → resolves voter via `resolveVoter`, fetches `arena_config` (beta_mode, allowlist), and
  returns `{ allowed: boolean, voterId, email }`. When `beta_mode` and not allowed → caller
  returns `403 { error: 'beta_closed' }`.
- `arena-pair`: call `betaGate` right after rate-limit; on deny return 403. **Fix the pool
  query:** replace `.neq("user_id", voterId)` with logic that keeps NULL-user board rows —
  fetch without the `neq`, then exclude `t.user_id === voterId` **in memory** (NULLs survive).
  The `opt_out` branch (drop `enrolled` filter) already exists.
- `arena-vote`: call `betaGate`; on deny 403. Self-vote check is already NULL-safe.
- `arena-register` (new): POST `{ ownedTeams: [{entryId, platform, draftId, snapshot}],
  boardTeams: [{boardEntryRef, userId, platform, draftId, snapshot}] }`. Steps: `betaGate`
  (403 if denied) → for owned, upsert on `(user_id, entry_id, platform)` with
  `user_id = voterId, source='owned'` → for each board team, verify
  `exists(select 1 from draft_boards_admin where draft_id = team.draftId and source='extension')`
  (skip + log if absent — guardrail #3), compute `board_user_hash = base64(HMAC-SHA256(userId,
  ARENA_TOKEN_SECRET))`, upsert on `(board_entry_ref, platform)` with `user_id = null,
  source='board'`. Rating columns untouched (server defaults). Return counts.
- `config.toml`: add `[functions.arena-register]\nverify_jwt = false`.

### 3. Frontend
- `arenaBeta.js`: copy the `normalizeEmail` logic (or import from `authorPreview.js` if
  exported cleanly) and a `BETA_EMAILS` set; export `isArenaBetaUser(email)`.
- `App.jsx`: compute `const arenaBeta = isArenaBetaUser(user?.email)`; filter the `arena`
  entry out of `MAIN_TABS` when `!arenaBeta`; guard `activeTab === 'arena'` render and the
  `/arena` route element with a redirect to `/` when `!arenaBeta`.
- `arenaSnapshot.js`: `buildBoardTeams(boardPicks, ownDraftEntryId)` — group `boardPicks` by
  `draftEntryId`, drop the group equal to `ownDraftEntryId`, and for each remaining group
  build the same snapshot shape `buildEnrollableTeams` produces (players/posSnap/path/count/
  platform), returning `{ boardEntryRef, userId, platform, draftId, snapshot }`.
- `arenaClient.js`: `registerArenaTeams(payload)` → POST to `arena-register` with auth
  headers; `getLeaderboard` → remove `.eq('enrolled', true)`.
- `Arena.jsx`: in a mount effect, when `ARENA_AVAILABLE && isArenaBetaUser(user?.email) &&
  rosterData?.length`, build owned teams (`buildEnrollableTeams`) + board teams (from the
  loaded board data) and call `registerArenaTeams` once per session (guard with a ref / a
  `sessionStorage` flag). Hide guest-vote CTAs while in beta.

### 4. Docs + verification
- Update `docs/migrations/arena-data-model.md` with the 012 model, beta gate, and the two
  deferred limitations.
- Run `npm run lint` + `npm run build`; fix any issues. Produce the deploy runbook (above)
  for the developer.

### Edge cases / decisions
- **NULL in unique index:** board uniqueness keys on `board_entry_ref` (always set for board
  rows), not `user_id`, so NULL-distinctness doesn't defeat dedup.
- **`opt_out` + `arena-pair` self-exclusion** must be in-memory (Postgres `<>` is NULL for
  NULL rows) — this is the load-bearing bug fix that lets board teams appear.
- **Snapshot trust:** `arena-register` trusts client snapshot *content* but enforces the
  allowlist + the `source='extension'` board check. Acceptable under a dev-only allowlist;
  hardening (server-side snapshot build) deferred to public launch.

## Dependencies
- **TASK-288, TASK-289, TASK-293, TASK-294** are implemented within this consolidated plan.
- Requires migration **011** + `arena-pair`/`arena-vote` to be deployed (they never were);
  the deploy runbook pushes 011 then 012 and deploys all three functions together.
- **Deferred (must precede `beta_mode = false` public launch):** TASK-290 (takedown),
  TASK-291 (privacy/ToS) — per ADR-014 guardrails #2/#4 and ADR-015.

## Open Questions / Known deferred limitations
- **Cross-user duplication:** if two BBE users ever sync the same pod, one user's owned team
  (keyed by pod id) and another's board capture of that same seat (keyed by `draftEntryId`)
  create two rows. Harmless in a single-developer beta; revisit at public launch alongside
  TASK-290.
- **Client-trusted board snapshots:** acceptable under the dev-only allowlist; harden at
  public launch.
- **Deploy not runnable in-session:** no Docker / Supabase creds here. Claude authors + runs
  build/lint; the developer runs `supabase db push`, function deploys, secret set, and the
  Vercel deploy.

## Handoff Notes
- **Tried:** Implemented the full build — migration `012`, `_shared/arena.ts` `betaGate`,
  `arena-pair` (gate + NULL-user board-exclusion fix), `arena-vote` (gate), new
  `arena-register` ingestion function, `config.toml`, `arenaBeta.js`, `App.jsx` tab/route
  gate, `arenaSnapshot.buildBoardTeams`/`playerNameKey`, `arenaClient.registerArenaTeams`
  + dropped `enrolled` filter, `Arena.jsx` auto-register effect, and the data-model doc.
- **Result:** `npm run lint` (no new errors — 8 pre-existing in untouched files) and
  `npm run build` both pass. Edge Functions reviewed for consistency; not type-checked
  (no Deno toolchain in-session).
- **Blocker:** Live verification needs the developer's deploy (no Docker / Supabase creds
  here). Nothing committed (per working agreement).
- **Next step:** Developer runs the deploy runbook (push 011→012, deploy the three
  functions, set `ARENA_TOKEN_SECRET` + `SB_SERVICE_ROLE_KEY`, Vercel deploy), then
  confirms the live smoke test so the tasks can be marked Verified/Done.

---
*Approved by: Patrick H. — 2026-06-27*
