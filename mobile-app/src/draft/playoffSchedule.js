// playoffSchedule.js — GENERATED from shared/data/playoff-schedule-2026.json
// (regenerate with the one-liner in that file's header if the schedule moves).
// A JS copy exists because the engine must import it under Node (fixture
// tests / replay harness), esbuild (extension bundle), and Metro alike —
// plain JSON imports don't resolve in Node ESM without import attributes.
// Keys are team abbreviations; values are W15/16/17 opponents.
export const PLAYOFF_SCHEDULE = {
  "ARI": { '15': "NYJ", '16': "NO", '17': "LV" },
  "ATL": { '15': "WAS", '16': "TB", '17': "NO" },
  "BAL": { '15': "PIT", '16': "CLE", '17': "CIN" },
  "BUF": { '15': "CHI", '16': "DEN", '17': "MIA" },
  "CAR": { '15': "CIN", '16': "PIT", '17': "SEA" },
  "CHI": { '15': "BUF", '16': "GB", '17': "DET" },
  "CIN": { '15': "CAR", '16': "IND", '17': "BAL" },
  "CLE": { '15': "NYG", '16': "BAL", '17': "IND" },
  "DAL": { '15': "LAR", '16': "JAX", '17': "NYG" },
  "DEN": { '15': "LV", '16': "BUF", '17': "NE" },
  "DET": { '15': "MIN", '16': "NYG", '17': "CHI" },
  "GB": { '15': "MIA", '16': "CHI", '17': "HOU" },
  "HOU": { '15': "JAX", '16': "PHI", '17': "GB" },
  "IND": { '15': "TEN", '16': "CIN", '17': "CLE" },
  "JAX": { '15': "HOU", '16': "DAL", '17': "WAS" },
  "KC": { '15': "NE", '16': "SF", '17': "LAC" },
  "LV": { '15': "DEN", '16': "TEN", '17': "ARI" },
  "LAC": { '15': "SF", '16': "MIA", '17': "KC" },
  "LAR": { '15': "DAL", '16': "SEA", '17': "TB" },
  "MIA": { '15': "GB", '16': "LAC", '17': "BUF" },
  "MIN": { '15': "DET", '16': "WAS", '17': "NYJ" },
  "NE": { '15': "KC", '16': "NYJ", '17': "DEN" },
  "NO": { '15': "TB", '16': "ARI", '17': "ATL" },
  "NYG": { '15': "CLE", '16': "DET", '17': "DAL" },
  "NYJ": { '15': "ARI", '16': "NE", '17': "MIN" },
  "PHI": { '15': "SEA", '16': "HOU", '17': "SF" },
  "PIT": { '15': "BAL", '16': "CAR", '17': "TEN" },
  "SF": { '15': "LAC", '16': "KC", '17': "PHI" },
  "SEA": { '15': "PHI", '16': "LAR", '17': "CAR" },
  "TB": { '15': "NO", '16': "ATL", '17': "LAR" },
  "TEN": { '15': "IND", '16': "LV", '17': "PIT" },
  "WAS": { '15': "ATL", '16': "MIN", '17': "JAX" },
};
