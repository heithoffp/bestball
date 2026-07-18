// selfOverlay.js — recognize and excise our OWN expanded Live Activity when it
// is captured over a draft room (TASK-329, shared by both platform parsers as
// of TASK-350). Ingesting the overlay feeds our output back into the parser —
// target names read as visible available rows and resurrect drafted players,
// and the glance headline reads as a header ticker. The expanded panel is a
// top-anchored card, so the signals bound an excision region rather than
// poisoning the whole frame.
// Pure JS — no React Native imports.

export const SELF_PATTERNS = {
  // "synced … ago" left the card in TASK-337; kept for replaying frame logs
  // recorded by older builds.
  selfSynced: /^synced\b/i,
  // Legacy long-form flags plus the TASK-336 compact flag glyphs ("SP", "QF")
  // — pre-TASK-337 replay compatibility. "SF" is excluded — it's a real team
  // abbreviation, not one of our flags.
  selfFlag: /^(FALLING|STACK|QUEUE RISK|\d+% OWNED|(?!SF$)[SPQF]{2,4})$/,
  // TASK-337 table: the P·S·C·E header strip (one per grid column; OCR may
  // merge both strips into one line or squeeze the spaces out)...
  selfTableHeader: /^P\s*S\s*C\s*E(\s+P\s*S\s*C\s*E)?$/,
  // ...and metric-cell runs: two or more tokens drawn ONLY from the table
  // vocabulary — playoff weeks ("16", "15+"), check/dash glyphs, percents —
  // e.g. "16 ✓ 24% 10%", "– – 9% 8%". A lone "15" or "9%" is deliberately
  // NOT a signal: it could be real screen content and would stretch the
  // excision region downward over live rows.
  selfTableCells: /^(?:1[567]\+?|[✓√]|[–—-]|\d{1,2}%)(?:\s+(?:1[567]\+?|[✓√]|[–—-]|\d{1,2}%))+$/,
  // Separator garbles observed on device: "·" reads as "•", ".", or "-";
  // zeros read as the letter "O" and may merge into the label ("QBO - RB O");
  // the leading "Q" itself can garble ("2BO - RB O", DK corpus
  // frames-1784385816 #17). The RB/WR/TE tail is the real signature, so the
  // leading token only needs to be QB-shaped. A missed roster bar shrinks the
  // excision region and our own target rows survive as "visible" player rows
  // (frames-1784120786 #1/#5).
  selfRosterBar: /^\W{0,2}[A-Z0-9]{1,3}\s*[0-9O]*\s*[·•.-]\s*RB\s*[0-9O]+\s*[·•.-]\s*WR\s*[0-9O]+\s*[·•.-]\s*TE\s*[0-9O]+$/,
  // Glance headlines are sentence case; Underdog renders its header ALL-CAPS,
  // so the case-sensitive match cannot swallow a real "UP IN 4 PICKS".
  // Observed garbles keep the lowercase body but mangle the leading capital
  // and truncate ("fou're on the clo....", "fracking • R1 • P1").
  selfHeadline: /^(Up in \d{1,2} picks?$|[A-Za-z]?ou'?re (on the clo|up next)|Waiting for capture to start$|[A-Za-z]?aiting to enter draft|[A-Za-z]?eft draft room|Draft complete$|Session ended$|[A-Za-z]?racking\s*[·•.]\s*R\d+\s*[·•.]\s*P\d+$)/,
  selfBrand: /^BB ?EXPOSURES$/i,
  // The card's compact position line ("P1 • R1", "R2 • P14") — observed as
  // its own OCR line over the DK draft room (frames-1784385816 #8/#17).
  selfPickLine: /^[PR]\d{1,2}\s*[·•.]\s*[PR]\d{1,2}$/,
  // Merged-form glance target row: "RB · Jaylen Warren · FALLING".
  selfTargetRow: /^(QB|RB|WR|TE)\s*[·•.]\s+\S/,
};

// Weak signals: individually ambiguous, two distinct kinds mark the overlay.
const WEAK_KINDS = [
  'selfFlag', 'selfTableCells', 'selfRosterBar', 'selfHeadline', 'selfBrand',
  'selfPickLine', 'selfTargetRow',
];

function isSignal(l) {
  return SELF_PATTERNS.selfSynced.test(l.text)
    || SELF_PATTERNS.selfFlag.test(l.text)
    || SELF_PATTERNS.selfTableHeader.test(l.text)
    || SELF_PATTERNS.selfTableCells.test(l.text)
    || SELF_PATTERNS.selfRosterBar.test(l.text)
    || SELF_PATTERNS.selfHeadline.test(l.text)
    || SELF_PATTERNS.selfBrand.test(l.text)
    || SELF_PATTERNS.selfPickLine.test(l.text)
    || SELF_PATTERNS.selfTargetRow.test(l.text);
}

/**
 * Excise the self-overlay region from normalized lines. One strong signal
 * ("synced … ago" / the P·S·C·E header strip — nothing on a real draft screen
 * renders either) or two weak kinds marks the overlay. Everything at or above
 * the lowest signal is our own output — drop that region and parse what
 * remains below. Discarding the whole frame froze capture for as long as the
 * panel stayed expanded (TASK-329); callers return kind 'self' only when
 * nothing usable is left after excision.
 *
 * @returns {{ lines: Array, excised: boolean }}
 */
export function exciseSelfOverlay(lines) {
  const strong = lines.some(l => SELF_PATTERNS.selfSynced.test(l.text)
    || SELF_PATTERNS.selfTableHeader.test(l.text));
  const weakKinds = WEAK_KINDS
    .filter(k => lines.some(l => SELF_PATTERNS[k].test(l.text))).length;
  if (!strong && weakKinds < 2) return { lines, excised: false };

  const withBoxes = lines.every(l => l.y != null);
  let out;
  if (withBoxes) {
    const overlayBottom = Math.max(
      ...lines.filter(isSignal).map(l => l.y + (l.h ?? 0)),
    ) + 0.02;
    out = lines.filter(l => l.y >= overlayBottom && !isSignal(l));
  } else {
    // Boxless input is roughly top-to-bottom: drop through the last signal.
    const lastIdx = lines.reduce((acc, l, i) => (isSignal(l) ? i : acc), -1);
    out = lines.slice(lastIdx + 1).filter(l => !isSignal(l));
  }
  return { lines: out, excised: true };
}
