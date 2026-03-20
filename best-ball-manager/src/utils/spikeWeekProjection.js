// src/utils/spikeWeekProjection.js
// Spike Week Projection — optimal single-week ceiling with correlation multipliers

// ── Schedule placeholder ─────────────────────────────────────────────────────
// Keyed by NFL team abbreviation. Empty by default — all multipliers return 1.0.
const WEEK_17_SCHEDULE = {
  // 'KC': { opponent: 'DEN', impliedTotal: 27.5, spread: -7.0, domeGame: false,
  //         defVsQB: 1.05, defVsRB: 0.92, defVsWR: 1.08, defVsTE: 0.95 }
};

function getScheduleMultiplier(team, position) {
  const entry = WEEK_17_SCHEDULE[team];
  if (!entry) return 1.0;
  const key = `defVs${position}`;
  return entry[key] ?? 1.0;
}

function getOpponent(team) {
  const entry = WEEK_17_SCHEDULE[team];
  return entry?.opponent ?? null;
}

// ── Correlation factor matrix ────────────────────────────────────────────────
// Keys: "pos1-pos2-relationship" where pos order is normalized (QB > WR > RB > TE)
const CORRELATION_MATRIX = {
  'QB-WR-same':     +0.20,
  'QB-TE-same':     +0.12,
  'QB-RB-same':     +0.03,
  'QB-QB-opposing': +0.08,
  'QB-WR-opposing': +0.06,
  'QB-TE-opposing': +0.04,
  'QB-RB-opposing': -0.06,
  'WR-WR-same':     -0.04,
  'WR-TE-same':     -0.03,
  'RB-RB-same':     -0.10,
  'WR-WR-opposing': +0.03,
  'RB-RB-opposing': -0.02,
};

const POS_ORDER = { QB: 0, WR: 1, RB: 2, TE: 3 };

function normalizePositionPair(pos1, pos2) {
  const o1 = POS_ORDER[pos1] ?? 99;
  const o2 = POS_ORDER[pos2] ?? 99;
  return o1 <= o2 ? [pos1, pos2] : [pos2, pos1];
}

function getCorrelationFactor(player1, player2) {
  const pos1 = player1.position;
  const pos2 = player2.position;
  if (!POS_ORDER.hasOwnProperty(pos1) || !POS_ORDER.hasOwnProperty(pos2)) return 0;

  const team1 = player1.team;
  const team2 = player2.team;

  let relationship = null;
  if (team1 === team2) {
    relationship = 'same';
  } else {
    // Check if they're opponents via schedule
    const opp1 = getOpponent(team1);
    if (opp1 && opp1 === team2) {
      relationship = 'opposing';
    }
  }

  if (!relationship) return 0;

  const [normPos1, normPos2] = normalizePositionPair(pos1, pos2);
  const key = `${normPos1}-${normPos2}-${relationship}`;
  return CORRELATION_MATRIX[key] ?? 0;
}

// ── Lineup optimizer ─────────────────────────────────────────────────────────
// Valid lineup: 1 QB, 2 RB, 3 WR, 1 TE, 1 FLEX (WR/RB/TE) = 8 starters

function getBaseProjection(player) {
  return (player.projectedPoints || 0) / 17;
}

function scoreLineup(lineup) {
  let baseScore = 0;
  for (const p of lineup) {
    baseScore += p._adjustedBase;
  }

  let correlationBonus = 0;
  for (let i = 0; i < lineup.length; i++) {
    for (let j = i + 1; j < lineup.length; j++) {
      const factor = getCorrelationFactor(lineup[i], lineup[j]);
      if (factor !== 0) {
        correlationBonus += factor * Math.sqrt(lineup[i]._adjustedBase * lineup[j]._adjustedBase);
      }
    }
  }

  return { spikeScore: baseScore + correlationBonus, baseScore, correlationBonus };
}

/**
 * Calculate the spike week projection for a roster.
 * @param {object[]} players - roster players with { position, team, projectedPoints, name }
 * @param {object} [schedule] - optional schedule override (unused for now)
 * @returns {{ spikeScore: number, lineup: object[], baseScore: number, correlationBonus: number }}
 */
export function calculateSpikeWeekProjection(players, schedule) {
  // Filter to eligible positions
  const eligible = players.filter(p => {
    const pos = p.position;
    return pos === 'QB' || pos === 'RB' || pos === 'WR' || pos === 'TE';
  });

  // Pre-compute adjusted base for each player
  const withBase = eligible.map(p => ({
    ...p,
    _adjustedBase: getBaseProjection(p) * getScheduleMultiplier(p.team, p.position),
  }));

  // Partition by position
  const qbs = withBase.filter(p => p.position === 'QB');
  const rbs = withBase.filter(p => p.position === 'RB');
  const wrs = withBase.filter(p => p.position === 'WR');
  const tes = withBase.filter(p => p.position === 'TE');

  // Need at least: 1 QB, 2 RB, 3 WR, 1 TE (FLEX can come from RB/WR/TE remainder)
  if (qbs.length < 1 || rbs.length < 2 || wrs.length < 3 || tes.length < 1) {
    // Check if we can fill with FLEX
    const totalFlex = rbs.length + wrs.length + tes.length;
    if (qbs.length < 1 || totalFlex < 7) {
      return { spikeScore: 0, lineup: [], baseScore: 0, correlationBonus: 0 };
    }
  }

  // Sort each position by adjusted base descending for pruning
  qbs.sort((a, b) => b._adjustedBase - a._adjustedBase);
  rbs.sort((a, b) => b._adjustedBase - a._adjustedBase);
  wrs.sort((a, b) => b._adjustedBase - a._adjustedBase);
  tes.sort((a, b) => b._adjustedBase - a._adjustedBase);

  // Top-K pruning: correlation bonuses (max +0.20) can't overcome large base gaps
  const topQbs = qbs.slice(0, 2);
  const topRbs = rbs.slice(0, 4);
  const topWrs = wrs.slice(0, 5);
  const topTes = tes.slice(0, 2);

  // Pre-build flex pool: all RB/WR/TE sorted by base descending
  const flexPool = withBase
    .filter(p => p.position === 'RB' || p.position === 'WR' || p.position === 'TE')
    .sort((a, b) => b._adjustedBase - a._adjustedBase);

  let bestResult = { spikeScore: -Infinity, lineup: [], baseScore: 0, correlationBonus: 0 };

  // Enumerate pruned lineups
  for (let qi = 0; qi < topQbs.length; qi++) {
    const qb = topQbs[qi];

    for (let ri = 0; ri < topRbs.length - 1; ri++) {
      for (let rj = ri + 1; rj < topRbs.length; rj++) {
        const rb1 = topRbs[ri], rb2 = topRbs[rj];

        for (let wi = 0; wi < topWrs.length - 2; wi++) {
          for (let wj = wi + 1; wj < topWrs.length - 1; wj++) {
            for (let wk = wj + 1; wk < topWrs.length; wk++) {
              const wr1 = topWrs[wi], wr2 = topWrs[wj], wr3 = topWrs[wk];

              for (let ti = 0; ti < topTes.length; ti++) {
                const te = topTes[ti];

                const starters = [qb, rb1, rb2, wr1, wr2, wr3, te];
                const starterNames = new Set([qb.name, rb1.name, rb2.name, wr1.name, wr2.name, wr3.name, te.name]);

                // Find best flex candidates from pre-sorted pool (check top 3 unused)
                let flexChecked = 0;
                for (let fi = 0; fi < flexPool.length && flexChecked < 3; fi++) {
                  const flex = flexPool[fi];
                  if (starterNames.has(flex.name)) continue;
                  flexChecked++;

                  const lineup = [...starters, flex];
                  const result = scoreLineup(lineup);
                  if (result.spikeScore > bestResult.spikeScore) {
                    bestResult = { ...result, lineup };
                  }
                }
              }
            }
          }
        }
      }
    }
  }

  // Clean up internal fields from returned lineup
  const cleanLineup = bestResult.lineup.map(({ _adjustedBase, ...rest }) => rest);

  return {
    spikeScore: bestResult.spikeScore,
    lineup: cleanLineup,
    baseScore: bestResult.baseScore,
    correlationBonus: bestResult.correlationBonus,
  };
}

/**
 * Compute percentile rank of a raw score within all scores.
 * @param {number} rawScore
 * @param {number[]} allScores
 * @returns {number} 0-100 percentile
 */
export function spikeWeekPercentile(rawScore, allScores) {
  if (!allScores || allScores.length === 0) return 0;
  const count = allScores.filter(s => s <= rawScore).length;
  return (count / allScores.length) * 100;
}
