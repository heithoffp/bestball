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
import { readAdpCache, refreshAdp } from './adpArtifact';

let _adpFiles = null;

/**
 * Decode a compacted ADP payload ({ names, snapshots }) into the pipeline's
 * [{date, filename, platform, rows}] shape. Pure — used for both the bundled
 * copy and a fetched remote artifact (they share the byte-identical shape).
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

/**
 * Decode ADP snapshots for the pipeline, cache-first (ADR-031). Returns the
 * cached remote copy when present, else the bundled copy shipped in the binary.
 * Memoized; refreshAdpFiles() updates the memo when a newer remote arrives.
 */
export async function loadAdp() {
  if (_adpFiles) return _adpFiles;
  const cached = await readAdpCache();
  _adpFiles = decodeAdp(cached || adpBundle);
  return _adpFiles;
}

/**
 * Background refresh (stale-while-revalidate). Fetches the remote artifact; on a
 * newer, valid payload it updates the memo and returns the freshly decoded files
 * so the caller can re-process. Returns null when unchanged or the fetch failed
 * — nothing already on screen is disturbed.
 */
export async function refreshAdpFiles() {
  const payload = await refreshAdp();
  if (!payload) return null;
  _adpFiles = decodeAdp(payload);
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
