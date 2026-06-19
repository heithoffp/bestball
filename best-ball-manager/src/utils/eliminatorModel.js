// Eliminator-format analysis for the Draft Assistant's Eliminator Mode (ADR-010, TASK-269).
//
// Pure, data-driven helpers over the 2026 Eliminator snapshot in
// `../data/eliminator-2026.json`. The Eliminator is a weekly head-to-head survival
// contest (6-of-12 Week-1 pod → 1v1 weeks), which inverts season-long best-ball logic:
// floor over ceiling, a fixed 3 QB / 5 RB / 6–7 WR / 3–4 TE shape, late (Week 13/14)
// byes as a high-leverage lever, a staggered "bye rainbow" (no two same-position
// players share a bye), and systematic fades of late-developing rookies / contingent backs.
//
// Nothing here re-ranks the board — per ADR-010 the candidate list is annotated, not
// reordered. These functions only describe state and flag format-specific risks.

import elim from '../data/eliminator-2026.json';
import { teamToAbbr } from './playoffStacks';

export const ELIMINATOR_DATA = elim;
export const ROSTER_SHAPE = elim.rosterShape;
export const PLAYBOOK = elim.playbook;
export const POSITION_ORDER = ['QB', 'RB', 'WR', 'TE'];

const LATE_BYE_WEEKS = new Set([...(elim.byeTiers.premium || []), ...(elim.byeTiers.strong || [])]);
const EARLY_BYE_WEEKS = new Set(elim.byeTiers.early || []);

// --- name normalization (fade matching) ---
const normalizeName = (name) =>
  String(name || '')
    .toLowerCase()
    .replace(/[.'`-]/g, '')
    .replace(/\b(jr|sr|ii|iii|iv|v)\b/g, '')
    .replace(/\s+/g, ' ')
    .trim();

const FADE_MAP = new Map(
  (elim.fades || []).map((f) => [normalizeName(f.name), f])
);

// --- bye lookups ---

// Resolve a player's bye week from their team (expanded name or abbreviation).
export function getByeWeek(team) {
  const abbr = teamToAbbr(team);
  if (!abbr) return null;
  const wk = elim.byeWeeks[abbr];
  return Number.isFinite(wk) ? wk : null;
}

// Classify a bye week into a strategic tier.
// 'premium' (wk14) | 'strong' (wk13) | 'shared' (wk11 bymageddon) | 'early' (wk5–8) | 'neutral'
export function getByeTier(week) {
  if (!Number.isFinite(week)) return null;
  if ((elim.byeTiers.premium || []).includes(week)) return 'premium';
  if ((elim.byeTiers.strong || []).includes(week)) return 'strong';
  if ((elim.byeTiers.shared || []).includes(week)) return 'shared';
  if (EARLY_BYE_WEEKS.has(week)) return 'early';
  return 'neutral';
}

export function isLateBye(week) {
  return Number.isFinite(week) && LATE_BYE_WEEKS.has(week);
}

// --- fade lookup ---

// Returns { name, reason, note } for a curated macro-fade player, else null.
export function getFadeInfo(name) {
  return FADE_MAP.get(normalizeName(name)) || null;
}

// --- roster shape ---

// Per-position progress vs. the Eliminator target shape, plus dead-pick warning.
// status: 'under' | 'ideal' | 'ok' (within min–max) | 'over'
export function analyzeRosterShape(picks = []) {
  const counts = { QB: 0, RB: 0, WR: 0, TE: 0 };
  picks.forEach((p) => {
    if (counts[p.position] != null) counts[p.position] += 1;
  });

  const positions = POSITION_ORDER.map((pos) => {
    const cfg = ROSTER_SHAPE.positions[pos] || { min: 0, max: 0, ideal: 0 };
    const count = counts[pos];
    let status;
    if (count > cfg.max) status = 'over';
    else if (count < cfg.min) status = 'under';
    else if (count === cfg.ideal) status = 'ideal';
    else status = 'ok';
    return { position: pos, count, ...cfg, status };
  });

  const total = picks.length;
  return {
    positions,
    counts,
    total,
    target: ROSTER_SHAPE.total,
    complete: total >= ROSTER_SHAPE.total,
  };
}

// --- bye rainbow ---

// Group rostered byes by position and surface rainbow violations.
// A "collision" = two+ players at the SAME position sharing a bye week (breaks the
// rainbow). "earlyStacks" = two+ players (any position) stacked on an early bye (wk5–8),
// the compounding-zero trap. lateByeCount = picks on a premium/strong (wk13/14) bye.
export function analyzeByeRainbow(picks = []) {
  const byPosition = {};
  const byWeekAll = new Map();
  let lateByeCount = 0;
  let unknownByeCount = 0;

  picks.forEach((p) => {
    const week = getByeWeek(p.team);
    if (!Number.isFinite(week)) {
      unknownByeCount += 1;
      return;
    }
    if (isLateBye(week)) lateByeCount += 1;

    if (!byPosition[p.position]) byPosition[p.position] = new Map();
    const posMap = byPosition[p.position];
    if (!posMap.has(week)) posMap.set(week, []);
    posMap.get(week).push(p.name);

    if (!byWeekAll.has(week)) byWeekAll.set(week, []);
    byWeekAll.get(week).push({ name: p.name, position: p.position });
  });

  const collisions = [];
  Object.entries(byPosition).forEach(([position, posMap]) => {
    posMap.forEach((players, week) => {
      if (players.length >= 2) collisions.push({ position, week, players });
    });
  });

  const earlyStacks = [];
  byWeekAll.forEach((players, week) => {
    if (EARLY_BYE_WEEKS.has(week) && players.length >= 2) {
      earlyStacks.push({ week, players });
    }
  });

  // Per-position summary for display: [{ position, weeks: [{week, tier, players}] }]
  const summary = POSITION_ORDER.filter((pos) => byPosition[pos]).map((position) => {
    const weeks = [...byPosition[position].entries()]
      .sort((a, b) => a[0] - b[0])
      .map(([week, players]) => ({ week, tier: getByeTier(week), players }));
    return { position, weeks };
  });

  return {
    byPosition,
    summary,
    collisions,
    earlyStacks,
    lateByeCount,
    unknownByeCount,
  };
}

// --- per-candidate flags ---

// Format-specific annotations for one candidate, given the current picks.
// Reorders nothing — purely descriptive badges for the player list.
//   byeWeek, byeTier, isLateBye
//   fade: { reason, note } | null
//   byeClash: { week, players: [name] } | null   (same-position rainbow violation if drafted)
//   fillsOnesieNeed: bool                          (QB/TE still below target min)
export function getEliminatorFlags(candidate, picks = []) {
  if (!candidate) return null;
  const byeWeek = getByeWeek(candidate.team);
  const byeTier = getByeTier(byeWeek);
  const fade = getFadeInfo(candidate.name);

  let byeClash = null;
  if (Number.isFinite(byeWeek)) {
    const samePosSameBye = picks.filter(
      (p) => p.position === candidate.position && getByeWeek(p.team) === byeWeek
    );
    if (samePosSameBye.length > 0) {
      byeClash = { week: byeWeek, players: samePosSameBye.map((p) => p.name) };
    }
  }

  let fillsOnesieNeed = false;
  if (candidate.position === 'QB' || candidate.position === 'TE') {
    const cfg = ROSTER_SHAPE.positions[candidate.position];
    const have = picks.filter((p) => p.position === candidate.position).length;
    fillsOnesieNeed = have < cfg.min;
  }

  return {
    byeWeek,
    byeTier,
    isLateBye: isLateBye(byeWeek),
    fade,
    byeClash,
    fillsOnesieNeed,
  };
}
