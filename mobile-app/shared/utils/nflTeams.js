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
  GB:  'Green Bay Packers',
  HOU: 'Houston Texans',
  IND: 'Indianapolis Colts',
  JAC: 'Jacksonville Jaguars',
  JAX: 'Jacksonville Jaguars',
  KC:  'Kansas City Chiefs',
  LAC: 'Los Angeles Chargers',
  LAR: 'Los Angeles Rams',
  LV:  'Las Vegas Raiders',
  MIA: 'Miami Dolphins',
  MIN: 'Minnesota Vikings',
  NE:  'New England Patriots',
  NO:  'New Orleans Saints',
  NYG: 'New York Giants',
  NYJ: 'New York Jets',
  PHI: 'Philadelphia Eagles',
  PIT: 'Pittsburgh Steelers',
  SEA: 'Seattle Seahawks',
  SF:  'San Francisco 49ers',
  TB:  'Tampa Bay Buccaneers',
  TEN: 'Tennessee Titans',
  WAS: 'Washington Commanders',
};

export const NFL_TEAMS_ABBREV = Object.fromEntries(
  Object.entries(NFL_TEAMS).map(([abbr, full]) => [full.toUpperCase(), abbr])
);

// Collapse a team to its abbreviation. Stored data carries teams as the source
// platform stored them: DraftKings uses abbreviations ("MIN"), Underdog uses full
// names ("Minnesota Vikings"). Unknown values (already-abbreviated, "FA", "N/A")
// pass through unchanged.
export function teamAbbrev(team) {
  if (!team) return team;
  return NFL_TEAMS_ABBREV[String(team).toUpperCase()] || team;
}
