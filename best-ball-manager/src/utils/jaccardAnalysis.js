// src/utils/jaccardAnalysis.js

export const CATEGORIES = [
  { key: 'overall', label: 'Overall', filter: {} },
  { key: 'qb', label: 'QB', filter: { position: 'QB' } },
  { key: 'rb', label: 'RB', filter: { position: 'RB' } },
  { key: 'wr', label: 'WR', filter: { position: 'WR' } },
  { key: 'te', label: 'TE', filter: { position: 'TE' } },
  { key: 'r1-6', label: 'Rounds 1-6', filter: { roundMin: 1, roundMax: 6 } },
  { key: 'r7-12', label: 'Rounds 7-12', filter: { roundMin: 7, roundMax: 12 } },
  { key: 'r13-18', label: 'Rounds 13-18', filter: { roundMin: 13, roundMax: 18 } },
];

export function groupByRoster(rosterData) {
  const map = new Map();
  rosterData.forEach(p => {
    const id = p.entry_id || 'unknown';
    if (!map.has(id)) map.set(id, []);
    map.get(id).push(p);
  });
  // Limit each roster to the first 18 picks for consistency
  for (const [id, players] of map) {
    players.sort((a, b) => (parseInt(a.pick) || 0) - (parseInt(b.pick) || 0));
    if (players.length > 18) map.set(id, players.slice(0, 18));
  }
  return map;
}

export function filterPlayers(players, { position, roundMin, roundMax } = {}) {
  return players.filter(p => {
    if (position && p.position !== position) return false;
    if (roundMin != null || roundMax != null) {
      let r = parseInt(p.round);
      if (isNaN(r) && p.pick > 0) r = Math.ceil(p.pick / 12);
      if (isNaN(r)) return false;
      if (roundMin != null && r < roundMin) return false;
      if (roundMax != null && r > roundMax) return false;
    }
    return true;
  });
}

export function jaccardUnweighted(setA, setB) {
  const intersection = new Set([...setA].filter(x => setB.has(x)));
  const union = new Set([...setA, ...setB]);
  if (union.size === 0) return { jaccard: 0, intersection: 0, union: 0 };
  return {
    jaccard: intersection.size / union.size,
    intersection: intersection.size,
    union: union.size,
  };
}

export function jaccardWeighted(weightsA, weightsB) {
  const allKeys = new Set([...Object.keys(weightsA), ...Object.keys(weightsB)]);
  if (allKeys.size === 0) return 0;
  let sumMin = 0, sumMax = 0;
  for (const key of allKeys) {
    const wa = weightsA[key] || 0;
    const wb = weightsB[key] || 0;
    sumMin += Math.min(wa, wb);
    sumMax += Math.max(wa, wb);
  }
  return sumMax === 0 ? 0 : sumMin / sumMax;
}

export function buildWeightMap(players, maxPick) {
  const weights = {};
  players.forEach(p => {
    const pick = parseInt(p.pick) || 0;
    weights[p.name] = maxPick + 1 - pick;
  });
  return weights;
}

export function computePortfolioJaccard(rosterData) {
  const rosterMap = groupByRoster(rosterData);
  const rosterEntries = Array.from(rosterMap.entries());
  if (rosterEntries.length < 2) return [];

  const maxPick = rosterData.reduce((max, p) => Math.max(max, parseInt(p.pick) || 0), 0);

  return CATEGORIES.map(cat => {
    const filtered = rosterEntries.map(([id, players]) => ({
      id,
      players: filterPlayers(players, cat.filter),
    }));

    let sumUnweighted = 0, sumWeighted = 0, sumShared = 0, pairCount = 0;

    for (let i = 0; i < filtered.length; i++) {
      for (let j = i + 1; j < filtered.length; j++) {
        const setA = new Set(filtered[i].players.map(p => p.name));
        const setB = new Set(filtered[j].players.map(p => p.name));
        const uw = jaccardUnweighted(setA, setB);
        sumUnweighted += uw.jaccard;
        sumShared += uw.intersection;

        const wA = buildWeightMap(filtered[i].players, maxPick);
        const wB = buildWeightMap(filtered[j].players, maxPick);
        sumWeighted += jaccardWeighted(wA, wB);

        pairCount++;
      }
    }

    return {
      key: cat.key,
      label: cat.label,
      unweightedPct: pairCount > 0 ? (sumUnweighted / pairCount) * 100 : 0,
      weightedPct: pairCount > 0 ? (sumWeighted / pairCount) * 100 : 0,
      avgSharedPlayers: pairCount > 0 ? sumShared / pairCount : 0,
      pairCount,
    };
  });
}

export function computePlayerImpact(rosterData) {
  const rosterMap = groupByRoster(rosterData);
  const rosterEntries = Array.from(rosterMap.entries());
  if (rosterEntries.length < 2) return [];

  const totalRosters = rosterEntries.length;

  // Baseline overall Jaccard
  const baseline = computeBaselineJaccard(rosterEntries);

  // Find players in 2+ rosters
  const playerRosters = new Map();
  rosterEntries.forEach(([id, players]) => {
    players.forEach(p => {
      if (!playerRosters.has(p.name)) {
        playerRosters.set(p.name, { player: p, rosterIds: new Set() });
      }
      playerRosters.get(p.name).rosterIds.add(id);
    });
  });

  const results = [];
  for (const [name, { player, rosterIds }] of playerRosters) {
    if (rosterIds.size < 2) continue;

    // Remove this player from all rosters, recompute
    const modified = rosterEntries.map(([id, players]) => [
      id,
      players.filter(p => p.name !== name),
    ]);
    const removed = computeBaselineJaccard(modified);

    const deltaJaccard = baseline.avgJaccard - removed.avgJaccard;
    const deltaShared = baseline.avgShared - removed.avgShared;

    results.push({
      name,
      position: player.position,
      team: player.team,
      exposure: ((rosterIds.size / totalRosters) * 100).toFixed(1),
      rosterCount: rosterIds.size,
      deltaJaccard,
      deltaSharedPlayers: deltaShared,
    });
  }

  results.sort((a, b) => b.deltaJaccard - a.deltaJaccard);
  return results;
}

function computeBaselineJaccard(rosterEntries) {
  let sumJaccard = 0, sumShared = 0, pairCount = 0;
  for (let i = 0; i < rosterEntries.length; i++) {
    for (let j = i + 1; j < rosterEntries.length; j++) {
      const setA = new Set(rosterEntries[i][1].map(p => p.name));
      const setB = new Set(rosterEntries[j][1].map(p => p.name));
      const uw = jaccardUnweighted(setA, setB);
      sumJaccard += uw.jaccard;
      sumShared += uw.intersection;
      pairCount++;
    }
  }
  return {
    avgJaccard: pairCount > 0 ? sumJaccard / pairCount : 0,
    avgShared: pairCount > 0 ? sumShared / pairCount : 0,
  };
}
