/**
 * Uniqueness Engine — Early Combo frequency lookup over REAL drafts.
 *
 * Source: every seat of every captured pod board in draft_boards_admin plus
 * the user's own synced rosters (realDraftData.js). There is no simulation
 * fallback — guests and demo mode simply see no combo data.
 *
 * Combo key: the roster's first COMBO_PICKS picks in draft order, sorted by
 * player_id, joined by "|" — matching how realDraftData keys its tables.
 * Rosters without pick numbers fall back to their COMBO_PICKS lowest-ADP
 * players, which is the same set in all but pathological drafts.
 */

import { loadRealDraftData, COMBO_PICKS } from './realDraftData';
import { cacheGet, cachePut } from './modelCache';

// ── Persistent table cache (stale-while-revalidate) ──────────────────────────
// The built tier1 tables persist to IndexedDB so a fresh page load can render
// Early Combo % immediately from last session's tables while the real build
// (network fetch of every board + aggregation) refreshes them in the
// background. Keyed by the same input signature loadRealDraftData rebuilds on.

const COMBO_CACHE_KEY = 'comboTables:v1';

/** Cache signature for the built tables — mirrors loadRealDraftData's key. */
export function comboTablesSig(masterPlayers = [], rosterData = []) {
  return `${masterPlayers.length}:${rosterData.length}`;
}

/**
 * Read last session's built tables for this signature.
 * @returns {Promise<{pre: object, post: object}|null>} tier1 tables or null
 */
export async function hydrateComboTables(sig) {
  const rec = await cacheGet(COMBO_CACHE_KEY);
  return rec && rec.sig === sig && rec.tables ? rec.tables : null;
}

/** Persist freshly built tier1 tables. Empty (guest/demo) results are skipped. */
export function persistComboTables(sig, pre, post) {
  const total = (pre?.metadata?.total_rosters ?? 0) + (post?.metadata?.total_rosters ?? 0);
  if (!total) return; // never clobber a real user's cache with guest emptiness
  cachePut(COMBO_CACHE_KEY, { sig, tables: { pre, post } });
}

/**
 * Load the Early Combo frequency table for a source ('pre' | 'post').
 * Resolves to an empty table ({ combos: {}, metadata: { total_rosters: 0 } })
 * when no real data is reachable.
 *
 * @param {string} source - 'pre' | 'post'
 * @param {{ masterPlayers?: Array, rosterData?: Array }} ctx - inputs for the
 *   real-data build (name → player_id mapping and the user's own rosters)
 * @returns {Promise<object>} tier1 table ({ combos, metadata })
 */
export async function loadComboTable(source = 'pre', ctx = {}) {
  const real = await loadRealDraftData(ctx.masterPlayers ?? [], ctx.rosterData ?? []);
  return real?.[source]?.tier1 ?? { combos: {}, metadata: { total_rosters: 0 } };
}

/**
 * Build the Early Combo key from a roster.
 *
 * @param {Array} rosterPlayers - players with `player_id` plus either a numeric
 *   `pick` (draft position) or a numeric `latestADP`/`adp`
 * @returns {string|null} pipe-joined key, or null if too few players resolve
 */
export function buildComboKey(rosterPlayers) {
  let top = null;

  const withPick = rosterPlayers.filter(p => p.player_id && Number(p.pick) > 0);
  if (withPick.length >= COMBO_PICKS) {
    top = [...withPick].sort((a, b) => Number(a.pick) - Number(b.pick)).slice(0, COMBO_PICKS);
  }

  if (!top) {
    const withAdp = rosterPlayers
      .filter(p => p.player_id && Number.isFinite(Number(p.latestADP ?? p.adp)))
      .map(p => ({ player_id: p.player_id, adp: Number(p.latestADP ?? p.adp) }));
    if (withAdp.length < COMBO_PICKS) return null;
    withAdp.sort((a, b) => a.adp - b.adp);
    top = withAdp.slice(0, COMBO_PICKS);
  }

  return top.map(p => p.player_id).sort((a, b) => a.localeCompare(b)).join('|');
}

/**
 * Look up a combo key in the frequency table.
 * The combos map stores integer counts directly: { "key": count }.
 * @param {string} comboKey
 * @param {object} tier1
 * @returns {{ count: number, totalRosters: number }|null} null = not in table
 */
export function lookupTier1(comboKey, tier1) {
  const count = tier1?.combos?.[comboKey];
  if (count == null) return null;
  return { count, totalRosters: tier1.metadata?.total_rosters ?? 1 };
}
