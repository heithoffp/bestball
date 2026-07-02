# TASK-296: Arena public-launch data hardening (dedup + server-built snapshots)

**Status:** Draft
**Priority:** P3

---

## Objective
Before flipping beta_mode=false (public launch), resolve the two deferred limitations from ADR-014/015: (1) cross-user duplication - one user's owned team (keyed by pod id) and another user's board capture of that same seat (keyed by draftEntryId) create two arena_teams rows; (2) arena-register currently trusts client-built snapshots - rebuild board snapshots server-side from draft_boards_admin so content can't be forged. Harmless under the single-developer allowlist; required for a public, multi-user pool. Gated alongside TASK-290/291.

## Dependencies
None

## 2026-07-02 launch-review findings — concrete attack paths this task must close
1. **Claim-on-sync hijack.** `arena-register`'s claim path (index.ts ~151-193) matches
   `platform + draft_id + playerNameKey(snapshot.players)` — all three client-supplied
   and all three readable via the client SELECT grant once beta_mode=false. Any
   authenticated user can echo a top board row's draft_id + player names to claim it:
   the row converts to source='owned' under the attacker with the display_snapshot
   REPLACED by attacker content, keeping its Elo; they can then unenroll it or serve
   arbitrary text to voters. Fix: verify the caller actually owns a seat in that pod
   server-side (against extension_entries / draft_boards_admin), never trust the
   client snapshot.
2. **Direct PostgREST snapshot injection.** Migration 011 grants authenticated INSERT
   (incl. display_snapshot, enrolled) and UPDATE (incl. display_snapshot) with no
   content validation; a client can insert enrolled=true rows whose snapshot claims
   tournamentTitle "Best Ball Mania …" with arbitrary "player" strings — they enter
   the featured pairing pool and are shown blind to every voter. An owner can also
   rewrite an already-rated team's public snapshot at will. Fix: revoke client
   INSERT/UPDATE of display_snapshot (route all writes through arena-register with
   server-side validation / server-built snapshots — the original intent of this task).
3. **Anon `user_id` grouping.** The client SELECT grant includes user_id; post-beta a
   logged-out API caller can group arena_teams by user_id and reconstruct an account's
   entire portfolio (one self-identified roster de-anonymizes all of that user's
   teams). Decide: drop user_id from the anon grant (authenticated keeps it for the
   self-match check) or replace with an RLS-computed is_mine.
Related fix already authored: migration 014 (2026-07-02) makes anon reads
enrolled-only post-beta. Launch-gating alongside TASK-285/290/310.

## Open Questions
<!-- Unknowns or decisions to resolve before planning. Delete if none. -->
