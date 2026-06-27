// arenaSnapshot.js — builds the anonymized display snapshot for an Arena team
// (ADR-013 / TASK-284). The snapshot is self-contained so the voting card and
// pairing function never need live roster data or any owner identity.
//
// Two producers:
//   - buildEnrollableTeams(rosterData) — the user's OWN teams, from in-memory rows.
//   - buildBoardTeams(board, ownKey)   — the other 11 pod rosters (ADR-014 / TASK-288),
//     from a draft_boards_admin board, excluding the user's own seat.

import { classifyRosterPath } from './rosterArchetypes';

// Stored platform values are 'underdog' | 'draftkings' (see migration 011).
function derivePlatform(players) {
  const fromAdp = players.find(
    (p) => p.adpPlatform === 'underdog' || p.adpPlatform === 'draftkings',
  )?.adpPlatform;
  if (fromAdp) return fromAdp;
  const slate = players[0]?.slateTitle || '';
  return slate.startsWith('DK') ? 'draftkings' : 'underdog';
}

// Board picks carry no per-player ADP/platform hint, so derive from the slate title
// (DK boards are tagged "DK …", UD boards "UD …" — see the extension board capture).
function platformFromSlate(slateTitle) {
  return (slateTitle || '').startsWith('DK') ? 'draftkings' : 'underdog';
}

// Normalized fingerprint of a roster's players, used to match the syncing user's own
// seat within a captured board so it is not re-registered as a board team.
export function playerNameKey(players) {
  return (players || [])
    .map((p) => (p.name || '').trim().replace(/\s+/g, ' ').toLowerCase())
    .filter(Boolean)
    .sort()
    .join('|');
}

// Build the anonymized snapshot from a roster's picks (already pick-sorted).
function buildSnapshot(sorted, platform, tournamentTitle, slateTitle) {
  const posSnap = sorted.reduce((acc, p) => {
    const pos = p.position || 'N/A';
    acc[pos] = (acc[pos] || 0) + 1;
    return acc;
  }, {});
  return {
    players: sorted.map((p) => ({
      name: p.name,
      position: p.position,
      team: p.team,
      pick: p.pick,
      round: p.round,
    })),
    posSnap,
    path: classifyRosterPath(sorted),
    count: sorted.length,
    platform,
    tournamentTitle: tournamentTitle || null,
    slateTitle: slateTitle || null,
  };
}

/**
 * Group flat roster rows by entry and build one enrollable team per entry.
 * @param {Array} rosterData flat rows: {name, position, team, entry_id, pick, round, ...}
 * @returns {Array<{entryId, platform, count, tournamentTitle, slateTitle, snapshot}>}
 */
export function buildEnrollableTeams(rosterData) {
  const map = {};
  (rosterData || []).forEach((p) => {
    const id = p.entry_id || 'Unknown';
    (map[id] ||= []).push(p);
  });

  return Object.entries(map)
    .filter(([id]) => id && id !== 'Unknown')
    .map(([entryId, players]) => {
      const sorted = [...players].sort((a, b) => (a.pick || 0) - (b.pick || 0));
      const platform = derivePlatform(sorted);
      const snapshot = buildSnapshot(
        sorted,
        platform,
        sorted[0]?.tournamentTitle || null,
        sorted[0]?.slateTitle || null,
      );
      return {
        entryId,
        platform,
        count: sorted.length,
        tournamentTitle: snapshot.tournamentTitle,
        slateTitle: snapshot.slateTitle,
        snapshot,
      };
    })
    .sort((a, b) => (a.tournamentTitle || '').localeCompare(b.tournamentTitle || ''));
}

/**
 * Build anonymized board teams (the other 11 pod rosters) from a captured board.
 * Groups the board's picks by draftEntryId, drops the seat matching the syncing
 * user's own roster (ownKey), and returns one registerable board team per remaining
 * seat. Owner identity (UD draftEntryId/userId) is carried for server-side dedup
 * only — it is never placed in the anonymized snapshot.
 *
 * @param {{draftId: string, slateTitle: string|null, picks: Array}} board
 * @param {string} ownKey playerNameKey() of the user's own roster for this draft
 * @returns {Array<{boardEntryRef: string, userId: string|null, platform: string, draftId: string, snapshot: object}>}
 */
export function buildBoardTeams(board, ownKey) {
  if (!board || !Array.isArray(board.picks) || board.picks.length === 0) return [];
  const platform = platformFromSlate(board.slateTitle);

  const seats = {};
  for (const pk of board.picks) {
    const ref = pk.draftEntryId != null ? String(pk.draftEntryId) : null;
    if (!ref || !pk.name) continue; // skip empty/unresolved picks
    (seats[ref] ||= { userId: pk.userId != null ? String(pk.userId) : null, picks: [] }).picks.push(pk);
  }

  const out = [];
  for (const [ref, seat] of Object.entries(seats)) {
    const sorted = [...seat.picks].sort((a, b) => (a.pick || 0) - (b.pick || 0));
    if (ownKey && playerNameKey(sorted) === ownKey) continue; // the user's own seat
    out.push({
      boardEntryRef: ref,
      userId: seat.userId,
      platform,
      draftId: String(board.draftId),
      snapshot: buildSnapshot(sorted, platform, null, board.slateTitle || null),
    });
  }
  return out;
}
