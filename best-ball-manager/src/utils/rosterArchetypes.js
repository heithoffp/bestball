/**
 * BIMODAL VOLATILITY PROTOCOL - HIERARCHICAL TREE
 * Structure: RB Tier (Capital Spend) -> QB Tier (Correlation) -> TE Tier (Final Hedge)
 */
export const PROTOCOL_TREE = {
  // --- LEVEL 1: RB (Capital Spend) ---
  RB_HERO: {
    target: 45, // Primary strategy: reliable ceiling + WR firepower
    color: '#4bf1db',
    children: {
      QB_CORE: { target: 60, children: { TE_ANCHOR: 50, TE_ELITE: 30, TE_LATE: 20 } },
      QB_ELITE: { target: 20, children: { TE_LATE: 80, TE_ANCHOR: 20, TE_ELITE: 0 } },
      QB_LATE: { target: 20, children: { TE_ELITE: 50, TE_ANCHOR: 50, TE_LATE: 0 } }
    }
  },
  RB_ZERO: {
    target: 40, // High-variance play: elite WR/QB/TE stacks
    color: '#8b5cf6',
    children: {
      QB_ELITE: { target: 70, children: { TE_ELITE: 40, TE_ANCHOR: 40, TE_LATE: 20 } }, // Zero RB NEEDS elite onesies
      QB_CORE: { target: 30, children: { TE_ELITE: 70, TE_ANCHOR: 30, TE_LATE: 0 } },
      QB_LATE: { target: 0, children: { TE_ELITE: 100, TE_ANCHOR: 0, TE_LATE: 0 } } // Disallow Zero RB + Late QB
    }
  },
  RB_HYPER_FRAGILE: {
    target: 15, // The Contrarian Hammer
    color: '#f97316',
    children: {
      QB_LATE: { target: 60, children: { TE_LATE: 80, TE_ANCHOR: 20, TE_ELITE: 0 } },
      QB_CORE: { target: 20, children: { TE_LATE: 90, TE_ANCHOR: 10, TE_ELITE: 0 } },
      QB_ELITE: { target: 20, children: { TE_LATE: 100, TE_ANCHOR: 0, TE_ELITE: 0} }
    }
  },
  RB_VALUE: {
    target: 0, // "Balanced" strategies are discouraged for top 0.1% hunting
    color: '#ef4444',
    children: {
      QB_CORE: { target: 100, children: { TE_LATE: 100 } }
    }
  }
};

/**
 * Metadata for UI labels and descriptions
 */
export const ARCHETYPE_METADATA = {
  RB_ZERO: { name: 'Zero RB', desc: 'No RB R1-6. Capital Rich.' },
  RB_HYPER_FRAGILE: { name: 'Hyper Fragile', desc: '3 RB R1-3. Capital Poor.' },
  RB_HERO: { name: 'Hero RB', desc: '1 RB R1-2. Middle Class.' },
  RB_VALUE: { name: 'Value', desc: 'Value Picks' },
  QB_ELITE: { name: 'Elite QB', desc: 'Rounds 1-3' },
  QB_CORE: { name: 'Core QB', desc: 'Rounds 4-9' },
  QB_LATE: { name: 'Late QB', desc: 'Round 10+' },
  TE_ELITE: { name: 'Elite TE', desc: 'Rounds 1-3' },
  TE_ANCHOR: { name: 'Anchor TE', desc: 'Rounds 4-7' },
  TE_LATE: { name: 'Late TE', desc: 'Round 8+' }
};

/**
 * Helper: Position Counter
 */
function countPosition(roster, position, start, end) {
  return roster.filter(p => {
    if (p.position !== position) return false;
    let r = p.round || Math.ceil(parseInt(p.pick) / 12);
    return r >= start && r <= end;
  }).length;
}

/**
 * Returns specific path tags for a roster
 */
/**
 * Classifies roster based on the strict structural rules for top-0.1% optimization
 */
export function classifyRosterPath(roster) {
  const path = { rb: 'RB_VALUE', qb: 'QB_LATE', te: 'TE_LATE' };

  // RB Capital Counts
  const rbRounds1to2 = countPosition(roster, 'RB', 1, 2);
  const rbRounds1to5 = countPosition(roster, 'RB', 1, 5);
  const rbRounds3to7 = countPosition(roster, 'RB', 3, 7);
  const totalRBs = countPosition(roster, 'RB', 1, 20);

  // RB Logic Implementation
  if (rbRounds1to5 === 0) {
    // Pure Zero RB: No RBs in the first 5 rounds
    path.rb = 'RB_ZERO';
  } else if (rbRounds1to5 >= 3 && totalRBs <= 4) {
    // Hyper Fragile: 3+ early RBs and a hard stop at 4 total
    path.rb = 'RB_HYPER_FRAGILE';
  } else if (rbRounds1to2 === 1 && rbRounds3to7 === 0) {
    // Hero RB: Exactly one elite RB and NO secondary RB until Round 8
    path.rb = 'RB_HERO';
  } else {
    // Failed to meet strict structural thresholds
    path.rb = 'RB_VALUE';
  }

  // QB Logic (Elite = Top 4 Rounds, Core = 5-9, Late = 10+)
  if (countPosition(roster, 'QB', 1, 4) >= 1) path.qb = 'QB_ELITE';
  else if (countPosition(roster, 'QB', 5, 9) >= 1) path.qb = 'QB_CORE';
  else path.qb = 'QB_LATE';

  // TE Logic (Elite = Top 4 Rounds, Anchor = 5-9, Late = 10+)
  if (countPosition(roster, 'TE', 1, 4) >= 1) path.te = 'TE_ELITE';
  else if (countPosition(roster, 'TE', 5, 9) >= 1) path.te = 'TE_ANCHOR';
  else path.te = 'TE_LATE';

  return path;
}

/**
 * Analyze Portfolio using the Tree Structure
 */
export function analyzePortfolioTree(rosterData) {
  const entriesMap = {};
  rosterData.forEach(p => {
    const id = p.entry_id || p.entryId || 'Unknown';
    if (!entriesMap[id]) entriesMap[id] = [];
    entriesMap[id].push(p);
  });

  const totalEntries = Object.keys(entriesMap).length;
  
  // Initialize results tree
  const tree = {};
  Object.keys(PROTOCOL_TREE).forEach(rbKey => {
    tree[rbKey] = { count: 0, children: {} };
    Object.keys(PROTOCOL_TREE[rbKey].children || {}).forEach(qbKey => {
      tree[rbKey].children[qbKey] = { count: 0, children: {} };
      Object.keys(PROTOCOL_TREE[rbKey].children[qbKey].children || {}).forEach(teKey => {
        tree[rbKey].children[qbKey].children[teKey] = { count: 0, entries: [] };
      });
    });
  });

  // Sort rosters into the tree
  Object.entries(entriesMap).forEach(([id, roster]) => {
    const path = classifyRosterPath(roster);
    
    // Safety check for off-tree branches
    if (tree[path.rb]) {
      tree[path.rb].count++;
      if (tree[path.rb].children[path.qb]) {
        tree[path.rb].children[path.qb].count++;
        if (tree[path.rb].children[path.qb].children[path.te]) {
          tree[path.rb].children[path.qb].children[path.te].count++;
          tree[path.rb].children[path.qb].children[path.te].entries.push({ id, roster });
        }
      }
    }
  });

  return { totalEntries, tree };
}