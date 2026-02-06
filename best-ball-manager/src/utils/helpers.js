// src/utils/helpers.js

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
    display: str
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
export function processMasterList(rosters = [], adpMap = {}, teams = 12, adpSnapshots = []) {
  // ------------------------
  // 1) Build snapshot lookups (if snapshots provided)
  // ------------------------
  // Each lookup is a Map(normalizedName -> parsedAdpObj)
  const snapshotLookups = (Array.isArray(adpSnapshots) && adpSnapshots.length > 0)
    ? adpSnapshots.map(snap => {
        const lookup = new Map();
        (snap.rows || []).forEach(row => {
          // derive name similarly to ingestion logic
          const nameCandidate = (
            (`${row.firstName || row.first_name || row['First Name'] || ''} ${row.lastName || row.last_name || row['Last Name'] || ''}`).trim()
            || row['Player Name'] || row.player_name || row.Player || ''
          ).trim();
          if (!nameCandidate) return;

          const normalized = nameCandidate.replace(/\s+/g, ' ');
          // find common ADP column names; keep raw string so parseAdpString can handle it
          const rawAdp = row.adp ?? row.ADP ?? row['ADP'] ?? row['Round.Pick'] ?? row['Adp'] ?? row['ADP (R.P)'] ?? '';
          const parsed = parseAdpString(rawAdp);
          lookup.set(normalized, parsed);
        });
        return { date: snap.date, lookup };
      })
    : [];

  // ------------------------
  // 2) Build canonical player map from rosters
  // ------------------------
  const totalEntries = new Set(rosters.map(r => r.entry_id)).size || 1;
  const playerMap = {};

  rosters.forEach(r => {
    const key = r.name;
    if (!playerMap[key]) {
      const canonicalKey = `${r.name}|${r.position}|${r.team}`;
      playerMap[key] = {
        player_id: stableId(canonicalKey),
        name: r.name,
        position: r.position,
        team: r.team,
        rookie: false,
        count: 0,
        entries: [],
        history: [] // will be filled below if snapshots exist
      };
    }
    playerMap[key].count++;
    playerMap[key].entries.push(r.entry_id);
  });

  // ------------------------
  // 3) If snapshots exist, populate per-player history aligned to snapshots (old -> new)
  // ------------------------
  if (snapshotLookups.length > 0) {
    // For each snapshot (by index), for each player, push a history entry.
    snapshotLookups.forEach((snapObj) => {
      const date = snapObj.date;
      const lookup = snapObj.lookup;
      Object.values(playerMap).forEach(p => {
        // lookup by the canonical name
        const parsed = lookup.get(p.name);
        if (parsed && parsed.pick !== null) {
          p.history.push({ date, adpPick: parsed.pick, adpDisplay: parsed.display });
        } else {
          // preserve alignment: include null entries so sparklines/series can rely on positions
          p.history.push({ date, adpPick: null, adpDisplay: '-' });
        }
      });
    });
  }

  // ------------------------
  // 4) Build final array using adpMap (latest) as primary source, fallback to last snapshot if available
  // ------------------------
  const final = Object.values(playerMap).map(p => {
    // Primary: latest from adpMap keyed by normalized name
    const adpObjFromMap = adpMap && (adpMap[p.name]);
    let adpDisplay = '-';
    let adpPick = null;

    if (adpObjFromMap) {
      // adpMap entries may be { pick, display } coming from parseAdpString, or raw objects
      adpPick = (adpObjFromMap.pick === undefined) ? (Number.isFinite(Number(adpObjFromMap)) ? Number(adpObjFromMap) : null) : adpObjFromMap.pick;
      adpDisplay = (adpObjFromMap.display !== undefined) ? adpObjFromMap.display : (adpPick !== null ? String(adpPick) : '-');
    } else if (snapshotLookups.length > 0) {
      // fallback: use the last snapshot's lookup for this player
      const lastSnap = snapshotLookups[snapshotLookups.length - 1];
      const parsed = lastSnap.lookup.get(p.name);
      if (parsed && parsed.pick !== null) {
        adpPick = parsed.pick;
        adpDisplay = parsed.display;
      }
    }

    return {
      ...p,
      exposure: ((p.count / totalEntries) * 100).toFixed(1),
      adpDisplay,
      adpPick
      // history already exists on p (possibly empty)
    };
  })
  .sort((a,b) => {
    // default: sort by exposure desc
    return parseFloat(b.exposure || 0) - parseFloat(a.exposure || 0);
  });

  return final;
}
