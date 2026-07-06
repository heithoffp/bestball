// src/utils/podAdvance.js
// Pod-exact advance model over a captured draft board — the single source of
// truth shared by the Draft Board modal and the Roster Viewer's Adv % column,
// so the same board always yields the same number in both places.
//
// Every seat on the board is a known opponent: each is simulated from its real
// picks' projections (computeRosterOutlook) and advance odds come from the
// Poisson-binomial pod model (podAdvanceProbabilities), not the portfolio
// field model. Determinism matters — seeds derive from draftId + slot, so
// re-renders and both call sites agree to the decimal.

import { canonicalName } from './helpers';
import {
  computeRosterOutlook,
  podAdvanceProbabilities,
  scoringForPlatform,
  advanceStructureFor,
  REGULAR_SEASON_WEEKS,
} from './advanceModel';
import { BYE_WEEKS_2026 } from '../data/byeWeeks';

/**
 * Derive the full pod model for one captured board.
 *
 * @param {{draftId?: string, slateTitle?: string|null, entryCount?: number,
 *          rounds?: number, picks: Array<object>}} board
 * @param {{rosterPlayers?: Array<{name: string}>, tournamentTitle?: string|null,
 *          adpByPlatform?: object|null, actuals?: object|null}} [opts]
 *   rosterPlayers — the user's synced roster, used to locate their seat by
 *   name overlap; tournamentTitle — the roster's tournament (boards whose
 *   slate_title is a plain slate name resolve structure through it).
 * @returns {{entryCount: number, rounds: number, slots: number[],
 *            byRoundSlot: Object<number, Object<number, object>>,
 *            playersBySlot: Object<number, Array<object>>,
 *            structure: object, outlookBySlot: Object<number, object>,
 *            advBySlot: Array<number|null>, userSlot: number|null}}
 *   advBySlot is aligned to `slots` (index i ↔ slot i+1); the user's own
 *   pod-exact advance odds are `userSlot != null ? advBySlot[userSlot - 1] : null`.
 */
export function derivePodModel(board, {
  rosterPlayers = [],
  tournamentTitle = null,
  adpByPlatform = null,
  actuals = null,
} = {}) {
  const udAdpMap = adpByPlatform?.underdog?.latestAdpMap ?? {};
  const projMap = adpByPlatform?.underdog?.projPointsMap ?? {};
  const entryCount = board.entryCount || 12;
  const rounds = board.rounds || Math.ceil(board.picks.length / entryCount);

  const byRoundSlot = {};
  const playersBySlot = {};
  for (const p of board.picks) {
    const round = p.round ?? (p.pick ? Math.ceil(p.pick / entryCount) : null);
    if (round == null || p.slot == null) continue;
    const key = p.name ? canonicalName(p.name) : null;
    const latestADP = key && udAdpMap[key] ? udAdpMap[key].pick : null;
    const enriched = {
      ...p,
      round,
      latestADP: Number.isFinite(latestADP) ? latestADP : null,
      projectedPoints: (key && projMap[key]) || null,
    };
    (byRoundSlot[round] ??= {})[p.slot] = enriched;
    (playersBySlot[p.slot] ??= []).push(enriched);
  }

  const slots = Array.from({ length: entryCount }, (_, i) => i + 1);

  // Season outlook per seat: lineup-aware projection plus banked actuals.
  // Seats where under half the picks resolved a projection stay unmodeled
  // rather than scoring a fake low.
  const slateTitle = board.slateTitle || '';
  const platform = slateTitle.startsWith('DK') ? 'draftkings' : 'underdog';
  const superflex = slateTitle.toLowerCase().includes('superflex');
  // Board slate_title carries the platform's tournament name ("The Big
  // Board"); the roster's tournamentTitle is checked too for boards whose
  // title is a plain slate name.
  const structure = advanceStructureFor(slateTitle, tournamentTitle || slateTitle);
  const outlookBySlot = {};
  const advOutlookBySlot = {};
  for (const slot of slots) {
    const players = playersBySlot[slot] ?? [];
    if (players.length === 0) continue;
    const resolved = players.filter(p => p.projectedPoints > 0).length;
    if (resolved < players.length / 2) continue;
    outlookBySlot[slot] = computeRosterOutlook(players, {
      scoring: scoringForPlatform(platform, slateTitle),
      actuals,
      superflex,
      sims: 200,
      seedKey: `${board.draftId || ''}-${slot}`,
      byeWeeks: BYE_WEEKS_2026,
    });
    // Advance odds run on the tournament's own horizon (Eliminator: Week 1
    // alone decides the 6-of-12 cut); the displayed Proj stays season-long.
    advOutlookBySlot[slot] = structure.totalWeeks === REGULAR_SEASON_WEEKS
      ? outlookBySlot[slot]
      : computeRosterOutlook(players, {
          scoring: scoringForPlatform(platform, slateTitle),
          actuals,
          superflex,
          totalWeeks: structure.totalWeeks,
          sims: 200,
          seedKey: `${board.draftId || ''}-${slot}`,
          byeWeeks: BYE_WEEKS_2026,
        });
  }

  // Every seat is a known opponent, so advance odds come from the pod-exact
  // model (Poisson-binomial), not the portfolio field model.
  const seatDists = slots.map(slot => {
    const o = advOutlookBySlot[slot];
    if (!o || !(o.weeklyMean > 0)) return null;
    return {
      mean: o.actualPoints + o.remainingWeeks * o.weeklyMean,
      sd: o.weeklySd * Math.sqrt(o.remainingWeeks),
    };
  });
  const advBySlot = podAdvanceProbabilities(seatDists, { advanceSpots: structure.advanceSpots });

  // Locate the user's seat by name overlap with their synced roster.
  const userNames = new Set((rosterPlayers ?? []).map(p => canonicalName(p.name)));
  let userSlot = null;
  let bestOverlap = 0;
  for (const slot of slots) {
    const players = playersBySlot[slot] ?? [];
    const overlap = players.filter(p => p.name && userNames.has(canonicalName(p.name))).length;
    if (overlap > bestOverlap) { bestOverlap = overlap; userSlot = slot; }
  }
  // Demand a real match — over half the column — before claiming a slot as "you".
  if (userSlot != null && bestOverlap <= (playersBySlot[userSlot]?.length ?? 0) / 2) userSlot = null;

  return { entryCount, rounds, slots, byRoundSlot, playersBySlot, structure, outlookBySlot, advBySlot, userSlot };
}

/**
 * The user's own pod-exact advance probability for a board, or null when
 * their seat can't be located or the pod is unmodeled.
 */
export function userPodAdvance(board, opts) {
  const pod = derivePodModel(board, opts);
  return pod.userSlot != null ? (pod.advBySlot[pod.userSlot - 1] ?? null) : null;
}
