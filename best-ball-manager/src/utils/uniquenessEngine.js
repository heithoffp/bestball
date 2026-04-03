/**
 * Uniqueness Engine — Tier 1 exact frequency lookup only.
 *
 * Combo key: 4 lowest-ADP players from a roster, sorted by player_id, joined by "|".
 * Matches the key format produced by simulation/engine.py.
 *
 * If a combo is not in the table, it is reported as "< 1 per totalRosters" — a rare roster.
 */

let _tier1 = null;
let _loading = false;
const _callbacks = [];

/**
 * Lazy-load Tier 1 frequency table. Module-level singleton — only one fetch in flight.
 * @returns {Promise<object>} tier1 data
 */
export async function loadSimData() {
  if (_tier1) return _tier1;
  if (_loading) return new Promise(resolve => _callbacks.push(resolve));
  _loading = true;
  try {
    _tier1 = await fetch('/sim/tier1_frequency.json').then(r => r.json());
  } finally {
    _loading = false;
    _callbacks.forEach(cb => cb(_tier1));
    _callbacks.length = 0;
  }
  return _tier1;
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

