// snake.js — pure snake-draft arithmetic shared by the live-session engine.
// No React Native imports; runs in Node for the fixture tests.

/** Overall pick number -> 1-based round. */
export function roundForOverall(overall, teams = 12) {
  return Math.floor((overall - 1) / teams) + 1;
}

/** Overall pick number -> 1-based pick within its round. */
export function pickInRoundForOverall(overall, teams = 12) {
  return ((overall - 1) % teams) + 1;
}

/** Overall pick number -> the draft slot (1..teams) that owns it. */
export function slotForOverall(overall, teams = 12) {
  const round = roundForOverall(overall, teams);
  const pickInRound = pickInRoundForOverall(overall, teams);
  return round % 2 === 1 ? pickInRound : teams + 1 - pickInRound;
}

/** (round, slot) -> overall pick number. */
export function overallForRoundSlot(round, slot, teams = 12) {
  const pickInRound = round % 2 === 1 ? slot : teams + 1 - slot;
  return (round - 1) * teams + pickInRound;
}

/** All overall pick numbers owned by a slot across the draft. */
export function overallsForSlot(slot, teams = 12, rounds = 18) {
  const out = [];
  for (let r = 1; r <= rounds; r++) out.push(overallForRoundSlot(r, slot, teams));
  return out;
}

/** The slot's next overall pick at/after `fromOverall` (null when draft is over). */
export function nextOverallForSlot(slot, fromOverall, teams = 12, rounds = 18) {
  for (let r = 1; r <= rounds; r++) {
    const o = overallForRoundSlot(r, slot, teams);
    if (o >= fromOverall) return o;
  }
  return null;
}

/**
 * Resolve an OCR'd drafter-card label against its overall pick number.
 * Cards render `round.pickInRound | overall` ("3.8 | 32"); OCR often loses the
 * dot ("310 | 34"). Given the digit string(s) and the overall, find the split
 * that satisfies (round-1)*teams + pickInRound === overall.
 * Returns { round, pickInRound } or null.
 */
export function resolveRoundDotPick(digits, overall, teams = 12) {
  const s = String(digits).replace(/\D/g, '');
  if (!s || !Number.isFinite(overall)) return null;
  for (let k = 1; k < s.length; k++) {
    const round = parseInt(s.slice(0, k), 10);
    const pickInRound = parseInt(s.slice(k), 10);
    if (pickInRound < 1 || pickInRound > teams) continue;
    if ((round - 1) * teams + pickInRound === overall) return { round, pickInRound };
  }
  return null;
}
