<!-- Completed: 2026-07-02 | Commit: dff614f -->
# TASK-310: Arena public-launch flip: remove client allowlist gate + deploy/backfill sequence

**Status:** Draft
**Priority:** P2

---

## Objective
Flipping arena_config.beta_mode=false alone launches nothing: the frontend gates the nav tab, /arena route, component render, and useAutoRegister on a hardcoded email allowlist (arenaBeta.js + four sites in App.jsx + Arena.jsx). Public launch requires, in order: (1) remove/replace the client allowlist gate; (2) apply migration 014 (anon reads become enrolled-only post-beta — authored 2026-07-02); (3) redeploy arena-pair, arena-vote, arena-register (all three import _shared/arena.ts, which changed after the 2026-06-27 deploy); (4) run backfill scripts with --apply: arena-backfill-pool.mjs (only after claim-on-sync is deployed; ARENA_TOKEN_SECRET must match the function secret), arena-stamp-board-tournaments.mjs (without it board rows are invisible to the BBM7 featured filter), arena-clean-unresolved.mjs; (5) flip beta_mode=false. Remains gated on TASK-290 (takedown), TASK-296 (data hardening), and the guest-integrity items in TASK-285.

## Dependencies
Gated on TASK-290 (done, code), TASK-296 (done, code), TASK-285 (done, code),
TASK-311 (done, code). All code-complete on branch `arena-public-launch`.

## Implementation status
- **Client gate (done):** the hardcoded email allowlist is replaced with an
  `arena_config.beta_mode`-driven visibility check (`App.jsx`,
  `arenaClient.getArenaBetaMode`, `Arena.jsx` `useAutoRegister`). The tab/route/
  component and auto-register appear the instant `beta_mode` flips false — **no
  frontend redeploy needed to launch**, and no pre-flip exposure window.
- **Remaining = ops (developer executes):** the ordered migrate → deploy → backfill
  → flip sequence is documented in **`docs/Arena_Public_Launch_Runbook.md`**. These
  need prod service-role / CLI credentials; the `beta_mode=false` flip is the
  deliberate, human go-live step (never autonomous). Decisions: ADR-017.

Status stays **Todo** until the runbook is executed against production.

## Open Questions
<!-- Unknowns or decisions to resolve before planning. Delete if none. -->
