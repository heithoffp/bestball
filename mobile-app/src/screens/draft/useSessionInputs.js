// useSessionInputs — builds everything a Live Draft Session needs from the
// portfolio context: the Underdog player pool for the OCR matcher, the user
// rankings map, and the exposure / roster-index maps behind the glance columns
// (TASK-337). Extracted from LiveSessionPanel so the setup screen owns session
// start (TASK-339) while the panel stays a pure status layer.
import { useMemo } from 'react';
import { canonicalName } from '../../../shared/utils/helpers';
import { usePortfolio } from '../../contexts/PortfolioContext';

// Underdog ADP CSV rows -> matcher pool rows (same field fallbacks as
// shared/utils/dataLoader rowName/buildLookupsFromRows).
function poolRowsFromAdpRows(rows) {
  const out = [];
  for (const row of rows || []) {
    const name = (
      `${row.firstName || row.first_name || row['First Name'] || ''} ${row.lastName || row.last_name || row['Last Name'] || ''}`.trim()
      || row.Name || row['Player Name'] || row.player_name || row.Player || ''
    ).trim().replace(/\s+/g, ' ');
    if (!name) continue;
    const adp = parseFloat(row.adp ?? row.ADP ?? row.Adp ?? '');
    out.push({
      name,
      position: row.position || row.Position || row.pos || 'N/A',
      team: (row.teamName || row.team || row.Team || 'N/A').toString().toUpperCase().slice(0, 3),
      adp: Number.isFinite(adp) ? adp : null,
    });
  }
  return out;
}

export default function useSessionInputs() {
  const { masterPlayers, adpByPlatform, rankingsByPlatform, rosterData } = usePortfolio();

  const poolRows = useMemo(() => {
    const udRows = poolRowsFromAdpRows(adpByPlatform?.underdog?.latestRows);
    if (udRows.length >= 100) return udRows;
    return (masterPlayers || [])
      .filter(p => p?.name)
      .map(p => ({ name: p.name, position: p.position, team: p.team, adp: p.adpPick }));
  }, [adpByPlatform, masterPlayers]);

  const rankMap = useMemo(() => {
    const map = new Map();
    (rankingsByPlatform?.underdog || []).forEach((row, i) => {
      const name = row.Name || row.name || row.Player || row.player || row['Player Name'] || '';
      if (!name) return;
      const rank = parseInt(row.Rank ?? row.rank ?? '', 10);
      map.set(canonicalName(name), Number.isFinite(rank) ? rank : i + 1);
    });
    return map;
  }, [rankingsByPlatform]);

  // One pass over the portfolio yields both glance inputs: exposure % and the
  // per-player roster index the correlation column reads (TASK-337).
  const { exposureMap, rosterIndexMap } = useMemo(() => {
    const rosters = new Set();
    const index = new Map();
    (rosterData || []).forEach(p => {
      const id = p.entry_id || p.entryId;
      if (!id || !p.name) return;
      rosters.add(id);
      const key = canonicalName(p.name);
      if (!index.has(key)) index.set(key, new Set());
      index.get(key).add(id);
    });
    const exposure = new Map();
    if (rosters.size > 0) {
      index.forEach((set, key) => exposure.set(key, (set.size / rosters.size) * 100));
    }
    return { exposureMap: exposure, rosterIndexMap: index };
  }, [rosterData]);

  return { poolRows, rankMap, exposureMap, rosterIndexMap };
}
