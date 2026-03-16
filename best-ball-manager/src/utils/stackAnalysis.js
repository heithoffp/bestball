// src/utils/stackAnalysis.js
// Shared stack detection logic — extracted from DraftFlowAnalysis.jsx

/**
 * Analyze stack relationship between a player and existing picks on the same team.
 * @param {object} player - { position, team, name }
 * @param {object[]} currentPicks - other players already picked (same roster or draft context)
 * @returns {object|null} { type, priority, color, icon, teammates }
 */
export function analyzeStack(player, currentPicks) {
  const team = player.team;
  if (!team || team === 'FA' || team === 'N/A') return null;

  const teammates = currentPicks.filter(p => p.team === team);
  if (teammates.length === 0) return null;

  const playerPos = player.position;
  const qbs = teammates.filter(p => p.position === 'QB');
  const wrs = teammates.filter(p => p.position === 'WR');
  const tes = teammates.filter(p => p.position === 'TE');
  const rbs = teammates.filter(p => p.position === 'RB');

  let stackType = '';
  let priority = 0;
  let color = '#64748b';
  let icon = '●';

  if (playerPos === 'QB' && (wrs.length > 0 || tes.length > 0)) {
    const passTargets = wrs.length + tes.length;
    if (passTargets >= 2) {
      stackType = '\uD83D\uDD25 ELITE OVERSTACK';
      priority = 100;
      color = '#a855f7';
      icon = '\u26A1\u26A1';
    } else {
      stackType = '\u26A1 ELITE STACK';
      priority = 90;
      color = '#8b5cf6';
      icon = '\u26A1';
    }
  } else if ((playerPos === 'WR' || playerPos === 'TE') && qbs.length > 0) {
    const passTargets = wrs.length + tes.length;
    if (passTargets >= 1) {
      stackType = '\uD83D\uDD25 ELITE OVERSTACK';
      priority = 100;
      color = '#a855f7';
      icon = '\u26A1\u26A1';
    } else {
      stackType = '\u26A1 ELITE STACK';
      priority = 90;
      color = '#8b5cf6';
      icon = '\u26A1';
    }
  } else if (playerPos === 'WR' && wrs.length >= 1) {
    stackType = `\uD83D\uDC8E WR OVERSTACK (${wrs.length + 1})`;
    priority = 80;
    color = '#06b6d4';
    icon = '\uD83D\uDC8E';
  } else if (playerPos === 'TE' && tes.length >= 1) {
    stackType = `\uD83D\uDC8E TE OVERSTACK (${tes.length + 1})`;
    priority = 80;
    color = '#06b6d4';
    icon = '\uD83D\uDC8E';
  } else if (playerPos === 'RB' && rbs.length >= 1) {
    stackType = `\uD83D\uDD04 RB STACK (${rbs.length + 1})`;
    priority = 60;
    color = '#f59e0b';
    icon = '\uD83D\uDD04';
  } else if (playerPos === 'RB' && (wrs.length > 0 || tes.length > 0)) {
    stackType = '\u25CB Game Stack';
    priority = 40;
    color = '#64748b';
    icon = '\u25CB';
  } else if ((playerPos === 'WR' || playerPos === 'TE') && rbs.length > 0) {
    stackType = '\u25CB Game Stack';
    priority = 40;
    color = '#64748b';
    icon = '\u25CB';
  } else {
    stackType = '\u25CF Stack';
    priority = 30;
    color = '#64748b';
    icon = '\u25CF';
  }

  return {
    type: stackType,
    priority,
    color,
    icon,
    teammates: teammates.map(t => `${t.position} ${t.name}`).join(', ')
  };
}

/**
 * Analyze all stacks within a single roster's player list.
 * Groups by team, classifies each team grouping, returns stacks with priority >= 40.
 * @param {object[]} players - roster players with { name, position, team }
 * @returns {object[]} sorted by priority desc: [{ team, type, priority, color, icon, members }]
 */
export function analyzeRosterStacks(players) {
  // Group players by team
  const byTeam = {};
  players.forEach(p => {
    if (!p.team || p.team === 'FA' || p.team === 'N/A') return;
    if (!byTeam[p.team]) byTeam[p.team] = [];
    byTeam[p.team].push(p);
  });

  const stacks = [];

  for (const [team, teamPlayers] of Object.entries(byTeam)) {
    if (teamPlayers.length < 2) continue;

    // Find highest-priority stack classification for this team grouping
    let bestStack = null;

    for (const player of teamPlayers) {
      const others = teamPlayers.filter(p => p !== player);
      const result = analyzeStack(player, others);
      if (result && result.priority >= 40) {
        if (!bestStack || result.priority > bestStack.priority) {
          bestStack = {
            team,
            type: result.type,
            priority: result.priority,
            color: result.color,
            icon: result.icon,
            members: teamPlayers.map(p => ({ name: p.name, position: p.position })),
          };
        }
      }
    }

    if (bestStack) stacks.push(bestStack);
  }

  // Sort by priority descending
  stacks.sort((a, b) => b.priority - a.priority);
  return stacks;
}

/**
 * Composite stack scoring metric (0-100) with four weighted components.
 * Replaces the naive "highest priority" approach that clustered all scores near 100.
 * @param {object[]} stacks - output of analyzeRosterStacks()
 * @param {object[]} players - roster players with { name, position, team, pick }
 * @returns {number} 0-100 composite score
 */
export function scoreRosterStacks(stacks, players) {
  if (!stacks || stacks.length === 0) return 0;

  // ── Component 1: Correlation Quality (35%) ──
  // Point system per stack type with diminishing-returns normalization
  let totalPts = 0;
  for (const s of stacks) {
    if (s.priority === 100) totalPts += 50;       // QB + 2+ pass catchers (ELITE OVERSTACK)
    else if (s.priority === 90) {
      // QB + 1 pass catcher — check if WR or TE
      const hasTE = s.members.some(m => m.position === 'TE');
      const hasWR = s.members.some(m => m.position === 'WR');
      const hasQB = s.members.some(m => m.position === 'QB');
      if (hasQB && hasWR) totalPts += 30;
      else if (hasQB && hasTE) totalPts += 25;
      else totalPts += 25;
    }
    else if (s.priority === 80) totalPts += 12;    // Position overstack (WR/TE, no QB)
    else if (s.priority === 40) totalPts += 8;     // Game stack
    else if (s.priority === 60) totalPts += 5;     // RB stack
  }
  const correlationQuality = Math.min(100, 40 * Math.log2(1 + totalPts / 20));

  // ── Component 2: Ceiling Path Diversity (25%) ──
  // Count unique NFL teams with qualifying stacks
  const uniqueTeams = new Set(stacks.map(s => s.team)).size;
  let ceilingDiversity;
  if (uniqueTeams === 0) ceilingDiversity = 0;
  else if (uniqueTeams === 1) ceilingDiversity = 30;
  else if (uniqueTeams === 2) ceilingDiversity = 70;
  else ceilingDiversity = Math.min(100, 90 + (uniqueTeams - 3) * 5);

  // ── Component 3: Capital Investment (25%) ──
  // Measures draft capital committed to stack pieces vs total roster
  const playerByName = {};
  for (const p of players) {
    playerByName[p.name] = p;
  }

  let stackCapital = 0;
  let totalRosterCapital = 0;
  const countedNames = new Set();

  for (const p of players) {
    const pick = Number(p.pick) || 180; // default to late if missing
    totalRosterCapital += 1 / Math.sqrt(pick);
  }

  for (const s of stacks) {
    for (const m of s.members) {
      if (countedNames.has(m.name)) continue;
      countedNames.add(m.name);
      const full = playerByName[m.name];
      const pick = full ? (Number(full.pick) || 180) : 180;
      stackCapital += 1 / Math.sqrt(pick);
    }
  }

  const capitalRatio = totalRosterCapital > 0 ? stackCapital / totalRosterCapital : 0;
  const capitalInvestment = Math.min(100, capitalRatio * 250);

  // ── Component 4: QB Anchor Bonus (15%) ──
  // Gradient bonus for QB-anchored stacking based on when QB was drafted
  let qbAnchor = 0;
  for (const s of stacks) {
    const qbMember = s.members.find(m => m.position === 'QB');
    if (!qbMember) continue;
    const full = playerByName[qbMember.name];
    const pick = full ? (Number(full.pick) || 0) : 0;
    if (pick > 0 && pick <= 96) qbAnchor = Math.max(qbAnchor, 100);     // Rounds 1-8
    else if (pick > 96) qbAnchor = Math.max(qbAnchor, 80);              // Rounds 9-14+
  }

  // ── Weighted composite ──
  const composite = (
    correlationQuality * 0.35 +
    ceilingDiversity * 0.25 +
    capitalInvestment * 0.25 +
    qbAnchor * 0.15
  );

  return Math.round(Math.min(100, Math.max(0, composite)));
}
