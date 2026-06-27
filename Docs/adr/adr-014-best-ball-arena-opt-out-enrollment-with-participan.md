# ADR-014: Best Ball Arena opt-out enrollment with participant-captured board teams

**Date:** 2026-06-26
**Status:** Accepted

---

## Context

ADR-013 launched the Best Ball Arena with **opt-in** enrollment as a deliberate privacy floor: a team enters the vote pool and leaderboard only when its owner explicitly enrolls it (a paid action). ADR-013 modeled eligibility as a single config flag (`arena_config.arena_eligibility_mode ∈ {'opt_in','opt_out'}`) precisely so the product could later flip to opt-out **without a schema change**, and it fenced that flip: *"Flipping to opt-out requires a Terms-of-Service update… Revisit before any flip to opt-out mode — that requires a ToS update and its own review."* This ADR is that review.

The developer wants the Arena pool to be **full by default**: every synced team enrolled automatically (in both the blind vote pool and the public leaderboard), with an unenroll escape hatch — maximizing pool depth, engagement, and the leaderboard's value from day one. The intended scope is **both**:

1. **Owned teams** — the signed-in user's own synced entries (`extension_entries`).
2. **Board teams** — the other 11 rosters in each synced pod. Per **ADR-009**, these are captured under *participant-authorized* access (the syncing user's own `/v2/drafts/{id}` response already contains the full pod; storing it carries "zero net-new ToS exposure"). ADR-009 authorized storing and showing them **as opponent context within the syncing user's own view**, and flagged that they are *identifiable third-party rosters* with a revisit condition if "a user or UD objects."

The current implementation only partially supports this:
- The pairing function already honors `opt_out` (drops the `enrolled` filter) — `arena-pair/index.ts:76`.
- But **no rows are auto-created** — only the manual Pro "Enter" button inserts into `arena_teams` (`arenaClient.enrollTeam`), so the opt-out pool would be empty.
- The **leaderboard and anon RLS still filter `enrolled = true`** (`arenaClient.getLeaderboard:96`, migration `011` policies), so teams would be voted on but invisible on the board.
- The schema cannot represent a board team: `arena_teams.user_id` is `NOT NULL REFERENCES auth.users(id)`, unique key `(user_id, entry_id, platform)`. Board opponents have no Supabase auth account.

## Decision

Flip the Arena to **opt-out by default** and **auto-enroll all eligible synced teams** — owned **and** participant-captured board teams — into both the blind vote pool and the public, anonymized leaderboard, with unenroll/removal as the escape hatch. This **revises the opt-in/consent parameter of ADR-013** (which otherwise stands in full); it does not supersede the pillar.

This is conditioned on four load-bearing guardrails, which are part of the decision, not optional polish:

1. **Identity-free publication.** A published team (vote card or leaderboard) carries **no owner identity** — only players, slots, ADP, archetype. The display snapshot already meets this; the requirement is now a hard invariant for board teams too. Any UD `userId`/`draftEntryId` used for dedupe is stored **service_role-only** (or salted-hashed), never client-readable.
2. **A removal path for non-users.** Owned teams unenroll via the existing toggle. Board-team subjects are not users and cannot log in, so the substitute is a **public takedown request** handled service-side (sets `enrolled = false` / deletes the row). ADR-009's revisit condition ("a user or UD objects") is operationalized here.
3. **Only ADR-009 participant-captured boards are eligible.** Any residual pre-ADR-009 *admin-scraped* board rows (the retired ADR-008 pipeline) are **excluded** from Arena enrollment — only authorized-capture data may be republished.
4. **Privacy policy + ToS updated before launch.** Disclose public ranking, board-team inclusion, and the takedown path — and correct the existing false claim in `privacy.html` that the extension "sends no data to external servers" (it writes entries and boards to Supabase today).

Schema and surfaces change as follows (deferred to the implementation plan for detail): **migration 012** makes `user_id` nullable, adds a `source` discriminator (`'owned' | 'board'`), reworks the unique key to accommodate ownerless rows, and adjusts grants/RLS so board rows are service-role-managed; an **auto-registration path** writes `arena_teams` rows (with frozen anonymized snapshots) at sync/load; and the **leaderboard/anon RLS** stop filtering on `enrolled` for default visibility.

## Alternatives Considered

### Option A: Stay opt-in (ADR-013 status quo)
- **Pros:** Strongest consent posture; zero new privacy/legal surface; no schema change.
- **Cons:** Pool is sparse and self-selected; leaderboard looks empty at launch; weakest engagement. Doesn't deliver the "full field by default" the developer wants.

### Option B: Opt-out, **owned teams only**
Auto-enroll the user's own entries; board teams stay out of the Arena.
- **Pros:** Clean consent model — the enrolling party owns the data; opt-out is genuinely the subject's choice. Everything published is anonymized; low marginal risk over ADR-013. No new "non-user removal" problem.
- **Cons:** Smaller pool (only BBE users' own teams). Leaves the richest data — every opponent in every pod — on the table.

### Option C: Opt-out, owned + board teams, **vote pool only** (leaderboard stays opt-in)
- **Pros:** Board teams accrue Elo and deepen matchmaking, but the public *ranked board* still lists only consenting owners — a middle privacy ground.
- **Cons:** Doesn't match the "all teams ranked by default" intent; two different visibility rules to explain.

### Option D: Opt-out, owned + board teams, **vote pool + public leaderboard** (Chosen)
- **Pros:** Maximum pool depth and leaderboard value immediately; delivers the developer's stated intent; reuses the pre-built eligibility flag and ADR-009 capture.
- **Cons:** Republishes identifiable third-party rosters for a **new public purpose** beyond ADR-009's "opponent context to the syncing user." Carries the heaviest privacy/trust and platform-relations exposure, and the only "consent" for board subjects is a post-hoc takedown. Requires schema change, ToS/policy work, and undercuts the Pro `arena_enroll` funnel.

## Consequences

### Positive
- Full vote pool and a populated leaderboard from launch — the breadth that makes the Arena compelling — with engagement/virality/retention upside (ADR-013's goals).
- Reuses infrastructure already designed for this: the eligibility flag, the pairing function's opt-out branch, and ADR-009's authorized board capture.
- Decision and its guardrails are on the record, bounding a real privacy expansion rather than letting it happen by drift.

### Negative
- Schema migration (012) and a new auto-registration ingestion path; leaderboard/RLS rewrites.
- The Pro `arena_enroll` conversion hook is undercut — if enrollment is universal and free, the monetization funnel must move elsewhere (e.g., advanced leaderboard analytics). Product follow-up required.
- A second, heavier disclosure burden (ToS + policy) and an operational takedown process to run.

### Risks
- **Purpose expansion beyond consent.** ADR-009 authorized board storage for the syncing user's *private opponent context*; public ranking is a new use the subject never agreed to. Mitigated by identity-free publication + takedown, but **revisit immediately if a user or UD objects** (extends ADR-009's revisit condition #2).
- **Self-identifying rosters.** ADR-013's caution stands: even anonymized, a roster can be recognizable to its owner's audience. The takedown path is the backstop.
- **Platform relations.** Even within authorized capture, *republishing* pod data publicly may draw UD's attention in a way private opponent-context did not. Revisit if UD posture changes.
- **Misattribution / data-model errors.** Ownerless rows weaken RLS's "owner = auth.uid()" guarantee; board-team writes must be service-role-managed so a client can never claim or move a board row. A bug here could attribute a stranger's team to a user.

## Revisit Conditions
- A user or Underdog objects to public ranking of board (third-party) rosters — re-weigh board-team inclusion (extends ADR-009 revisit #2).
- UD's data posture or payload shape changes such that board capture is no longer authorized — board teams must then be removed from the pool.
- Arena engagement/signup attribution fails to justify the added privacy and operational surface after one season (extends ADR-013's scope/cost revisit).
- The monetization-funnel rework proves insufficient — reconsider whether enrollment should remain universal/free or return to a gated model.

## Related
- ADRs: ADR-013 (Arena pillar — this revises its opt-in/consent parameter; otherwise stands), ADR-009 (participant-authorized board capture — source of board teams; extends its revisit conditions), ADR-002 (Mirror-Not-Advisor — Arena carve-out unchanged), ADR-001 (Edge Function pattern).
- Tasks: EPIC-07; TASK-280–286 (Arena v1). Follow-ups filed via hus-backlog: migration 012, auto-registration ingestion, leaderboard/RLS change, takedown path, `privacy.html` + ToS update, monetization-funnel rework.

---
*Approved by: Patrick H. — 2026-06-26*
