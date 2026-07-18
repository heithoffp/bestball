// buildPlayers.js — player-list builders for the Rankings screens.
//
// buildPlayersFromSource is a port of the web's
// best-ball-manager/src/components/PlayerRankings/buildPlayers.js: canonical-name
// ids so the SAME player matches across the UD and DK columns in Compare.
//
// buildRankedPlayers (platform-id based) powers the single-platform board — its
// ids round-trip through the saved CSV / user_rankings exactly like the web
// PlayerRankings board. Moved here from the old RankingsView along with its
// lookup helpers.
import { canonicalName, expandTeam } from '../../../shared/utils/helpers';

/**
 * Normalized list from a saved-rankings array OR an ADP-rows array,
 * keyed by canonical name (cross-platform identity).
 * @param {Array}   source        rankingsByPlatform[p] or adpByPlatform[p].latestRows
 * @param {Object}  projMap       canonical-name → projected points
 * @param {boolean} isAdpFallback sort by ADP when true; preserve input order when false
 */
export function buildPlayersFromSource(source, projMap = {}, isAdpFallback = false) {
  if (!source || source.length === 0) return [];
  const list = source.map(row => {
    let firstName = row.firstName || row.first_name || row['First Name'] || '';
    let lastName = row.lastName || row.last_name || row['Last Name'] || '';
    const name = `${firstName} ${lastName}`.trim() || row['Player Name'] || row.player_name || row.Name || row.name || '';
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
      adpStr: isNaN(adpVal) ? '-' : String(Math.round(adpVal * 10) / 10),
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

/** Platform-id based builder for the single-platform board (web parity). */
export function buildRankedPlayers(source, { projMap = {}, nameToAdpId = new Map(), adpLookup = new Map(), teamLookup = new Map() } = {}) {
  const players = source.map(row => {
    const firstName = row.firstName || row.first_name || row['First Name'] || '';
    const lastName = row.lastName || row.last_name || row['Last Name'] || '';
    const name = `${firstName} ${lastName}`.trim() || row['Player Name'] || row.player_name || row.Name || row.name || 'Unknown';
    const adpVal = parseFloat(row.adp ?? row.ADP ?? '');
    const nameKey = canonicalName(name);
    const projFromMap = projMap[nameKey] != null ? String(projMap[nameKey]) : '';
    const projRaw = row.projectedPoints || row.projected_points || '';
    const proj = projFromMap || projRaw;
    const rawId = row.id || row.ID || '';
    const id = (!rawId || String(rawId).startsWith('gen_'))
      ? (nameToAdpId.get(nameKey) || `gen_${name.replace(/\s+/g, '_')}`)
      : String(rawId);
    const teamFromSource = expandTeam(row.teamName || row.team || row.Team || '');
    return {
      id,
      firstName,
      lastName,
      name,
      adp: isNaN(adpVal) ? 9999 : adpVal,
      originalAdp: isNaN(adpVal) ? '-' : String(adpVal),
      latestAdp: adpLookup.get(nameKey) || null,
      projectedPoints: proj,
      positionRank: row.positionRank || '',
      slotName: row.slotName || row.position || row.Position || row.pos || 'N/A',
      teamName: teamLookup.get(nameKey) || teamFromSource,
      lineupStatus: row.lineupStatus || '',
      byeWeek: row.byeWeek || '',
      _csvTier: row.tier || '',
      _csvTierNum: row.tierNum || '',
    };
  });
  players.sort((a, b) => a.adp - b.adp);
  return players.filter(p => p.adp !== 9999);
}

export function buildTeamLookup(adpRows) {
  const map = new Map();
  adpRows.forEach(r => {
    const n = canonicalName(
      (`${r.firstName || r.first_name || ''} ${r.lastName || r.last_name || ''}`).trim()
      || r.Name || r.name || ''
    );
    const team = r.teamName || r.team || r.Team || '';
    if (n && team) map.set(n, team);
  });
  return map;
}

export function buildNameToAdpId(adpRows) {
  const map = new Map();
  adpRows.forEach(r => {
    const n = canonicalName(
      (`${r.firstName || r.first_name || ''} ${r.lastName || r.last_name || ''}`).trim()
      || r.Name || r.name || ''
    );
    const id = r.id || r.ID;
    if (n && id) map.set(n, String(id));
  });
  return map;
}

export function buildAdpLookup(adpRows) {
  const map = new Map();
  adpRows.forEach(r => {
    const n = canonicalName(
      (`${r.firstName || r.first_name || ''} ${r.lastName || r.last_name || ''}`).trim()
      || r.Name || r.name || ''
    );
    const adp = parseFloat(r.adp ?? r.ADP ?? '');
    if (n && !isNaN(adp)) map.set(n, adp);
  });
  return map;
}
