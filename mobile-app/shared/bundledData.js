// bundledData.js — runtime decoder for the build-time compacted assets
// (scripts/build-data.mjs). Reconstructs the row-object shapes the data
// pipeline expects, mirroring loadBundledAdp() in the web App.jsx.
//
// Historical snapshots carry only [nameIdx, adp]; each platform's latest
// snapshot carries full rows [nameIdx, position, team, adp, proj, posRank,
// bye, lineupStatus] — matching what the pipeline actually reads from each.

import adpBundle from './data/adpSnapshots.json';
import projectionsRows from './data/projections.json';
import rankingsRows from './data/rankings.json';
import demoRosterRows from './data/demoRosters.json';
import actualsBundle from './data/actuals.json';

let _adpFiles = null;

/** Decode bundled ADP snapshots → [{date, filename, platform, rows}] (cached). */
export function loadBundledAdp() {
  if (_adpFiles) return _adpFiles;
  const { names, snapshots } = adpBundle;
  _adpFiles = snapshots.map(snap => ({
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
  return _adpFiles;
}

export function getProjectionsRows() {
  return projectionsRows;
}

export function getRankingsRows() {
  return rankingsRows;
}

export function getDemoRosterRows() {
  return demoRosterRows;
}

/** Bundled weekly actuals files: [{filename, rows}] — empty until the season starts. */
export function getActualsFiles() {
  return actualsBundle;
}
