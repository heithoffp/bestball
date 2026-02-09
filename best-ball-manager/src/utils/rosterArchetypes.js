// Roster Construction Archetypes for Bimodal Volatility Portfolio

/**
 * Defines the specific target strategies for the top-0.1% portfolio
 */
export const ROSTER_ARCHETYPES = {
  // --- RB TARGETS (The Barbell) ---
  RB_ZERO: {
    name: 'Zero RB',
    description: 'No RBs in rounds 1-6. Maximizes chaos upside.',
    // Target: 40% of Portfolio
    color: '#8b5cf6' 
  },
  RB_HYPER_FRAGILE: {
    name: 'Hyper Fragile RB',
    description: '3+ RBs in rounds 1-3, then NONE until Round 10+. Maximizes early dominance.',
    // Target: 40% of Portfolio
    color: '#f97316'
  },
  RB_HERO: {
    name: 'Hero RB',
    description: 'Exactly 1 RB in rounds 1-2, then NONE rounds 3-7. The structural hedge.',
    // Target: 20% of Portfolio
    color: '#4bf1db'
  },
  RB_SUBOPTIMAL: {
    name: 'Suboptimal RB',
    description: 'Dead Zone, Balanced, or Robust builds that do not fit the volatility model.',
    // Target: 0% (Avoid)
    color: '#ef4444'
  },

  // --- QB TARGETS (Correlations) ---
  QB_ELITE: {
    name: 'Elite QB',
    description: 'Top tier QB in rounds 1-3. Mandatory for Zero RB.',
    color: '#f59e0b'
  },
  QB_CORE: {
    name: 'Core QB',
    description: 'Mid-round QB commit (Rounds 4-9). Optional for all builds.',
    color: '#3b82f6'
  },
  QB_LATE: {
    name: 'Late QB',
    description: 'No QB before Round 10. Mandatory for Hyper Fragile.',
    color: '#9ca3af'
  },

  // --- TE TARGETS (Correlations) ---
  TE_ELITE: {
    name: 'Elite TE',
    description: 'Top tier TE in rounds 1-3.',
    color: '#db2777'
  },
  TE_ANCHOR: {
    name: 'Anchor TE',
    description: 'Mid-round TE commit (Rounds 4-7).',
    color: '#06b6d4'
  },
  TE_LATE: { 
    name: 'Late TE', 
    description: 'No TE until Round 8+. Requires 3-TE builds.', 
    color: '#64748b' 
  }
};

/**
 * Helper function to count positions in a round range
 */
function countPosition(roster, position, startRound, endRound) {
  return roster.filter(player => {
    if (player.position !== position) return false;
    const round = typeof player.round === 'number' ? player.round : parseInt(player.round);
    if (isNaN(round)) return false;
    return round >= startRound && round <= endRound;
  }).length;
}

/**
 * Classify a roster based on the Bimodal Volatility Protocol
 * Returns an array of tags (e.g., ['RB_ZERO', 'QB_ELITE'])
 */
export function classifyRoster(roster) {
  const archetypes = [];

  // --- RB CLASSIFICATION ---
  const rb1to2 = countPosition(roster, 'RB', 1, 2);
  const rb1to3 = countPosition(roster, 'RB', 1, 3);
  const rb1to6 = countPosition(roster, 'RB', 1, 6);
  const rb3to7 = countPosition(roster, 'RB', 3, 7);
  const rb4to9 = countPosition(roster, 'RB', 4, 9);
  
  if (rb1to3 >= 3 && rb4to9 === 0) {
    archetypes.push('RB_HYPER_FRAGILE');
  } else if (rb1to6 === 0) {
    archetypes.push('RB_ZERO');
  } else if (rb1to2 === 1 && rb3to7 === 0) {
    archetypes.push('RB_HERO');
  } else {
    archetypes.push('RB_SUBOPTIMAL');
  }

  // --- QB CLASSIFICATION ---
  const qb1to3 = countPosition(roster, 'QB', 1, 3);
  const qb4to9 = countPosition(roster, 'QB', 4, 9);
  const qb1to9 = countPosition(roster, 'QB', 1, 9);

  if (qb1to3 >= 1) {
    archetypes.push('QB_ELITE');
  } else if (qb4to9 >= 1) {
    archetypes.push('QB_CORE');
  } else if (qb1to9 === 0) {
    archetypes.push('QB_LATE');
  }

  // --- TE CLASSIFICATION ---
  const te1to3 = countPosition(roster, 'TE', 1, 3);
  const te4to7 = countPosition(roster, 'TE', 4, 7);
  const te1to7 = countPosition(roster, 'TE', 1, 7);

  if (te1to3 >= 1) {
    archetypes.push('TE_ELITE');
  } else if (te4to7 >= 1) {
    archetypes.push('TE_ANCHOR');
  } else if (te1to7 === 0) {
    archetypes.push('TE_LATE');
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