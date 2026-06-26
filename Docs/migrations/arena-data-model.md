# Migration note: Best Ball Arena data model

**Migration:** `supabase/migrations/011_create_arena_schema.sql`
**Task:** TASK-280 · **ADR:** ADR-013 · **Epic:** EPIC-07

This note captures the design decisions baked into the Arena schema so the rules
survive beyond the session that wrote them. The migration is the source of truth;
this explains *why*.

## Tables

| Table | Purpose | Written by |
|-------|---------|------------|
| `arena_teams` | One row per `(user_id, entry_id, platform)`. Anonymized `display_snapshot`, the `enrolled` flag, and the hidden Elo standings. | Client (non-rating cols of own rows only) + service_role (Elo) |
| `arena_matches` | One row per recorded vote. `pairing_id` is unique — the DB replay/dedupe guard. | service_role only (`arena-vote`) |
| `arena_config` | Singleton holding `arena_eligibility_mode` (`opt_in` \| `opt_out`). | service_role only |

## Roster identity (`arena_teams.entry_id`)

There is **no persistent roster table** in this codebase — rosters are computed
in-memory from `extension_entries` (keyed by `(user_id, entry_id)`) on every load
(`src/utils/extensionBridge.js`). The Arena therefore references a roster by its
logical `entry_id` (plain text, no FK, since `extension_entries` is not in the
migration set) plus `platform`, and stores an **anonymized `display_snapshot`**
(players, draft slots, ADP, archetype — *no owner identity*) so the pairing
function never has to join live roster data or risk leaking who owns a team.

The snapshot is **frozen at enroll time** (TASK-284) for stability; a roster edit
does not silently change a team already in the vote pool. Re-enrolling refreshes it.

## Tamper-proof Elo — the load-bearing invariant

ADR-013: *"a leaderboard whose ratings any client can write is worthless."* The Elo
columns (`elo`, `matches`, `wins`, `losses`, `provisional`) are protected by
**withholding the column-level INSERT/UPDATE grant** from `anon`/`authenticated`:

- `grant insert (user_id, entry_id, platform, display_snapshot, enrolled) … to authenticated`
- `grant update (display_snapshot, enrolled, updated_at) … to authenticated`

Because the rating columns are absent from those grants, a client cannot set or
move them even on its own row that passes RLS — they take their server defaults
(`elo = 1500`, `matches = 0`, `provisional = true`) on insert and change **only**
via `service_role` inside an Edge Function. This is why enrollment can be a plain
client `upsert` (no dedicated enroll Edge Function): the client can flip `enrolled`
and refresh the snapshot, but the standings stay server-owned.

## Eligibility flag (schema-stable opt-in → opt-out path)

`arena_config.arena_eligibility_mode` is a **policy flag**, not table structure:

- **`opt_in` (launch default):** a team is in the vote pool **and** leaderboard
  only when `enrolled = true`.
- **`opt_out` (future, needs a ToS update — out of scope for ADR-013):** all teams
  are vote-eligible anonymously; `enrolled` then governs leaderboard
  *visibility/attribution* only.

The pairing function (`arena-pair`, TASK-281) reads this flag to pick the eligible
pool. Because vote snapshots are always anonymized, flipping the mode changes
*which teams are sampled* — never the schema.

## RLS summary

- `arena_teams`: anon reads `enrolled` rows; authenticated reads `enrolled` OR own;
  authenticated insert/update bounded to `user_id = auth.uid()`.
- `arena_matches`: authenticated reads own votes (`voter_id = auth.uid()`); no anon
  table access (votes flow through the Edge Function); writes service_role only.
- `arena_config`: world-readable; writes service_role only.

## What this migration does NOT do

- No Elo computation (that is `arena-vote`, TASK-281).
- No matchmaking (that is `arena-pair`, TASK-281).
- No `extension_entries` FK (that table is created ad-hoc, not in the migration set).

## Deploy / verify checklist (developer — local stack needs Docker)

This migration was authored and statically reviewed but **not applied** in the
autonomous run (no local Supabase stack / Docker available). To apply and verify:

1. `supabase db push` (or `supabase migration up`) — expect zero errors, three new
   `arena_*` tables.
2. Inspect grants: `\dp public.arena_teams` — confirm `service_role` has full DML,
   `authenticated` has SELECT + column-scoped INSERT/UPDATE (no rating columns),
   `anon` has SELECT only.
3. Exercise RLS with a test user: can flip `enrolled` on own row; cannot on
   another user's row; cannot UPDATE `elo` at all (expect `42501`).
4. `select arena_eligibility_mode from public.arena_config;` → `opt_in`.
