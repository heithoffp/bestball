// draftScorer.js
// Scoring module for draft picks: returns a utility score + components.
// Designed to integrate with your existing data shapes.

/////////////////////
// Helpers & config
/////////////////////

const DEFAULT_WEIGHTS = {
  alpha: 0.50, // projected value
  beta: 0.30,  // diversification
  gamma: 0.10, // (1 - global exposure)
  delta: 0.10, // strategy fit
  eta: 0.60,   // reach penalty magnitude
  kappa: 1.00  // kills strategy hard penalty
};

const SMOOTH_ALPHA = 1.0; // Laplace smoothing constant for co-occurrence

function clamp01(x) { return Math.max(0, Math.min(1, x)); }
function logistic(x) { return 1 / (1 + Math.exp(-x)); }
function safeNum(x, fallback = NaN) { return Number.isFinite(x) ? x : fallback; }

///////////////////////////////
// Co-occurrence metrics
///////////////////////////////
export function computeCooccurrenceMetrics(playerIndexMap, candidateName, pickNames = [], totalRosters = 0) {
  const alpha = SMOOTH_ALPHA;
  const candidateSet = playerIndexMap.get(candidateName) || new Set();
  const candidateCount = candidateSet.size;

  let sumP_given_pick = 0;
  let sumPick_given_candidate = 0;
  let comparisons = 0;

  // aggregated cells for stability (across picks)
  let totalN11 = 0;
  let totalN10 = 0;
  let totalN01 = 0;
  let totalN00 = 0;

  for (const pickName of pickNames) {
    const pickSet = playerIndexMap.get(pickName) || new Set();
    const pickCount = pickSet.size;

    // intersection
    let intersection = 0;
    if (pickCount === 0 || candidateCount === 0) {
      intersection = 0;
    } else if (pickCount < candidateCount) {
      pickSet.forEach(rid => { if (candidateSet.has(rid)) intersection++; });
    } else {
      candidateSet.forEach(rid => { if (pickSet.has(rid)) intersection++; });
    }

    const N11 = intersection;
    const N10 = Math.max(0, candidateCount - N11);
    const N01 = Math.max(0, pickCount - N11);
    const N00 = Math.max(0, (totalRosters || 0) - (N11 + N10 + N01));

    // smoothed conditionals
    const p_given_pick = (N11 + alpha) / (Math.max(pickCount, 0) + alpha * 2);
    const pick_given_candidate = (N11 + alpha) / (Math.max(candidateCount, 0) + alpha * 2);

    sumP_given_pick += p_given_pick;
    sumPick_given_candidate += pick_given_candidate;
    comparisons++;

    totalN11 += N11;
    totalN10 += N10;
    totalN01 += N01;
    totalN00 += N00;
  }

  const avgP_given_pick = comparisons > 0 ? (sumP_given_pick / comparisons) : 0;
  const avgPick_given_candidate = comparisons > 0 ? (sumPick_given_candidate / comparisons) : 0;

  // Jaccard using aggregated cells
  const jaccard = (totalN11) / Math.max(1, (totalN11 + totalN10 + totalN01));

  // Phi (binary Pearson) using aggregated cells
  const N1dot = totalN11 + totalN10;
  const N0dot = totalN01 + totalN00;
  const Ndot1 = totalN11 + totalN01;
  const Ndot0 = totalN10 + totalN00;
  let phi = 0;
  const denom = Math.sqrt(Math.max(0, N1dot * N0dot * Ndot1 * Ndot0));
  if (denom > 0) {
    phi = ((totalN11 * totalN00) - (totalN10 * totalN01)) / denom;
    phi = Math.max(-1, Math.min(1, phi));
  } else {
    phi = 0;
  }

  return {
    avgP_given_pick,           // [0..1] smoothed
    avgPick_given_candidate,   // [0..1] smoothed
    jaccard,                   // [0..1]
    phi,                       // [-1..1]
    totals: { totalN11, totalN10, totalN01, totalN00, comparisons, candidateCount, totalRosters }
  };
}

///////////////////////////////
// Strategy fit helper
///////////////////////////////
// If checkStrategyViability is provided, call it; otherwise fallback to naive position-match.
function computeStrategyFit(candidate, strategyStatus = {}, currentPicks = [], currentRound = 1, checkStrategyViability = null) {
  // If a viability checker is provided, treat fit as binary 1/0 and small gradation
  try {
    if (typeof checkStrategyViability === 'function' && strategyStatus) {
      // try to use the locked keys if present to decide fit
      const pickCandidate = { ...candidate, round: currentRound, position: candidate.position };
      // If any locked strategy would be killed by adding this candidate, return 0
      const locked = strategyStatus.lockedStrategy;
      if (locked) {
        const viable = checkStrategyViability(locked.key, [...currentPicks, pickCandidate], currentRound);
        return viable ? 1.0 : 0.0;
      }
      // otherwise, query candidate's strategy viability for top candidates in strategyStatus.viableRB
      // fallback: if candidate matches a needed position in the current plan, return 1
      return 1.0;
    }
  } catch (e) {
    // fallback path
  }

  // naive fallback: if position is required by strategy (simple heuristic), return 1.0 else 0.6
  // we can't know required position when check function isn't provided, so be permissive
  return 0.6;
}

///////////////////////////////
// Reach penalty
///////////////////////////////
function reachPenalty(candidateAdp, referenceAdp, opts = {}) {
  // referenceAdp typically currentOverallPick
  // delta positive if candidate ADP is later number (higher pick number) — we want delta = referenceAdp - candidateAdp if "reach earlier"
  // but earlier ADP number is smaller value; we'll compute reachDistance = referenceAdp - candidateAdp (positive => reaching earlier)
  const candidate = Number.isFinite(candidateAdp) ? candidateAdp : Infinity;
  const reference = Number.isFinite(referenceAdp) ? referenceAdp : NaN;
  if (!Number.isFinite(reference) || !Number.isFinite(candidate)) return 0;

  const reachDistance = reference - candidate; // positive => you are reaching earlier than ADP
  // Soft thresholding: no penalty up to tau, then logistic increase
  const tau = opts.tau ?? 6; // soft threshold in picks
  const scale = opts.scale ?? 3;
  const x = (reachDistance - tau) / scale;
  return clamp01(logistic(x)); // returns near 0 when reachDistance <= tau, near 1 when much larger
}

///////////////////////////////
// Value projection normalization
///////////////////////////////
function computeProjectedValueScore(candidate, sliceCandidates = []) {
  // Preferred: candidate.projectedPoints exists and sliceCandidates provides min/max
  const proj = safeNum(candidate.projectedPoints, NaN) || safeNum(candidate.projectedPoint, NaN) || NaN;
  if (Number.isFinite(proj) && Array.isArray(sliceCandidates) && sliceCandidates.length > 0) {
    let minP = Infinity, maxP = -Infinity;
    for (const c of sliceCandidates) {
      const p = safeNum(c.projectedPoints, safeNum(c.projectedPoint, NaN));
      if (Number.isFinite(p)) {
        minP = Math.min(minP, p);
        maxP = Math.max(maxP, p);
      }
    }
    if (minP === Infinity || maxP === -Infinity || minP === maxP) {
      // fallback simple logistic mapping using proj and no range
      return clamp01(logistic((proj - 10) / 5)); // arbitrary centering if unknown range
    }
    return clamp01((proj - minP) / (maxP - minP));
  }

  // Fallback using ADP (_sortAdp is earlier in your code)
  const adp = safeNum(candidate.adpPick, safeNum(candidate._sortAdp, NaN));
  if (!Number.isFinite(adp) || !Array.isArray(sliceCandidates) || sliceCandidates.length === 0) {
    return 0.5; // neutral when no info
  }
  // Use slice ADP distribution to compute relative value: earlier ADP (smaller number) -> higher score
  let minAdp = Infinity, maxAdp = -Infinity;
  for (const c of sliceCandidates) {
    const a = safeNum(c.adpPick, safeNum(c._sortAdp, NaN));
    if (Number.isFinite(a)) {
      minAdp = Math.min(minAdp, a);
      maxAdp = Math.max(maxAdp, a);
    }
  }
  if (!Number.isFinite(minAdp) || !Number.isFinite(maxAdp) || minAdp === maxAdp) return 0.5;
  // earlier ADP -> higher score, so invert
  const raw = 1 - (adp - minAdp) / (maxAdp - minAdp);
  return clamp01(raw);
}

///////////////////////////////
// Diversification combine
///////////////////////////////
function computeDiversificationScore(coMetrics, smallSampleGuard = false) {
  // coMetrics.avgP_given_pick in [0..1] (smaller is better)
  // coMetrics.phi in [-1..1] (negative good)
  // We'll combine as: 0.6*(1 - normP) + 0.4*normPhiNeg
  // normalize avgP_given_pick: map from 0..0.5 typical range to 0..1; clamp
  const rawP = clamp01(coMetrics.avgP_given_pick); // usually small
  // interpret 0..0.3 as linear; beyond that clamp
  const normP = clamp01(rawP / 0.3);

  // phi: -1..1 -> prefer negative values; map -0.2 -> 1 (strongly anti-corr), 0.2 -> 0 (strongly corr)
  const phi = coMetrics.phi ?? 0;
  const normPhiNeg = clamp01((0.2 - phi) / 0.4); // phi = -0.2 -> 1, phi = 0.2 -> 0

  let score = 0.6 * (1 - normP) + 0.4 * normPhiNeg;

  // small sample guard: if comparisons small, downweight diversification toward neutral 0.5
  if (smallSampleGuard) {
    const comparisons = (coMetrics.totals && coMetrics.totals.comparisons) || 0;
    if (comparisons < 3) {
      const weight = comparisons / 3; // 0..1
      score = score * weight + 0.5 * (1 - weight);
    }
  }

  return clamp01(score);
}

///////////////////////////////
// Main scorer
///////////////////////////////
export function scoreCandidate(candidate, options = {}) {
  // options expected:
  // {
  //   currentPicks, playerIndexMap, totalRosters, currentRound, draftSlot,
  //   referenceAdp (currentOverallPick), strategyStatus, checkStrategyViability,
  //   sliceCandidates (array to compute normalization), weights (override default)
  // }
  const {
    currentPicks = [],
    playerIndexMap = new Map(),
    totalRosters = 0,
    currentRound = 1,
    draftSlot = 1,
    referenceAdp = NaN,
    strategyStatus = {},
    checkStrategyViability = null,
    sliceCandidates = [],
    weights = DEFAULT_WEIGHTS
  } = options;

  // 1) Projected value score
  const V_proj = computeProjectedValueScore(candidate, sliceCandidates);

  // 2) Co-occurrence metrics
  const pickNames = currentPicks.map(p => p.name);
  const co = computeCooccurrenceMetrics(playerIndexMap, candidate.name, pickNames, totalRosters);
  const smallSample = (co.totals && co.totals.comparisons < 3) || totalRosters < 50;
  const D_div = computeDiversificationScore(co, smallSample);

  // 3) global exposure penalty (0..1)
  const globalExposure = (Number.isFinite(totalRosters) && totalRosters > 0) ? ( (candidate.totalGlobalCount || 0) / totalRosters ) : 0;
  const globalScore = clamp01(1 - globalExposure); // higher is better when underexposed

  // 4) strategy fit (0..1)
  const S_fit = computeStrategyFit(candidate, strategyStatus, currentPicks, currentRound, checkStrategyViability);

  // 5) reach penalty
  const candidateAdp = Number.isFinite(candidate.adpPick) ? candidate.adpPick : Number.isFinite(candidate._sortAdp) ? candidate._sortAdp : NaN;
  const R_reach = reachPenalty(candidateAdp, referenceAdp, { tau: 6, scale: 3 });

  // 6) kills strategy
  let K_kills = 0;
  try {
    if (typeof checkStrategyViability === 'function' && strategyStatus) {
      // If adding candidate would break any locked strategy, mark kills
      const nextPicks = [...currentPicks, { ...candidate, round: currentRound, position: candidate.position }];
      const structural = strategyStatus.viableRB || []; // defensive
      // if any lockedStrategy exists and is violated, set kills
      if (strategyStatus.lockedStrategy) {
        if (!checkStrategyViability(strategyStatus.lockedStrategy.key, nextPicks, currentRound)) K_kills = 1;
      }
      // otherwise we can also test other axes if present in strategyStatus
    }
  } catch (e) {
    K_kills = 0;
  }

  // Compose utility
  const w = { ...DEFAULT_WEIGHTS, ...(weights || {}) };

  const U = (
    w.alpha * V_proj +
    w.beta * D_div +
    w.gamma * globalScore +
    w.delta * S_fit -
    w.eta * R_reach -
    w.kappa * K_kills
  );

  const U_clamped = clamp01(U); // keep inside [0,1] for consistency

  return {
    utility: U_clamped,
    components: {
      V_proj, D_div, globalScore, S_fit, R_reach, K_kills,
      coMetrics: co
    }
  };
}
