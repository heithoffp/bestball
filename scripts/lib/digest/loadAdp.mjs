// scripts/lib/digest/loadAdp.mjs
//
// Reads the bundled ADP snapshot CSVs from best-ball-manager/src/assets/adp/
// and shapes them for processMasterList() + league-wide mover detection.
//
// Two platforms, two schemas (both handled by processMasterList's snapshot parser):
//   underdog_adp_YYYY-MM-DD.csv  -> firstName,lastName,adp,slotName,teamName,...
//   draftking_adp_YYYY-MM-DD.csv -> Name,Position,ADP,Team,...
//
// This module is I/O (reads disk + parses CSV). The pure digest logic lives in
// assemble.mjs and consumes the structures returned here.

import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import Papa from 'papaparse';
import { canonicalName, parseAdpString } from '../../../best-ball-manager/src/utils/helpers.js';

// Filename prefix -> canonical platform key used everywhere downstream.
const PLATFORM_PREFIX = { underdog: 'underdog', draftking: 'draftkings' };
// Accept dash- or underscore-separated dates; the date is normalized to dashes
// below so a malformed filename (e.g. _2026_06_25) is still loaded, not silently
// skipped (TASK-278).
const FILE_RE = /^(underdog|draftking)_adp_(\d{4}[-_]\d{2}[-_]\d{2})\.csv$/;

// League-mover noise floor: ignore tiny absolute moves at the very top of the
// board (e.g. 1.0 -> 1.2) that would otherwise dominate a percentage metric.
const MOVER_FLOOR_PICKS = 2;

/** Extract a display name from either platform's row shape. */
function rowName(row) {
  const fl = `${row.firstName || row.first_name || ''} ${row.lastName || row.last_name || ''}`.trim();
  const name = fl || row.Name || row['Player Name'] || row.player_name || row.Player || '';
  return String(name).trim().replace(/\s+/g, ' ');
}

/** Pick number from either platform's row shape (null if unparseable). */
function rowPick(row) {
  const raw = row.adp ?? row.ADP ?? row['ADP'] ?? row.Adp ?? '';
  return parseAdpString(raw).pick;
}

/**
 * Load and parse every dated ADP CSV under adpDir.
 * @returns {{ underdog: PlatformAdp, draftkings: PlatformAdp }}
 *   where PlatformAdp = { snapshots, adpMap, movers }
 *   - snapshots: [{ date, platform, rows }]  (ascending by date)
 *   - adpMap:    { canonicalName -> { pick, display } } from the latest snapshot
 *   - movers:    { risers: Mover[], fallers: Mover[] } from the two latest snapshots
 *     Mover = { name, fromPick, toPick, pct, direction }
 */
export function loadAdpData(adpDir) {
  const byPlatform = { underdog: [], draftkings: [] };

  for (const file of readdirSync(adpDir)) {
    const m = FILE_RE.exec(file);
    if (!m) continue; // skips superflex_adp.csv and anything undated
    const platform = PLATFORM_PREFIX[m[1]];
    const date = m[2].replace(/_/g, '-');
    const text = readFileSync(join(adpDir, file), 'utf8');
    const { data } = Papa.parse(text, { header: true, skipEmptyLines: true });
    byPlatform[platform].push({ date, platform, rows: data });
  }

  const result = {};
  for (const [platform, snaps] of Object.entries(byPlatform)) {
    snaps.sort((a, b) => a.date.localeCompare(b.date));
    result[platform] = {
      snapshots: snaps,
      adpMap: buildAdpMap(snaps[snaps.length - 1]),
      movers: computeLeagueMovers(snaps),
    };
  }
  return result;
}

function buildAdpMap(latest) {
  const map = {};
  if (!latest) return map;
  for (const row of latest.rows) {
    const name = rowName(row);
    if (!name) continue;
    const parsed = parseAdpString(row.adp ?? row.ADP ?? row.Adp ?? '');
    if (parsed.pick === null) continue;
    map[canonicalName(name)] = { pick: parsed.pick, display: parsed.display };
  }
  return map;
}

/**
 * League-wide risers/fallers from the two most recent snapshots, ranked by
 * position-normalized significance: |prev - curr| / prev. A 5-pick move at
 * pick 30 (16.7%) outranks a 5-pick move at pick 180 (2.8%).
 */
export function computeLeagueMovers(snaps, topN = 6) {
  if (!snaps || snaps.length < 2) return { risers: [], fallers: [] };
  const prev = snapToPickMap(snaps[snaps.length - 2]);
  const curr = snapToPickMap(snaps[snaps.length - 1]);

  const moves = [];
  for (const [key, toPick] of curr) {
    const fromPick = prev.get(key);
    if (fromPick == null || toPick == null) continue;
    const absMove = Math.abs(fromPick - toPick);
    if (absMove < MOVER_FLOOR_PICKS) continue;
    const pct = absMove / fromPick;
    moves.push({
      name: nameOf(snaps[snaps.length - 1], key),
      fromPick,
      toPick,
      pct,
      direction: toPick < fromPick ? 'riser' : 'faller', // lower pick = rising
    });
  }

  moves.sort((a, b) => b.pct - a.pct);
  return {
    risers: moves.filter((m) => m.direction === 'riser').slice(0, topN),
    fallers: moves.filter((m) => m.direction === 'faller').slice(0, topN),
  };
}

function snapToPickMap(snap) {
  const map = new Map();
  for (const row of snap.rows) {
    const name = rowName(row);
    if (!name) continue;
    const pick = rowPick(row);
    if (pick === null) continue;
    map.set(canonicalName(name), pick);
  }
  return map;
}

// Recover a display name for a canonical key from a snapshot (best-effort).
function nameOf(snap, key) {
  for (const row of snap.rows) {
    const name = rowName(row);
    if (name && canonicalName(name) === key) return name;
  }
  return key;
}
