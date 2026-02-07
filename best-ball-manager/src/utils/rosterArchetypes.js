// Roster Construction Archetypes for Best Ball

/**
 * Defines different roster construction strategies in best ball
 */
export const ROSTER_ARCHETYPES = {
  ZERO_RB: {
    name: 'Zero-RB',
    description: 'No RBs in rounds 1-6',
    rule: 'count(RB,1,6) == 0',
    emoji: '🚫',
    color: '#8b5cf6'
  },
  FRAGILE_RB: {
    name: 'Fragile-RB',
    description: '2-3 RBs early (rounds 1-3), then none until round 10',
    rule: '2 <= count(RB,1,3) <= 3 AND count(RB,4,9) == 0',
    emoji: '💎',
    color: '#ec4899'
  },
  ROBUST_RB: {
    name: 'Robust-RB',
    description: '2+ RBs early (rounds 1-4) and 6+ total by round 14',
    rule: 'count(RB,1,4) >= 2 AND count(RB,1,14) >= 6',
    emoji: '🏃‍♂️',
    color: '#ef4444'
  },
  BALANCED: {
    name: 'Balanced',
    description: '2+ RBs and 3+ WRs in first 6 rounds',
    rule: 'count(RB,1,6) >= 2 AND count(WR,1,6) >= 3',
    emoji: '⚖️',
    color: '#10b981'
  },
  LATE_QB: {
    name: 'Late-QB',
    description: 'No QB before round 10, first QB in rounds 10-14',
    rule: 'count(QB,1,9) == 0 AND count(QB,10,14) >= 1',
    emoji: '🎯',
    color: '#eab308'
  },
  EARLY_QB: {
    name: 'Early-QB',
    description: 'QB in rounds 3-5 (anchor QB)',
    rule: 'count(QB,3,5) >= 1 AND count(QB,1,2) == 0',
    emoji: '👑',
    color: '#f59e0b'
  },
  ANCHOR_TE: {
    name: 'Anchor-TE',
    description: 'Lock top TE early (rounds 2-4)',
    rule: 'count(TE,2,4) >= 1',
    emoji: '🎪',
    color: '#06b6d4'
  },
  WR_HEAVY: {
    name: 'WR-Heavy',
    description: '2+ WRs in rounds 1-3, max 2 RBs through round 8',
    rule: 'count(WR,1,3) >= 2 AND count(RB,1,8) <= 2',
    emoji: '📡',
    color: '#3b82f6'
  }
};

/**
 * Helper function to count positions in a round range
 * @param {Array} roster - Array of player objects
 * @param {string} position - Position to count (e.g., 'RB', 'WR', 'QB', 'TE')
 * @param {number} startRound - Start round (inclusive)
 * @param {number} endRound - End round (inclusive)
 * @returns {number} - Count of players matching criteria
 */
function countPosition(roster, position, startRound, endRound) {
  return roster.filter(player => {
    if (player.position !== position) return false;
    
    // Get round number - handle both number and string types
    const round = typeof player.round === 'number' 
      ? player.round 
      : parseInt(player.round);
    
    // Skip if round is invalid
    if (isNaN(round)) return false;
    
    return round >= startRound && round <= endRound;
  }).length;
}

/**
 * Classify a single roster by its construction archetype
 * @param {Array} roster - Array of player objects for one entry
 * @param {number} draftSize - Number of teams in draft (default 12)
 * @returns {Array} - Array of archetype keys that this roster matches
 */
export function classifyRoster(roster, draftSize = 12) {
  const archetypes = [];
  
  // 1 — Zero-RB: count(RB,1,6) == 0
  const rbIn1to6 = countPosition(roster, 'RB', 1, 6);
  if (rbIn1to6 === 0) {
    archetypes.push('ZERO_RB');
  }
  
  // 2 — Fragile-RB: 2 <= count(RB,1,3) <= 3 AND count(RB,4,9) == 0
  const rbIn1to3 = countPosition(roster, 'RB', 1, 3);
  const rbIn4to9 = countPosition(roster, 'RB', 4, 9);
  if (rbIn1to3 >= 2 && rbIn1to3 <= 3 && rbIn4to9 === 0) {
    archetypes.push('FRAGILE_RB');
  }
  
  // 3 — Robust-RB: count(RB,1,4) >= 2 AND count(RB,1,14) >= 6
  const rbIn1to4 = countPosition(roster, 'RB', 1, 4);
  const rbIn1to14 = countPosition(roster, 'RB', 1, 14);
  if (rbIn1to4 >= 2 && rbIn1to14 >= 6) {
    archetypes.push('ROBUST_RB');
  }
  
  // 4 — Balanced: count(RB,1,6) >= 2 AND count(WR,1,6) >= 3
  const wrIn1to6 = countPosition(roster, 'WR', 1, 6);
  if (rbIn1to6 >= 2 && wrIn1to6 >= 3) {
    archetypes.push('BALANCED');
  }
  
  // 5 — Late-QB: count(QB,1,9) == 0 AND count(QB,10,14) >= 1
  const qbIn1to9 = countPosition(roster, 'QB', 1, 9);
  const qbIn10to14 = countPosition(roster, 'QB', 10, 14);
  if (qbIn1to9 === 0 && qbIn10to14 >= 1) {
    archetypes.push('LATE_QB');
  }
  
  // 6 — Early-QB: count(QB,3,5) >= 1 AND count(QB,1,2) == 0
  const qbIn1to2 = countPosition(roster, 'QB', 1, 2);
  const qbIn3to5 = countPosition(roster, 'QB', 3, 5);
  if (qbIn3to5 >= 1 && qbIn1to2 === 0) {
    archetypes.push('EARLY_QB');
  }
  
  // 7 — Anchor-TE: count(TE,2,4) >= 1
  const teIn2to4 = countPosition(roster, 'TE', 2, 4);
  if (teIn2to4 >= 1) {
    archetypes.push('ANCHOR_TE');
  }
  
  // 8 — WR-Heavy: count(WR,1,3) >= 2 AND count(RB,1,8) <= 2
  const wrIn1to3 = countPosition(roster, 'WR', 1, 3);
  const rbIn1to8 = countPosition(roster, 'RB', 1, 8);
  if (wrIn1to3 >= 2 && rbIn1to8 <= 2) {
    archetypes.push('WR_HEAVY');
  }
  
  return archetypes;
}

/**
 * Analyze all rosters and calculate exposure to each archetype
 * @param {Array} rosterData - All drafted players
 * @param {number} draftSize - Number of teams (default 12)
 * @returns {Object} - Exposure data by archetype
 */
export function analyzeRosterConstructions(rosterData, draftSize = 12) {
  // Group players by entry_id
  const entriesMap = {};
  rosterData.forEach(player => {
    const entryId = player.entry_id || 'Unknown';
    if (!entriesMap[entryId]) {
      entriesMap[entryId] = [];
    }
    entriesMap[entryId].push(player);
  });
  
  const entries = Object.keys(entriesMap);
  const totalEntries = entries.length;
  
  // Count archetypes
  const archetypeCounts = {};
  const archetypeEntries = {}; // Track which entries match each archetype
  
  Object.keys(ROSTER_ARCHETYPES).forEach(key => {
    archetypeCounts[key] = 0;
    archetypeEntries[key] = [];
  });
  
  // Classify each roster
  entries.forEach(entryId => {
    const roster = entriesMap[entryId];
    const archetypes = classifyRoster(roster, draftSize);
    
    archetypes.forEach(archetype => {
      archetypeCounts[archetype]++;
      archetypeEntries[archetype].push(entryId);
    });
  });
  
  // Calculate percentages and build results
  const results = Object.keys(ROSTER_ARCHETYPES).map(key => {
    const count = archetypeCounts[key];
    const percentage = totalEntries > 0 ? (count / totalEntries) * 100 : 0;
    
    return {
      key,
      ...ROSTER_ARCHETYPES[key],
      count,
      percentage: percentage.toFixed(1),
      entries: archetypeEntries[key]
    };
  });
  
  // Sort by percentage descending
  results.sort((a, b) => parseFloat(b.percentage) - parseFloat(a.percentage));
  
  return {
    totalEntries,
    archetypes: results,
    entriesMap // Include for individual roster analysis
  };
}