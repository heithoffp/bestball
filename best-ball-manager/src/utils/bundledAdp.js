// bundledAdp.js — runtime decoder for the build-time compacted ADP artifact
// (scripts/build-data.mjs; TASK-365). Replaces the import.meta.glob of ~134
// raw ADP CSVs + per-load PapaParse (~13 MB, ~1.7s) with one ~2 MB JSON that
// decodes in tens of milliseconds. Same artifact format and decode logic as
// mobile-app/shared/bundledData.js (ADR-031).
//
// Historical snapshots carry only [nameIdx, adp]; each platform's latest
// snapshot carries full rows [nameIdx, position, team, adp, proj, posRank,
// bye, lineupStatus] — matching what the pipeline actually reads from each.
/**
 * Decode the compacted ADP payload ({ names, snapshots }) into the pipeline's
 * [{date, filename, platform, rows}] shape (rows pre-parsed — dataLoader
 * skips PapaParse when rows are present).
 */
export function decodeAdp(bundle) {
  const { names, snapshots } = bundle;
  return snapshots.map(snap => ({
    date: snap.date,
    filename: snap.filename,
    platform: snap.platform,
    rows: snap.rows.map(t => {
      if (!snap.full) {
        return { Name: names[t[0]], adp: t[1] == null ? '' : t[1] };
      }
      const [nameIdx, position, team, adp, proj, posRank, bye, lineupStatus] = t;
      return {
        Name: names[nameIdx],
        position,
        slotName: position,
        teamName: team,
        adp: adp == null ? '' : adp,
        projectedPoints: proj == null ? '' : proj,
        positionRank: posRank,
        byeWeek: bye,
        lineupStatus,
      };
    }),
  }));
}

let _adpFiles = null;

/**
 * Decoded bundled ADP snapshots, memoized — loadData can run more than once.
 * The artifact is dynamically imported so it ships as its own lazy chunk
 * instead of bloating the entry bundle.
 */
export async function loadBundledAdp() {
  if (!_adpFiles) {
    const { default: adpBundle } = await import('../data/adpSnapshots.json');
    _adpFiles = decodeAdp(adpBundle);
  }
  return _adpFiles;
}
