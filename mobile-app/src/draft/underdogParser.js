// underdogParser.js — turns OCR output of the Underdog iOS draft room into
// structured observations (ADR-021's "read only what you must" engine).
//
// Input is tolerant: an array of strings (Shortcuts "Extract Text" / the spike
// artifacts) or objects { text, x, y, w, h, confidence } (our Vision module).
// Raw Vision reading order decouples number columns from name rows, so row
// association leans on the *name sequence* plus lookahead, never on zipping
// number streams.
//
// Screen knowledge lives in the PATTERNS table below — the v1 stand-in for the
// remote parse templates; lift to Supabase when templates land.
// Pure JS — no React Native imports.

import { matchPlayer, fuzzyPosition, looksLikeNameLine } from './playerMatcher.js';
import { resolveRoundDotPick } from './snake.js';

const PATTERNS = {
  // "UP IN 2 PICKS" header ticker; on-the-clock variants. "YOUR PICK" must
  // reject the plural: the UD home screen's tagline "Your players. Your
  // picks." sits in the header zone and flashed a false "on the clock" at P1
  // for as long as the user browsed the lobby (frames-1784120786 #2-#11).
  upInPicks: /UP\s+IN\s+(\d{1,2})\s+PICKS?/i,
  onTheClock: /(YOUR\s+PICK(?!S)|ON\s+THE\s+CLOCK|YOU'?RE\s+UP)/i,
  upNext: /\bUP\s+NEXT\b/i,
  // "Your pick: 0:19" carries the pick clock inline in the header.
  yourPickClock: /YOUR\s+PICK\W*?(\d{1,2}):(\d{2})/i,
  // Pre-draft lobby headers.
  lobbySoon: /DRAFTING\s+STARTS\s+SOON/i,
  lobbyCountdown: /DRAFT\s+STARTS\s+IN\s+(\d{1,2}):(\d{2})/i,
  // Carousel drafter-card username: ALL-CAPS, may embed digits ("TIMW1974").
  username: /^[A-Z][A-Z0-9_.\-]{3,19}$/,
  // Unfilled lobby seat placeholder card.
  filled: /^Filled$/i,
  // Pick-confirmation card at the carousel's left edge: "ATL / D. London",
  // or split across two lines ("ATL" then "D. London").
  confirmCardLine: /^([A-Z]{2,3})\s*[/|]\s*([A-Za-z])\.?\s+([A-Za-z'.\-\s…]{2,})$/,
  teamOnly: /^[A-Z]{2,3}$/,
  abbrevName: /^([A-Za-z])\.\s+([A-Za-z'.\-\s…]{2,})$/,
  // Card roster tally under each drafter card: "0 0 1 1" (OCR: "0" -> "O").
  tallyRow: /^[0-9O]\s+[0-9O]\s+[0-9O]\s+[0-9O]$/,
  // Expanded player-detail accordion signatures.
  statsHeader: /^(Rushing|Receiving)$/i,
  draftAction: /^Draft$/,
  // Our own Live Activity, when expanded over the draft room, is captured
  // like any other screen content ("synced 8 sec ago", target rows, the
  // roster bar). Ingesting it feeds our output back into the parser — target
  // names read as visible available rows and resurrect drafted players, and
  // the glance headline reads as the header ticker. The overlay is a
  // top-anchored card, so these signals bound an excision region (TASK-329)
  // rather than poisoning the whole frame.
  selfSynced: /^synced\b/i,
  selfFlag: /^(FALLING|STACK|QUEUE RISK|\d+% OWNED)$/,
  // Separator garbles observed on device: "·" reads as "•", ".", or "-";
  // zeros read as the letter "O" and may merge into the label ("QBO - RB O").
  // A missed roster bar shrinks the excision region and our own target rows
  // survive as "visible" player rows (frames-1784120786 #1/#5).
  selfRosterBar: /^QB\s*[0-9O]+\s*[·•.-]\s*RB\s*[0-9O]+\s*[·•.-]\s*WR\s*[0-9O]+\s*[·•.-]\s*TE\s*[0-9O]+$/,
  // Glance headlines are sentence case; Underdog renders its header ALL-CAPS,
  // so the case-sensitive match cannot swallow a real "UP IN 4 PICKS".
  // Observed garbles keep the lowercase body but mangle the leading capital
  // and truncate ("fou're on the clo....", "fracking • R1 • P1").
  selfHeadline: /^(Up in \d{1,2} picks?$|[A-Za-z]?ou'?re (on the clo|up next)|Waiting for capture to start$|Draft complete$|Session ended$|[A-Za-z]?racking\s*[·•.]\s*R\d+\s*[·•.]\s*P\d+$)/,
  selfBrand: /^BB ?EXPOSURES$/i,
  // Merged-form glance target row: "RB · Jaylen Warren · FALLING".
  selfTargetRow: /^(QB|RB|WR|TE)\s*[·•.]\s+\S/,
  // Drafter card "3.8 | 32" (round.pickInRound | overall); OCR may drop the dot
  // ("310 | 34") or garble the pipe.
  upcomingCard: /(\d[\d.,·]{0,4})\s*[|Il¦]\s*(\d{1,3})\s*$/,
  // Pick clock on the on-the-clock card: "59:50", "0:28", "1hr", "12 min".
  clock: /^(\d{1,2}):(\d{2})$/,
  clockCoarse: /^(\d{1,2})\s*(hr|h|min|m)\.?$/i,
  // Players-tab gold divider: "2 picks away".
  picksAway: /(\d{1,2})\s+picks?\s+away/i,
  // Board cell meta line: "RB - DET (1.1)" (pos may garble: "VR", ":B").
  boardPick: /^\W{0,2}([A-Za-z:;\].]{1,3})\s*[-–]\s*([A-Za-z]{2,3})\s*\(\s*(\d{1,2})[.,·]\s*(\d{1,2})\s*\)\s*$/,
  // Players/Queue row fragments that follow a name line.
  posRank: /^\W{0,2}([A-Za-z:;\]]{1,3})\s*(\d{1,2})$/,
  teamBye: /([A-Z]{2,3})\s*[,.]?\s*Bye\s*(\d{1,2})/i,
  // Queue tab repeats unit labels under each value ("29.5 / ADP / 189.8 / Proj");
  // the Players tab shows "ADP =" / "Proj =" column headers instead.
  unitLabel: /^(ADP|Proj)$/i,
  // Drafter-card roster panel repeats "Pick" under each pick number ("57 /
  // Pick / 9 / Pick"); the real Players list never shows a standalone "Pick".
  rosterPickLabel: /^Pick$/,
};

// ALL-CAPS UI strings that would otherwise pass the username shape test.
const NOT_USERNAMES = new Set([
  'PICKS', 'PICK', 'NEXT', 'DRAFT', 'DRAFTS', 'FILLED', 'PLAYERS', 'QUEUE',
  'BOARD', 'PROJ', 'CLOCK', 'YOUR', 'AUTO', 'BYE', 'RANK',
]);

/** ALL-CAPS username shape, excluding pos-rank pills ("WR13") and UI words. */
function isUsernameLine(t) {
  if (!PATTERNS.username.test(t)) return false;
  if (/^(QB|RB|WR|TE)\d{0,2}$/.test(t)) return false;
  return !NOT_USERNAMES.has(t.replace(/[^A-Z]/g, ''));
}

/**
 * Recover a card label whose pipe merged into the digits ("1.7 | 7" ->
 * "1.717", "3.6 | 30" -> "3.6130"). The snake identity
 * (round-1)*teams + pickInRound === overall makes false positives rare —
 * decimals like ADP "29.5" or Proj "235.1" can't satisfy it.
 */
function recoverCardOverall(text, teams) {
  const m = String(text).match(/^(\d{1,2})[.,·](\d{2,5})$/);
  if (!m) return null;
  const round = parseInt(m[1], 10);
  if (round < 1 || round > 30) return null;
  const rest = m[2];
  for (let pl = 1; pl <= 2 && pl < rest.length; pl++) {
    const p = parseInt(rest.slice(0, pl), 10);
    if (p < 1 || p > teams) continue;
    for (const junk of ['', '1']) { // the pipe often OCRs as a "1"
      const tail = rest.slice(pl);
      if (junk && !tail.startsWith(junk)) continue;
      const overallStr = junk ? tail.slice(junk.length) : tail;
      if (!overallStr) continue;
      const overall = parseInt(overallStr, 10);
      if ((round - 1) * teams + p === overall) return overall;
    }
  }
  return null;
}

/** Validate a drafter-card label against snake math -> overall (or null). */
function cardLabelOverall(m, teams) {
  const overall = parseInt(m[2], 10);
  if (!Number.isFinite(overall) || overall < 1) return null;
  const dotted = m[1].match(/^(\d{1,2})[.,·](\d{1,2})$/);
  if (dotted) {
    const r = parseInt(dotted[1], 10);
    const p = parseInt(dotted[2], 10);
    if (p >= 1 && p <= teams && (r - 1) * teams + p === overall) return overall;
  }
  return resolveRoundDotPick(m[1], overall, teams) != null ? overall : null;
}

/** Single text fragment -> card-label overall (pipe form or merged form). */
function parseCardLabelText(text, teams) {
  const lbl = text.match(PATTERNS.upcomingCard);
  if (lbl) {
    const overall = cardLabelOverall(lbl, teams);
    if (overall != null) return overall;
  }
  return recoverCardOverall(text, teams);
}

/** Validate a split label pair ("2.7" + "19") against snake math. */
function splitLabelOverall(dottedText, overallText, teams) {
  const dotted = dottedText.match(/^(\d{1,2})[.,·](\d{1,2})$/);
  const ov = overallText.match(/^(\d{1,3})$/);
  if (!dotted || !ov) return null;
  const r = parseInt(dotted[1], 10);
  const p = parseInt(dotted[2], 10);
  const overall = parseInt(ov[1], 10);
  return p >= 1 && p <= teams && (r - 1) * teams + p === overall ? overall : null;
}

function parseTally(text) {
  if (!PATTERNS.tallyRow.test(text)) return null;
  const [qb, rb, wr, te] = text.split(/\s+/).map(v => (v === 'O' ? 0 : parseInt(v, 10)));
  return { QB: qb, RB: rb, WR: wr, TE: te };
}

function centerX(l) {
  return (l.x ?? 0) + (Number.isFinite(l.w) ? l.w / 2 : 0);
}

/**
 * Extract carousel drafter cards: a USERNAME paired with a "r.p | overall"
 * label or an on-the-clock countdown, optionally with a "QB RB WR TE" tally.
 * Board column headers are bare usernames with neither, so the pairing
 * requirement excludes them.
 *
 * When bounding boxes exist the pairing is GEOMETRIC (label directly under
 * the username, x-centers aligned) — the y-then-x line sort interleaves
 * fragments of side-by-side cards, so "the next line" routinely belongs to
 * the neighboring card. Sequential pairing is the boxless fallback.
 */
function extractDrafterCards(lines, teams) {
  const withBoxes = lines.length > 0 && lines.every(l => l.y != null && l.x != null);
  const cards = [];

  if (withBoxes) {
    for (const u of lines) {
      if (!isUsernameLine(u.text)) continue;
      const ucx = centerX(u);
      const near = lines
        .filter(l => l !== u && l.y > u.y && l.y - u.y < 0.05
          && Math.abs(centerX(l) - ucx) < 0.11)
        .sort((a, b) => Math.abs(centerX(a) - ucx) - Math.abs(centerX(b) - ucx));
      let card = null;
      for (const l of near) {
        const overall = parseCardLabelText(l.text, teams);
        if (overall != null) {
          card = { username: u.text, nextOverall: overall, onClock: false, tally: null };
          break;
        }
        if (PATTERNS.clock.test(l.text) || PATTERNS.clockCoarse.test(l.text)) {
          card = { username: u.text, nextOverall: null, onClock: true, tally: null };
          break;
        }
        // Split label: the overall fragment sits immediately right of "r.p".
        const right = lines.find(r => r !== l && Math.abs(r.y - l.y) < 0.02
          && r.x > l.x && r.x - (l.x + (Number.isFinite(l.w) ? l.w : 0)) < 0.06);
        if (right) {
          const overall2 = splitLabelOverall(l.text, right.text, teams);
          if (overall2 != null) {
            card = { username: u.text, nextOverall: overall2, onClock: false, tally: null };
            break;
          }
        }
      }
      if (!card) continue;
      const tallyLine = lines.find(l => l.y > u.y && l.y - u.y < 0.09
        && Math.abs(centerX(l) - ucx) < 0.11 && PATTERNS.tallyRow.test(l.text));
      if (tallyLine) card.tally = parseTally(tallyLine.text);
      cards.push(card);
    }
    return cards;
  }

  const texts = lines.map(l => l.text);
  for (let i = 0; i < texts.length; i++) {
    const t = texts[i];
    if (!isUsernameLine(t)) continue;
    let card = null;
    for (let j = i + 1; j <= Math.min(texts.length - 1, i + 2); j++) {
      const overall = parseCardLabelText(texts[j], teams);
      if (overall != null) {
        card = { username: t, nextOverall: overall, onClock: false, tally: null };
        break;
      }
      if (j + 1 < texts.length) {
        const overall2 = splitLabelOverall(texts[j], texts[j + 1], teams);
        if (overall2 != null) {
          card = { username: t, nextOverall: overall2, onClock: false, tally: null };
          break;
        }
      }
      if (PATTERNS.clock.test(texts[j]) || PATTERNS.clockCoarse.test(texts[j])) {
        card = { username: t, nextOverall: null, onClock: true, tally: null };
        break;
      }
    }
    if (!card) continue;
    for (let j = i + 1; j <= Math.min(texts.length - 1, i + 4); j++) {
      const tally = parseTally(texts[j]);
      if (tally) { card.tally = tally; break; }
    }
    cards.push(card);
  }
  return cards;
}

/**
 * Find the pick-confirmation card ("ATL / D. London" one-line, or team badge
 * above an abbreviated name). Geometric when boxes exist (top 40% of screen,
 * x-aligned); sequential-adjacency fallback for boxless input.
 */
function findConfirmCard(lines) {
  const withBoxes = lines.length > 0 && lines.every(l => l.y != null && l.x != null);
  for (let i = 0; i < lines.length; i++) {
    const n = lines[i];
    if (withBoxes && n.y > 0.4) continue;
    const one = n.text.match(PATTERNS.confirmCardLine);
    if (one) return { team: one[1].toUpperCase(), nameRaw: `${one[2]}. ${one[3]}`, raw: n.text };
    if (withBoxes) {
      if (!PATTERNS.abbrevName.test(n.text)) continue;
      const t = lines.find(l => l !== n && PATTERNS.teamOnly.test(l.text)
        && Math.abs(centerX(l) - centerX(n)) < 0.15
        && n.y - l.y > -0.02 && n.y - l.y < 0.08);
      if (t) return { team: t.text.toUpperCase(), nameRaw: n.text, raw: `${t.text} / ${n.text}` };
    } else if (PATTERNS.teamOnly.test(n.text) && i + 1 < lines.length
      && PATTERNS.abbrevName.test(lines[i + 1].text)) {
      return {
        team: n.text.toUpperCase(),
        nameRaw: lines[i + 1].text,
        raw: `${n.text} / ${lines[i + 1].text}`,
      };
    }
  }
  return null;
}

function normalizeItems(items) {
  const out = [];
  for (const it of items || []) {
    const text = (typeof it === 'string' ? it : it?.text) ?? '';
    const clean = String(text).replace(/￼/g, '').trim();
    if (!clean) continue;
    out.push({
      text: clean,
      x: typeof it === 'object' && Number.isFinite(it?.x) ? it.x : null,
      y: typeof it === 'object' && Number.isFinite(it?.y) ? it.y : null,
      w: typeof it === 'object' && Number.isFinite(it?.w) ? it.w : null,
      h: typeof it === 'object' && Number.isFinite(it?.h) ? it.h : null,
      confidence: typeof it === 'object' && Number.isFinite(it?.confidence) ? it.confidence : null,
    });
  }
  // Vision returns roughly top-to-bottom already; enforce it when boxes exist.
  if (out.length && out.every(i => i.y != null)) {
    out.sort((a, b) => (a.y - b.y) || ((a.x ?? 0) - (b.x ?? 0)));
  }
  return out;
}

/** Parse one OCR'd screen. ctx: { pool, teams }. */
export function parseUnderdogScreen(items, ctx) {
  const { pool, teams = 12 } = ctx || {};
  let lines = normalizeItems(items);

  const obs = {
    kind: 'unknown',
    picksUntil: null,
    onClock: false,
    clockSeconds: null,
    upcomingOveralls: [],
    picksAwayDivider: null,
    boardPicks: [],
    rows: [],
    availability: null,
    queueNames: [],
    drafterCards: [],
    confirmCard: null,
    lobby: false,
    filledCount: 0,
    detailPanel: false,
    rosterPanel: false,
    stats: { lines: lines.length, matchedRows: 0, boardMatches: 0, unmatchedNames: [] },
  };

  // ---- Self-overlay excision: our Live Activity expanded over the draft
  // room. One strong signal ("synced … ago") or two weak kinds (target flag,
  // roster bar, glance headline, brand, merged target row) marks the overlay.
  // The expanded panel is a top-anchored card, so everything at or above the
  // lowest signal is our own output — drop that region and parse what remains
  // below (the Players rows and the "N picks away" divider stay valid).
  // Discarding the whole frame froze capture for as long as the panel stayed
  // expanded (TASK-329); returning 'self' is reserved for frames with nothing
  // usable left after excision (e.g. the overlay over a blurred background).
  {
    const isSignal = l => PATTERNS.selfSynced.test(l.text)
      || PATTERNS.selfFlag.test(l.text)
      || PATTERNS.selfRosterBar.test(l.text)
      || PATTERNS.selfHeadline.test(l.text)
      || PATTERNS.selfBrand.test(l.text)
      || PATTERNS.selfTargetRow.test(l.text);
    const strong = lines.some(l => PATTERNS.selfSynced.test(l.text));
    const weakKinds = ['selfFlag', 'selfRosterBar', 'selfHeadline', 'selfBrand', 'selfTargetRow']
      .filter(k => lines.some(l => PATTERNS[k].test(l.text))).length;
    if (strong || weakKinds >= 2) {
      const withBoxes = lines.every(l => l.y != null);
      if (withBoxes) {
        const overlayBottom = Math.max(
          ...lines.filter(isSignal).map(l => l.y + (l.h ?? 0)),
        ) + 0.02;
        lines = lines.filter(l => l.y >= overlayBottom && !isSignal(l));
      } else {
        // Boxless input is roughly top-to-bottom: drop through the last signal.
        const lastIdx = lines.reduce((acc, l, i) => (isSignal(l) ? i : acc), -1);
        lines = lines.slice(lastIdx + 1).filter(l => !isSignal(l));
      }
      if (lines.length < 4) {
        obs.kind = 'self';
        return obs;
      }
    }
  }
  const texts = lines.map(l => l.text);

  // ---- Header signals (any tab) ----
  for (const ln of lines) {
    const t = ln.text;
    const up = t.match(PATTERNS.upInPicks);
    if (up) obs.picksUntil = parseInt(up[1], 10);
    // "On the clock" also renders inside the current pick's BOARD CELL for
    // whoever is picking — only the header zone means the USER is on the clock.
    else if (PATTERNS.onTheClock.test(t) && (ln.y == null || ln.y < 0.12)) {
      obs.onClock = true;
      obs.picksUntil = 0;
      const yc = t.match(PATTERNS.yourPickClock);
      if (yc) obs.clockSeconds = parseInt(yc[1], 10) * 60 + parseInt(yc[2], 10);
    } else if (obs.picksUntil == null && PATTERNS.upNext.test(t)) obs.picksUntil = 1;

    if (PATTERNS.lobbySoon.test(t) || PATTERNS.lobbyCountdown.test(t)) obs.lobby = true;
    if (PATTERNS.filled.test(t)) obs.filledCount++;

    const away = t.match(PATTERNS.picksAway);
    if (away) obs.picksAwayDivider = parseInt(away[1], 10);

    const clk = t.match(PATTERNS.clock);
    if (clk) obs.clockSeconds = parseInt(clk[1], 10) * 60 + parseInt(clk[2], 10);
    else {
      const coarse = t.match(PATTERNS.clockCoarse);
      if (coarse) {
        const v = parseInt(coarse[1], 10);
        obs.clockSeconds = /h/i.test(coarse[2]) ? v * 3600 : v * 60;
      }
    }

    const card = t.match(PATTERNS.upcomingCard);
    if (card) {
      const overall = parseInt(card[2], 10);
      if (Number.isFinite(overall) && overall >= 1) {
        // Validate against snake math; rejects accidental "n | m" text.
        let ok = false;
        const dotted = card[1].match(/^(\d{1,2})[.,·](\d{1,2})$/);
        if (dotted) {
          const r = parseInt(dotted[1], 10);
          const p = parseInt(dotted[2], 10);
          ok = p >= 1 && p <= teams && (r - 1) * teams + p === overall;
        }
        if (!ok) ok = resolveRoundDotPick(card[1], overall, teams) != null;
        if (ok) obs.upcomingOveralls.push(overall);
      }
    }
  }

  // ---- Carousel drafter cards (usernames anchor the user's slot) ----
  obs.drafterCards = extractDrafterCards(lines, teams);
  // Recovered card labels are upcoming-pick evidence like any pipe-form label.
  for (const c of obs.drafterCards) {
    if (c.nextOverall != null && !obs.upcomingOveralls.includes(c.nextOverall)) {
      obs.upcomingOveralls.push(c.nextOverall);
    }
  }

  // Early lobby: seats show "Filled" placeholders and the user's card has no
  // pick label yet, so collect bare usernames — the only named card is the user.
  if (obs.lobby) {
    obs.lobbyUsernames = texts.filter(isUsernameLine);
  } else {
    obs.lobbyUsernames = [];
  }

  // ---- Pick-confirmation card ("ATL / D. London", possibly split) ----
  obs.confirmCard = findConfirmCard(lines);

  // ---- Expanded player-detail accordion (stats table + Queue/Draft bar) ----
  {
    const hasStats = texts.some(t => PATTERNS.statsHeader.test(t));
    const hasDraftAction = texts.some(t => PATTERNS.draftAction.test(t));
    obs.detailPanel = hasStats && hasDraftAction;
  }

  // ---- Drafter-card roster panel (tap a card -> that drafter's picks) ----
  // Its rows are DRAFTED players grouped by position, so it must never feed
  // availability or clear inferred-gone marks (an opponent's roster view
  // would resurrect their picks into the targets).
  obs.rosterPanel = texts.filter(t => PATTERNS.rosterPickLabel.test(t)).length >= 2;

  // ---- Board cells: "<Name lines> / RB - DET (1.1)" -> exact ledger picks ----
  // With boxes, name fragments are associated GEOMETRICALLY (same column,
  // directly above the meta line). The y-sorted line order interleaves
  // side-by-side columns, so "the lines above" routinely belong to the
  // neighboring cell — on-device this recorded wrong players at the user's
  // own overalls (debug dump 2026-07-14: "Spencer Brown" at #9 with the OCR
  // plainly reading "Jonathan / Taylor / RB - IND (1.9)").
  const boardBoxes = lines.length > 0 && lines.every(l => l.y != null && l.x != null);
  const isNameFrag = t => looksLikeNameLine(t)
    || /^[A-Z][A-Za-z'.-]{2,}$/.test(t); // single fragment: "Gibbs", "Achane"
  const consumedIdx = new Set();
  const consumedLines = new Set();
  for (let i = 0; i < texts.length; i++) {
    const m = texts[i].match(PATTERNS.boardPick);
    if (!m) continue;
    const round = parseInt(m[3], 10);
    const pickInRound = parseInt(m[4], 10);
    if (!(round >= 1 && round <= 30 && pickInRound >= 1 && pickInRound <= teams)) continue;
    const overall = (round - 1) * teams + pickInRound;

    let nameParts = [];
    let nameLines = [];
    if (boardBoxes) {
      const ml = lines[i];
      const mcx = centerX(ml);
      nameLines = lines
        .filter(l => !consumedLines.has(l) && l !== ml
          && l.y < ml.y && ml.y - l.y < 0.07
          && Math.abs(centerX(l) - mcx) < 0.10
          && isNameFrag(l.text))
        .sort((a, b) => b.y - a.y) // nearest above first
        .slice(0, 2)
        .reverse();
      nameParts = nameLines.map(l => l.text);
    } else {
      // Gather up to 2 contiguous name-ish lines immediately above.
      for (let j = i - 1; j >= Math.max(0, i - 2); j--) {
        if (consumedIdx.has(j)) break;
        const frag = texts[j];
        if (!isNameFrag(frag)) break;
        nameParts.unshift(frag);
      }
    }
    if (!nameParts.length) continue;

    const posHint = fuzzyPosition(m[1]);
    const teamHint = /^[A-Z]{2,3}$/.test(m[2].toUpperCase()) ? m[2].toUpperCase() : null;
    const raw = nameParts.join(' ');
    const match = matchPlayer(pool, raw, { position: posHint, team: teamHint })
      || (nameParts.length > 1 ? matchPlayer(pool, nameParts[nameParts.length - 1], { position: posHint, team: teamHint }) : null);
    if (match) {
      obs.boardPicks.push({
        overall, round, pickInRound,
        player: match.player, score: match.score, raw,
      });
      obs.stats.boardMatches++;
      if (boardBoxes) {
        for (const l of nameLines) consumedLines.add(l);
        consumedLines.add(lines[i]);
      } else {
        for (let j = i - nameParts.length; j <= i; j++) consumedIdx.add(j);
      }
    } else {
      obs.stats.unmatchedNames.push(raw);
    }
  }

  // ---- Players/Queue rows: name line + lookahead posRank / team-bye ----
  // Abbreviated "F. Surname" forms never appear on the Players list (it
  // renders full names) — they are carousel/confirmation-card artifacts. In
  // slow drafts every completed drafter card shows its LAST pick that way
  // ("J. Tyson" under the label), and matching those as visible rows
  // resurrected just-drafted players into the targets (frames-1784120786).
  // Double initials ("A.J. Brown") are real list names and stay eligible.
  const isAbbrevNameForm = t => /^[A-Za-z]\.\s*[A-Z][a-z]/.test(t);
  if (obs.boardPicks.length < 2) {
    for (let i = 0; i < texts.length; i++) {
      if (consumedIdx.has(i) || consumedLines.has(lines[i])) continue;
      const t = texts[i];
      if (!looksLikeNameLine(t) || isAbbrevNameForm(t)) continue;
      const nameMatch = matchPlayer(pool, t);
      if (!nameMatch) {
        if (t.split(' ').length >= 2) obs.stats.unmatchedNames.push(t);
        continue;
      }
      const row = { player: nameMatch.player, score: nameMatch.score, raw: t, pos: null, posRank: null, team: null, bye: null };
      for (let j = i + 1; j <= Math.min(texts.length - 1, i + 3); j++) {
        if (row.pos == null) {
          const pr = texts[j].match(PATTERNS.posRank);
          if (pr) {
            const pos = fuzzyPosition(pr[1]);
            if (pos) { row.pos = pos; row.posRank = parseInt(pr[2], 10); continue; }
          }
        }
        if (row.team == null) {
          const tb = texts[j].match(PATTERNS.teamBye);
          if (tb) { row.team = tb[1].toUpperCase(); row.bye = parseInt(tb[2], 10); continue; }
        }
        if (looksLikeNameLine(texts[j])) break; // next row began
      }
      obs.rows.push(row);
      obs.stats.matchedRows++;
    }
  }

  // ---- Classification + availability ----
  const unitLabels = texts.filter(t => PATTERNS.unitLabel.test(t)).length;
  // Queue rows repeat unit labels *under* each value ("29.5" then "ADP");
  // the Players tab shows the unit as a column header *before* any value, so
  // a value-then-unit pair separates the two even when OCR drops the "=".
  const valueThenUnit = texts.some((t, i) => /^\d+(\.\d+)?$/.test(t)
    && i + 1 < texts.length && PATTERNS.unitLabel.test(texts[i + 1]));
  if (obs.boardPicks.length >= 2) {
    obs.kind = 'board';
  } else if (obs.rows.length >= 1 && unitLabels >= 2 && valueThenUnit && obs.rows.length <= 4) {
    obs.kind = 'queue';
    obs.queueNames = obs.rows.map(r => r.player.canonical);
  } else if (obs.detailPanel && obs.rows.length <= 3) {
    obs.kind = 'detail';
  } else if (obs.rosterPanel && obs.rows.length >= 1) {
    obs.kind = 'roster';
  } else if (obs.rows.length >= 1) {
    obs.kind = 'players';
  } else if (obs.lobby) {
    obs.kind = 'lobby';
  } else if (obs.picksUntil != null || obs.upcomingOveralls.length || obs.drafterCards.length >= 2) {
    obs.kind = 'header';
  }

  // Availability inference is only safe on a confident, ADP-sorted Players list:
  // everything with meaningfully lower ADP than the top visible player is gone.
  // An expanded detail accordion hides list rows, so it disables the inference.
  if (obs.kind === 'players' && !obs.detailPanel && obs.rows.length >= 6) {
    const withAdp = obs.rows.filter(r => Number.isFinite(r.player.adp));
    if (withAdp.length >= 6) {
      let inversions = 0;
      for (let i = 1; i < withAdp.length; i++) {
        if (withAdp[i].player.adp < withAdp[i - 1].player.adp - 2.0) inversions++;
      }
      if (inversions <= 1) {
        const positionsSeen = [...new Set(obs.rows.map(r => r.pos || r.player.position).filter(Boolean))];
        obs.availability = {
          topVisibleAdp: withAdp[0].player.adp,
          bottomVisibleAdp: withAdp[withAdp.length - 1].player.adp,
          positionsSeen,
          visibleCanonicals: obs.rows.map(r => r.player.canonical),
          // Rows whose name OCR'd too garbled to match — a high count means
          // gaps in the window are misreads, not drafted players.
          unmatchedCount: obs.stats.unmatchedNames.length,
        };
      }
    }
  }

  return obs;
}

/** Split a raw text blob (deep link / Shortcuts path) into parser input lines. */
export function textToItems(text) {
  return String(text || '')
    .split(/\r?\n/)
    .map(s => s.trim())
    .filter(Boolean);
}
