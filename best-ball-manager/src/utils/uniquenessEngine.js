/**
 * Uniqueness Engine — Tier 1 exact frequency lookup only.
 *
 * Combo key: 4 lowest-ADP players from a roster, sorted by player_id, joined by "|".
 * Matches the key format produced by simulation/engine.py.
 *
 * If a combo is not in the table, it is reported as "< 1 per totalRosters" — a rare roster.
 */

const _states = new Map(); // source → { tier1, loading, callbacks }

function _getState(source) {
  let s = _states.get(source);
  if (!s) {
    s = { tier1: null, loading: false, callbacks: [] };
    _states.set(source, s);
  }
  return s;
}

/**
 * Lazy-load Tier 1 frequency table for the requested source ('pre' | 'post').
 * @returns {Promise<object>} tier1 data
 */
export async function loadSimData(source = 'pre') {
  const s = _getState(source);
  if (s.tier1) return s.tier1;
  if (s.loading) return new Promise(resolve => s.callbacks.push(resolve));
  s.loading = true;
  try {
    s.tier1 = await fetch(`/sim/${source}/tier1_frequency.json`).then(r => r.json());
  } finally {
    s.loading = false;
    s.callbacks.forEach(cb => cb(s.tier1));
    s.callbacks.length = 0;
  }
  return s.tier1;
}

/**
 * Build the 4-pick combo key from a roster.
 * Players must have `player_id` (string) and a numeric `latestADP` or `adp`.
 * @param {Array} rosterPlayers
 * @returns {string|null} pipe-joined key, or null if fewer than 4 players can be resolved
 */
export function buildComboKey(rosterPlayers) {
  const withAdp = rosterPlayers
    .filter(p => p.player_id && Number.isFinite(Number(p.latestADP ?? p.adp)))
    .map(p => ({ player_id: p.player_id, adp: Number(p.latestADP ?? p.adp) }));
  if (withAdp.length < 4) return null;
  withAdp.sort((a, b) => a.adp - b.adp);
  const top4 = withAdp.slice(0, 4);
  top4.sort((a, b) => a.player_id.localeCompare(b.player_id));
  return top4.map(p => p.player_id).join('|');
}

/**
 * Look up a combo key in the Tier 1 table.
 * The combos map stores integer counts directly: { "key": count }.
 * @param {string} comboKey
 * @param {object} tier1
 * @returns {{ count: number, totalRosters: number }|null} null = not in table (< 1 per totalRosters)
 */
export function lookupTier1(comboKey, tier1) {
  const count = tier1?.combos?.[comboKey];
  if (count == null) return null;
  return { count, totalRosters: tier1.metadata?.total_rosters ?? 1 };
}

