// scripts/lib/digest/assemble.mjs
//
// PURE digest logic — no I/O. Given a user's roster data, ADP context, and last
// week's snapshot, produce the data model the template renders, plus the snapshot
// to persist for next week's diff.
//
// Design principle (mirror, not advisor): every field DESCRIBES portfolio state.
// No prescriptive language is produced here or in the template.

import { processMasterList } from '../../../best-ball-manager/src/utils/helpers.js';
import { analyzeRosterStacks } from '../../../best-ball-manager/src/utils/stackAnalysis.js';
import { classifyRosterPath, ARCHETYPE_METADATA } from '../../../best-ball-manager/src/utils/rosterArchetypes.js';

// ── Tunable thresholds (starting values; see TASK-188 plan) ───────────────────
export const THRESHOLDS = {
  newRosterDays: 7,         // a roster synced within N days counts as "new"
  exposureShiftPts: 5,      // |Δ exposure| in percentage points to surface
  adpMovePct: 0.10,         // position-normalized ADP move to surface for owned players
  adpMoveFloorPicks: 2,     // absolute floor so top-of-board noise is ignored
};

export const SITE = 'https://bestballexposures.com';

// Tabs that are Pro-locked for free users (deep-link targets for teasers/CTAs).
const LOCKED_TABS = {
  combos: { path: '/combos', label: 'Combo Analysis' },
  rosters: { path: '/rosters', label: 'Roster Viewer' },
  exposures: { path: '/exposures', label: 'Exposure Analysis' },
  adp: { path: '/adp-tracker', label: 'ADP Tracker' },
};

const PLATFORMS = ['underdog', 'draftkings'];

function platformOf(slateTitle) {
  return slateTitle && String(slateTitle).startsWith('DK') ? 'draftkings' : 'underdog';
}

/** Group flat roster rows into { entry_id -> players[] }. */
function groupByEntry(rosters) {
  const map = new Map();
  for (const r of rosters) {
    if (!map.has(r.entry_id)) map.set(r.entry_id, []);
    map.get(r.entry_id).push(r);
  }
  return map;
}

/**
 * Build the digest for a single user.
 *
 * @param {object} input
 *   - tier: 'free' | 'pro'
 *   - rosters: flat picks [{ name, position, team, entry_id, pick, round, slateTitle }]
 *   - entries: [{ entry_id, synced_at, slate_title }] (for new-roster detection)
 *   - priorSnapshot: previous digest_snapshots.summary | null
 *   - adp: { underdog: PlatformAdp, draftkings: PlatformAdp } from loadAdp
 *   - blog: { title, url } | null
 *   - now: Date
 * @returns {{ mode, subject, model, snapshot }}
 */
export function buildDigest({ tier, rosters = [], entries = [], priorSnapshot = null, adp = {}, blog = null, now = new Date() }) {
  const isFree = tier !== 'pro';

  // ── Per-platform exposure + ADP history via the app's own pipeline ──────────
  const players = [];
  for (const platform of PLATFORMS) {
    const pf = rosters.filter((r) => platformOf(r.slateTitle) === platform);
    if (pf.length === 0) continue;
    const platformAdp = adp[platform] || { adpMap: {}, snapshots: [] };
    const list = processMasterList(pf, platformAdp.adpMap, 12, platformAdp.snapshots);
    for (const p of list) if (p.count > 0) players.push({ ...p, platform });
  }

  const rosterCount = new Set(rosters.map((r) => r.entry_id)).size;

  // ── Signal 1: new rosters synced in the last N days ─────────────────────────
  const cutoff = now.getTime() - THRESHOLDS.newRosterDays * 86400000;
  const newRosterCount = entries.filter((e) => {
    const t = e.synced_at ? new Date(e.synced_at).getTime() : 0;
    return t >= cutoff;
  }).length;

  // ── Signal 2: exposure shifts vs last week's snapshot ───────────────────────
  const priorExp = (priorSnapshot && priorSnapshot.exposures) || {};
  const exposureShifts = [];
  for (const p of players) {
    const key = p.name.toLowerCase();
    const toPct = Number(p.exposure);
    const fromPct = key in priorExp ? Number(priorExp[key]) : null;
    if (fromPct === null) continue;
    const delta = toPct - fromPct;
    if (Math.abs(delta) >= THRESHOLDS.exposureShiftPts) {
      exposureShifts.push({ name: p.name, fromPct, toPct, delta });
    }
  }
  exposureShifts.sort((a, b) => Math.abs(b.delta) - Math.abs(a.delta));

  // ── Signal 3: ADP movers among players the user owns (normalized %) ──────────
  const ownedMovers = [];
  for (const p of players) {
    const mv = lastMoveFromHistory(p.history);
    if (!mv) continue;
    const absMove = Math.abs(mv.fromPick - mv.toPick);
    const pct = absMove / mv.fromPick;
    if (absMove >= THRESHOLDS.adpMoveFloorPicks && pct >= THRESHOLDS.adpMovePct) {
      ownedMovers.push({
        name: p.name,
        platform: p.platform,
        exposure: Number(p.exposure),
        fromPick: mv.fromPick,
        toPick: mv.toPick,
        pct,
        direction: mv.toPick < mv.fromPick ? 'riser' : 'faller',
      });
    }
  }
  ownedMovers.sort((a, b) => b.pct - a.pct);

  // ── Routing: any personal signal => personalized, else general (never skip) ──
  const hasSignal = newRosterCount > 0 || exposureShifts.length > 0 || ownedMovers.length > 0;
  const mode = hasSignal ? 'personalized' : 'general';

  // ── Supporting context for rendering ────────────────────────────────────────
  const topExposures = players
    .slice()
    .sort((a, b) => Number(b.exposure) - Number(a.exposure))
    .slice(0, 8)
    .map((p) => ({ name: p.name, pct: Number(p.exposure), position: p.position, team: p.team }));

  const archetypeMix = computeArchetypeMix(rosters);
  const stackCount = countAccidentalStacks(rosters);

  const leagueMovers = mergeLeagueMovers(adp);

  // ── Teaser (free only) — strongest-signal rotation ──────────────────────────
  const teaser = isFree
    ? selectTeaser({ mode, stackCount, topExposures, archetypeMix, ownedMovers })
    : null;

  const model = {
    mode,
    tier: isFree ? 'free' : 'pro',
    rosterCount,
    newRosterCount,
    exposureShifts: exposureShifts.slice(0, 6),
    ownedMovers: ownedMovers.slice(0, 6),
    topExposures,
    archetypeMix,
    leagueMovers,
    teaser,
    blog,
    seasonalFooter: isFree,
  };

  const subject = buildSubject(model);

  // Snapshot to persist (for next week's exposure diff).
  const exposures = {};
  for (const p of players) exposures[p.name.toLowerCase()] = Number(p.exposure);

  return { mode, subject, model, snapshot: { rosterCount, exposures } };
}

/** Last meaningful move from an aligned history array (latest two non-null picks). */
function lastMoveFromHistory(history = []) {
  const picks = history.filter((h) => Number.isFinite(h.adpPick));
  if (picks.length < 2) return null;
  return { fromPick: picks[picks.length - 2].adpPick, toPick: picks[picks.length - 1].adpPick };
}

/** RB-archetype distribution across the portfolio (descending by count). */
function computeArchetypeMix(rosters) {
  const byEntry = groupByEntry(rosters);
  const counts = {};
  for (const roster of byEntry.values()) {
    const { rb } = classifyRosterPath(roster);
    counts[rb] = (counts[rb] || 0) + 1;
  }
  const total = byEntry.size || 1;
  return Object.entries(counts)
    .map(([key, count]) => ({
      label: ARCHETYPE_METADATA[key]?.name || key,
      count,
      pct: Math.round((count / total) * 100),
    }))
    .sort((a, b) => b.count - a.count);
}

/** Count rosters containing a QB-correlated stack (priority >= 90). */
function countAccidentalStacks(rosters) {
  let n = 0;
  for (const roster of groupByEntry(rosters).values()) {
    if (analyzeRosterStacks(roster).some((s) => s.priority >= 90)) n += 1;
  }
  return n;
}

function mergeLeagueMovers(adp) {
  const risers = [];
  const fallers = [];
  for (const platform of PLATFORMS) {
    const m = adp[platform]?.movers;
    if (!m) continue;
    for (const r of m.risers) risers.push({ ...r, platform });
    for (const f of m.fallers) fallers.push({ ...f, platform });
  }
  risers.sort((a, b) => b.pct - a.pct);
  fallers.sort((a, b) => b.pct - a.pct);
  return { risers: risers.slice(0, 5), fallers: fallers.slice(0, 5) };
}

/**
 * Pick the single most striking Pro-locked insight to tease, scored so the
 * strongest signal wins (strongest-signal rotation). Each candidate maps to a
 * locked tab deep-link.
 */
export function selectTeaser({ mode, stackCount, topExposures, archetypeMix, ownedMovers }) {
  const candidates = [];

  if (stackCount > 0) {
    candidates.push({
      score: stackCount * 20,
      key: 'combos',
      title: `${stackCount} QB stack${stackCount === 1 ? '' : 's'} across your portfolio`,
      body: `${stackCount} of your rosters pair a QB with a teammate pass-catcher.`,
    });
  }

  const topExp = topExposures[0];
  if (topExp) {
    candidates.push({
      score: topExp.pct,
      key: 'exposures',
      title: `Your highest exposure: ${topExp.name} at ${topExp.pct}%`,
      body: `${topExp.name} appears on ${topExp.pct}% of your rosters.`,
    });
  }

  const topArch = archetypeMix[0];
  if (topArch) {
    candidates.push({
      score: topArch.pct,
      key: 'rosters',
      title: `${topArch.pct}% of your builds are ${topArch.label}`,
      body: `Your most common roster archetype is ${topArch.label}.`,
    });
  }

  const topMover = ownedMovers[0];
  if (topMover) {
    candidates.push({
      score: Math.round(topMover.pct * 100),
      key: 'adp',
      title: `${topMover.name}'s ADP is ${topMover.direction === 'riser' ? 'rising' : 'falling'}`,
      body: `${topMover.name} moved from ${topMover.fromPick.toFixed(1)} to ${topMover.toPick.toFixed(1)}.`,
    });
  }

  // General mode with no personal candidates: fall back to a generic locked tease.
  if (candidates.length === 0) {
    candidates.push({
      score: 0,
      key: 'combos',
      title: 'See your stacks, archetypes, and combos',
      body: 'Pro unlocks the full portfolio analytics suite for your synced rosters.',
    });
  }

  candidates.sort((a, b) => b.score - a.score);
  const best = candidates[0];
  const tab = LOCKED_TABS[best.key];
  return {
    title: best.title,
    body: best.body,
    ctaText: `Open ${tab.label}`,
    ctaUrl: `${SITE}${tab.path}`,
  };
}

function buildSubject(model) {
  if (model.mode === 'personalized') {
    if (model.ownedMovers.length > 0) {
      const m = model.ownedMovers[0];
      return `${m.name}'s ADP is moving — and you own ${model.rosterCount} rosters`;
    }
    if (model.newRosterCount > 0) {
      return `Your week in best ball — ${model.newRosterCount} new draft${model.newRosterCount === 1 ? '' : 's'}`;
    }
    return `Your portfolio shifted this week — ${model.rosterCount} rosters`;
  }
  return 'ADP movers this week in best ball';
}
