// nflTeamColors.js — one identity color per NFL franchise, used by the Arena to
// paint stack visuals in the team's real color (a PHI stack reads midnight green,
// a CIN stack reads Bengal orange). These are hand-tuned from each team's official
// primary for legibility on the app's navy surfaces: too-dark primaries (Bears
// navy, Browns brown, Texans steel) fall back to the franchise's next most
// recognizable color, and dark hues are lifted rather than used verbatim.

export const NFL_TEAM_COLORS = {
  ARI: '#D64358', // cardinal
  ATL: '#E5405A', // falcon red
  BAL: '#9B7EDE', // raven purple (lifted)
  BUF: '#5B8DEF', // royal (lifted)
  CAR: '#2E9FDB', // process blue
  CHI: '#E8632A', // bears orange (navy unusable)
  CIN: '#FB4F14', // bengal orange
  CLE: '#F1552F', // browns orange (brown unusable)
  DAL: '#7FA3D9', // cowboys silver-blue
  DEN: '#F65A22', // broncos orange
  DET: '#1E90D6', // honolulu blue
  GB:  '#55BD85', // packers green (lifted further — mid greens sink into navy)
  HOU: '#CE2F42', // battle red (steel blue unusable)
  IND: '#5C99EA', // colts speed blue (lifted further — mid blues sink into navy)
  JAC: '#1BA7B8', // jaguar teal
  JAX: '#1BA7B8',
  KC:  '#E8324A', // chiefs red
  LAC: '#55B7E8', // powder blue
  LAR: '#6C80EC', // rams royal (lifted further)
  LV:  '#A8B2BD', // raiders silver
  MIA: '#12B0BA', // dolphins aqua
  MIN: '#8458C8', // vikings purple (lifted)
  NE:  '#6F9BDB', // patriots nautical blue (lifted further)
  NO:  '#CBB27E', // saints old gold
  NYG: '#6787E8', // giants royal (lifted further)
  NYJ: '#3DAD7C', // gotham green (lifted further)
  PHI: '#3BAEA0', // midnight green (lifted further)
  PIT: '#FFB612', // steelers gold
  SEA: '#69BE28', // action green
  SF:  '#C93A34', // 49ers red
  TB:  '#E03A2E', // buccaneer red
  TEN: '#58A0E8', // titans two-tone blue
  WAS: '#A6413B', // burgundy (lifted)
};

/** Identity color for an NFL team abbreviation; muted slate when unknown. */
export function nflTeamColor(abbrev) {
  return NFL_TEAM_COLORS[String(abbrev || '').toUpperCase()] || '#64748b';
}
