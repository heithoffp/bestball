// src/utils/helpers.js
import { NFL_TEAMS } from './nflTeams.js';
import { applyAlias } from './playerAliases.js';

/**
 * Expand a team abbreviation to its full name.
 * Returns the full name if known, otherwise returns the value as-is.
 * Used to normalize team names across platforms (DK uses abbrevs, UD uses full names).
 */
export function expandTeam(raw = '') {
  const s = String(raw).trim();
  if (!s || s.toUpperCase() === 'FA') return '';
  return NFL_TEAMS[s.toUpperCase()] || s;
}

/**
 * Canonical player name key for cross-platform matching.
 * Strips generational suffixes (Jr., Sr., II–V), removes periods from
 * initials (D.J. → DJ), normalizes whitespace, and lowercases. Finally
 * reconciles known cross-platform renames via the alias map (ADR-012).
 * Use for map keys and comparisons — NOT for display.
 */
const SUFFIX_RE = /\s+(jr\.?|sr\.?|ii|iii|iv|v)\s*$/i;

// Memoized: player names repeat across every ADP snapshot (~200k calls per
// data load) and the regex pipeline below is hot enough to dominate load time
// without it (TASK-365). Pure input→output, so the cache is safe; it is
// bounded by the number of unique name strings seen (a few thousand).
const canonicalCache = new Map();

export function canonicalName(name = '') {
  const raw = String(name);
  const cached = canonicalCache.get(raw);
  if (cached !== undefined) return cached;
  const canonical = raw
    .trim()
    .replace(/^"|"$/g, '')
    .replace(SUFFIX_RE, '')
    .replace(/\./g, '')
    .replace(/\s+/g, ' ')
    .trim()
    .toLowerCase();
  const result = applyAlias(canonical);
  canonicalCache.set(raw, result);
  return result;
}

/**
 * Normalize a player position across platforms.
 * Two-way players can sync with a defensive designation (e.g. Travis Hunter
 * arrives as CB on some platforms); fantasy-relevant position is WR.
 */
export function normalizePosition(raw = '') {
  const pos = String(raw).trim().toUpperCase();
  if (pos === 'CB') return 'WR';
  return pos || 'N/A';
}

// stable id generator used for canonical player_id
export function stableId(input = '') {
  let hash = 0;
  for (let i = 0; i < input.length; i++) {
    hash = ((hash << 5) - hash) + input.charCodeAt(i);
    hash |= 0;
  }
  return `p_${Math.abs(hash)}`;
}

/**
 * parseAdpString(rawAdp)
 * - interprets ADP as an absolute (possibly decimal) pick number
 * - returns { pick: Number|null, display: string }
 */
export function parseAdpString(rawAdp) {
  if (rawAdp === null || rawAdp === undefined) {
    return { pick: null, display: '-' };
  }

  const str = String(rawAdp).trim();
  if (str === '') {
    return { pick: null, display: '-' };
  }

  const value = Number(str);
  if (!Number.isFinite(value)) {
    // Non-numeric: preserve display but mark pick as null so sorting treats it as missing
    return { pick: null, display: str };
  }

  return {
    pick: value,
    display: value.toFixed(1)
  };
}

/**
 * processMasterList(rosters, adpMap = {}, teams = 12, adpSnapshots = [])
 *
 * - rosters: array of normalized roster entries [{ name, position, team, entry_id, pick, round }, ...]
 * - adpMap: object keyed by normalized name -> { pick, display } (parsed ADP for latest snapshot)
 * - teams: retained for backward compatibility (not used in parser now)
 * - adpSnapshots: OPTIONAL array of snapshots sorted ascending (old -> new)
 *      each snapshot: { date: 'YYYY-MM-DD', rows: [...] } where rows are raw CSV row objects
 *
 * Returns canonical players array with fields:
 *  - player_id, name, position, team, rookie, count, entries
 *  - exposure (string percent)
 *  - adpDisplay (string) or '-' if missing
 *  - adpPick (number) or null if missing
 *  - history: [{ date, adpPick, adpDisplay }, ... ] aligned to adpSnapshots (or empty)
 */
export function processMasterList(rosters = [], adpMap = {}, _teams = 12, adpSnapshots = []) {
  // normalize names for matching — uses canonicalName for cross-platform consistency
  const normalize = (s = '') => canonicalName(s);

  // Per-invocation caches for the snapshot loop below: raw name strings and
  // raw ADP values repeat across every snapshot (~134 per load), so cleaning /
  // parsing each distinct value once instead of ~200k times is a large win
  // (TASK-365). The shared parsedAdp objects never escape this function —
  // consumers copy out primitives — so reuse across lookup entries is safe.
  const nameCandidateCache = new Map();
  const parsedAdpCache = new Map();

  // Build snapshot lookups (sorted by date ascending)
  const snapshotLookups = (Array.isArray(adpSnapshots) && adpSnapshots.length > 0)
    ? adpSnapshots
        .slice()
        .map(snap => ({ ...snap })) // shallow copy
        .sort((a, b) => (a.date || '').localeCompare(b.date || ''))
        .map(snap => {
          const lookup = new Map();
          (snap.rows || []).forEach(row => {
            // Same precedence as the original template-string extraction:
            // first/last name fields (either alone suffices) win over Name.
            const fl = row.firstName || row.first_name || row['First Name'] || '';
            const ll = row.lastName || row.last_name || row['Last Name'] || '';
            const rawName = (fl || ll)
              ? `${fl} ${ll}`.trim()
              : (row.Name || row['Player Name'] || row.player_name || row.Player || '');

            let nameCandidate = nameCandidateCache.get(rawName);
            if (nameCandidate === undefined) {
              nameCandidate = String(rawName).trim().replace(/\s+/g, ' ');
              nameCandidateCache.set(rawName, nameCandidate);
            }

            if (!nameCandidate) return;
            const key = normalize(nameCandidate);
            const rawAdp = row.adp ?? row.ADP ?? row['ADP'] ?? row['Round.Pick'] ?? row['Adp'] ?? '';
            let parsedAdp = parsedAdpCache.get(rawAdp);
            if (parsedAdp === undefined) {
              parsedAdp = parseAdpString(rawAdp);
              parsedAdpCache.set(rawAdp, parsedAdp);
            }
            lookup.set(key, { row, parsedAdp, displayName: nameCandidate });
          });
          return { date: snap.date, platform: snap.platform || 'unknown', lookup };
        })
    : [];

  // convenience: latest snapshot lookup (most recent date)
  const latestSnapObj = snapshotLookups.length > 0 ? snapshotLookups[snapshotLookups.length - 1] : null;
  const latestLookup = latestSnapObj ? latestSnapObj.lookup : new Map();

  // Count exposures from rosters. The same pass indexes the first roster row
  // per normalized name, replacing a per-universe-player rosters.find() scan
  // that made this function quadratic on large portfolios (TASK-365).
  const totalEntries = new Set(rosters.map(r => r.entry_id)).size || 1;
  const draftCounts = {};
  const rosterByName = new Map();
  rosters.forEach(r => {
    const nm = normalize(r.name);
    draftCounts[nm] = (draftCounts[nm] || 0) + 1;
    if (!rosterByName.has(nm)) rosterByName.set(nm, r);
  });

  // Normalized adpMap index — first key wins per normalized name, matching the
  // order-sensitive Object.keys(adpMap).find(...) scans this replaces (TASK-365).
  const adpByNorm = new Map();
  Object.keys(adpMap || {}).forEach(k => {
    const n = normalize(k);
    if (!adpByNorm.has(n)) adpByNorm.set(n, adpMap[k]);
  });

  // BUILD THE UNIVERSE: unique normalized names from adpMap keys, rosters, and latest snapshot
  const adpMapKeys = Array.from(adpByNorm.keys());
  const rosterNamesNorm = rosters.map(r => normalize(r.name));
  const latestSnapNames = latestLookup ? Array.from(latestLookup.keys()) : [];

  const allNormalizedNamesSet = new Set([
    ...adpMapKeys,
    ...rosterNamesNorm,
    ...latestSnapNames
  ]);

  // Build display name map — roster names (UD-sourced) always take priority over ADP snapshot names.
  // This is critical for sim player_id matching: the sim was built from UD data, so player names must
  // match UD's convention (e.g. "Brian Thomas" not "Brian Thomas Jr.", "Luther Burden" not "Luther Burden III").
  const displayNameFor = {};
  latestLookup && Array.from(latestLookup.entries()).forEach(([k, v]) => { displayNameFor[k] = v.displayName || k; });
  Object.keys(adpMap || {}).forEach(k => { const n = normalize(k); if (!displayNameFor[n]) displayNameFor[n] = k; });
  // Roster override: always use the roster (UD) display name for drafted players
  rosters.forEach(r => { const k = normalize(r.name); displayNameFor[k] = r.name; });

  // BUILD MASTER LIST
  const final = Array.from(allNormalizedNamesSet).map(normName => {
    const displayName = displayNameFor[normName] || normName;

    // roster instance (if exists) — first roster row for this name, as
    // rosters.find() returned before the Map index (TASK-365)
    const rosterInstance = rosterByName.get(normName);

    // Determine position/team preference:
    // 1) latest ADP snapshot row (slotName/teamName or pos/team fields)
    // 2) adpMap entry (if it contains slotName/teamName)
    // 3) roster csv data
    let pos = 'N/A';
    let team = 'N/A';

    const latestEntry = latestLookup.get(normName);
    if (latestEntry && latestEntry.row) {
      const row = latestEntry.row;
      pos = row.slotName || row.position || row.Position || row.pos || row.Pos || row['Position'] || row['SlotName'] || row.slot || 'N/A';
      team = expandTeam(row.teamName || row.team || row.Team || row.NFL_Team || row['NFL Team'] || row['TeamName'] || '');
    } else {
      // check adpMap (some consumers populate slotName/teamName there)
      const adpObj = adpMap && (adpMap[displayName] || adpMap[normName] || adpByNorm.get(normName));
      if (adpObj) {
        pos = adpObj.slotName || adpObj.position || adpObj.pos || pos;
        team = expandTeam(adpObj.teamName || adpObj.team || adpObj.Team || '');
      }
      // fallback to roster CSV
      if ((pos === 'N/A' || !pos) && rosterInstance) pos = rosterInstance.position || pos;
      if ((team === 'N/A' || !team) && rosterInstance) team = expandTeam(rosterInstance.team || '') || team;
    }

    // Resolve ADP pick/display (prefer adpMap parsed pick, then latest snapshot parsed)
    let adpPick = null;
    let adpDisplay = '-';
    // try adpMap first (often contains parsed fields)
    const adpObj = adpMap && (adpMap[displayName] || adpMap[normName] || adpByNorm.get(normName));
    if (adpObj) {
      adpPick = adpObj.pick ?? (Number.isFinite(Number(adpObj)) ? Number(adpObj) : null);
      adpDisplay = adpObj.display ?? (adpPick !== null ? String(adpPick) : adpDisplay);
    } else if (latestEntry && latestEntry.parsedAdp) {
      adpPick = latestEntry.parsedAdp.pick ?? null;
      adpDisplay = latestEntry.parsedAdp.display ?? adpDisplay;
    }

    // Build history aligned to snapshots
    const history = snapshotLookups.map(snapObj => {
      const e = snapObj.lookup.get(normName);
      return {
        date: snapObj.date,
        platform: snapObj.platform || 'unknown',
        adpPick: e?.parsedAdp?.pick ?? null,
        adpDisplay: e?.parsedAdp?.display ?? '-'
      };
    });

    const count = draftCounts[normName] || 0;

    return {
      player_id: `id-${displayName}-${pos}-${team}`.replace(/[^\w-]/g, ''),
      name: displayName,
      position: normalizePosition(pos),
      team: team || 'N/A',
      count,
      exposure: ((count / totalEntries) * 100).toFixed(1),
      adpDisplay,
      adpPick,
      history
    };
  })
  .sort((a, b) => {
    // 1) drafted exposure desc
    if (parseFloat(b.exposure) !== parseFloat(a.exposure)) {
      return parseFloat(b.exposure) - parseFloat(a.exposure);
    }
    // 2) ADP numeric ascending (nulls go to end)
    const apA = Number.isFinite(Number(a.adpPick)) ? Number(a.adpPick) : 9999;
    const apB = Number.isFinite(Number(b.adpPick)) ? Number(b.adpPick) : 9999;
    return apA - apB;
  });

  return final;
}

/**
 * Shorten a long tournament name for display.
 * - Strips a leading "DraftKings " prefix
 * - Strips a trailing " Presented by ..." suffix
 * - Truncates to 40 chars with ellipsis if still long
 * Underdog and other non-DK names pass through unchanged (no "DraftKings" prefix).
 */
export function compactTournamentName(name) {
  if (!name) return name;
  let compact = name
    .replace(/^DraftKings\s+/i, '')
    .replace(/\s+Presented by\b.*/i, '');
  if (compact.length > 40) compact = compact.slice(0, 38) + '\u2026';
  return compact;
}
