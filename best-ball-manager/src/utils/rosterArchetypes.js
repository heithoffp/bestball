// Roster Construction Archetypes for Best Ball

/**
 * Defines different roster construction strategies in best ball
 */
export const ROSTER_ARCHETYPES = {
  ZERO_RB: {
    name: 'Zero-RB',
    description: 'No RBs in rounds 1-6',
    rule: 'count(RB,1,6) == 0',
    emoji: '',
    color: '#8b5cf6'
  },
  FRAGILE_RB: {
    name: 'Fragile-RB',
    description: '2-3 RBs early (rounds 1-3), then none until round 10',
    rule: '2 <= count(RB,1,3) <= 3 AND count(RB,4,9) == 0',
    emoji: '',
    color: '#ec4899'
  },
  ROBUST_RB: {
    name: 'Robust-RB',
    description: '2+ RBs early (rounds 1-4) and 6+ total by round 14',
    rule: 'count(RB,1,4) >= 2 AND count(RB,1,14) >= 6',
    emoji: '',
    color: '#ef4444'
  },
  HERO_RB: {
    name: 'Hero-RB',
    description: '1 RB early (rounds 1-2) and 0 for next 5 rounds',
    rule: 'count(RB,1,2) == 1 AND count(RB,3,7) == 0 ',
    emoji: '',
    color: '#4bf1db'
  },
  BALANCED: {
    name: 'Balanced',
    description: '2+ RBs and 3+ WRs in first 6 rounds',
    rule: 'count(RB,1,6) >= 2 AND count(WR,1,6) >= 3',
    emoji: '',
    color: '#10b981'
  },
  LATE_QB: {
    name: 'Late-QB',
    description: 'No QB before round 10, first QB in rounds 10-14',
    rule: 'count(QB,1,9) == 0 AND count(QB,10,14) >= 1',
    emoji: '',
    color: '#eab308'
  },
  ELITE_QB: {
    name: 'Elite-QB',
    description: 'QB in rounds 1-3',
    rule: 'count(QB,1,3) >= 1',
    emoji: '',
    color: '#f59e0b'
  },
  ANCHOR_TE: {
    name: 'Anchor-TE',
    description: 'Lock top TE early (rounds 1-3)',
    rule: 'count(TE,1,3) >= 1',
    emoji: '',
    color: '#06b6d4'
  },
  DOUBLE_PREMIUM_QB: {
    name: 'Double-Premium-QB',
    description: '2 QB in rounds 1-7',
    rule: 'count(QB,1,7) >= 2',
    emoji: '',
    color: '#db2777'
  },
  OTHER: {
    name: 'Other',
    description: 'Does not fit other archetypes',
    rule: 'N/A',
    emoji: '',
    color: '#6b7280'
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
  const rbIn1to6 = countPosition(roster, 'RB', 1, 6);
  const rbIn1to3 = countPosition(roster, 'RB', 1, 3);
  const rbIn4to9 = countPosition(roster, 'RB', 4, 9);
  const rbIn1to2 = countPosition(roster, 'RB', 1, 2);
  const rbIn3to7 = countPosition(roster, 'RB', 3, 7);
  const rbIn1to4 = countPosition(roster, 'RB', 1, 4);
  const rbIn1to14 = countPosition(roster, 'RB', 1, 14);
  const wrIn1to7 = countPosition(roster, 'WR', 1, 7);
  const qbIn1to9 = countPosition(roster, 'QB', 1, 9);
  const teIn1to3 = countPosition(roster, 'TE', 1, 3);
    // 6 — Elite-QB: count(QB,1,3) >= 1
  const qbIn1to3 = countPosition(roster, 'QB', 1, 3);
  if (rbIn1to6 === 0) {
    archetypes.push('ZERO_RB');
  } else if (rbIn1to2 === 1 && rbIn3to7 === 0) {
    archetypes.push('HERO_RB');
  } else if (qbIn1to3 >= 1) {
    archetypes.push('ELITE_QB');
  } else if (teIn1to3 >= 1) {
    archetypes.push('ANCHOR_TE');
  } else if(rbIn1to4 >= 2 && rbIn1to14 >= 6) {
    archetypes.push('ROBUST_RB');
  } else if (rbIn1to3 >= 2 && rbIn1to3 <= 3 && rbIn4to9 === 0) {
    archetypes.push('FRAGILE_RB');
  } else  if (qbIn1to9 === 0) {
    archetypes.push('LATE_QB');
  } else if(  countPosition(roster, 'QB', 1, 7) >= 2 ) {
    archetypes.push('DOUBLE_PREMIUM_QB');
  } else if (rbIn1to6 >= 2 && wrIn1to7 >= 3) {
    archetypes.push('BALANCED');
  } else{
    archetypes.push('OTHER');
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