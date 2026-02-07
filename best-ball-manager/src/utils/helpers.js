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
  // 1) Build snapshot lookups (Map: Name -> ParsedADP)
  const snapshotLookups = (Array.isArray(adpSnapshots) && adpSnapshots.length > 0)
    ? adpSnapshots.map(snap => {
      const lookup = new Map();
      (snap.rows || []).forEach(row => {
        const nameCandidate = (
          (`${row.firstName || row.first_name || row['First Name'] || ''} ${row.lastName || row.last_name || row['Last Name'] || ''}`).trim()
          || row['Player Name'] || row.player_name || row.Player || ''
        ).trim().replace(/\s+/g, ' ');

        if (!nameCandidate) return;
        const rawAdp = row.adp ?? row.ADP ?? row['ADP'] ?? row['Round.Pick'] ?? row['Adp'] ?? '';
        lookup.set(nameCandidate, parseAdpString(rawAdp));
      });
      return { date: snap.date, lookup };
    })
    : [];

  // 2) Count exposures from rosters
  const totalEntries = new Set(rosters.map(r => r.entry_id)).size || 1;
  const draftCounts = {};
  rosters.forEach(r => {
    draftCounts[r.name] = (draftCounts[r.name] || 0) + 1;
  });

  // 3) BUILD THE UNIVERSE: Collect EVERY unique player name from ADP and Rosters
  const allPlayerNames = new Set([
    ...Object.keys(adpMap),
    ...rosters.map(r => r.name),
    ...(snapshotLookups.length > 0 ? snapshotLookups[snapshotLookups.length - 1].lookup.keys() : [])
  ]);

  // 4) Create the Master List by iterating over the Universe
  const final = Array.from(allPlayerNames).map(name => {
    // A) Get latest Info (Pos/Team) - Prefer roster data, fallback to latest ADP row
    const rosterInstance = rosters.find(r => r.name === name);
    const latestSnap = snapshotLookups[snapshotLookups.length - 1];

    // Attempt to find metadata if player wasn't drafted
    let pos = rosterInstance?.position || 'N/A';
    let team = rosterInstance?.team || 'N/A';

    // B) Resolve ADP Data
    const adpObj = adpMap[name];
    let adpDisplay = '-';
    let adpPick = null;

    if (adpObj) {
      adpPick = adpObj.pick ?? (Number.isFinite(Number(adpObj)) ? Number(adpObj) : null);
      adpDisplay = adpObj.display ?? (adpPick !== null ? String(adpPick) : '-');
    } else if (latestSnap) {
      const parsed = latestSnap.lookup.get(name);
      if (parsed) {
        adpPick = parsed.pick;
        adpDisplay = parsed.display;
      }
    }

    // C) Build History (Aligned to Snapshots)
    const history = snapshotLookups.map(snapObj => {
      const parsed = snapObj.lookup.get(name);
      return {
        date: snapObj.date,
        adpPick: parsed?.pick ?? null,
        adpDisplay: parsed?.display ?? '-'
      };
    });

    const count = draftCounts[name] || 0;

    return {
      player_id: `id-${name}-${pos}-${team}`.replace(/\s+/g, ''),
      name,
      position: pos,
      team,
      count,
      exposure: ((count / totalEntries) * 100).toFixed(1),
      adpDisplay,
      adpPick,
      history
    };
  })
    .sort((a, b) => {
      // Sort drafted players to top, then by ADP for the rest
      if (parseFloat(b.exposure) !== parseFloat(a.exposure)) {
        return parseFloat(b.exposure) - parseFloat(a.exposure);
      }
      return (a.adpPick || 999) - (b.adpPick || 999);
    });

  return final;
}