// arenaSnapshot.js — builds the anonymized display snapshot for an Arena team
// from the app's in-memory roster rows (ADR-013 / TASK-284). The snapshot is
// self-contained so the voting card and pairing function never need live roster
// data or any owner identity.

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
      const posSnap = sorted.reduce((acc, p) => {
        const pos = p.position || 'N/A';
        acc[pos] = (acc[pos] || 0) + 1;
        return acc;
      }, {});
      const path = classifyRosterPath(sorted);
      const platform = derivePlatform(sorted);
      const snapshot = {
        players: sorted.map((p) => ({
          name: p.name,
          position: p.position,
          team: p.team,
          pick: p.pick,
          round: p.round,
        })),
        posSnap,
        path,
        count: sorted.length,
        platform,
        tournamentTitle: sorted[0]?.tournamentTitle || null,
        slateTitle: sorted[0]?.slateTitle || null,
      };
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
