# ADR-016: Full-database Arena pool with claim-on-sync and account-level enrollment

**Date:** 2026-07-01
**Status:** Accepted

---

## Context

ADR-014 flipped the Arena to opt-out enrollment but bounded the pool with guardrail #3: *"Only ADR-009 participant-captured boards are eligible"* — admin-scraped boards from the retired ADR-008 pipeline are refused at registration (`arena-register` filters `draft_boards_admin` on `source='extension'`). Ingestion is also entirely **client-pushed**: `useAutoRegister` (Arena.jsx) submits only the signed-in user's own entries plus board teams for drafts present in that user's `rosterData`. Two consequences follow:

1. The pool contains only the developer's own teams and opponents from pods the developer sat in — observed directly during beta testing ("only my teams and teams I have encountered").
2. The largest data assets in the database sit unused by the Arena: all `draft_boards_admin` rows with `source='admin_scraper'`, extension-captured boards not tied to the current viewer's rosters, and `extension_entries` rosters that never pass through an Arena page load.

The developer wants the Arena pool to be the **entire database** — every roster in `draft_boards_admin` (both sources) and every roster in `extension_entries` — enrolled by default, permanently, with uniqueness strictly enforced. The private beta (ADR-015) currently contains all visibility to the allowlisted developer account, but this decision is explicitly **not** beta-scoped: admin-scraped boards remain eligible after public launch.

Identity facts that constrain the dedup design:

- Owned rows are unique on `(user_id, entry_id, platform)` where `entry_id` is the draft-level id; board rows are unique on `(board_entry_ref, platform)` where `board_entry_ref` is the seat-level UD `draftEntryId`. These are **different id spaces**, so "same roster in both sources" cannot be detected by id equality.
- The existing client path already solves this with a player-name fingerprint (`playerNameKey`) to exclude the syncing user's own seat; a full backfill must apply the same fingerprint dedup across sources and across admin-scraped vs. extension-captured copies of the same pod.

A further consequence of a full-database pool: a roster can enter the pool as an ownerless board row **before** its owner ever signs up for BBE. The enrollment model must handle that owner arriving later.

## Decision

Retire ADR-014 guardrail #3 **permanently**: all `draft_boards_admin` rows are Arena-eligible regardless of `source`. Add a **server-side backfill/registration path** (service-role, developer-run admin script, re-runnable) that enrolls every roster in `draft_boards_admin` and every roster in `extension_entries` into `arena_teams`, with three-layer dedup: the existing owned unique index `(user_id, entry_id, platform)`, the existing board unique index `(board_entry_ref, platform)`, and cross-source roster-fingerprint dedup (per-draft player-name key) so no roster appears twice.

Three refinements are part of the decision (developer-specified at approval):

1. **Identity-free publication is absolute.** No user-name or owner-identity information is ever shown on any Arena surface (vote cards, leaderboard). ADR-014 guardrail #1 stands and extends to admin-scraped subjects.
2. **Claim-on-sync.** When a user syncs a roster whose per-draft fingerprint matches an existing ownerless board row in the pool, the row is **claimed**: converted to `source='owned'` with the syncing user's `user_id`/`entry_id`, preserving its Elo, match history, and standings. Detection is server-side at registration time so the pool never holds a board-row duplicate of an owned team.
3. **Account-level enrollment.** Enrollment is a single per-user state, not per-team: a user is either **enrolled** (all of their teams are in the pool) or **unenrolled** (all of their teams are out). There is no per-team selection. The default is enrolled — a team synced to Supabase exists in the Arena from that moment. Ownerless board rows have no enrollment agent and are always in the pool (takedown per ADR-014 guardrail #2 is their removal path).

Guardrails #1 (identity-free publication), #2 (takedown path), and #4 (privacy/ToS before public launch) of ADR-014 stand unchanged and now also cover admin-scraped subjects.

## Alternatives Considered

### Option A: Status quo (client-pushed, extension-captured only)
- **Pros:** No new code; strictest reading of ADR-009's authorization boundary.
- **Cons:** Pool is starved — effectively one user's drafts during beta. The Arena's core loop (blind voting variety, meaningful leaderboard) doesn't work with a shallow pool; this is what prompted the developer's report.

### Option B: Server-side backfill of extension-captured boards + all `extension_entries` only
- **Pros:** Pool grows without touching guardrail #3; no ADR change; consent posture unchanged.
- **Cons:** Excludes the admin-scraped corpus, which is the majority of stored boards; pool depth stays well short of "full field." Developer explicitly declined this option.

### Option C: All boards, beta-scoped (re-fence admin-scraped rows before public launch)
- **Pros:** Full pool now with a forced re-review before any public republication; lowest permanent privacy commitment.
- **Cons:** Requires tracking and unwinding thousands of rows at launch (a source-of-origin flag plus a launch-gate task); developer explicitly chose permanence over a deferred re-decision.

### Option D: All boards + all `extension_entries`, permanently, with claim-on-sync and account-level enrollment (Chosen)
- **Pros:** Maximum pool depth from every data asset already collected; single uniform eligibility rule (everything in the database is in the pool); no launch-time unwinding; late-arriving owners inherit their teams' standings instead of spawning duplicates; one comprehensible consent switch per user.
- **Cons:** Republishes third-party rosters obtained **without** participant authorization (the ADR-008 scraper corpus), permanently — the heaviest consent posture the Arena has taken. The only recourse for non-user subjects is the guardrail #2 takedown path, which is not yet built (TASK-290) and becomes launch-blocking. Account-level enrollment removes the per-team curation ADR-013 originally sold as a Pro action.

### Enrollment-granularity sub-decision: per-team toggle (ADR-013/014 model)
- **Pros:** Finer user control; preserves the per-row `enrolled` semantics already in the schema and UI.
- **Cons:** Developer explicitly rejected it — one account-level switch is simpler to explain, and under a full-database default the per-team toggle mostly invites partial states that fragment the pool.

## Consequences

### Positive
- The vote pool and leaderboard reflect the full database immediately; matchmaking variety and leaderboard depth stop being gated on which pods the viewer personally drafted.
- One ingestion truth: a re-runnable service-role backfill replaces reliance on per-user page loads, so the pool no longer depends on who happens to open the Arena tab.
- `extension_entries` rosters from all users enter as `source='owned'` rows tied to their real `user_id`, so owners see their standings and control them via the account-level switch — consistent with ADR-014's opt-out model.
- Claim-on-sync preserves rating continuity: a team's Elo history survives its owner joining BBE.

### Negative
- ADR-014 guardrail #3 is gone: the "only authorized-capture data may be republished" line no longer holds, and the privacy/ToS work (guardrail #4, TASK-291) must now disclose admin-collected data too.
- The backfill must replicate the client's snapshot-building (`buildBoardTeams`/`buildEnrollableTeams`) server-side; two snapshot builders must be kept behaviorally aligned.
- Fingerprint dedup is approximate: identical rosters from different drafts are distinct teams, so the fingerprint must be scoped per-draft — a global fingerprint would wrongly merge them, while a per-draft one can miss cross-copy duplicates if draft ids differ between scraper and extension captures of the same pod.
- The enrollment model changes shape: per-team `enrolled` semantics (schema, `arenaClient.enrollTeam`/`unenrollTeam`, ArenaMyTeams UI, the Pro `arena_enroll` gate) must be reworked to one account-level state. The ADR-014 monetization-funnel question sharpens: enrollment can no longer be a paid per-team action at all.

### Risks
- **Consent exposure is now permanent.** If Underdog or an affected user objects post-launch, the remedy is takedown-per-request rather than categorical exclusion.
- **Takedown path becomes load-bearing** for a much larger subject population (TASK-290 must ship before `beta_mode=false`).
- **Claim-on-sync misattribution:** fingerprint collision within a draft is implausible (two seats in one pod cannot draft identical 18-player rosters), but a buggy fingerprint scope could hand a stranger's board row — and its Elo — to the wrong account. Claim logic must be service-role-only and covered by tests.
- **Elo dilution:** a large influx of provisional teams temporarily floods pairing with unrated matchups; acceptable, self-correcting as votes accumulate.

## Revisit Conditions
- Underdog or any roster owner objects to inclusion of admin-scraped boards — re-weigh categorical exclusion vs. takedown (tightens ADR-014's revisit #1).
- The takedown path (TASK-290) proves operationally insufficient at the expanded scale.
- UD's posture toward scraped-data republication changes (extends ADR-008/009 conditions).
- Account-level enrollment draws user complaints about all-or-nothing granularity — reconsider a per-team override layered on the account switch.

## Related
- ADRs: ADR-014 (retires its guardrail #3 and its per-team enrollment granularity; guardrails #1/#2/#4 and the opt-out decision stand), ADR-008 (its data corpus is re-activated for a new purpose), ADR-009 (authorization boundary consciously exceeded), ADR-015 (beta gate contains visibility until launch), ADR-013 (pillar unchanged; per-team Pro enroll action retired).
- Tasks: follow-ups via hus-backlog — backfill script, guardrail #3 removal, claim-on-sync, account-level enrollment rework; TASK-290/291 become hard launch-blockers.

---
*Approved by: Patrick H. — 2026-07-01 (approved with refinements: identity-free publication absolute, claim-on-sync, account-level enrollment)*
