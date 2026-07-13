// dataLoader.js — mobile port of best-ball-manager/src/utils/dataLoader.js.
// Identical pipeline with one signature change: on mobile every CSV was parsed
// at build time (scripts/build-data.mjs), so inputs arrive as pre-parsed row
// arrays instead of raw CSV text. Keep the processing logic in lockstep with
// the web version.
import { processMasterList, parseAdpString, canonicalName, normalizePosition } from './helpers';

/** Extract a normalized name from a CSV row, handling multiple column conventions. */
function rowName(row) {
  return (
    (`${row.firstName || row.first_name || row['First Name'] || ''} ${row.lastName || row.last_name || row['Last Name'] || ''}`.trim())
    || row.Name || row['Player Name'] || row.player_name || row.Player || ''
  ).trim().replace(/\s+/g, ' ') || null;
}

/**
 * Build an ADP lookup map from parsed CSV rows.
 * Returns { adpMap, teamLookup, projPointsMap } keyed by normalized player name.
 */
function buildLookupsFromRows(rows) {
  const adpMap = {};
  const teamLookup = {};
  const projPointsMap = {};

  rows.forEach(row => {
    const name = rowName(row);
    if (!name) return;
    const key = canonicalName(name);

    const rawTeam = row.teamName || row.team || row.Team || row['Team Abbr'] || row['team_abbr'] || '';
    const teamVal = String(rawTeam).trim().toUpperCase();
    if (teamVal) teamLookup[key] = teamVal;

    const rawAdp = row.adp ?? row.ADP ?? row['ADP'] ?? row['Adp'] ?? row['Round.Pick'] ?? '';
    const parsed = parseAdpString(rawAdp);
    adpMap[key] = parsed ? parsed : { display: String(rawAdp), pick: NaN };

    const rawProj = row.projectedPoints || row.projected_points || row['Projected Points'] || '';
    const projVal = parseFloat(rawProj);
    if (!isNaN(projVal) && projVal > 0) projPointsMap[key] = projVal;
  });

  return { adpMap, teamLookup, projPointsMap };
}

/** Infer draft platform from slate title string. Returns 'eliminator', 'superflex', 'underdog', 'draftkings', or null. */
function detectPlatformFromSlate(slateTitle) {
  const t = (slateTitle || '').toLowerCase();
  // Eliminator first: the UD Eliminator slate title ("UD 2026 Eliminator Season") also
  // contains "ud", which the underdog branch below would otherwise claim.
  if (t.includes('eliminator')) return 'eliminator';
  if (t.includes('superflex')) return 'superflex';
  if (t.includes('draftkings') || t.startsWith('dk ') || t === 'dk') return 'draftkings';
  if (t.includes('ud')) return 'underdog';
  return null;
}

/**
 * processLoadedData({ rosterCsvRows, rosterRows, adpFiles, rankingsRows?, projectionsRows? })
 *
 * Unified processing pipeline for roster data. Pass either rosterCsvRows
 * (pre-parsed CSV rows with original headers, e.g. bundled demo rosters) or
 * rosterRows (pre-mapped array from extension entries) — not both.
 *
 * @param {Array} [rosterCsvRows] - Parsed roster CSV rows (original header keys)
 * @param {Array} [rosterRows] - Pre-mapped roster rows from convertEntriesToRosterRows()
 * @param {Array<{rows: Array, date: string, filename: string, platform: string}>} adpFiles - ADP snapshot files (pre-parsed)
 * @param {Array} [rankingsRows] - Parsed rankings CSV rows
 * @param {Array} [projectionsRows] - Parsed projections CSV rows
 * @returns {{ rosterData, masterPlayers, adpSnapshots, rankingsSource, adpByPlatform }}
 */
export async function processLoadedData({ rosterCsvRows, rosterRows: prebuiltRows, adpFiles = [], rankingsRows, projectionsRows }) {
  // 1) Build roster rows — either from pre-mapped extension entries or from parsed CSV rows
  let mappedRosters;
  if (prebuiltRows) {
    mappedRosters = prebuiltRows;
  } else {
    const parsed = rosterCsvRows || [];
    mappedRosters = parsed.map(row => {
    let name = row['Player Name'] || row.player_name || row.Player;
    if (!name && (row['First Name'] || row.firstName)) {
      name = `${row['First Name'] || row.firstName || ''} ${row['Last Name'] || row.lastName || ''}`;
    }
    const entry = row['Draft Entry'] || row['Entry ID'] || row.entry_id || 'Entry1';
    const pick = parseInt(row['Pick Number'] || row.pick_number || row.Pick || 0);
    const draftSize = parseInt(row['Draft Size'] || 12);
    const round = row['Round'] || (pick > 0 ? Math.ceil(pick / (draftSize || 12)) : '-');

    return {
      name: name ? name.trim().replace(/\s+/g, ' ') : 'Unknown',
      position: normalizePosition(row['Position'] || row.position),
      team: row['Team'] || row.team || 'N/A',
      entry_id: entry,
      pick,
      round,
      pickedAt: row['Picked At'] || null,
      tournamentTitle: row['Tournament Title'] || null,
    };
    }).filter(p => p.name !== 'Unknown');
  }

  // 2) Sort ADP snapshots (already parsed at build time)
  const snapshots = adpFiles.map(({ rows, date, filename, platform }) => (
    { date, fileName: filename, rows, platform: platform || 'unknown' }
  ));
  snapshots.sort((a, b) => a.date.localeCompare(b.date));

  if (snapshots.length === 0) {
    const master = processMasterList(mappedRosters, {}, 12, []);
    // Resolve rankings
    let rankingsSource = [];
    if (rankingsRows?.length) {
      rankingsSource = rankingsRows;
    } else if (projectionsRows?.length) {
      rankingsSource = projectionsRows;
    }
    return { rosterData: mappedRosters, masterPlayers: master, adpSnapshots: [], rankingsSource, adpByPlatform: {} };
  }

  // 3) Build lookups from latest snapshot (most recent across all platforms)
  const latest = snapshots[snapshots.length - 1];
  const { adpMap: localAdpMap, teamLookup, projPointsMap } = latest?.rows
    ? buildLookupsFromRows(latest.rows)
    : { adpMap: {}, teamLookup: {}, projPointsMap: {} };

  // Merge projected points from all other snapshots — some platforms (e.g. DK) omit projections
  for (const snap of snapshots) {
    if (snap === latest) continue;
    snap.rows.forEach(row => {
      const name = rowName(row);
      if (!name) return;
      const key = canonicalName(name);
      if (projPointsMap[key] != null) return;
      const rawProj = row.projectedPoints || row.projected_points || row['Projected Points'] || '';
      const projVal = parseFloat(rawProj);
      if (!isNaN(projVal) && projVal > 0) projPointsMap[key] = projVal;
    });
  }

  if (latest && latest.rows) {
    // Backfill missing projections using nearest same-position ADP neighbor
    const posProjections = {};
    latest.rows.forEach(row => {
      const name = rowName(row);
      if (!name) return;
      const key = canonicalName(name);
      const pos = (row.position || row.Position || row.pos || row.slotName || 'N/A').toUpperCase();
      const adp = localAdpMap[key]?.pick;
      const proj = projPointsMap[key];
      if (proj != null && Number.isFinite(adp)) {
        (posProjections[pos] ??= []).push({ adp, proj });
      }
    });
    Object.values(posProjections).forEach(arr => arr.sort((a, b) => a.adp - b.adp));

    latest.rows.forEach(row => {
      const name = rowName(row);
      if (!name) return;
      const key = canonicalName(name);
      if (projPointsMap[key] != null) return;
      const pos = (row.position || row.Position || row.pos || row.slotName || 'N/A').toUpperCase();
      const adp = localAdpMap[key]?.pick;
      const group = posProjections[pos];
      if (!group?.length || !Number.isFinite(adp)) return;
      let lo = 0, hi = group.length - 1, best = group[0];
      while (lo <= hi) {
        const mid = (lo + hi) >> 1;
        if (Math.abs(group[mid].adp - adp) < Math.abs(best.adp - adp)) best = group[mid];
        if (group[mid].adp < adp) lo = mid + 1; else hi = mid - 1;
      }
      projPointsMap[key] = best.proj;
    });

    // Backfill projections for roster players not in ADP snapshot (rookies/FAs)
    mappedRosters.forEach(player => {
      const key = canonicalName(player.name);
      if (projPointsMap[key] != null) return;
      const pos = (player.position || 'N/A').toUpperCase();
      const adpProxy = player.pick || NaN;
      const group = posProjections[pos];
      if (!group?.length || !Number.isFinite(adpProxy)) return;
      let lo = 0, hi = group.length - 1, best = group[0];
      while (lo <= hi) {
        const mid = (lo + hi) >> 1;
        if (Math.abs(group[mid].adp - adpProxy) < Math.abs(best.adp - adpProxy)) best = group[mid];
        if (group[mid].adp < adpProxy) lo = mid + 1; else hi = mid - 1;
      }
      projPointsMap[key] = best.proj;
    });
  }

  // Merge projections rows into projPointsMap — authoritative source shared across all platforms
  if (projectionsRows?.length) {
    projectionsRows.forEach(row => {
      const name = rowName(row);
      if (!name) return;
      const key = canonicalName(name);
      const rawProj = row.projectedPoints || row.projected_points || '';
      const projVal = parseFloat(rawProj);
      if (!isNaN(projVal) && projVal > 0) projPointsMap[key] = projVal;
    });
  }

  // 3b) Build per-platform ADP grouping
  const adpByPlatform = {};
  for (const snap of snapshots) {
    const p = snap.platform || 'unknown';
    if (!adpByPlatform[p]) adpByPlatform[p] = { snapshots: [], latestAdpMap: {}, latestRows: [] };
    adpByPlatform[p].snapshots.push(snap);
  }
  for (const data of Object.values(adpByPlatform)) {
    const platLatest = data.snapshots[data.snapshots.length - 1];
    data.latestRows = platLatest.rows;
    data.latestAdpMap = buildLookupsFromRows(platLatest.rows).adpMap;
    data.projPointsMap = projPointsMap;
  }

  // 4) Build universe of all ADP players
  const universePlayers = [];
  if (latest && latest.rows) {
    latest.rows.forEach(row => {
      const name = rowName(row);
      if (!name) return;
      universePlayers.push({
        name,
        position: row.position || row.Position || row.pos || 'N/A',
        team: teamLookup[canonicalName(name)] || 'N/A'
      });
    });
  }

  // Enrich rosters with ADP data
  const enrichedRosters = mappedRosters.map(player => {
    const key = canonicalName(player.name);
    const latestTeam = teamLookup[key];
    const detectedPlatform = detectPlatformFromSlate(player.slateTitle);
    const platformAdpMap = detectedPlatform ? adpByPlatform[detectedPlatform]?.latestAdpMap : null;
    const adpData = (platformAdpMap && platformAdpMap[key]) || localAdpMap[key];
    return {
      ...player,
      team: latestTeam || player.team || 'N/A',
      latestADP: adpData ? adpData.pick : null,
      latestADPDisplay: adpData ? adpData.display : 'N/A',
      adpDiff: adpData && player.pick ? (adpData.pick - player.pick).toFixed(2) : null,
      projectedPoints: projPointsMap[key] || null,
      adpPlatform: detectedPlatform || 'global',
    };
  });

  // 6) Build master list
  const master = processMasterList(enrichedRosters, localAdpMap, 12, snapshots, universePlayers);

  // 7) Resolve rankings source (rankings > latest ADP > projections)
  let rankingsSource = [];
  if (rankingsRows?.length) {
    rankingsSource = rankingsRows;
  } else if (latest) {
    rankingsSource = latest.rows;
  } else if (projectionsRows?.length) {
    rankingsSource = projectionsRows;
  }

  return { rosterData: enrichedRosters, masterPlayers: master, adpSnapshots: snapshots, rankingsSource, adpByPlatform };
}
