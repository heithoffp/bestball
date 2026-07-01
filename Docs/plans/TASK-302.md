# TASK-302: Arena: voting fun layer - keyboard voting, session streaks, upset badges, instant advance

**Status:** Approved (Level 3 auto-executed)
**Priority:** P2
**Epic:** EPIC-07 (Best Ball Arena)

---

## Objective
Voting works but feels flat: a fixed 2s reveal you can't skip, mouse-only input, no
sense of momentum, and no payoff moment. Make the loop fast and compulsive while
keeping the prizefight identity (ADR-013 blind fairness intact — nothing new is
revealed pre-vote):

1. **Keyboard voting** — ← picks left/red, → picks right/blue, S (or ↓) skips,
   Space/Enter advances during the reveal. Subtle key-hint row, hidden on mobile.
2. **Instant advance** — reveal window drops to 1.5s with a visible countdown bar;
   Space/Enter/Next skips the wait entirely (prefetch already makes this instant).
3. **Session scorecard** — "judged" count + upset-pick count for this session,
   shown as compact mono chips; persisted in sessionStorage.
4. **Upset payoff** — after the reveal, if the picked team had the LOWER pre-vote
   Elo, stamp the picked card "UPSET PICK" (boxing-scorecard stamp-in) and tick the
   upset counter. Pre-vote Elos come back from arena-vote's response only after the
   vote — blindness holds.

## Decision
Bounded UI design, judged in-loop under the developer's blanket grant for this run
("make it addicting and fun … do everything on your own"). Signature moment = the
reveal (stamp + countdown); everything else stays quiet. No confetti, no sounds.

## Verification
- ArrowLeft/ArrowRight submit votes; S/ArrowDown skips; Space/Enter during reveal
  advances immediately; keys are inert while submitting and in non-matchup states.
- Reveal auto-advance is 1.5s with an animated countdown bar; a Next control and
  Space/Enter cut it short.
- Session chips render "N judged · M upsets" and survive tab navigation within the
  session (sessionStorage), reset on new session.
- Upset stamp appears only when the picked team's `before` Elo is strictly lower
  than the opponent's `before`, and only post-reveal.
- `prefers-reduced-motion` disables stamp + countdown animations; hint row hidden
  below 900px.
- `cd best-ball-manager && npm run lint && npm run build` pass (no new errors vs
  baseline).
- Independent verifier sub-agent reviews the diff against this plan.

## Files to Change
| File | Change |
|------|--------|
| `best-ball-manager/src/components/arena/ArenaVote.jsx` | Keyboard handler, session scorecard, upset detection, countdown + Next |
| `best-ball-manager/src/components/arena/ArenaRosterCard.jsx` | Upset stamp overlay prop |
| `best-ball-manager/src/components/Arena.module.css` | Stamp, countdown bar, chips, kbd hints, reduced-motion |

## Rollback
Revert the commit — pure frontend, no data/API change.
