import { canonicalName, expandTeam } from '../../utils/helpers';

/**
 * Build a normalized player list from a saved-rankings array OR an ADP-rows array.
 *
 * @param {Array}   source         - rows from rankingsByPlatform[platform] or adpByPlatform[platform].latestRows
 * @param {Object}  projMap        - canonical-name → projected-points map (optional)
 * @param {boolean} isAdpFallback  - sort by ADP when true; preserve input order when false
 */
export function buildPlayersFromSource(source, projMap = {}, isAdpFallback = false) {
  if (!source || source.length === 0) return [];
  const list = source.map(row => {
    let firstName = row.firstName || row.first_name || row['First Name'] || '';
    let lastName = row.lastName || row.last_name || row['Last Name'] || '';
    const name = `${firstName} ${lastName}`.trim() || row['Player Name'] || row.player_name || row.Name || row.name || '';
    // Fallback: split joined name when source lacks separate first/last columns
    // (e.g. some ADP fallback paths). Ensures save round-trip carries names.
    if (!firstName && !lastName && name) {
      const parts = name.trim().split(/\s+/);
      firstName = parts[0] || '';
      lastName = parts.slice(1).join(' ') || '';
    }
    const adpVal = parseFloat(row.adp ?? row.ADP ?? '');
    const nameKey = canonicalName(name);
    const projRaw = row.projectedPoints || row.projected_points || '';
    const proj = projRaw || (projMap[nameKey] != null ? String(projMap[nameKey]) : '');
    return {
      id: nameKey,
      name,
      firstName,
      lastName,
      adp: isNaN(adpVal) ? 9999 : adpVal,
      adpStr: isNaN(adpVal) ? '-' : String(adpVal),
      projectedPoints: proj,
      slotName: row.slotName || row.position || row.Position || row.pos || 'N/A',
      teamName: expandTeam(row.teamName || row.team || row.Team || ''),
      lineupStatus: row.lineupStatus || '',
      byeWeek: row.byeWeek || '',
      _csvTier: row.tier || '',
      _csvTierNum: row.tierNum || '',
    };
  }).filter(p => p.id);

  if (isAdpFallback) {
    list.sort((a, b) => a.adp - b.adp);
  }
  return list.filter(p => p.adp !== 9999);
}

/**
 * Derive tier-break placement and labels from a sorted player list whose CSV rows
 * carry `_csvTier` (letter) and/or `_csvTierNum` (numeric).
 * Returns { breaks: Set<playerId>, labels: { __tier1__: string, [playerId]: string } }.
 */
export function deriveTierBreaks(players) {
  const breaks = new Set();
  const labels = {};
  if (!players || players.length === 0) return { breaks, labels };

  const hasTierNums = players.some(p => p._csvTierNum);
  const hasTiers = players.some(p => p._csvTier);
  if (!hasTierNums && !hasTiers) return { breaks, labels };

  let prevTierNum = null;
  let prevTierLabel = null;

  players.forEach((p, idx) => {
    const tierNum = p._csvTierNum ? String(p._csvTierNum) : null;
    const tierLabel = p._csvTier || '';
    if (idx === 0 && tierLabel) labels['__tier1__'] = tierLabel;

    if (hasTierNums) {
      if (prevTierNum !== null && tierNum && tierNum !== prevTierNum) {
        breaks.add(p.id);
        if (tierLabel) labels[p.id] = tierLabel;
      }
      if (tierNum) prevTierNum = tierNum;
    } else {
      if (prevTierLabel !== null && tierLabel && tierLabel !== prevTierLabel) {
        breaks.add(p.id);
        if (tierLabel) labels[p.id] = tierLabel;
      }
      if (tierLabel) prevTierLabel = tierLabel;
    }
  });

  return { breaks, labels };
}

const TIER_LABELS = ['S', 'A+', 'A', 'A-', 'B+', 'B', 'B-', 'C+', 'C', 'C-', 'D+', 'D', 'D-', 'F'];
const TIER_COLORS = {
  'S':  { bg: 'rgba(255,215,0,0.15)',  text: '#ffd700',  border: '#ffd700' },
  'A+': { bg: 'rgba(239,68,68,0.15)',  text: '#ef4444',  border: '#ef4444' },
  'A':  { bg: 'rgba(239,68,68,0.12)',  text: '#f87171',  border: '#f87171' },
  'A-': { bg: 'rgba(251,146,60,0.12)', text: '#fb923c',  border: '#fb923c' },
  'B+': { bg: 'rgba(245,158,11,0.12)', text: '#f59e0b',  border: '#f59e0b' },
  'B':  { bg: 'rgba(234,179,8,0.12)',  text: '#eab308',  border: '#eab308' },
  'B-': { bg: 'rgba(163,230,53,0.12)', text: '#a3e635',  border: '#a3e635' },
  'C+': { bg: 'rgba(16,185,129,0.12)', text: '#10b981',  border: '#10b981' },
  'C':  { bg: 'rgba(6,182,212,0.12)',  text: '#06b6d4',  border: '#06b6d4' },
  'C-': { bg: 'rgba(59,130,246,0.12)', text: '#3b82f6',  border: '#3b82f6' },
  'D+': { bg: 'rgba(99,102,241,0.12)', text: '#6366f1',  border: '#6366f1' },
  'D':  { bg: 'rgba(139,92,246,0.12)', text: '#8b5cf6',  border: '#8b5cf6' },
  'D-': { bg: 'rgba(168,85,247,0.12)', text: '#a855f7',  border: '#a855f7' },
  'F':  { bg: 'rgba(107,114,128,0.12)', text: '#6b7280', border: '#6b7280' },
};

export function getTierLabel(tierNum) {
  if (tierNum < 1) return TIER_LABELS[0];
  if (tierNum > TIER_LABELS.length) return TIER_LABELS[TIER_LABELS.length - 1];
  return TIER_LABELS[tierNum - 1];
}

export function getTierColor(tierNum) {
  return TIER_COLORS[getTierLabel(tierNum)] || TIER_COLORS['F'];
}
