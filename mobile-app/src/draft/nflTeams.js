// nflTeams.js — GENERATED-style local copy of shared/utils/nflTeams.js.
// A plain-JS copy exists (like playoffSchedule.js) because the engine must
// import it under Node (fixture tests / replay harness), esbuild (extension
// bundle) and Metro alike — the shared module's extensionless './nflTeams'
// import doesn't resolve in Node ESM. Keep in lockstep with
// shared/utils/nflTeams.js (full name <-> abbreviation).

export const NFL_TEAMS = {
  ARI: 'Arizona Cardinals',
  ATL: 'Atlanta Falcons',
  BAL: 'Baltimore Ravens',
  BUF: 'Buffalo Bills',
  CAR: 'Carolina Panthers',
  CHI: 'Chicago Bears',
  CIN: 'Cincinnati Bengals',
  CLE: 'Cleveland Browns',
  DAL: 'Dallas Cowboys',
  DEN: 'Denver Broncos',
  DET: 'Detroit Lions',
  GB: 'Green Bay Packers',
  HOU: 'Houston Texans',
  IND: 'Indianapolis Colts',
  JAC: 'Jacksonville Jaguars',
  JAX: 'Jacksonville Jaguars',
  KC: 'Kansas City Chiefs',
  LAC: 'Los Angeles Chargers',
  LAR: 'Los Angeles Rams',
  LV: 'Las Vegas Raiders',
  MIA: 'Miami Dolphins',
  MIN: 'Minnesota Vikings',
  NE: 'New England Patriots',
  NO: 'New Orleans Saints',
  NYG: 'New York Giants',
  NYJ: 'New York Jets',
  PHI: 'Philadelphia Eagles',
  PIT: 'Pittsburgh Steelers',
  SEA: 'Seattle Seahawks',
  SF: 'San Francisco 49ers',
  TB: 'Tampa Bay Buccaneers',
  TEN: 'Tennessee Titans',
  WAS: 'Washington Commanders',
};

const NFL_TEAMS_ABBREV = Object.fromEntries(
  Object.entries(NFL_TEAMS).map(([abbr, full]) => [full.toUpperCase(), abbr]),
);

// Collapse a team to its abbreviation. Underdog stores full names ("New York
// Jets"), DraftKings stores abbreviations ("MIN"). Unknown values (already
// abbreviated, "FA", "N/A") pass through unchanged. Mirrors
// shared/utils/nflTeams.js teamAbbrev.
export function teamAbbrev(team) {
  if (!team) return team;
  return NFL_TEAMS_ABBREV[String(team).toUpperCase()] || team;
}
