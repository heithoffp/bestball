<!-- Completed: 2026-07-02 | Commit: working tree (not yet committed) -->

# TASK-291: Arena privacy policy + ToS update for public ranking

**Status:** Pending Approval (ToS half; privacy half complete)
**Priority:** P2
**Epic:** EPIC-07 (Best Ball Arena)

---

## Objective
ADR-014 guardrail #4: update the public-facing privacy policy and Terms of Service to
disclose the Best Ball Arena's opt-out public ranking, participant-captured board-team
inclusion, and the takedown path — and correct the existing FALSE claim in
`privacy.html` that the extension "sends no data to external servers" (it writes entries
and pod/board rosters to Supabase today). Must land before the opt-out launch switch is
flipped. Absorbs TASK-259 (participant-captured third-party roster storage disclosure).

## Dependencies
None.

## Decision
- Arena is described as **live behavior** (no private-beta caveat) so the disclosure is
  stable through public launch. (Developer, 2026-07-02.)

## Implementation Approach

### Part A — `privacy.html` (DONE, 2026-07-02, developer-approved)
Full replacement of `best-ball-manager/public/privacy.html`:
1. Removed the false "does not collect, transmit, or store any data externally" /
   "No data is sent to external servers" claims; replaced with an accurate description
   of what the signed-in extension syncs to Supabase.
2. Added a **"Rosters From Your Drafts"** section disclosing that the other rosters in
   each synced pod (participant-captured "board teams", ADR-009) are stored — fulfilling
   TASK-259.
3. Added a **"Best Ball Arena"** section: opt-out inclusion of owned + board rosters in
   the blind vote pool and public leaderboard by default; identity-free publication
   (players/slots/ADP/archetype only); both escape hatches (account enrollment switch for
   owners, takedown request for any roster).
4. Added **Stripe** to Third-Party Services (billing) — previously omitted though the ToS
   references it.
5. Added a **"Your Choices & Data Removal"** section (enrollment toggle, takedown,
   account deletion).
6. Bumped "Last updated" to July 2, 2026.

### Part B — `terms.html` (REMAINING — this approval)
Update `best-ball-manager/public/terms.html` to match. `terms.html` currently makes no
mention of the Arena, public ranking, board teams, or takedown. Planned edits:
1. **Intro / "The Service"** — include the Best Ball Arena in the definition of the
   Service.
2. **New "Best Ball Arena" section** — describe the community competition: blind voting
   and a public leaderboard; synced rosters (owned + participant-captured board teams)
   are included by default (opt-out); publication is identity-free; enrollment can be
   turned off and any roster can be removed via a takedown request. Cross-link the
   Privacy Policy.
3. **"Your Data" section** — note that opponent/board rosters visible in your synced
   drafts are stored and may appear anonymized in the Arena; point to the Privacy Policy
   and the takedown path.
4. Bump "Last updated" to July 2, 2026.

No wording that grants BBE ownership of user rosters (ToS already states the user retains
ownership — keep that). No changes to pricing/subscription/liability sections.

## Files to Change
| File | Change | Status |
|------|--------|--------|
| `best-ball-manager/public/privacy.html` | Full rewrite: correct false claim; add board-team, Arena, Stripe, data-removal disclosures; date bump | Done |
| `best-ball-manager/public/terms.html` | Add Arena/public-ranking/board-team/takedown disclosure; date bump | Pending |

## Verification Criteria
1. `privacy.html` contains no claim that the extension sends/stores no data externally,
   and explicitly discloses Supabase sync of owned + board rosters. *(met)*
2. `privacy.html` discloses the Arena's opt-out public ranking, identity-free
   publication, and both escape hatches (enrollment switch + takedown email). *(met)*
3. `terms.html` references the Arena, its opt-out public ranking, board-team inclusion,
   and the takedown path, and cross-links the Privacy Policy.
4. Both pages show "Last updated: July 2, 2026" and render without broken markup.
5. No contradiction between the two documents (e.g., both describe the same takedown
   contact and the same opt-out model).

## Verification Approach
- Automatable: grep `best-ball-manager/public/{privacy,terms}.html` for the removed false
  phrases (expect zero hits), for "Arena"/"takedown"/"leaderboard" (expect hits in both),
  and for the updated date string. Confirm the pages are static HTML (no build step;
  served from `public/`).
- Developer-manual: load `/privacy.html` and `/terms.html` in the running app / preview
  and eyeball rendering and the cross-links.

## Rollback
Revert the commit — both files are static HTML with no dependents; no data or schema
impact. (Heavy-tier rollback note included for completeness though tier is Standard.)

## Related
- ADR-014 (opt-out enrollment + guardrail #4, the source of this task), ADR-016
  (full-database pool / claim-on-sync — all board sources eligible), ADR-009
  (participant-authorized board capture), ADR-013 (Arena pillar), ADR-015 (private beta).
- Absorbs TASK-259 (participant-captured third-party roster storage disclosure).
