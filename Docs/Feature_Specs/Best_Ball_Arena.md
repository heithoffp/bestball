# Best Ball Arena

## Purpose
A competitive/social pillar (ADR-013, EPIC-07) that drives engagement, virality, and
off-season retention. Visitors vote on **blind head-to-head roster matchups** ("which
team would you rather have?"); each vote updates a **hidden, server-computed Elo** per
eligible team; an **opt-in public leaderboard** ranks enrolled teams. It is the one place
the product makes a cross-user, crowd-judged comparison — a conscious, bounded relaxation
of the social-features, server-side, and Mirror-Not-Advisor boundaries (see
`Vision_and_Scope.md` §2.3 #1, §2.4, §3.2). Crowd opinion is the product here; the
analytics tabs remain single-user, client-only mirrors.

## Current Status
**Active (v1 — first iteration).** Wired in `App.jsx` at the `/arena` route via the
`arena` tab key. The tab is **guest-accessible** (rendered without a `LockedFeature`
wrapper). The frontend ships ahead of backend deployment and degrades to a "warming up"
state until the Edge Functions + migration are deployed (`ARENA_AVAILABLE`).

## Monetization
- **Viewing + voting are free and guest-accessible** — the viral top-of-funnel.
- **Entering your own teams is a paid (Pro) feature**, gated via `featureAccess.js`
  (`arena_enroll: 'pro'`; the tab itself is `arena: 'guest'`).

## User-Facing Behavior

### Views (sub-nav within the Arena tab)
- **Vote** — two anonymized rosters ("Red Corner" / "Blue Corner") flanking the
  Tale-of-the-Tape spine with the gold **VS medallion** (TASK-297). "Pick Red"/"Pick
  Blue" under each, plus Skip. On vote: instant reveal — victory glow, Elo deltas, a
  1.5s auto-advance with a visible countdown bar, and a **Next** control (TASK-302).
  **Keyboard voting**: ← / → pick, S or ↓ skips, Space/Enter advances during the
  reveal (hints shown on desktop only). A **session scorecard** (matchups judged +
  upset picks, sessionStorage) rides the top-right; picking the lower-rated team
  stamps the card **"Upset"** post-reveal — pre-vote ratings are never shown, so
  blindness holds. Free + guest.
- **Leaderboard** — teams ranked by Elo with a **podium strip** (top 3 as champion
  cards), per-row **Elo distribution bars** scaled to the visible range, W–L, win%,
  and a movement indicator. **Tournament filter** (Featured = Best Ball Mania,
  default / All tournaments — TASK-301) plus the platform filter. Signed-in owners
  get a **your-team banner** with true rank + percentile computed by server count
  queries (correct beyond the fetched 200-row page) and a "Find my team"
  scroll-and-flash action (TASK-303). Rows expand to the full roster card.
- **My Teams** — the Pro enrollment panel: the user's synced teams with an enter/withdraw
  toggle, plus each entered team's hidden Elo and record. Guests see a sign-in prompt;
  non-Pro users see an Upgrade-to-Pro CTA.

### Featured tournament (TASK-301)
Pairing tries a **featured-tournament pool** first (constant pattern matched against
the snapshot's `tournamentTitle`/`slateTitle`; currently *Best Ball Mania*) and falls
back to the full pool whenever the featured pool cannot produce a valid pair, so
scoping never creates an artificial "No matchups yet". The featured pattern lives in
`supabase/functions/_shared/arena.ts` (`FEATURED_TOURNAMENT_OR_FILTER`) and
`src/utils/arenaFeatured.js` (`FEATURED_TOURNAMENT`) — keep them in sync.

### Blindness & privacy
- Owner identity is **never shown** while voting; the matchup uses an anonymized
  `display_snapshot` (players, draft slots, ADP, archetype — no owner).
- A voter is never shown their own teams (excluded at pairing time).
- On the leaderboard, only the **viewer's own** rows are flagged; no other user's identity
  is exposed (`user_id` is used only for the self-match check, never rendered).
- **Opt-in by default**: a team enters the pool + leaderboard only when its owner enrolls
  it (explicit consent to public ranking). The eligibility mode is a single config flag
  (`arena_eligibility_mode`) so a future opt-out mode needs no schema change (ToS update +
  its own review required — out of scope for v1).

### Visual treatment
- Cohesive with the navy/gold dashboard, with a "scoreboard" personality: JetBrains Mono
  numerics for Elo/rank/deltas, the gold VS medallion as the signature, position-colored
  badges and archetype pills mirroring the Roster Viewer idiom.
- Motion (VS pulse, delta drop-in, winner glow) respects `prefers-reduced-motion`.

### Empty / fallback states
- **Warming up** — backend not available (`ARENA_AVAILABLE` false).
- **No matchups yet** — fewer than two enrolled teams (CTA to enter your teams).
- **Rate limited** — friendly "slow down" with a retry.
- **No ranked teams yet** — empty leaderboard.

## Server-side contract (the bounded compute path)
- **`POST /arena-pair`** → `{ pairing_id, token, team_a, team_b }`. Selects a comparable
  matchup (same platform, nearby Elo) from the eligible pool (opt-in → enrolled only),
  excludes the caller's own teams **at query level** (`or(user_id.is.null,user_id.neq.…)`
  — filtering after the LIMIT starved the pool for heavy portfolios; TASK-300), tries the
  featured-tournament pool first with full-pool fallback (TASK-301), returns anonymized
  snapshots + a signed single-use token.
- **`POST /arena-vote`** with `{ token, winner, guestId }` → validates the HMAC token
  (signature + expiry), binds it to the live caller, rejects self-votes, dedupes on
  `pairing_id` (unique), applies the Elo update (provisional higher-K for a team's first N
  matches), returns per-team before/after/delta.
- Both functions accept guests (`verify_jwt = false` in `supabase/config.toml`). Clients
  **never** write rating columns — only `service_role` inside the Edge Functions does.

## Elo
Standard Elo, server-computed. `expected = 1/(1+10^((opp−self)/400))`;
`new = rating + K·(score − expected)`. `K = 40` while a team has `< 10` matches
(provisional), else `20`. Teams seed at `1500`.

## Integrity / anti-abuse (load-bearing — ADR-013)
- Server-issued **signed, single-use** pairing tokens (HMAC-SHA256, short TTL); team ids +
  voter identity are inside the signed payload (client cannot retarget a vote).
- **Replay/dedupe**: `arena_matches.pairing_id` is unique; a replayed token is rejected.
- **Self-vote** exclusion at pairing and vote time.
- **Guest votes** count equally toward Elo but are **capped at 5 counted votes per guest**
  (guest id baked into the token), with server-side per-IP rate limiting as the backstop.
- Per-IP and durable per-voter **rate limiting**; structured anomaly/volume logging.

## Computations & Data Dependencies
**Arena props:** `rosterData`, `helpOpen`, `onHelpToggle` (My Teams builds enrollable
teams from `rosterData`; the snapshot is built client-side at enroll time and frozen).

**Tables (migration `011_create_arena_schema.sql`):** `arena_teams` (anonymized snapshot +
hidden Elo standings; rating columns `service_role`-write only via column-scoped grants),
`arena_matches` (one row per recorded vote; `pairing_id` unique), `arena_config` (singleton
`arena_eligibility_mode`, default `opt_in`).

## Key Files
- `src/components/Arena.jsx` — container + sub-nav + contextual help
- `src/components/arena/ArenaVote.jsx` — blind voting + reveal + states
- `src/components/arena/ArenaLeaderboard.jsx` — ranked leaderboard + filter + your-rank
- `src/components/arena/ArenaMyTeams.jsx` — enrollment + paid gating
- `src/components/arena/ArenaRosterCard.jsx` — anonymized roster card (shared)
- `src/components/Arena.module.css` — scoped styles
- `src/utils/arenaClient.js` — Edge Function calls + leaderboard/enroll reads + guest id
- `src/utils/arenaSnapshot.js` — builds anonymized display snapshots from roster rows
- `supabase/functions/arena-pair/index.ts`, `arena-vote/index.ts`, `_shared/arena.ts`
- `supabase/migrations/011_create_arena_schema.sql`; `docs/migrations/arena-data-model.md`
- `supabase/config.toml` — `verify_jwt = false` for the Arena functions

## Known limitations / revisit (v1)
- Elo update is a best-effort read-modify-write (not a single transaction); the ADR names a
  scheduled batch Elo recompute as the fallback if concurrent-vote races prove material.
- Matchmaking is in-memory over a bounded sample; a SQL RPC with an Elo-window + random
  pick is the scale path.
- Leaderboard "movement" is a client-side delta vs the viewer's last visit (no rank-history
  table in v1); a server-side daily rank snapshot is the scale path.
- Backend is authored but deploy/verification (migration apply + `functions deploy` +
  `ARENA_TOKEN_SECRET`) is a developer step — see `docs/migrations/arena-data-model.md` and
  `docs/plans/TASK-281.md`.

## Related
- ADR-013 (the pivot); ADR-001 (Edge Function pattern, extended here); ADR-002 (Mirror-Not-
  Advisor, scope clarified). Epic EPIC-07; tasks TASK-280…286.
