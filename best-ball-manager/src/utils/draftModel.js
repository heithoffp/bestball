/**
 * Draft Explorer model — per-player pick-path counts (r1–r4) computed from
 * REAL drafts: every seat of every captured pod board in draft_boards_admin
 * plus the user's own synced rosters (realDraftData.js). There is no
 * simulation fallback — guests and demo mode see an empty-data state.
 *
 * Two cache trees coexist per source: `pre` (pre-NFL-draft) and `post`
 * (post-NFL-draft), so toggling between modes after both are warm is instant.
 */

import { loadRealDraftData } from './realDraftData';

const EMPTY_CACHE = { r1: null, r2: null, r3: null, r4: null, metadata: { total_rosters: 0 } };
const _caches = new Map(); // source → { r1, r2, r3, r4, metadata }

/**
 * Build (or reuse) pick-path data for a source from real drafts.
 *
 * @param {string} source - 'pre' | 'post'
 * @param {{ masterPlayers?: Array, rosterData?: Array }} ctx - inputs for the
 *   real-data build (name → player_id mapping and the user's own rosters)
 */
export async function loadTier3Initial(source = 'pre', ctx = {}) {
  const real = await loadRealDraftData(ctx.masterPlayers ?? [], ctx.rosterData ?? []);
  const t = real?.[source];
  const cache = t && (t.metadata?.total_rosters ?? 0) > 0
    ? { r1: t.r1, r2: t.r2, r3: t.r3, r4: t.r4, metadata: t.metadata }
    : EMPTY_CACHE;
  _caches.set(source, cache);
  return { metadata: cache.metadata };
}

/**
 * Get the current cache for a source (empty until loadTier3Initial resolves).
 */
export function getTier3Cache(source = 'pre') {
  return _caches.get(source) ?? EMPTY_CACHE;
}

// ---------------------------------------------------------------------------
// Core lookup and normalization
// ---------------------------------------------------------------------------

/**
 * Look up the count distribution for a given round and prior selections,
 * then normalize to probabilities.
 *
 * @param {object} cache - The pick-path cache object
 * @param {string[]} selectedPlayerIds - player_ids of picks so far (in order)
 * @returns {Record<string, number>|null} player_id → probability, or null if not loaded or not found
 */
export function lookupDistribution(cache, selectedPlayerIds) {
  const round = selectedPlayerIds.length + 1;
  const rnd = `r${round}`;
  const roundData = cache[rnd];
  if (!roundData) return null;

  let counts;
  if (round === 1) {
    counts = roundData;
  } else if (round === 2) {
    counts = roundData[selectedPlayerIds[0]];
  } else if (round === 3) {
    counts = roundData[`${selectedPlayerIds[0]}|${selectedPlayerIds[1]}`];
  } else if (round === 4) {
    counts = roundData[`${selectedPlayerIds[0]}|${selectedPlayerIds[1]}|${selectedPlayerIds[2]}`];
  }

  if (!counts) return null;

  // Normalize counts to probabilities
  const total = Object.values(counts).reduce((sum, c) => sum + c, 0);
  if (total === 0) return null;

  const probs = {};
  for (const [pid, count] of Object.entries(counts)) {
    probs[pid] = count / total;
  }
  return probs;
}

// ---------------------------------------------------------------------------
// Draft state computation (used by DraftExplorer useMemo)
// ---------------------------------------------------------------------------

/**
 * Compute the probability state for the draft explorer.
 *
 * @param {Array<{gridIndex: number}>} selections - user's picks so far
 * @param {Array<{player_id: string, position: string}>} gridPlayers - all grid players
 * @param {Map<string, number>} playerIdToGrid - player_id → gridIndex lookup
 * @param {object} cache - The pick-path cache object
 * @returns {{ probMap: Map<number, number>, selectedSet: Set<number>, currentRound: number }}
 */
export function computeDraftState(selections, gridPlayers, playerIdToGrid, cache) {
  const currentRound = selections.length + 1;
  const selectedSet = new Set(selections.map(s => s.gridIndex));

  const selectedPlayerIds = selections.map(s => gridPlayers[s.gridIndex].player_id);

  const probMap = new Map();

  if (currentRound <= 4) {
    const distribution = lookupDistribution(cache, selectedPlayerIds);
    if (distribution) {
      for (const [playerId, prob] of Object.entries(distribution)) {
        const gridIdx = playerIdToGrid.get(playerId);
        if (gridIdx != null && !selectedSet.has(gridIdx) && prob > 0) {
          probMap.set(gridIdx, prob);
        }
      }
    }
  }

  return { probMap, selectedSet, currentRound };
}
