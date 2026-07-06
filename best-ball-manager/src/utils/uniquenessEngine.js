/**
 * Uniqueness Engine — Tier 1 exact frequency lookup.
 *
 * Primary source: REAL drafts — every seat of every captured pod board in
 * draft_boards_admin plus the user's own synced rosters (realDraftData.js).
 * Fallback: the bundled Monte Carlo tier1 table (/sim/{source}/...) when no
 * real data is reachable (guests, demo mode, fetch errors).
 *
 * Combo key: 4 players, sorted by player_id, joined by "|". How the 4 players
 * are chosen depends on the loaded table's metadata.key_basis:
 *   - 'picks' (real data): the roster's first 4 picks in draft order.
 *   - 'adp'   (sim fallback): the 4 lowest-ADP players — matches the key
 *     format produced by simulation/engine.py.
 * Always pass the loaded table's key_basis to buildComboKey so lookups match
 * how the table was keyed.
 *
 * If a combo is not in the table, it is reported as "< 1 per totalRosters" — a
 * rare roster.
 */

import { loadRealDraftData } from './realDraftData';

const _simStates = new Map(); // source → { tier1, loading, callbacks }

function _getSimState(source) {
  let s = _simStates.get(source);
  if (!s) {
    s = { tier1: null, loading: false, callbacks: [] };
    _simStates.set(source, s);
  }
  return s;
}

async function _loadBundledTier1(source) {
  const s = _getSimState(source);
  if (s.tier1) return s.tier1;
  if (s.loading) return new Promise(resolve => s.callbacks.push(resolve));
  s.loading = true;
  try {
    s.tier1 = await fetch(`/sim/${source}/tier1_frequency.json`).then(r => r.json());
    if (s.tier1) {
      s.tier1.metadata = { ...(s.tier1.metadata || {}), data_source: 'sim', key_basis: 'adp' };
    }
  } finally {
    s.loading = false;
    s.callbacks.forEach(cb => cb(s.tier1));
    s.callbacks.length = 0;
  }
  return s.tier1;
}

/**
 * Load the Tier 1 frequency table for the requested source ('pre' | 'post').
 * Real drafts (boards + user rosters) win; the bundled sim is the fallback.
 *
 * @param {string} source - 'pre' | 'post'
 * @param {{ masterPlayers?: Array, rosterData?: Array }} ctx - inputs for the
 *   real-data build (name → player_id mapping and the user's own rosters)
 * @returns {Promise<object>} tier1 data ({ combos, metadata })
 */
export async function loadSimData(source = 'pre', ctx = {}) {
  try {
    const real = await loadRealDraftData(ctx.masterPlayers ?? [], ctx.rosterData ?? []);
    const tier1 = real?.[source]?.tier1;
    if (tier1 && (tier1.metadata?.total_rosters ?? 0) > 0) return tier1;
  } catch {
    // fall through to the bundled sim
  }
  return _loadBundledTier1(source);
}

/**
 * Build the 4-player combo key from a roster.
 *
 * @param {Array} rosterPlayers - players with `player_id` plus either a numeric
 *   `pick` (draft position) or a numeric `latestADP`/`adp`
 * @param {'picks'|'adp'} keyBasis - how the loaded table was keyed
 *   (metadata.key_basis); 'picks' falls back to ADP when picks are missing
 * @returns {string|null} pipe-joined key, or null if fewer than 4 players can be resolved
 */
export function buildComboKey(rosterPlayers, keyBasis = 'picks') {
  let top4 = null;

  if (keyBasis === 'picks') {
    const withPick = rosterPlayers.filter(p => p.player_id && Number(p.pick) > 0);
    if (withPick.length >= 4) {
      top4 = [...withPick].sort((a, b) => Number(a.pick) - Number(b.pick)).slice(0, 4);
    }
  }

  if (!top4) {
    const withAdp = rosterPlayers
      .filter(p => p.player_id && Number.isFinite(Number(p.latestADP ?? p.adp)))
      .map(p => ({ player_id: p.player_id, adp: Number(p.latestADP ?? p.adp) }));
    if (withAdp.length < 4) return null;
    withAdp.sort((a, b) => a.adp - b.adp);
    top4 = withAdp.slice(0, 4);
  }

  return top4.map(p => p.player_id).sort((a, b) => a.localeCompare(b)).join('|');
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
