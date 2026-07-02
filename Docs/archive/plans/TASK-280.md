<!-- Completed: 2026-07-02 | Commit: f5bb972 (verified shipped in 2026-07-02 launch review) -->
# TASK-280: Arena: data model & Supabase migrations

**Status:** Approved (Level 3 auto-executed)
**Priority:** P1

> **Auto-execution note (hus-goal run auto/audit-execute-20260626-1358).** Authored
> `supabase/migrations/011_create_arena_schema.sql` + `docs/migrations/arena-data-model.md`.
> The migration could **not** be applied/verified locally (no Docker → no local Supabase
> stack), and applying it to the live project is an irreversible external action the
> autonomous loop must not take. Verification here was **static** (independent verifier
> review against the criteria below); the **deploy + RLS/grant verification is a developer
> step** — see the checklist in the migration note.

> **Lead plan for the Best Ball Arena (EPIC-07).** This file carries the whole-feature
> architecture so a future session can build from one document; the *Files to Change* and
> *Verification* sections below are scoped to **this task only** (the data model). Sibling
> tasks TASK-281…TASK-286 implement the rest against the contract defined here.

---

## Objective
Create the Supabase data model that underpins the Best Ball Arena (ADR-013): per-team eligibility/enrollment with a hidden Elo, vote/match records, and a single `arena_eligibility_mode` policy flag (defaults to `opt_in`, flippable to `opt_out` with no schema change). Rating columns are `service_role`-write only; RLS restricts enroll/unenroll to the owning user; every new `public` table ships the explicit GRANTs required after 2026-10-30.

---

## Whole-Feature Architecture (context for EPIC-07)

### What the Arena is
A new `/arena` tab. A visitor is shown **two rosters side by side, blind** (no owner names) and asked **"Which team would you rather have?"** They vote (or skip → next). Each vote is a **match**; the winning team gains Elo, the loser loses Elo. Every match runs through a **server-issued pairing token** so votes can't be forged or replayed. Teams carry a **hidden Elo** at all times; a team appears on the **public leaderboard only if its owner enrolls it** (opt-in default). Viewing + voting are **free** (top-of-funnel); **enrolling your own teams is a paid-tier feature**.

### Component map (which task owns what)
| Concern | Owner task | Notes |
|---|---|---|
| Data model + migrations + RLS + grants | **TASK-280 (this)** | Defines the contract everything else depends on |
| Edge Functions: `arena-pair`, `arena-vote` | TASK-281 | Only place Elo is written (`service_role`) |
| Voting UI (`/arena`, `Arena.jsx`, `arenaClient.js`) | TASK-282 | Blind H2H card; free/guest |
| Leaderboard view | TASK-283 | Enrolled teams ranked by Elo |
| Enroll/unenroll toggle + paid gating | TASK-284 | `featureAccess.js` gate on enroll |
| Anti-abuse hardening + guest-vote decision | TASK-285 | Rate limits, replay protection |
| Vision_and_Scope + Feature Spec | TASK-286 | The documented pivot |

### Server-side contract (defined here, implemented in TASK-281)
- **`POST /arena-pair`** → returns `{ pairing_id, token, team_a, team_b }` where each team is an **anonymized display snapshot** (players, draft slot, ADP, archetype — **no owner identity**). The function selects a *comparable* matchup (same `platform`, nearby `elo`) and **excludes the caller's own teams**. `token` is a signed, single-use, short-TTL credential bound to `(pairing_id, team_a, team_b)`.
- **`POST /arena-vote`** with `{ pairing_id, token, winner }` → validates the token (signature, unused, unexpired), rejects self-votes, dedupes on `pairing_id`, writes the `arena_match` row, and applies the **Elo update** with a **provisional higher-K** for each team's first `N` matches (settling to a stable K). Returns the post-vote Elo deltas for the instant reveal.
- Clients call these only; **clients never UPDATE rating columns directly** — enforced by grants (rating columns writable by `service_role` only).

### Elo (computed server-side in TASK-281)
Standard Elo. `expected_a = 1 / (1 + 10^((elo_b - elo_a)/400))`. New deltas: `elo_a += K * (score_a - expected_a)`. `K = K_PROVISIONAL` while `matches < N_PROVISIONAL`, else `K_STABLE`. Seed every team at `elo = 1500`, `matches = 0`, `provisional = true`. Concrete constants (`N_PROVISIONAL`, `K_PROVISIONAL`, `K_STABLE`) are finalized in TASK-281; this task only stores the columns they need.

### Privacy / eligibility (the load-bearing decision)
Eligibility is a **single policy flag**, `arena_eligibility_mode ∈ {'opt_in','opt_out'}`, stored in a config row — **not** baked into table structure — so the product can flip modes later with zero migration:
- **`opt_in` (launch default):** a team is in the vote pool **and** leaderboard only when `enrolled = true`.
- **`opt_out` (future, needs ToS update):** all teams are vote-eligible **anonymously**; `enrolled` then governs leaderboard *visibility/attribution* only.

The pairing function (TASK-281) reads this flag to decide the eligible pool. Because the snapshot is always anonymized at vote time, switching modes changes *which teams are sampled*, never the schema.

---

## Verification Criteria
- A migration file exists under `supabase/migrations/` creating the Arena tables and config flag, and it applies cleanly (`supabase db reset` / `supabase migration up` with no errors).
- Tables created: `arena_teams` (or equivalently named), `arena_matches`, and an `arena_config` row carrying `arena_eligibility_mode` defaulting to `'opt_in'`.
- Every new `public` table has **RLS enabled** and **explicit GRANTs** for `anon` / `authenticated` / `service_role` matched to real callsites (per CLAUDE.md) — RLS policies alone are not relied upon.
- Rating/standings columns (`elo`, `matches`, `wins`, `losses`, `provisional`) carry **no INSERT/UPDATE grant to `anon` or `authenticated`** — only `service_role` (and `authenticated` may UPDATE `enrolled` on its own rows).
- RLS policies allow an authenticated user to set `enrolled` only on rows where `user_id = auth.uid()`; reads of leaderboard-eligible data are permitted to `anon`.
- A non-owner cannot UPDATE another user's `arena_teams` row (policy denies it); a client cannot UPDATE any `elo` value (no grant).

## Verification Approach
1. **Apply the migration locally.** Run the project's Supabase migration command (e.g. `supabase db reset` against the local stack, or `supabase migration up`). Report full output; expect zero errors and the new tables present (`\dt public.arena_*` or the Studio table list).
2. **Inspect grants.** Query `information_schema.role_table_grants` (or `\dp public.arena_teams`) and confirm: `service_role` has full DML; `authenticated` has SELECT + (scoped) UPDATE; `anon` has SELECT only where intended; no write grant on rating columns to `anon`/`authenticated`. Paste the grant rows.
3. **Exercise RLS.** Using `supabase-js` with an authenticated test user (or `set role` + `request.jwt.claims` in SQL): confirm the user can flip `enrolled` on their own row, cannot flip it on another user's row, and cannot UPDATE `elo` at all. Report each attempt's result (success / `42501` / RLS denial).
4. **Confirm the flag default.** Select the `arena_config` row and confirm `arena_eligibility_mode = 'opt_in'`.
5. Developer reviews the migration SQL for naming/shape before approval (this is a schema decision that downstream tasks lock onto).

## Files to Change
| File | Action | Description |
|------|--------|-------------|
| `supabase/migrations/<ts>_arena_schema.sql` | Create | `arena_teams`, `arena_matches`, `arena_config` tables; RLS enable; explicit `anon`/`authenticated`/`service_role` GRANTs; owner-only enroll RLS policies; seed `arena_config` with `arena_eligibility_mode='opt_in'` |
| `docs/migrations/arena-data-model.md` | Create | Short migration note documenting the schema, the eligibility-flag rationale, and the service_role-only rating-write rule (per CLAUDE.md docs/migrations convention) |

## Implementation Approach
1. **`arena_teams`** — one row per roster eligible to be rated. Suggested columns:
   - `id` (pk), `roster_id` (fk/identifier into existing roster storage), `user_id` (owner, `auth.uid()`), `platform` (`underdog` | `draftking`),
   - `display_snapshot jsonb` — the **anonymized** roster render payload (players, draft slots, ADP, archetype) so the pairing function never has to join live roster data or leak identity,
   - `enrolled boolean default false`,
   - `elo numeric default 1500`, `matches int default 0`, `wins int default 0`, `losses int default 0`, `provisional boolean default true`,
   - `created_at`, `updated_at`.
   - Index on `(platform, elo)` for matchmaking range scans; partial index on `enrolled` for leaderboard.
2. **`arena_matches`** — one row per counted vote: `id`, `pairing_id` (unique — the dedupe key), `team_a_id`, `team_b_id`, `winner_id` (nullable for explicit ties/skips if recorded), `voter_id` (nullable for guests), `voter_is_guest boolean`, `elo_a_before/after`, `elo_b_before/after`, `created_at`. Unique constraint on `pairing_id` enforces one-vote-per-pairing at the DB level (belt-and-suspenders with the Edge Function check).
3. **`arena_config`** — single-row table (or a `key/value` row) holding `arena_eligibility_mode text not null default 'opt_in' check (arena_eligibility_mode in ('opt_in','opt_out'))`. Read by `arena-pair`.
4. **RLS + grants (per CLAUDE.md, post-2026-10-30 rule):**
   - `alter table … enable row level security;` on all three.
   - `arena_teams`: `grant select on … to anon, authenticated;` `grant update (enrolled) on … to authenticated;` (column-scoped) `grant select, insert, update, delete on … to service_role;`. RLS: select policy for `anon`/`authenticated` (leaderboard-visible rows); update policy `using (user_id = auth.uid()) with check (user_id = auth.uid())` for `authenticated` (the column grant already prevents touching `elo`).
   - `arena_matches`: `grant select on … to authenticated;` writes only via `service_role`; `anon` likely no direct access (votes flow through the Edge Function).
   - `arena_config`: `grant select on … to anon, authenticated;` writes `service_role` only.
   - **Rating columns are protected by withholding the column-level UPDATE grant** — `authenticated` gets `update(enrolled)` only, so `elo`/`matches`/etc. are unreachable from the client even though the row passes RLS.
5. **Edge cases:** a roster that is deleted/desynced upstream (orphaned `arena_teams` row — decide soft-delete vs cascade in TASK-281's pool query); platform value normalization to match existing `platform` conventions in the codebase; ensuring `display_snapshot` is regenerated when a roster changes (handled by the enroll flow in TASK-284, noted here as a dependency).
6. Write the `docs/migrations/` note capturing the eligibility-flag design and the service_role-write invariant so the rule survives beyond this session.

## Dependencies
- **ADR-013 must be Accepted** before this is implemented (it is currently Proposed).
- None on other tasks (this is the foundation). TASK-281…286 depend on this.

## Open Questions
- **Roster identity source:** exact shape of `roster_id` / how to reference an existing roster across the Supabase + IndexedDB storage split (`storage.js` / `cloudStorage.js`). Resolve against the real roster persistence model during implementation — may constrain whether guests' own (local-only) rosters can ever be enrolled.
- **Snapshot freshness:** whether `display_snapshot` is frozen at enroll time or refreshed on roster edits (leaning frozen-at-enroll for stability; confirm in TASK-284).
- **Ties/skips:** whether skips are recorded as rows (analytics value) or dropped entirely (simpler). Recommend dropping skips from `arena_matches`; record only decisive votes.

## Handoff Notes
<!-- Populate only if leaving this task In Progress at session end. -->

---
*Approved by: <!-- pending developer approval -->*
