# Best Ball Arena — Public Launch Runbook

Ordered, hands-on sequence to take the Arena from private beta (ADR-015) to a public,
multi-user pool. Every code change for launch is on branch `arena-public-launch` and
is build/lint-clean. The steps below are the **ops** that must run against production;
they need service-role / CLI credentials and are intentionally NOT automated. The
`beta_mode=false` flip is the final, deliberate go-live and stays a human action.

Covers TASK-310 (flip + sequence), TASK-311 (edge hardening), TASK-296 (data
hardening), TASK-285 (guest integrity), TASK-290 (takedown path). Decision record:
the ADR-013 amendment (guest-vote hybrid + claim-hijack + snapshot hardening).

---

## What changed in code (already done, on the branch)

- **Client gate is now `beta_mode`-driven** (`App.jsx`, `arenaClient.getArenaBetaMode`).
  The Arena tab/route/component appear the instant `arena_config.beta_mode` flips
  false — **no frontend redeploy needed to launch**, and no pre-flip exposure window.
  The hardcoded email allowlist still governs who sees it *during* the beta.
- **`arena-register`**: right error for unauthenticated post-beta (`auth_required`, not
  `beta_closed`); per-IP throttle + durable per-user owned-team quota; claim-on-sync is
  exact-ref-only (removes the fingerprint-hijack vector); board snapshots are validated
  against `draft_boards_admin.picks` and take their slate title from the stored board.
- **`arena-vote`**: guests must send a `guestId` (else 400); guest cap + rate limit key
  on `guestId` **and** a salted IP hash (rotating the guestId no longer resets them);
  `voter_ip_hash` recorded per match.
- **Grants (migration 015)**: client `INSERT`/`display_snapshot` writes on `arena_teams`
  revoked (registration is server-only); `user_id` dropped from the **anon** read grant.
- **Takedown**: `scripts/arena-takedown.mjs` (unenroll/delete board or owned rows).

---

## Prerequisites

- `.env.local` at repo root with `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY`, and
  `ARENA_TOKEN_SECRET` **matching the deployed function secret** (backfill + takedown
  hash UD ids with it — a mismatch silently produces wrong `board_user_hash` values).
- Supabase CLI linked to the production project (`supabase link`).
- Branch `arena-public-launch` merged to `main` and the Vercel production deploy live
  (safe at any time — the Arena stays hidden until the flag flips).

---

## Sequence (run in order)

> Order matters: deploy the **frontend first** (the `getLeaderboard` change stops anon
> from selecting `user_id`, which migration 015 revokes), then migrations, then
> functions, then backfill, then the flip.

### 1. Deploy the frontend
Merge `arena-public-launch` → `main`; confirm the Vercel production build is live.
Verify (still in beta): Arena tab shows for the allowlisted account only.

### 2. Apply migrations to production (in order)
```bash
supabase db push        # or apply 014 then 015 explicitly, in number order
```
- `014_arena_anon_read_enrolled_only.sql` — anon post-beta reads are enrolled-only.
- `015_arena_public_launch_hardening.sql` — revoke client snapshot/insert writes,
  drop `user_id` from the anon grant, add `arena_matches.voter_ip_hash`.

Both are idempotent. After this, an **old** frontend selecting `user_id` as anon would
42501 — which is why step 1 precedes this, and why anon has no Arena access during beta.

### 3. Redeploy the three Edge Functions
All import `_shared/arena.ts`, which changed — deploy all three or they run stale:
```bash
supabase functions deploy arena-register
supabase functions deploy arena-pair
supabase functions deploy arena-vote
```
Confirm the functions still have `ARENA_TOKEN_SECRET`, `SB_SERVICE_ROLE_KEY`,
`SUPABASE_URL`, `SUPABASE_ANON_KEY` set.

### 4. Run the backfill scripts (dry-run first, then `--apply`) — in order
```bash
node scripts/arena-backfill-pool.mjs                 # dry-run: review counts
node scripts/arena-backfill-pool.mjs --apply         # full-DB pool (ADR-016)
node scripts/arena-stamp-board-tournaments.mjs --apply   # BBM7 attribution for board rows
node scripts/arena-clean-unresolved.mjs --apply          # unenroll UUID-name rows
```
- `arena-backfill-pool` must run **after** the claim-on-sync function (step 3) is live,
  and needs the matching `ARENA_TOKEN_SECRET`.
- Without the stamp script, board rows are invisible to the BBM7 featured filter.

### 5. Flip `beta_mode` → false (GO LIVE)
Human action. In the Supabase SQL editor (or psql):
```sql
update public.arena_config set beta_mode = false, updated_at = now() where id;
```
The frontend picks this up on next load (tab appears for everyone); the Edge Functions
read it per request (guests can pair/vote immediately).

### 6. Post-launch verification
- Signed out: Arena tab visible; can pair + vote; the guest cap kicks in after
  `GUEST_VOTE_CAP` counted votes and the "sign in to keep counting" note shows.
- Signed out, direct API: `select user_id from arena_teams` → **denied** (42501).
- Signed out, direct API: `select` returns only `enrolled = true` rows.
- New non-allowlisted account: syncs → teams auto-register → appear on the leaderboard.
- Function logs: `[arena-vote] recorded …` lines; rate-limit / cap anomalies logged.

---

## Rollback

Set `beta_mode` back to true — the Arena re-hides for everyone but the allowlist and the
functions re-close to guests immediately:
```sql
update public.arena_config set beta_mode = true, updated_at = now() where id;
```
Migrations 014/015 are safe to leave applied (they only tighten access). Reverting the
grant changes is possible but unnecessary for a rollback.

---

## Takedown (post-launch, as requests arrive) — TASK-290

Board teams have non-user subjects who can't unenroll themselves. On a removal request:
```bash
node scripts/arena-takedown.mjs --draft-id <podId>          # preview a whole pod
node scripts/arena-takedown.mjs --draft-id <podId> --apply  # unenroll (reversible)
node scripts/arena-takedown.mjs --entry-ref <udEntryId> --delete --apply   # hard erase one seat
node scripts/arena-takedown.mjs --user-id <udUserId> --apply               # all of a UD user's captured seats
```
Default is unenroll (hidden everywhere, Elo kept); `--delete` for a legal/erasure
request. `--include-owned` also affects owned rows (e.g. a full-pod takedown).
