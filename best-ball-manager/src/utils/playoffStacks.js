// Portfolio-level playoff (W15/16/17) game-stack analysis.
//
// Mirrors the position-pair rule shipped in chrome-extension/src/content/draft-overlay.js
// (TASK-232) but reformulated symmetrically for roster-vs-roster aggregation.

import { NFL_TEAMS, NFL_TEAMS_ABBREV } from './nflTeams';

export const PLAYOFF_WEEKS = ['15', '16', '17'];

const MEANINGFUL_POSITIONS = new Set(['QB', 'WR', 'TE']);

export function isMeaningfulPair(posA, posB) {
  if (!MEANINGFUL_POSITIONS.has(posA) || !MEANINGFUL_POSITIONS.has(posB)) return false;
  if (posA === 'TE' && posB === 'TE') return false;
  return true;
}

// Normalize team to a 2-3 letter abbreviation matching the schedule JSON keys.
// Accepts either form because the web app stores expanded names (e.g. "Buffalo
// Bills" via expandTeam) while the extension stores abbreviations.
export function teamToAbbr(team) {
  if (!team) return null;
  const t = String(team).trim();
  if (!t || t === 'FA' || t === 'N/A') return null;
  const upper = t.toUpperCase();
  if (NFL_TEAMS[upper]) return upper;
  return NFL_TEAMS_ABBREV[upper] || null;
}

function canonicalMatchup(teamA, teamB) {
  return teamA < teamB ? [teamA, teamB] : [teamB, teamA];
}

// Analyze one roster. Returns { '15': [game, ...], '16': [...], '17': [...] }
// where game = { teamA, teamB, pairs: Array<[playerA, playerB]> }.
// teamA/teamB are alphabetically ordered (canonical) so matchups dedupe across rosters.
export function analyzeRosterPlayoffStacks(roster, schedule) {
  const byTeam = new Map();
  for (const p of roster) {
    if (!p || !p.team || !p.position) continue;
    const abbr = teamToAbbr(p.team);
    if (!abbr) continue;
    if (!byTeam.has(abbr)) byTeam.set(abbr, []);
    byTeam.get(abbr).push(p);
  }

  const result = { 15: [], 16: [], 17: [] };

  for (const week of PLAYOFF_WEEKS) {
    const seen = new Set();
    for (const teamA of byTeam.keys()) {
      const opp = schedule[teamA]?.[week];
      if (!opp) continue;
      if (!byTeam.has(opp)) continue;
      const [tA, tB] = canonicalMatchup(teamA, opp);
      const key = `${tA}|${tB}`;
      if (seen.has(key)) continue;
      seen.add(key);

      const playersForA = byTeam.get(tA);
      const playersForB = byTeam.get(tB);
      const pairs = [];
      for (const pA of playersForA) {
        for (const pB of playersForB) {
          if (isMeaningfulPair(pA.position, pB.position)) {
            pairs.push([pA, pB]);
          }
        }
      }
      if (pairs.length > 0) {
        result[week].push({ teamA: tA, teamB: tB, pairs });
      }
    }
  }
  return result;
}

// Aggregate per-game stack frequency across the whole portfolio.
//
// Returns:
//   {
//     weeks: {
//       '15': {
//         games: Map<'<TEAM_A>|<TEAM_B>', GameAgg>,
//         rostersWithAny: Set<entryId>
//       },
//       '16': {...},
//       '17': {...}
//     },
//     nakedRosters: Set<entryId>
//   }
//
// GameAgg = {
//   teamA, teamB,
//   rosterEntryIds: Set<entryId>,
//   piecesByTeam: { [team]: Map<playerName, { position, rosterCount }> }
// }
export function aggregatePortfolioPlayoffStacks(rosters, schedule) {
  const weeks = {
    15: { games: new Map(), rostersWithAny: new Set() },
    16: { games: new Map(), rostersWithAny: new Set() },
    17: { games: new Map(), rostersWithAny: new Set() },
  };
  const nakedRosters = new Set();

  for (const roster of rosters) {
    const entryId = roster[0]?.entry_id || 'unknown';
    const perWeek = analyzeRosterPlayoffStacks(roster, schedule);
    let rosterHasAny = false;

    for (const week of PLAYOFF_WEEKS) {
      const games = perWeek[week];
      if (games.length === 0) continue;
      rosterHasAny = true;
      weeks[week].rostersWithAny.add(entryId);

      for (const game of games) {
        const key = `${game.teamA}|${game.teamB}`;
        let agg = weeks[week].games.get(key);
        if (!agg) {
          agg = {
            teamA: game.teamA,
            teamB: game.teamB,
            rosterEntryIds: new Set(),
            piecesByTeam: {
              [game.teamA]: new Map(),
              [game.teamB]: new Map(),
            },
          };
          weeks[week].games.set(key, agg);
        }
        agg.rosterEntryIds.add(entryId);

        // Add this roster's contributing players (dedupe within roster — a player
        // appears once per roster regardless of how many pairs they form).
        const addedA = new Set();
        const addedB = new Set();
        for (const [pA, pB] of game.pairs) {
          if (!addedA.has(pA.name)) {
            addedA.add(pA.name);
            incrementPiece(agg.piecesByTeam[game.teamA], pA);
          }
          if (!addedB.has(pB.name)) {
            addedB.add(pB.name);
            incrementPiece(agg.piecesByTeam[game.teamB], pB);
          }
        }
      }
    }

    if (!rosterHasAny) nakedRosters.add(entryId);
  }

  return { weeks, nakedRosters };
}

function incrementPiece(map, player) {
  const existing = map.get(player.name);
  if (existing) {
    existing.rosterCount += 1;
  } else {
    map.set(player.name, { position: player.position, rosterCount: 1 });
  }
}

// Team-centric flip of the aggregate. For each NFL team that appears in any
// meaningful stack across the portfolio, returns its 3-week schedule with the
// number of rosters that hold a meaningful stack involving that team in each
// playoff week.
//
// Returns: Map<teamAbbr, {
//   team,
//   pieces: Map<playerName, { position, rosterCount }>,
//   weeks: {
//     '15': { opponent, rosterIds: Set<entryId> },
//     '16': { ... },
//     '17': { ... },
//   },
//   anyStackRosters: Set<entryId>,   // union across weeks
// }>
export function aggregateByTeam(aggregate, schedule) {
  const teams = new Map();

  const ensureTeam = (team) => {
    if (!teams.has(team)) {
      teams.set(team, {
        team,
        pieces: new Map(),
        weeks: {
          15: { opponent: schedule[team]?.['15'] || null, rosterIds: new Set() },
          16: { opponent: schedule[team]?.['16'] || null, rosterIds: new Set() },
          17: { opponent: schedule[team]?.['17'] || null, rosterIds: new Set() },
        },
        anyStackRosters: new Set(),
      });
    }
    return teams.get(team);
  };

  for (const week of PLAYOFF_WEEKS) {
    for (const game of aggregate.weeks[week].games.values()) {
      for (const side of [game.teamA, game.teamB]) {
        const t = ensureTeam(side);
        for (const id of game.rosterEntryIds) {
          t.weeks[week].rosterIds.add(id);
          t.anyStackRosters.add(id);
        }
        const sidePieces = game.piecesByTeam[side];
        if (sidePieces) {
          for (const [name, info] of sidePieces) {
            const existing = t.pieces.get(name);
            if (existing) {
              existing.rosterCount = Math.max(existing.rosterCount, info.rosterCount);
            } else {
              t.pieces.set(name, { position: info.position, rosterCount: info.rosterCount });
            }
          }
        }
      }
    }
  }

  return teams;
}

// Walks every roster and returns per-roster matchup-count summaries. A
// "matchup" is one game in which the roster has at least one meaningful pair
// (analyzeRosterPlayoffStacks already enforces this). The result is suitable
// for ranking rosters by how many playoff game stacks they carry.
//
// Returns: Array<{
//   entryId,
//   index,                       // original ordering for stable display
//   slateTitle,
//   perWeek: { '15': [...], '16': [...], '17': [...] },  // raw games per week
//   counts: { 15, 16, 17, total, weeksCovered },
// }>
// Candidate-side game-stack analysis for the live Draft Assistant (TASK-245).
// Asymmetric: given a candidate (team + position) and the user's current picks,
// returns the qualifying opponent overlaps in W15/16/17. Mirrors the extension's
// MEANINGFUL_GAME_PAIRS rule from draft-overlay.js — W17 (championship week) is
// the only week that admits RB on either side.
//
// Returns null when there is no overlap; otherwise:
//   { count, weeks: [{ week, entries: [{ name, position, team, opp }] }] }
const CANDIDATE_PAIRS_DEFAULT = Object.freeze({
  QB: new Set(['QB', 'WR', 'TE']),
  WR: new Set(['QB', 'WR', 'TE']),
  TE: new Set(['QB', 'WR']),
});
const CANDIDATE_PAIRS_W17 = Object.freeze({
  QB: new Set(['QB', 'WR', 'TE', 'RB']),
  WR: new Set(['QB', 'WR', 'TE', 'RB']),
  TE: new Set(['QB', 'WR', 'RB']),
  RB: new Set(['QB', 'WR', 'TE', 'RB']),
});

function candidatePairsForWeek(week) {
  return week === '17' ? CANDIDATE_PAIRS_W17 : CANDIDATE_PAIRS_DEFAULT;
}

export function analyzeCandidatePlayoffStack({ candidateTeam, candidatePos, currentPicks, schedule }) {
  const team = teamToAbbr(candidateTeam);
  if (!team || !candidatePos || !currentPicks || currentPicks.length === 0) return null;

  const weeks = [];
  let count = 0;

  for (const week of PLAYOFF_WEEKS) {
    const qualifyingOpps = candidatePairsForWeek(week)[candidatePos];
    if (!qualifyingOpps) continue;

    const opp = schedule[team]?.[week];
    if (!opp) continue;

    const entries = [];
    for (const pick of currentPicks) {
      const pickTeam = teamToAbbr(pick.team);
      const pickPos = pick.position;
      if (!pickTeam || !pickPos) continue;
      if (pickTeam === team) continue; // same-team — covered by standard stack pill
      if (pickTeam !== opp) continue;
      const pickOpp = schedule[pickTeam]?.[week];
      if (pickOpp && pickOpp !== team) continue;
      if (!qualifyingOpps.has(pickPos)) continue;

      entries.push({
        name: pick.name,
        position: pickPos,
        team: pickTeam,
        opp: team,
      });
    }

    if (entries.length > 0) {
      weeks.push({ week, entries });
      count += entries.length;
    }
  }

  if (count === 0) return null;
  return { count, weeks };
}

export function aggregatePerRoster(rosters, schedule) {
  return rosters.map((roster, idx) => {
    const entryId = roster[0]?.entry_id || `roster-${idx}`;
    const slateTitle = roster[0]?.slateTitle || null;
    const perWeek = analyzeRosterPlayoffStacks(roster, schedule);
    const c15 = perWeek[15].length;
    const c16 = perWeek[16].length;
    const c17 = perWeek[17].length;
    const total = c15 + c16 + c17;
    const weeksCovered = (c15 > 0 ? 1 : 0) + (c16 > 0 ? 1 : 0) + (c17 > 0 ? 1 : 0);
    return {
      entryId,
      index: idx,
      slateTitle,
      perWeek,
      counts: { 15: c15, 16: c16, 17: c17, total, weeksCovered },
    };
  });
}
