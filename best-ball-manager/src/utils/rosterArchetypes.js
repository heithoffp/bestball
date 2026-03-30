/**
 * BIMODAL VOLATILITY PROTOCOL - HIERARCHICAL TREE
 * Structure: RB Tier (Capital Spend) -> QB Tier (Correlation) -> TE Tier (Final Hedge)
 */
export const PROTOCOL_TREE = {
  // --- LEVEL 1: RB (Capital Spend) ---
  RB_HERO: {
    color: '#4bf1db',
    children: {
      QB_CORE: { children: { TE_ANCHOR: 50, TE_ELITE: 30, TE_LATE: 20 } },
      QB_ELITE: { children: { TE_LATE: 80, TE_ANCHOR: 20, TE_ELITE: 0 } },
      QB_LATE: { children: { TE_ELITE: 50, TE_ANCHOR: 50, TE_LATE: 0 } }
    }
  },
  RB_ZERO: {
    color: '#8b5cf6',
    children: {
      QB_ELITE: { children: { TE_ELITE: 40, TE_ANCHOR: 40, TE_LATE: 20 } },
      QB_CORE: { children: { TE_ELITE: 70, TE_ANCHOR: 30, TE_LATE: 0 } },
      QB_LATE: { children: { TE_ELITE: 100, TE_ANCHOR: 0, TE_LATE: 0 } }
    }
  },
  RB_HYPER_FRAGILE: {
    color: '#f97316',
    children: {
      QB_LATE: { children: { TE_LATE: 80, TE_ANCHOR: 20, TE_ELITE: 0 } },
      QB_CORE: { children: { TE_LATE: 90, TE_ANCHOR: 10, TE_ELITE: 0 } },
      QB_ELITE: { children: { TE_LATE: 100, TE_ANCHOR: 0, TE_ELITE: 0} }
    }
  },
  RB_BALANCED: {
    color: '#ef4444',
    children: {
      QB_CORE: { children: { TE_LATE: 100 } }
    }
  }
};

/**
 * Metadata for UI labels and descriptions
 */
export const ARCHETYPE_METADATA = {
  RB_ZERO: { name: 'Zero RB', desc: 'No RB R1-6. WR Capital Rich.' },
  RB_HYPER_FRAGILE: { name: 'Hyper Fragile', desc: '3 RB R1-3. Capital Poor.' },
  RB_HERO: { name: 'Hero RB', desc: '1 RB R1-2. Middle Class.' },
  RB_BALANCED: { name: 'Balanced', desc: 'Balanced Approach' },
  QB_ELITE: { name: 'Elite QB', desc: '1st QB in Rounds 1-4' },
  QB_CORE: { name: 'Core QB', desc: 'Rounds 5-8' },
  QB_LATE: { name: 'Late QB', desc: 'Round 9+' },
  TE_ELITE: { name: 'Elite TE', desc: '1st TE in Rounds 1-4' },
  TE_ANCHOR: { name: 'Anchor TE', desc: 'Rounds 5-8' },
  TE_LATE: { name: 'Late TE', desc: 'Round 9+' }
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
  const path = { rb: 'RB_BALANCED', qb: 'QB_LATE', te: 'TE_LATE' };

  // RB Capital Counts
  const rbRounds1to3 = countPosition(roster, 'RB', 1, 3);
  const rbRounds1to4 = countPosition(roster, 'RB', 1, 4);
  const rbRounds4to6 = countPosition(roster, 'RB', 4, 6);
  const totalRBs = countPosition(roster, 'RB', 1, 17);

  // RB Logic Implementation
  if (rbRounds1to4 === 0) {
    // Pure Zero RB: No RBs in the first 4 rounds
    path.rb = 'RB_ZERO';
  } else if (rbRounds1to4 >= 3 && totalRBs <= 4) {
    // Hyper Fragile: 3+ early RBs and a hard stop at 4 total
    path.rb = 'RB_HYPER_FRAGILE';
  } else if (rbRounds1to3 === 1 && rbRounds4to6 === 0) {
    // Hero RB: Exactly one elite RB and NO secondary RB until Round 7
    path.rb = 'RB_HERO';
  } else {
    // Failed to meet strict structural thresholds
    path.rb = 'RB_BALANCED';
  }

  // QB Logic (Elite = Top 4 Rounds, Core = 5-8, Late = 9+)
  if (countPosition(roster, 'QB', 1, 4) >= 1) path.qb = 'QB_ELITE';
  else if (countPosition(roster, 'QB', 5, 8) >= 1) path.qb = 'QB_CORE';
  else path.qb = 'QB_LATE';

  // TE Logic (Elite = Top 4 Rounds, Anchor = 5-8, Late = 9+)
  if (countPosition(roster, 'TE', 1, 4) >= 1) path.te = 'TE_ELITE';
  else if (countPosition(roster, 'TE', 5, 8) >= 1) path.te = 'TE_ANCHOR';
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