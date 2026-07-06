/**
 * Draft Explorer model — per-player pick-path counts (r1–r4).
 *
 * Primary source: REAL drafts — every seat of every captured pod board in
 * draft_boards_admin plus the user's own synced rosters (realDraftData.js).
 * Fallback when no real data is reachable (guests, demo mode, fetch errors):
 * the bundled simulation files, split into 4 files for progressive loading:
 *   tier3_r1.json — R1 unconditional counts (~2KB)
 *   tier3_r2.json — R2 given specific R1 player (~200KB)
 *   tier3_r3.json — R3 given specific R1+R2 (~6MB)
 *   tier3_r4.json — R4 given specific R1+R2+R3 (~20MB)
 *
 * Two cache trees coexist per source: `pre` (pre-NFL-draft) and `post`
 * (post-NFL-draft). Each loader takes a `source` argument and maintains its
 * own per-source cache so toggling between modes after both caches are warm
 * is instant. metadata.data_source is 'real' or 'sim'.
 */

import { loadRealDraftData } from './realDraftData';

const _realCaches = new Map(); // source → cache built from real drafts

// ---------------------------------------------------------------------------
// Per-source progressive loader (bundled sim fallback)
// ---------------------------------------------------------------------------

const _states = new Map(); // source → { cache, loading, callbacks }

function _getState(source) {
  let s = _states.get(source);
  if (!s) {
    s = {
      cache: { r1: null, r2: null, r3: null, r4: null, metadata: null },
      loading: { r1: false, r2: false, r3: false, r4: false },
      callbacks: { r1: [], r2: [], r3: [], r4: [] },
    };
    _states.set(source, s);
  }
  return s;
}

async function _fetchRound(rnd, source) {
  const s = _getState(source);
  if (s.cache[rnd]) return s.cache[rnd];
  if (s.loading[rnd]) return new Promise(resolve => s.callbacks[rnd].push(resolve));
  s.loading[rnd] = true;
  try {
    const data = await fetch(`/sim/${source}/tier3_${rnd}.json`).then(r => r.json());
    s.cache[rnd] = data[rnd];
    if (data.metadata) s.cache.metadata = { ...data.metadata, data_source: 'sim' };
  } finally {
    s.loading[rnd] = false;
    s.callbacks[rnd].forEach(cb => cb(s.cache[rnd]));
    s.callbacks[rnd].length = 0;
  }
  return s.cache[rnd];
}

/**
 * Load pick-path data for a source. Real drafts (boards + user rosters) win;
 * when no real data is reachable, fall back to the bundled sim files (R1
 * immediately, R2-R4 in the background).
 *
 * @param {string} source - 'pre' | 'post'
 * @param {{ masterPlayers?: Array, rosterData?: Array }} ctx - inputs for the
 *   real-data build (name → player_id mapping and the user's own rosters)
 */
export async function loadTier3Initial(source = 'pre', ctx = {}) {
  try {
    const real = await loadRealDraftData(ctx.masterPlayers ?? [], ctx.rosterData ?? []);
    const t = real?.[source];
    if (t && (t.metadata?.total_rosters ?? 0) > 0) {
      const cache = { r1: t.r1, r2: t.r2, r3: t.r3, r4: t.r4, metadata: t.metadata };
      _realCaches.set(source, cache);
      return { metadata: cache.metadata };
    }
  } catch {
    // fall through to the bundled sim
  }
  _realCaches.delete(source);
  await _fetchRound('r1', source);
  // Start background loads for R2-R4
  _fetchRound('r2', source);
  _fetchRound('r3', source);
  _fetchRound('r4', source);
  return { metadata: _getState(source).cache.metadata };
}

/**
 * Get the current cache state for a source (may have partial data while the
 * sim fallback is still streaming rounds; real-data caches arrive complete).
 */
export function getTier3Cache(source = 'pre') {
  return _realCaches.get(source) ?? _getState(source).cache;
}

/**
 * Ensure a specific round's data is loaded. Returns immediately if cached.
 */
export async function ensureRound(rnd, source = 'pre') {
  return _fetchRound(rnd, source);
}

// ---------------------------------------------------------------------------
// Core lookup and normalization
// ---------------------------------------------------------------------------

/**
 * Look up the count distribution for a given round and prior selections,
 * then normalize to probabilities.
 *
 * @param {object} cache - The tier3 cache object
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
 * Compute the probability state for the draft explorer using per-player sim data.
 *
 * @param {Array<{gridIndex: number}>} selections - user's picks so far
 * @param {Array<{player_id: string, position: string}>} gridPlayers - all grid players
 * @param {Map<string, number>} playerIdToGrid - player_id → gridIndex lookup
 * @param {object} cache - The tier3 cache object
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
