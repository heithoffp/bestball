import { parseCSVText } from './csv';
import { processMasterList, parseAdpString, canonicalName } from './helpers';

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
    const teamVal = rawTeam.trim().toUpperCase();
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

/** Infer draft platform from slate title string. Returns 'underdog', 'draftkings', or null. */
function detectPlatformFromSlate(slateTitle) {
  const t = (slateTitle || '').toLowerCase();
  if (t.includes('ud')) return 'underdog';
  if (t.includes('draftkings')) return 'draftkings';
  return null;
}

/**
 * processLoadedData({ rosterText, rosterRows, adpFiles, rankingsText?, projectionsText? })
 *
 * Unified processing pipeline for roster data. Pass either rosterText (CSV string)
 * or rosterRows (pre-mapped array from extension entries) — not both.
 *
 * @param {string} [rosterText] - Raw CSV text for rosters
 * @param {Array} [rosterRows] - Pre-mapped roster rows from convertEntriesToRosterRows()
 * @param {Array<{text: string, date: string, filename: string}>} adpFiles - ADP snapshot files
 * @param {string} [rankingsText] - Raw CSV text for rankings
 * @param {string} [projectionsText] - Raw CSV text for projections
 * @returns {{ rosterData, masterPlayers, adpSnapshots, rankingsSource, adpByPlatform }}
 */
export async function processLoadedData({ rosterText, rosterRows: prebuiltRows, adpFiles = [], rankingsText, projectionsText }) {
  // 1) Build roster rows — either from pre-mapped extension entries or by parsing CSV text
  let mappedRosters;
  if (prebuiltRows) {
    mappedRosters = prebuiltRows;
  } else {
    const parsed = rosterText ? await parseCSVText(String(rosterText)) : [];
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
      position: row['Position'] || row.position || 'N/A',
      team: row['Team'] || row.team || 'N/A',
      entry_id: entry,
      pick,
      round,
      pickedAt: row['Picked At'] || null,
      tournamentTitle: row['Tournament Title'] || null,
    };
    }).filter(p => p.name !== 'Unknown');
  }

  // 2) Parse ADP snapshots
  const snapshots = await Promise.all(adpFiles.map(async ({ text, date, filename, platform }) => {
    const rows = await parseCSVText(String(text));
    return { date, fileName: filename, rows, rawText: text, platform: platform || 'unknown' };
  }));
  snapshots.sort((a, b) => a.date.localeCompare(b.date));

  if (snapshots.length === 0) {
    const master = processMasterList(mappedRosters, {}, 12, []);
    // Resolve rankings
    let rankingsSource = [];
    if (rankingsText) {
      rankingsSource = await parseCSVText(String(rankingsText));
    } else if (projectionsText) {
      rankingsSource = await parseCSVText(String(projectionsText));
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

  // Merge projections.csv into projPointsMap — authoritative source shared across all platforms
  if (projectionsText) {
    const projRows = await parseCSVText(String(projectionsText));
    projRows.forEach(row => {
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
  if (rankingsText) {
    rankingsSource = await parseCSVText(String(rankingsText));
  } else if (latest) {
    rankingsSource = latest.rows;
  } else if (projectionsText) {
    rankingsSource = await parseCSVText(String(projectionsText));
  }

  return { rosterData: enrichedRosters, masterPlayers: master, adpSnapshots: snapshots, rankingsSource, adpByPlatform };
}
