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
 * Parse ADP string like "1.10" into:
 *  - display: zero-padded string "1.10"
 *  - pick: absolute pick number (for sorting), e.g. (round-1)*teams + pickInRound
 *
 * Returns null if input is falsy.
 */
export function parseAdpString(adpStr, teams = 12) {
  if (!adpStr && adpStr !== 0) return null;
  const s = String(adpStr).trim();

  // allow "1.10", "1.1", "1-10" etc. Normalize expecting round.pick
  const normalized = s.replace(/[-_]/g, '.');
  const m = normalized.match(/^(\d+)\.(\d+)$/);

  if (!m) {
    // If it doesn't match expected pattern, still return display preserved and NaN pick
    return {
      display: s,
      pick: NaN
    };
  }

  const round = parseInt(m[1], 10);
  const pickInRound = parseInt(m[2], 10);

  // zero-pad pickInRound for display to preserve "1.10"
  const pickDisplay = `${round}.${String(pickInRound).padStart(2, '0')}`;
  const pick = (round - 1) * teams + pickInRound;

  return {
    display: pickDisplay,
    pick
  };
}

/**
 * processMasterList(rosters, adpMap)
 * adpMap is expected to be an object keyed by normalized player name with values:
 *   { display: "1.10", pick: 10 }  // output of parseAdpString(...)
 *
 * Returns canonical players array with fields:
 *  - player_id, name, position, team, rookie, count, entries
 *  - exposure (string percent)
 *  - adpDisplay (string) or '-' if missing
 *  - adpPick (number) or null if missing/NaN
 */
export function processMasterList(rosters = [], adpMap = {}, teams = 12) {
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
        entries: []
      };
    }
    playerMap[key].count++;
    playerMap[key].entries.push(r.entry_id);
  });

  const final = Object.values(playerMap).map(p => {
    // find ADP entry for this player (adpMap expected to be keyed by exact normalized name)
    const adpObj = adpMap[p.name];
    return {
      ...p,
      exposure: ((p.count / totalEntries) * 100).toFixed(1),
      // ADP display string (keep string "1.10") and numeric pick for sorting
      adpDisplay: adpObj && (adpObj.display || adpObj.raw) ? (adpObj.display || String(adpObj.raw)) : '-',
      adpPick: adpObj && !Number.isNaN(adpObj.pick) ? adpObj.pick : null
    };
  })
  .sort((a,b) => {
    // default sort by exposure desc
    return parseFloat(b.exposure || 0) - parseFloat(a.exposure || 0);
  });

  return final;
}
