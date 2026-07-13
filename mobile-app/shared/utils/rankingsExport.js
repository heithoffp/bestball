// rankingsExport.js — mobile port of the web rankingsExport. buildRankingsCSV
// and the Supabase persistence are identical; the browser download becomes an
// iOS share sheet, and the Vite dev-server asset write is dropped.
import Papa from 'papaparse';
import { File, Paths } from 'expo-file-system';
import * as Sharing from 'expo-sharing';
import { supabase } from './supabaseClient';

const TIER_LABELS = [
  'S', 'A+', 'A', 'A-', 'B+', 'B', 'B-', 'C+', 'C', 'C-', 'D+', 'D', 'D-', 'F',
];

function getTierLabel(tierNum) {
  if (tierNum < 1) return TIER_LABELS[0];
  if (tierNum > TIER_LABELS.length) return TIER_LABELS[TIER_LABELS.length - 1];
  return TIER_LABELS[tierNum - 1];
}

const CSV_COLUMNS_DEFAULT = ['id', 'firstName', 'lastName', 'adp', 'projectedPoints',
  'positionRank', 'slotName', 'teamName', 'lineupStatus', 'byeWeek', 'tier', 'tierNum'];

const CSV_COLUMNS_DK = ['ID', 'Name', 'Position', 'ADP', 'Team', 'tier', 'tierNum'];

export function buildRankingsCSV(rankedPlayers, tierMap, tierLabels = {}, platform = 'underdog') {
  const isDK = platform === 'draftkings';
  const positionCounters = {};

  const breakPlayerIds = new Set();
  let prevTierNum = null;
  rankedPlayers.forEach((p, idx) => {
    const tierNum = tierMap ? (tierMap.get(p.id) || 1) : 1;
    if (idx > 0 && tierNum !== prevTierNum) {
      breakPlayerIds.add(p.id);
    }
    prevTierNum = tierNum;
  });

  const rows = rankedPlayers.map((p, idx) => {
    const pos = p.slotName || 'N/A';
    positionCounters[pos] = (positionCounters[pos] || 0) + 1;
    const tierNum = tierMap ? (tierMap.get(p.id) || 1) : 1;

    let displayLabel;
    if (idx === 0 && tierLabels['__tier1__']) {
      displayLabel = tierLabels['__tier1__'];
    } else if (breakPlayerIds.has(p.id) && tierLabels[p.id]) {
      displayLabel = tierLabels[p.id];
    } else {
      displayLabel = getTierLabel(tierNum);
    }

    if (isDK) {
      return {
        ID: p.id || '',
        Name: p.name || '',
        Position: pos,
        ADP: String(idx + 1),
        Team: p.teamName || '',
        tier: displayLabel,
        tierNum: String(tierNum),
      };
    }
    return {
      id: p.id || '',
      firstName: p.firstName || '',
      lastName: p.lastName || '',
      adp: String(idx + 1),
      projectedPoints: p.projectedPoints || '',
      positionRank: `${pos}${positionCounters[pos]}`,
      slotName: pos,
      teamName: p.teamName || '',
      lineupStatus: p.lineupStatus || '',
      byeWeek: p.byeWeek || '',
      tier: displayLabel,
      tierNum: String(tierNum),
    };
  });

  return Papa.unparse(rows, { columns: isDK ? CSV_COLUMNS_DK : CSV_COLUMNS_DEFAULT });
}

/** Share the rankings CSV via the iOS share sheet (replaces the web download). */
export async function exportRankingsCSV(rankedPlayers, tierMap, tierLabels = {}, platform = 'underdog') {
  const csv = buildRankingsCSV(rankedPlayers, tierMap, tierLabels, platform);
  const file = new File(Paths.cache, `rankings_${platform}.csv`);
  try { file.delete(); } catch { /* didn't exist */ }
  file.create();
  file.write(csv);
  if (await Sharing.isAvailableAsync()) {
    await Sharing.shareAsync(file.uri, { mimeType: 'text/csv' });
  }
}

/**
 * Persist rankings: Supabase storage + AsyncStorage (syncSaveFile) plus the
 * user_rankings table the Chrome extension reads for tier breaks. Identical
 * server writes to the web's saveRankingsToAssets (minus the dev-only asset
 * endpoint).
 */
export async function saveRankings(rankedPlayers, tierMap, tierLabels = {}, platform = 'underdog') {
  const csv = buildRankingsCSV(rankedPlayers, tierMap, tierLabels, platform);
  const storageId = `rankings_${platform}`;

  if (supabase) {
    const { data: { user } } = await supabase.auth.getUser();
    if (user) {
      const { syncSaveFile } = await import('./storage');
      await syncSaveFile({ id: storageId, type: 'rankings', filename: `${storageId}.csv`, text: csv, userId: user.id });

      try {
        const rankings = rankedPlayers.map((p, idx) => ({
          name: p.name.trim().toLowerCase(),
          rank: idx + 1,
          tierNum: tierMap ? (tierMap.get(p.id) || 1) : 1,
        }));
        await supabase.from('user_rankings').upsert(
          { user_id: user.id, platform, rankings, updated_at: new Date().toISOString() },
          { onConflict: 'user_id,platform' }
        );
      } catch {
        // Non-fatal — storage save already succeeded
      }
    }
  }
  return csv;
}
