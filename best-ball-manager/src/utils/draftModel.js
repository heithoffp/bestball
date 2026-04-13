/**
 * Draft Explorer model — uses empirical per-player simulation data (tier3).
 *
 * Tier 3 is split into 4 files for progressive loading:
 *   tier3_r1.json — R1 unconditional counts (~2KB)
 *   tier3_r2.json — R2 given specific R1 player (~200KB)
 *   tier3_r3.json — R3 given specific R1+R2 (~6MB)
 *   tier3_r4.json — R4 given specific R1+R2+R3 (~20MB)
 *
 * R1 loads immediately. R2-R4 load in the background after R1 is ready.
 */

// ---------------------------------------------------------------------------
// Progressive loader
// ---------------------------------------------------------------------------

const _cache = { r1: null, r2: null, r3: null, r4: null, metadata: null };
const _loading = { r1: false, r2: false, r3: false, r4: false };
const _callbacks = { r1: [], r2: [], r3: [], r4: [] };

async function _fetchRound(rnd) {
  if (_cache[rnd]) return _cache[rnd];
  if (_loading[rnd]) return new Promise(resolve => _callbacks[rnd].push(resolve));
  _loading[rnd] = true;
  try {
    const data = await fetch(`/sim/tier3_${rnd}.json`).then(r => r.json());
    _cache[rnd] = data[rnd];
    if (data.metadata) _cache.metadata = data.metadata;
  } finally {
    _loading[rnd] = false;
    _callbacks[rnd].forEach(cb => cb(_cache[rnd]));
    _callbacks[rnd].length = 0;
  }
  return _cache[rnd];
}

/**
 * Load R1 data immediately, then kick off background loads for R2-R4.
 * Returns the metadata + a flag indicating R1 is ready.
 */
export async function loadTier3Initial() {
  await _fetchRound('r1');
  // Start background loads for R2-R4
  _fetchRound('r2');
  _fetchRound('r3');
  _fetchRound('r4');
  return { metadata: _cache.metadata };
}

/**
 * Get the current tier3 cache state (may have partial data).
 */
export function getTier3Cache() {
  return _cache;
}

/**
 * Ensure a specific round's data is loaded. Returns immediately if cached.
 */
export async function ensureRound(rnd) {
  return _fetchRound(rnd);
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
