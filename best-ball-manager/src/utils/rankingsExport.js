import Papa from 'papaparse';
import { supabase } from './supabaseClient';

const TIER_LABELS = [
  'S', 'A+', 'A', 'A-', 'B+', 'B', 'B-', 'C+', 'C', 'C-', 'D+', 'D', 'D-', 'F',
];

function getTierLabel(tierNum) {
  if (tierNum < 1) return TIER_LABELS[0];
  if (tierNum > TIER_LABELS.length) return TIER_LABELS[TIER_LABELS.length - 1];
  return TIER_LABELS[tierNum - 1];
}

const CSV_COLUMNS = ['id', 'firstName', 'lastName', 'adp', 'projectedPoints',
  'positionRank', 'slotName', 'teamName', 'lineupStatus', 'byeWeek', 'tier', 'tierNum'];

function buildRankingsCSV(rankedPlayers, tierMap, tierLabels = {}) {
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

  return Papa.unparse(rows, { columns: CSV_COLUMNS });
}

export function exportRankingsCSV(rankedPlayers, tierMap, tierLabels = {}) {
  const csv = buildRankingsCSV(rankedPlayers, tierMap, tierLabels);
  const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = 'rankings.csv';
  a.click();
  URL.revokeObjectURL(url);
}

export async function saveRankingsToAssets(rankedPlayers, tierMap, tierLabels = {}) {
  const csv = buildRankingsCSV(rankedPlayers, tierMap, tierLabels);

  // Persist to Supabase storage + IndexedDB so rankings restore on next load
  if (supabase) {
    const { data: { user } } = await supabase.auth.getUser();
    if (user) {
      const { syncSaveFile } = await import('./storage');
      await syncSaveFile({ id: 'rankings', type: 'rankings', filename: 'rankings.csv', text: csv, userId: user.id });

      // Also save to user_rankings table so the Chrome extension can read tier breaks
      try {
        const rankings = rankedPlayers.map((p, idx) => ({
          name: p.name.trim().toLowerCase(),
          rank: idx + 1,
          tierNum: tierMap ? (tierMap.get(p.id) || 1) : 1,
        }));
        await supabase.from('user_rankings').upsert(
          { user_id: user.id, rankings, updated_at: new Date().toISOString() },
          { onConflict: 'user_id' }
        );
      } catch {
        // Non-fatal — storage save already succeeded
      }
    }
  }

  // Dev-only: also write to local asset file via Vite dev server (non-fatal in production)
  try {
    const res = await fetch('/__save-rankings', {
      method: 'POST',
      headers: { 'Content-Type': 'text/plain' },
      body: csv,
    });
    if (!res.ok) throw new Error('Dev server save failed');
  } catch {
    // Expected in production — endpoint only exists in Vite dev server
  }
}
