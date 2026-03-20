import { parseCSVText } from './csv';
import { processMasterList, parseAdpString } from './helpers';

/**
 * processLoadedData({ rosterText, adpFiles, rankingsText?, projectionsText? })
 *
 * Unified processing pipeline for both bundled-asset and IndexedDB loading paths.
 *
 * @param {string} rosterText - Raw CSV text for rosters
 * @param {Array<{text: string, date: string, filename: string}>} adpFiles - ADP snapshot files
 * @param {string} [rankingsText] - Raw CSV text for rankings
 * @param {string} [projectionsText] - Raw CSV text for projections
 * @returns {{ rosterData, masterPlayers, adpSnapshots, rankingsSource }}
 */
export async function processLoadedData({ rosterText, adpFiles = [], rankingsText, projectionsText }) {
  // 1) Parse roster (may be undefined when no roster CSV exists)
  const rosterRows = rosterText ? await parseCSVText(String(rosterText)) : [];
  const mappedRosters = rosterRows.map(row => {
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

  // 2) Parse ADP snapshots
  const snapshots = await Promise.all(adpFiles.map(async ({ text, date, filename }) => {
    const rows = await parseCSVText(String(text));
    return { date, fileName: filename, rows, rawText: text };
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
    return { rosterData: mappedRosters, masterPlayers: master, adpSnapshots: [], rankingsSource };
  }

  // 3) Build lookups from latest snapshot
  const latest = snapshots[snapshots.length - 1];
  const localAdpMap = {};
  const teamLookup = {};
  const projPointsMap = {};

  if (latest && latest.rows) {
    latest.rows.forEach(row => {
      const name = (`${row.firstName || row.first_name || row['First Name'] || ''} ${row.lastName || row.last_name || row['Last Name'] || ''}`.trim()
        || row['Player Name'] || row.player_name || row.Player);
      if (!name) return;
      const normalizedName = name.trim().replace(/\s+/g, ' ');

      const rawTeam = row.team || row.Team || row['Team Abbr'] || row['team_abbr'] || '';
      const teamVal = rawTeam.trim().toUpperCase();
      if (teamVal) {
        teamLookup[normalizedName] = teamVal;
      }

      const rawAdp = row.adp ?? row.ADP ?? row['ADP'] ?? row['Adp'] ?? row['Round.Pick'] ?? '';
      const parsed = parseAdpString(rawAdp, 12);
      localAdpMap[normalizedName] = parsed ? parsed : { display: String(rawAdp), pick: NaN };

      const rawProj = row.projectedPoints || row.projected_points || row['Projected Points'] || '';
      const projVal = parseFloat(rawProj);
      if (!isNaN(projVal) && projVal > 0) {
        projPointsMap[normalizedName] = projVal;
      }
    });

    // Backfill missing projections using nearest same-position ADP neighbor
    const posProjections = {};
    latest.rows.forEach(row => {
      const name = (`${row.firstName || row.first_name || row['First Name'] || ''} ${row.lastName || row.last_name || row['Last Name'] || ''}`.trim()
        || row['Player Name'] || row.player_name || row.Player);
      if (!name) return;
      const normalizedName = name.trim().replace(/\s+/g, ' ');
      const pos = (row.position || row.Position || row.pos || row.slotName || 'N/A').toUpperCase();
      const adp = localAdpMap[normalizedName]?.pick;
      const proj = projPointsMap[normalizedName];
      if (proj != null && Number.isFinite(adp)) {
        (posProjections[pos] ??= []).push({ adp, proj });
      }
    });
    Object.values(posProjections).forEach(arr => arr.sort((a, b) => a.adp - b.adp));

    latest.rows.forEach(row => {
      const name = (`${row.firstName || row.first_name || row['First Name'] || ''} ${row.lastName || row.last_name || row['Last Name'] || ''}`.trim()
        || row['Player Name'] || row.player_name || row.Player);
      if (!name) return;
      const normalizedName = name.trim().replace(/\s+/g, ' ');
      if (projPointsMap[normalizedName] != null) return;
      const pos = (row.position || row.Position || row.pos || row.slotName || 'N/A').toUpperCase();
      const adp = localAdpMap[normalizedName]?.pick;
      const group = posProjections[pos];
      if (!group?.length || !Number.isFinite(adp)) return;
      let lo = 0, hi = group.length - 1, best = group[0];
      while (lo <= hi) {
        const mid = (lo + hi) >> 1;
        if (Math.abs(group[mid].adp - adp) < Math.abs(best.adp - adp)) best = group[mid];
        if (group[mid].adp < adp) lo = mid + 1; else hi = mid - 1;
      }
      projPointsMap[normalizedName] = best.proj;
    });

    // Backfill projections for roster players not in ADP snapshot (rookies/FAs)
    mappedRosters.forEach(player => {
      if (projPointsMap[player.name] != null) return;
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
      projPointsMap[player.name] = best.proj;
    });
  }

  // 4) Build universe of all ADP players
  const universePlayers = [];
  if (latest && latest.rows) {
    latest.rows.forEach(row => {
      const name = (`${row.firstName || row.first_name || row['First Name'] || ''} ${row.lastName || row.last_name || row['Last Name'] || ''}`.trim()
        || row['Player Name'] || row.player_name || row.Player);
      if (!name) return;
      const normalizedName = name.trim().replace(/\s+/g, ' ');
      universePlayers.push({
        name: normalizedName,
        position: row.position || row.Position || row.pos || 'N/A',
        team: teamLookup[normalizedName] || 'N/A'
      });
    });
  }

  // Enrich rosters with ADP data
  const enrichedRosters = mappedRosters.map(player => {
    const latestTeam = teamLookup[player.name];
    const adpData = localAdpMap[player.name];
    return {
      ...player,
      team: latestTeam || player.team || 'N/A',
      latestADP: adpData ? adpData.pick : null,
      latestADPDisplay: adpData ? adpData.display : 'N/A',
      adpDiff: adpData && player.pick ? (adpData.pick - player.pick).toFixed(2) : null,
      projectedPoints: projPointsMap[player.name] || null,
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

  return { rosterData: enrichedRosters, masterPlayers: master, adpSnapshots: snapshots, rankingsSource };
}
