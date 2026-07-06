// src/utils/advanceModel.js
//
// Startable-lineup projection + Expected Advance % model for the Roster Viewer.
//
// Two problems with the old "sum of season projections" number:
//   1. Only a starting lineup scores in best ball (1 QB / 2 RB / 3 WR / 1 TE /
//      1 FLEX). A 4-QB roster summed higher simply because QBs project more
//      points, even though three of those QBs can never start together.
//   2. It was static — once the season starts, banked actual points and
//      observed player performance should move the number.
//
// This module fixes both, and layers an advance-odds estimate on top:
//
//   Projected Points  = actual best-ball points from completed weeks
//                     + remaining weeks × E[weekly optimal-lineup score]
//     E[weekly lineup] comes from a seeded Monte Carlo: each player's weekly
//     score is drawn around his rest-of-season weekly mean with position-
//     specific volatility, then the optimal lineup is scored. Depth earns
//     value through variance (your WR6 sometimes outscores your WR1), and
//     surplus QBs stop inflating the total.
//
//   Rest-of-season weekly mean per player = Bayesian blend of the preseason
//     projection (treated as PRIOR_WEIGHT_WEEKS weeks of evidence) with the
//     player's actual weekly scores once weekly actuals are loaded.
//
//   Expected Advance % = P(finish top advanceSpots of podSize) over the
//     tournament's advancement window. Your roster's total is
//     Normal(actual + R·weeklyMean, weeklySd·√R); the 11 opponents are i.i.d.
//     draws from a field model built from the user's own portfolio cohort in
//     the same tournament (fallback: platform, then all rosters — both scoped
//     to the same format so superflex/eliminator rosters never measure
//     against classic cohorts). Computed by numeric integration — no
//     simulation needed at this layer.
//
//   Advancement structure is per-tournament (advanceStructureFor):
//     - classic UD/DK tournaments: top 2 of 12 over the 14-week regular season
//     - The Big Board / The Little Board: top 3 of 12 over 14 weeks
//     - Superflex: top 2 of 12 over 14 weeks, simulated with the superflex slot
//     - The Eliminator: top 6 of 12 on Week 1 alone (the first survival cut)
//
// Byes: when a bye schedule is supplied (team abbreviation → week, see
// src/data/byeWeeks.js), remaining weeks are simulated against the REAL
// schedule — each week zeroes exactly the players whose bye it is, so
// clustered byes (five teammates off in Week 9) crater one simulated week
// instead of being smeared thinly, and a roster whose byes are already
// behind it gets a cleaner rest-of-season outlook. Players whose team can't
// be resolved fall back to the uniform P_MISS_WEEK zero-week chance.
//
// Documented simplifications (all uniform across rosters, so relative
// comparisons — the point of the column — hold):
//   - Opponents are modeled from the portfolio cohort, not the actual pod;
//     an average roster in your own portfolio therefore sits near the
//     ADVANCE_SPOTS/POD_SIZE baseline.
//   - Opponent actual scores are unobserved, so opponents keep full-season
//     variance while your own variance shrinks as weeks complete.
//   - Injury absences are not explicitly simulated (season projections
//     already discount expected missed games).
//   - Player-overlap correlation between pod rosters is ignored.
//
// Kept free of Vite-isms (pure ESM, data-only imports) so Node scripts can
// exercise the math directly.

import { canonicalName, normalizePosition } from './helpers.js';
import { teamAbbrev } from './nflTeams.js';

// ── Contest structure ─────────────────────────────────────────────────────────

/** Advancement is decided over weeks 1–14 in classic UD/DK best ball tournaments. */
export const REGULAR_SEASON_WEEKS = 14;
export const POD_SIZE = 12;
export const ADVANCE_SPOTS = 2;
/** Baseline advance rate — an exactly-average roster in an average pod. */
export const ADVANCE_BASELINE = ADVANCE_SPOTS / POD_SIZE;

/**
 * Resolve a tournament's advancement structure from its slate / tournament
 * titles. Every supported format is modeled:
 *   - The Eliminator: weekly survival — Week 1 alone decides the first cut,
 *     top 6 of the 12-team pod survive. Advance % is scored on that cut.
 *   - The Big Board / The Little Board: top 3 of 12 over the regular season.
 *   - Superflex: classic 2-of-12 advancement, superflex lineup in the sim.
 *   - Everything else: classic 2-of-12 over the 14-week regular season.
 * `format` scopes the opponent field model so rosters only measure against
 * same-format cohorts; `baseline` is the exactly-average advance rate used
 * for display coloring.
 *
 * @param {string|null} slateTitle
 * @param {string|null} tournamentTitle
 * @returns {{advanceSpots: number, podSize: number, totalWeeks: number,
 *            format: 'classic'|'superflex'|'eliminator', baseline: number}}
 */
export function advanceStructureFor(slateTitle, tournamentTitle) {
  const slate = (slateTitle || '').toLowerCase();
  const tourn = (tournamentTitle || '').toLowerCase();
  const make = (advanceSpots, totalWeeks, format) => ({
    advanceSpots,
    podSize: POD_SIZE,
    totalWeeks,
    format,
    baseline: advanceSpots / POD_SIZE,
  });
  if (slate.includes('eliminator') || tourn.includes('eliminator')) {
    return make(6, 1, 'eliminator');
  }
  if (slate.includes('superflex') || tourn.includes('superflex')) {
    return make(ADVANCE_SPOTS, REGULAR_SEASON_WEEKS, 'superflex');
  }
  if (tourn.includes('big board') || tourn.includes('little board')) {
    return make(3, REGULAR_SEASON_WEEKS, 'classic');
  }
  return make(ADVANCE_SPOTS, REGULAR_SEASON_WEEKS, 'classic');
}

/** Season projections cover a 17-game schedule. */
export const PROJECTION_GAMES = 17;
/** Chance a player contributes nothing in a given week (bye, spread uniformly). */
const P_MISS_WEEK = 1 / 17;

/** Classic best-ball starting lineup; FLEX is filled from the leftovers. */
export const CLASSIC_LINEUP = Object.freeze({ QB: 1, RB: 2, WR: 3, TE: 1 });
const FLEX_POS = ['RB', 'WR', 'TE'];
const SFLEX_POS = ['QB', 'RB', 'WR', 'TE'];

// Weekly score volatility by position, expressed as a coefficient of variation
// on the weekly mean (public weekly-scoring research: QBs are the steadiest,
// TEs the spikiest) plus a floor so deep bench players still fluctuate.
const WEEKLY_CV = { QB: 0.40, RB: 0.58, WR: 0.64, TE: 0.72 };
const DEFAULT_CV = 0.60;
const MIN_WEEKLY_SD = 2.0;

/** Preseason projection weight when blending in actuals, in week-equivalents. */
const PRIOR_WEIGHT_WEEKS = 6;

// ── Deterministic RNG (stable results across re-renders) ─────────────────────

function hashSeed(str = '') {
  let h = 2166136261;
  for (let i = 0; i < str.length; i++) {
    h ^= str.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

function mulberry32(seed) {
  let a = seed >>> 0;
  return function () {
    a |= 0; a = (a + 0x6D2B79F5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

// ── Normal distribution helpers ───────────────────────────────────────────────

/** Abramowitz–Stegun 7.1.26 erf approximation (|err| < 1.5e-7). */
function erf(x) {
  const sign = x < 0 ? -1 : 1;
  const ax = Math.abs(x);
  const t = 1 / (1 + 0.3275911 * ax);
  const y = 1 - (((((1.061405429 * t - 1.453152027) * t) + 1.421413741) * t - 0.284496736) * t + 0.254829592) * t * Math.exp(-ax * ax);
  return sign * y;
}

function normCdf(x, mean = 0, sd = 1) {
  if (sd <= 0) return x >= mean ? 1 : 0;
  return 0.5 * (1 + erf((x - mean) / (sd * Math.SQRT2)));
}

// ── Optimal lineup ────────────────────────────────────────────────────────────

/**
 * Score the optimal starting lineup for one week.
 * Greedy fill (dedicated slots best-first, then FLEX, then superflex) is exact
 * because every flex slot's eligibility is a superset of the dedicated slots.
 *
 * @param {Array<{position: string, points: number}>} scored
 * @param {boolean} superflex - add a QB-eligible superflex slot
 * @returns {number}
 */
export function optimalLineupPoints(scored, superflex = false) {
  const byPos = { QB: [], RB: [], WR: [], TE: [] };
  for (const s of scored) {
    if (byPos[s.position]) byPos[s.position].push(s.points);
  }
  for (const pos of Object.keys(byPos)) byPos[pos].sort((a, b) => b - a);

  let total = 0;
  const used = { QB: 0, RB: 0, WR: 0, TE: 0 };
  for (const [pos, n] of Object.entries(CLASSIC_LINEUP)) {
    const limit = Math.min(n, byPos[pos].length);
    for (let i = 0; i < limit; i++) total += byPos[pos][i];
    used[pos] = limit;
  }

  const takeBestRemaining = (eligible) => {
    let bestPos = null;
    let bestPts = -Infinity;
    for (const pos of eligible) {
      const next = byPos[pos][used[pos]];
      if (next !== undefined && next > bestPts) { bestPts = next; bestPos = pos; }
    }
    if (bestPos === null) return 0;
    used[bestPos] += 1;
    return bestPts;
  };

  total += takeBestRemaining(FLEX_POS);
  if (superflex) total += takeBestRemaining(SFLEX_POS);
  return total;
}

// ── Weekly lineup simulation ──────────────────────────────────────────────────

/**
 * Estimate the mean and SD of a roster's weekly optimal-lineup score via a
 * seeded Monte Carlo over per-player weekly score draws.
 *
 * @param {Array<{position: string, weeklyMean: number, missProb?: number}>} players -
 *   missProb is each player's chance of a zero week (defaults to the uniform
 *   bye rate; pass 0 when byes are modeled explicitly by the caller)
 * @param {{sims?: number, seed?: number, superflex?: boolean}} [opts]
 * @returns {{mean: number, sd: number}}
 */
export function simulateWeeklyLineup(players, { sims = 300, seed = 1, superflex = false } = {}) {
  const rng = mulberry32(seed);
  const sampled = players.map(p => ({
    position: p.position,
    mean: Math.max(0, p.weeklyMean || 0),
    sd: Math.max(MIN_WEEKLY_SD, (WEEKLY_CV[p.position] ?? DEFAULT_CV) * Math.max(0, p.weeklyMean || 0)),
    missProb: p.missProb ?? P_MISS_WEEK,
    points: 0,
  }));

  // Box–Muller with a cached spare draw.
  let spare = null;
  const normal = () => {
    if (spare !== null) { const v = spare; spare = null; return v; }
    let u = 0, v = 0;
    while (u === 0) u = rng();
    v = rng();
    const mag = Math.sqrt(-2 * Math.log(u));
    spare = mag * Math.sin(2 * Math.PI * v);
    return mag * Math.cos(2 * Math.PI * v);
  };

  let sum = 0;
  let sumSq = 0;
  for (let s = 0; s < sims; s++) {
    for (const p of sampled) {
      p.points = (p.mean <= 0 || (p.missProb > 0 && rng() < p.missProb))
        ? 0
        : Math.max(0, p.mean + p.sd * normal());
    }
    const pts = optimalLineupPoints(sampled, superflex);
    sum += pts;
    sumSq += pts * pts;
  }

  const mean = sum / sims;
  const variance = Math.max(0, sumSq / sims - mean * mean);
  return { mean, sd: Math.sqrt(variance) };
}

// ── Rest-of-season blending ───────────────────────────────────────────────────

/**
 * Blend a preseason season projection with observed weekly actuals into a
 * rest-of-season weekly mean. The projection acts as PRIOR_WEIGHT_WEEKS weeks
 * of evidence, so early weeks nudge and a half-season of data dominates.
 * A player stuck on zeros (injury) degrades; a breakout climbs.
 */
export function blendedWeeklyMean(seasonProj, actualTotal, weeksCompleted) {
  const prior = Math.max(0, seasonProj || 0) / PROJECTION_GAMES;
  if (!weeksCompleted || weeksCompleted <= 0) return prior;
  return (PRIOR_WEIGHT_WEEKS * prior + Math.max(0, actualTotal || 0)) / (PRIOR_WEIGHT_WEEKS + weeksCompleted);
}

// ── Weekly actuals ingestion ──────────────────────────────────────────────────

/** Map a roster's platform to the scoring format its actuals use. */
export function scoringForPlatform(adpPlatform, slateTitle) {
  if (adpPlatform === 'draftkings') return 'fullppr';
  if ((slateTitle || '').startsWith('DK')) return 'fullppr';
  return 'halfppr'; // underdog, eliminator, superflex
}

function actualsRowName(row) {
  return (
    (`${row.firstName || row.first_name || row['First Name'] || ''} ${row.lastName || row.last_name || row['Last Name'] || ''}`.trim())
    || row.Name || row.name || row['Player Name'] || row.player_name || row.Player || row.player || ''
  ).trim().replace(/\s+/g, ' ') || null;
}

function actualsRowPoints(row) {
  const raw = row.points ?? row.Points ?? row.PTS ?? row.pts ?? row.FPTS ?? row.fpts
    ?? row.fantasyPoints ?? row.fantasy_points ?? row['Fantasy Points'] ?? row.score ?? row.Score ?? '';
  const val = parseFloat(raw);
  return Number.isFinite(val) ? val : null;
}

/**
 * Parse weekly actual-points files into per-scoring, per-week lookup maps.
 *
 * File convention (dropped into src/assets/actuals/, mirroring the ADP
 * snapshot workflow): {halfppr|fullppr}_week_{N}.csv — e.g.
 * halfppr_week_01.csv, fullppr_week_1.csv. Underscores/hyphens and a
 * "half_ppr" spelling are tolerated. Columns: a player name (Name, or
 * firstName/lastName like projections.csv) and a points column (points /
 * FPTS / fantasy_points / score).
 *
 * @param {Array<{filename: string, rows: Array<object>}>} files - pre-parsed CSV rows
 * @returns {{halfppr: {weeks: Object<number, Map<string, number>>, weekNumbers: number[]},
 *            fullppr: {weeks: Object<number, Map<string, number>>, weekNumbers: number[]}}|null}
 *          null when no usable file was found.
 */
export function parseActualsFiles(files = []) {
  const out = {
    halfppr: { weeks: {}, weekNumbers: [] },
    fullppr: { weeks: {}, weekNumbers: [] },
  };
  let any = false;

  for (const { filename, rows } of files) {
    const scoringMatch = (filename || '').match(/(half|full)[\s_-]?ppr/i);
    const weekMatch = (filename || '').match(/week[\s_-]?(\d{1,2})/i);
    if (!scoringMatch || !weekMatch || !Array.isArray(rows)) continue;
    const scoring = scoringMatch[1].toLowerCase() === 'full' ? 'fullppr' : 'halfppr';
    const week = parseInt(weekMatch[1], 10);
    if (!Number.isFinite(week) || week < 1) continue;

    const map = out[scoring].weeks[week] || new Map();
    for (const row of rows) {
      const name = actualsRowName(row);
      const points = actualsRowPoints(row);
      if (!name || points === null) continue;
      map.set(canonicalName(name), points);
    }
    if (map.size === 0) continue;
    out[scoring].weeks[week] = map;
    any = true;
  }

  if (!any) return null;
  for (const scoring of ['halfppr', 'fullppr']) {
    out[scoring].weekNumbers = Object.keys(out[scoring].weeks).map(Number).sort((a, b) => a - b);
  }
  return out;
}

// ── Per-roster outlook ────────────────────────────────────────────────────────

/** Resolve a player's bye week from a team-abbreviation-keyed schedule. */
export function byeWeekForTeam(team, byeWeeks) {
  if (!team || !byeWeeks) return null;
  const week = byeWeeks[teamAbbrev(team)] ?? byeWeeks[String(team).trim().toUpperCase()];
  return Number.isFinite(week) ? week : null;
}

/**
 * Compute a roster's dynamic season outlook: banked actual best-ball points,
 * rest-of-season weekly lineup distribution, and the blended season projection.
 *
 * When `byeWeeks` is supplied, remaining weeks are grouped by which players
 * are on bye and each group is simulated with those players out — the real
 * schedule shape, not a uniform miss rate. weeklyMean/weeklySd are then the
 * per-week aggregates of that remaining-season distribution, so
 * `actual + R·weeklyMean` and `weeklySd·√R` reconstruct the remaining totals.
 *
 * @param {Array<{name: string, position: string, team?: string, projectedPoints?: number}>} players
 * @param {{scoring?: 'halfppr'|'fullppr', actuals?: object|null, superflex?: boolean,
 *          totalWeeks?: number, sims?: number, seedKey?: string,
 *          byeWeeks?: Object<string, number>|null}} [opts]
 * @returns {{projectedPoints: number, actualPoints: number, weeksCompleted: number,
 *            remainingWeeks: number, weeklyMean: number, weeklySd: number,
 *            playerActuals: Map<string, number>}}
 */
export function computeRosterOutlook(players, {
  scoring = 'halfppr',
  actuals = null,
  superflex = false,
  totalWeeks = REGULAR_SEASON_WEEKS,
  sims = 300,
  seedKey = '',
  byeWeeks = null,
} = {}) {
  const lineupPlayers = players.map(p => ({
    position: normalizePosition(p.position),
    nameKey: canonicalName(p.name),
    seasonProj: Number(p.projectedPoints) || 0,
    byeWeek: byeWeekForTeam(p.team, byeWeeks),
  }));

  // Completed weeks within the regular season, for this roster's scoring format.
  const weekNumbers = (actuals?.[scoring]?.weekNumbers || []).filter(w => w <= totalWeeks);
  const completedSet = new Set(weekNumbers);
  const weeksCompleted = weekNumbers.length;
  const remainingWeeks = Math.max(0, totalWeeks - weeksCompleted);

  // Banked best-ball points: each completed week scores the optimal lineup of
  // that week's actual player points (absent from the file = 0 — inactive).
  let actualPoints = 0;
  const playerActuals = new Map();
  for (const p of lineupPlayers) playerActuals.set(p.nameKey, 0);
  for (const w of weekNumbers) {
    const weekMap = actuals[scoring].weeks[w];
    const scored = lineupPlayers.map(p => {
      const pts = weekMap.get(p.nameKey) ?? 0;
      playerActuals.set(p.nameKey, playerActuals.get(p.nameKey) + pts);
      return { position: p.position, points: pts };
    });
    actualPoints += optimalLineupPoints(scored, superflex);
  }

  // Rest-of-season per-player weekly means. A player with a known bye plays
  // every other week (his season projection already spans 17 games), so his
  // zero week comes from the schedule, not a random miss.
  const simPlayers = lineupPlayers.map(p => ({
    position: p.position,
    weeklyMean: blendedWeeklyMean(p.seasonProj, playerActuals.get(p.nameKey), weeksCompleted),
    missProb: p.byeWeek != null ? 0 : P_MISS_WEEK,
    byeWeek: p.byeWeek,
  }));
  const baseSeed = hashSeed(seedKey || lineupPlayers.map(p => p.nameKey).join('|'));

  // Group the remaining weeks by which players sit out, and simulate each
  // distinct group once: total remaining mean/variance are the count-weighted
  // sums (weeks are independent), so clustered byes crater one simulated week
  // instead of being smeared across the season.
  const groups = new Map(); // signature → { count, outSet }
  for (let w = 1; w <= totalWeeks; w++) {
    if (completedSet.has(w)) continue;
    const out = [];
    simPlayers.forEach((p, i) => { if (p.byeWeek === w) out.push(i); });
    const sig = out.join(',');
    const g = groups.get(sig);
    if (g) g.count += 1;
    else groups.set(sig, { count: 1, outSet: new Set(out) });
  }

  let remainingMean = 0;
  let remainingVar = 0;
  let baseWeekly = null; // no-byes week — the fallback aggregate when R = 0
  for (const [sig, g] of groups) {
    const active = simPlayers.filter((_, i) => !g.outSet.has(i));
    // The all-active week dominates the total; bye weeks each appear once and
    // tolerate a lighter simulation.
    const groupSims = g.outSet.size === 0 ? sims : Math.max(100, sims >> 1);
    const stats = simulateWeeklyLineup(active, {
      sims: groupSims,
      seed: hashSeed(`${baseSeed}|${sig}`),
      superflex,
    });
    if (g.outSet.size === 0) baseWeekly = stats;
    remainingMean += g.count * stats.mean;
    remainingVar += g.count * stats.sd * stats.sd;
  }
  if (!baseWeekly) {
    baseWeekly = simulateWeeklyLineup(simPlayers, { sims, seed: baseSeed, superflex });
  }

  // Effective per-week aggregates of the remaining-season distribution;
  // season over → keep the base week so consumers' (mean > 0) gates hold.
  const weeklyMean = remainingWeeks > 0 ? remainingMean / remainingWeeks : baseWeekly.mean;
  const weeklySd = remainingWeeks > 0 ? Math.sqrt(remainingVar / remainingWeeks) : baseWeekly.sd;

  return {
    projectedPoints: actualPoints + remainingMean,
    actualPoints,
    weeksCompleted,
    remainingWeeks,
    weeklyMean,
    weeklySd,
    playerActuals,
  };
}

// ── Field model ───────────────────────────────────────────────────────────────

const MIN_TOURNAMENT_COHORT = 3;

// The spread of the user's own portfolio is a biased estimator of within-pod
// roster-quality spread (a diverse or tiny portfolio can wildly overstate it,
// a one-strategy portfolio understates it). Clamp to a realistic band,
// expressed as a fraction of the field's weekly mean (~2–5 weekly points).
const QUALITY_SD_MIN_FRAC = 0.015;
const QUALITY_SD_MAX_FRAC = 0.04;

/**
 * Build the opponent field model from the user's own portfolio. Cohorts are
 * resolved tournament → platform → global, so a roster is measured against
 * the most specific pool available. Also captures roster-quality dispersion
 * (spread of weekly means across the cohort) so opponents aren't all clones.
 *
 * The platform and global fallbacks are scoped per format ('classic' |
 * 'superflex' | 'eliminator') — a superflex roster's inflated weekly mean
 * (extra QB slot) or an eliminator roster's week-1 outlook must never be
 * measured against classic cohorts, and vice versa.
 *
 * @param {Array<{tournamentTitle: string|null, platform: string|null,
 *                format?: string, weeklyMean: number, weeklySd: number}>} outlooks
 * @returns {(tournamentTitle: string|null, platform: string|null, format?: string) =>
 *           {weeklyMean: number, weeklySd: number, qualitySd: number}|null}
 */
export function buildFieldModel(outlooks = []) {
  const valid = outlooks.filter(o => o.weeklyMean > 0);

  const summarize = (list) => {
    if (!list.length) return null;
    const n = list.length;
    const weeklyMean = list.reduce((s, o) => s + o.weeklyMean, 0) / n;
    const weeklySd = list.reduce((s, o) => s + o.weeklySd, 0) / n;
    const qualityVar = n > 1
      ? list.reduce((s, o) => s + (o.weeklyMean - weeklyMean) ** 2, 0) / (n - 1)
      : 0;
    const qualitySd = Math.min(
      Math.max(Math.sqrt(qualityVar), QUALITY_SD_MIN_FRAC * weeklyMean),
      QUALITY_SD_MAX_FRAC * weeklyMean
    );
    return { weeklyMean, weeklySd, qualitySd, n };
  };

  const byTournament = new Map();
  const byPlatform = new Map(); // `${format}|${platform}` → outlooks
  const byFormat = new Map();   // format → outlooks
  for (const o of valid) {
    const format = o.format || 'classic';
    if (o.tournamentTitle) {
      if (!byTournament.has(o.tournamentTitle)) byTournament.set(o.tournamentTitle, []);
      byTournament.get(o.tournamentTitle).push(o);
    }
    const platKey = `${format}|${o.platform || 'global'}`;
    if (!byPlatform.has(platKey)) byPlatform.set(platKey, []);
    byPlatform.get(platKey).push(o);
    if (!byFormat.has(format)) byFormat.set(format, []);
    byFormat.get(format).push(o);
  }

  return (tournamentTitle, platform, format = 'classic') => {
    const tourn = tournamentTitle ? summarize(byTournament.get(tournamentTitle) || []) : null;
    if (tourn && tourn.n >= MIN_TOURNAMENT_COHORT) return tourn;
    const plat = summarize(byPlatform.get(`${format}|${platform || 'global'}`) || []);
    if (plat) return plat;
    return summarize(byFormat.get(format) || []);
  };
}

// ── Expected Advance % ────────────────────────────────────────────────────────

/** P(at most k of n i.i.d. opponents exceed the threshold), opponent-beats-you prob q. */
function binomAtMost(k, n, q) {
  const p = Math.min(1, Math.max(0, q));
  let sum = 0;
  let coef = 1; // C(n, i)
  for (let i = 0; i <= k; i++) {
    if (i > 0) coef = coef * (n - i + 1) / i;
    sum += coef * Math.pow(p, i) * Math.pow(1 - p, n - i);
  }
  return Math.min(1, Math.max(0, sum));
}

/**
 * Expected Advance % — probability this roster finishes in the top
 * `advanceSpots` of its `podSize`-team pod at the end of the regular season.
 *
 * Your season total ~ Normal(actual + R·weeklyMean, weeklySd·√R). Each of the
 * podSize−1 opponents ~ Normal(totalWeeks·fieldWeeklyMean,
 * √(totalWeeks²·qualitySd² + totalWeeks·fieldWeeklySd²)) — full-season
 * variance (their weekly results are unobserved) plus roster-quality spread.
 * Integrates P(≤ advanceSpots−1 opponents beat you) over your distribution.
 *
 * @returns {number} probability in [0, 1]
 */
export function advanceProbability({
  myActualPoints = 0,
  myWeeklyMean,
  myWeeklySd,
  fieldWeeklyMean,
  fieldWeeklySd,
  fieldQualitySd = 0,
  weeksCompleted = 0,
  totalWeeks = REGULAR_SEASON_WEEKS,
  podSize = POD_SIZE,
  advanceSpots = ADVANCE_SPOTS,
}) {
  if (!(myWeeklyMean > 0) || !(fieldWeeklyMean > 0)) return null;

  const R = Math.max(0, totalWeeks - Math.min(weeksCompleted, totalWeeks));
  const myMean = myActualPoints + R * myWeeklyMean;
  const mySd = (myWeeklySd || 0) * Math.sqrt(R);

  const oppMean = totalWeeks * fieldWeeklyMean;
  const oppSd = Math.sqrt(
    (totalWeeks * fieldQualitySd) ** 2 + totalWeeks * (fieldWeeklySd || 0) ** 2
  );
  if (!(oppSd > 0)) return null;

  const opponents = podSize - 1;
  const spots = Math.max(1, advanceSpots);
  const survive = (t) => binomAtMost(spots - 1, opponents, 1 - normCdf(t, oppMean, oppSd));

  // Season over (or zero variance): the total is known exactly.
  if (mySd <= 1e-9) return survive(myMean);

  // Numeric integration over your season-total distribution, z ∈ [−5, 5].
  const STEPS = 121;
  const dz = 10 / (STEPS - 1);
  let prob = 0;
  let weight = 0;
  for (let i = 0; i < STEPS; i++) {
    const z = -5 + i * dz;
    const w = Math.exp(-0.5 * z * z);
    prob += w * survive(myMean + mySd * z);
    weight += w;
  }
  return Math.min(1, Math.max(0, prob / weight));
}

/**
 * Advance odds for every seat of a KNOWN pod (Draft Board view) — unlike
 * advanceProbability's i.i.d. field model, each opponent here is a specific
 * roster with its own season-total distribution, so the count of opponents
 * beating a given total is Poisson-binomial (computed by DP). Probabilities
 * across fully-modeled pods sum to ~advanceSpots.
 *
 * @param {Array<{mean: number, sd: number}|null>} seats - season-total
 *   distributions in slot order; null = unmodeled seat (missing projections),
 *   which participates as a pod-average opponent but gets no odds of its own.
 * @param {{advanceSpots?: number}} [opts]
 * @returns {Array<number|null>} P(top advanceSpots) per seat, aligned to input
 */
export function podAdvanceProbabilities(seats = [], { advanceSpots = ADVANCE_SPOTS } = {}) {
  const valid = seats.filter(s => s && Number.isFinite(s.mean) && s.mean > 0);
  if (valid.length < 2) return seats.map(() => null);

  // Unmodeled seats still occupy a pod spot — stand in a pod-average roster.
  const avgMean = valid.reduce((a, s) => a + s.mean, 0) / valid.length;
  const avgSd = valid.reduce((a, s) => a + (s.sd || 0), 0) / valid.length;
  const filled = seats.map(s => (s && Number.isFinite(s.mean) && s.mean > 0) ? s : { mean: avgMean, sd: avgSd });

  const spots = Math.max(1, advanceSpots);
  return seats.map((orig, i) => {
    if (!(orig && Number.isFinite(orig.mean) && orig.mean > 0)) return null;
    const me = filled[i];
    const others = filled.filter((_, j) => j !== i);

    // P(≤ spots−1 of the specific others exceed t): Poisson-binomial DP,
    // truncated at `spots` states (overflow mass = eliminated anyway).
    const survive = (t) => {
      let dp = new Array(spots).fill(0);
      dp[0] = 1;
      for (const o of others) {
        const q = 1 - normCdf(t, o.mean, o.sd);
        const next = new Array(spots).fill(0);
        for (let k = 0; k < spots; k++) {
          if (dp[k] === 0) continue;
          next[k] += dp[k] * (1 - q);
          if (k + 1 < spots) next[k + 1] += dp[k] * q;
        }
        dp = next;
      }
      return dp.reduce((a, b) => a + b, 0);
    };

    if ((me.sd || 0) <= 1e-9) return Math.min(1, Math.max(0, survive(me.mean)));

    const STEPS = 121;
    const dz = 10 / (STEPS - 1);
    let prob = 0;
    let weight = 0;
    for (let s = 0; s < STEPS; s++) {
      const z = -5 + s * dz;
      const w = Math.exp(-0.5 * z * z);
      prob += w * survive(me.mean + me.sd * z);
      weight += w;
    }
    return Math.min(1, Math.max(0, prob / weight));
  });
}

/**
 * Display treatment for an advance probability (0–1 or null): formatted
 * percentage colored against the pod baseline (pass the tournament's own
 * baseline from advanceStructureFor — 3/12 and 6/12 structures center
 * differently). Shared by the Roster Viewer table/cards and the Draft Board
 * modal so the number reads identically.
 */
export function advanceLabel(prob, baseline = ADVANCE_BASELINE) {
  if (prob == null) return { text: '—', color: 'var(--text-muted)' };
  const color = prob >= baseline + 0.03 ? '#00e5a0'
    : prob <= baseline - 0.03 ? '#ff6b6b'
    : '#e0e0e0';
  return { text: `${(prob * 100).toFixed(1)}%`, color };
}
