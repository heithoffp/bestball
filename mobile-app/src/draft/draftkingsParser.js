// draftkingsParser.js — turns OCR output of the DraftKings iOS draft room into
// structured observations (TASK-350; same "read only what you must" engine
// contract as underdogParser, ADR-021).
//
// DK renders far more explicit state than Underdog — every tab's header carries
// "Round 4, Pick 12" (the exact current overall), "You're up in N pick(s)",
// "On The Clock: <username>", and "Last Pick: T. McLaurin WAS-WR". The Board
// tab is one column per slot: a username header, a QB/RB/WR/TE tally row, then
// cells of `r.p` / `overall` / `F. Surname` / `POS TEAM` (ledger-grade picks).
// Names are abbreviated ("D. Montgomery") on every tab, so row matching runs
// through matchAbbrevPlayer with pos/team corroboration.
//
// Screen knowledge is grounded in a real recorded session:
// docs/draftkings_debug/frames-1784385816.jsonl (2026-07-18, slow draft,
// user BirdEnthusiast at slot 4).
// Pure JS — no React Native imports.

import {
  matchPlayer, matchAbbrevPlayer, fuzzyPosition, anchorUsernameMatches,
} from './playerMatcher.js';
import { slotForOverall } from './snake.js';
import { exciseSelfOverlay } from './selfOverlay.js';
import { normalizeItems } from './underdogParser.js';

const PATTERNS = {
  // "Round 4, Pick 12" — the pick currently on the clock, on every tab.
  roundPick: /Round\s*(\d{1,2})\s*[,.]?\s*Pick\s*(\d{1,2})/i,
  // "You're up in 4 pick(s)" (OCR may garble the apostrophe).
  upIn: /You.?re\s+up\s+in\s+(\d{1,2})\s+pick/i,
  // Speculative on-clock header for the user's own turn; the countdown also
  // derives picksUntil=0 from slot math, so this is belt-and-braces.
  youreOnClock: /You.?re\s+on\s+the\s+clock/i,
  // "On The Clock:" label — the username follows on the same line or the next.
  onClockLabel: /On\s*The\s*Clock\s*:?\s*(.*)$/i,
  // "Last Pick: T. McLaurin WAS-WR" → event evidence at currentOverall − 1.
  lastPick: /Last\s*Pick\s*:?\s*(.+?)\s+([A-Z]{2,3})\s*[-–]\s*([A-Za-z]{1,3})\s*$/i,
  // Slow-draft clock "06:35:49"; fast clock "0:28".
  clockHMS: /^(\d{1,2}):(\d{2}):(\d{2})$/,
  clockMS: /^(\d{1,2}):(\d{2})$/,
  // Board cell label "1.1" / "2.12" (round.pickInRound); overall sits beneath.
  cellLabel: /^(\d{1,2})[.,·](\d{1,2})$/,
  overallNum: /^\d{1,3}$/,
  // Row meta "RB BAL (BYE 13)" (Players/Rosters tabs).
  posTeamBye: /^([A-Za-z]{1,3})\s+([A-Z]{2,3})\s*\(\s*BYE\s*(\d{1,2})\s*\)/i,
  // Board cell meta "RB ATL" (position may garble).
  posTeam: /^([A-Za-z]{1,3})\s+([A-Z]{2,3})$/,
  // Abbreviated row/cell name: "D. Henry", "T.McLaurin", "K. Walker III".
  abbrevName: /^([A-Za-z])[.·]\s*([A-Za-z'.\-\s…]{2,})$/,
  // Players-tab controls.
  showDrafted: /^SHOW\s+DRAFTED/i,
  // Rosters-tab fill tally "QB 0/1 RB 1/2" (groups may merge into one line).
  tallyGroup: /(QB|RB|WR|TE)\s*([0-9O]{1,2})\s*\/\s*[0-9O]{1,2}/gi,
  // Rosters-tab left rail slots.
  posRail: /^(QB|RB|WR|TE|FLEX|BN)$/,
  // Queue empty state.
  emptyQueue: /No\s+players\s+in\s+Queue/i,
  // Bottom tab bar — present on every draft-room screen (in-room evidence).
  tabBar: /^(Players|Queue|Rosters|Board)$/,
  // DK usernames are mixed-case, single-token ("ski2sun", "BirdEnthusiast");
  // board column headers truncate with an ellipsis ("BirdEnthusi...").
  username: /^[A-Za-z][A-Za-z0-9_.\-]{2,24}(\.{2,3}|…)?$/,
};

// Single-token UI strings that would otherwise pass the username shape test.
const NOT_USERNAMES = new Set([
  'players', 'queue', 'rosters', 'board', 'player', 'rank', 'adp', 'pos',
  'flex', 'bn', 'all', 'show', 'drafted', 'round', 'pick', 'clock', 'bye',
  'autodraft', 'auto', 'settings', 'search', 'fantasy', 'sports',
]);

function isUsernameLine(t) {
  if (!PATTERNS.username.test(t)) return false;
  const bare = t.replace(/(\.{2,3}|…)$/, '');
  if (/^(QB|RB|WR|TE|FLEX|BN)\d{0,2}$/i.test(bare)) return false;
  return !NOT_USERNAMES.has(bare.toLowerCase());
}

/** Strip the ellipsis from a truncated board-column username. */
function bareUsername(t) {
  return String(t).replace(/(\.{2,3}|…)$/, '').trim();
}

function centerX(l) {
  return (l.x ?? 0) + (Number.isFinite(l.w) ? l.w / 2 : 0);
}

/** "R. Rice Q" → "R. Rice" (trailing queue/draft icon garbles into a letter). */
function cleanRowName(t) {
  return String(t).replace(/\s+[QWA]$/, '').trim();
}

/** Match an abbreviated DK name with pos/team corroboration (or null). */
function matchDkName(pool, raw, teamHint, posHint) {
  const cleaned = cleanRowName(raw);
  const m = matchAbbrevPlayer(pool, cleaned, teamHint)
    || matchPlayer(pool, cleaned, { team: teamHint, position: posHint });
  if (!m) return null;
  if (posHint && m.player.position && m.player.position !== 'N/A'
    && m.player.position !== posHint) return null;
  return { player: m.player, score: Math.min(m.score, 1) };
}

/** Parse one OCR'd DraftKings screen. ctx: { pool, teams, username }. */
export function parseDraftKingsScreen(items, ctx) {
  const { pool, teams = 12, username = null } = ctx || {};
  let lines = normalizeItems(items);

  const obs = {
    kind: 'unknown',
    picksUntil: null,
    onClock: false,
    clockSeconds: null,
    currentOverall: null,   // exact current pick from "Round X, Pick Y"
    lastPick: null,         // { nameRaw, team, pos, raw } at currentOverall − 1
    slotAnchors: [],        // [{ username, slot }] from Board columns
    rosterTally: null,      // { username, tally } from the Rosters-tab header
    rosterSet: null,        // { username, players, tallyTotal } — Rosters-tab rows
    upcomingOveralls: [],
    picksAwayDivider: null,
    boardPicks: [],
    rosterPicks: [],
    cardPicks: [],
    rosterOwner: null,
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

  // ---- Self-overlay excision (shared with the UD parser, selfOverlay.js).
  {
    const excision = exciseSelfOverlay(lines);
    if (excision.excised) {
      lines = excision.lines;
      if (lines.length < 4) {
        obs.kind = 'self';
        return obs;
      }
    }
  }
  const texts = lines.map(l => l.text);
  const withBoxes = lines.length > 0 && lines.every(l => l.y != null && l.x != null);

  // ---- Header signals (every tab) ----
  for (let i = 0; i < lines.length; i++) {
    const ln = lines[i];
    const t = ln.text;

    const rp = t.match(PATTERNS.roundPick);
    if (rp && (ln.y == null || ln.y < 0.3)) {
      const r = parseInt(rp[1], 10);
      const p = parseInt(rp[2], 10);
      if (r >= 1 && r <= 30 && p >= 1 && p <= teams) {
        obs.currentOverall = (r - 1) * teams + p;
      }
    }

    const up = t.match(PATTERNS.upIn);
    if (up) obs.picksUntil = parseInt(up[1], 10);

    if (PATTERNS.youreOnClock.test(t)) {
      obs.onClock = true;
      obs.picksUntil = 0;
    }

    const oc = t.match(PATTERNS.onClockLabel);
    if (oc && username && (ln.y == null || ln.y < 0.3)) {
      // The username follows on the same line or on a nearby line below-left.
      let name = oc[1] ? oc[1].trim() : '';
      if (!name) {
        const near = withBoxes
          ? lines.find(l => l !== ln && l.y > ln.y && l.y - ln.y < 0.05
            && Math.abs(l.x - ln.x) < 0.2 && isUsernameLine(l.text))
          : (i + 1 < lines.length && isUsernameLine(lines[i + 1].text) ? lines[i + 1] : null);
        name = near ? near.text : '';
      }
      if (name && anchorUsernameMatches(username, name)) {
        obs.onClock = true;
        obs.picksUntil = 0;
      }
    }

    const lp = t.match(PATTERNS.lastPick);
    if (lp && (ln.y == null || ln.y < 0.3)) {
      obs.lastPick = {
        nameRaw: lp[1].trim(),
        team: lp[2].toUpperCase(),
        pos: fuzzyPosition(lp[3]),
        raw: t,
      };
    }

    const hms = t.match(PATTERNS.clockHMS);
    if (hms) {
      obs.clockSeconds = parseInt(hms[1], 10) * 3600
        + parseInt(hms[2], 10) * 60 + parseInt(hms[3], 10);
    } else if (obs.clockSeconds == null && (ln.y == null || ln.y < 0.12)) {
      const ms = t.match(PATTERNS.clockMS);
      if (ms) obs.clockSeconds = parseInt(ms[1], 10) * 60 + parseInt(ms[2], 10);
    }
  }

  // ---- Board tab: per-slot columns of `r.p` / overall / name / POS TEAM ----
  // Geometric: the overall sits directly under its label (left-aligned column),
  // the abbreviated name under that, the POS TEAM meta last. Future cells stop
  // at label+overall (the arrow glyph "→" carries no state).
  const consumedLines = new Set();
  const validatedCells = []; // { labelLine, overall } — slot evidence incl. future cells
  if (withBoxes) {
    for (const lbl of lines) {
      const m = lbl.text.match(PATTERNS.cellLabel);
      if (!m) continue;
      const round = parseInt(m[1], 10);
      const pickInRound = parseInt(m[2], 10);
      if (!(round >= 1 && round <= 30 && pickInRound >= 1 && pickInRound <= teams)) continue;
      const expected = (round - 1) * teams + pickInRound;
      const ov = lines.find(l => l !== lbl && PATTERNS.overallNum.test(l.text)
        && l.y > lbl.y && l.y - lbl.y < 0.04
        && Math.abs(l.x - lbl.x) < 0.06
        && parseInt(l.text, 10) === expected);
      if (!ov) continue;
      validatedCells.push({ labelLine: lbl, overall: expected });

      // Completed cell: abbreviated name under the overall, meta under the name.
      const nameLine = lines
        .filter(l => l.y > ov.y && l.y - ov.y < 0.045
          && Math.abs(l.x - lbl.x) < 0.15
          && PATTERNS.abbrevName.test(cleanRowName(l.text)))
        .sort((a, b) => a.y - b.y)[0];
      if (!nameLine) continue;
      const metaLine = lines.find(l => l.y > nameLine.y && l.y - nameLine.y < 0.035
        && Math.abs(l.x - lbl.x) < 0.15 && PATTERNS.posTeam.test(l.text));
      const meta = metaLine ? metaLine.text.match(PATTERNS.posTeam) : null;
      const posHint = meta ? fuzzyPosition(meta[1]) : null;
      const teamHint = meta && /^[A-Z]{2,3}$/.test(meta[2]) ? meta[2] : null;
      const match = matchDkName(pool, nameLine.text, teamHint, posHint);
      if (match) {
        obs.boardPicks.push({
          overall: expected, round, pickInRound,
          player: match.player, score: match.score, raw: nameLine.text,
        });
        obs.stats.boardMatches++;
        consumedLines.add(nameLine);
        if (metaLine) consumedLines.add(metaLine);
      } else {
        obs.stats.unmatchedNames.push(nameLine.text);
      }
    }

    // Column username headers → slot anchors. A column's cells all belong to
    // one slot; the username line sits above the first cell, x-aligned with
    // the column. Truncated headers ("BirdEnthusi...") are matched by the
    // engine via dkUsernameMatches.
    if (validatedCells.length) {
      const headerCands = lines.filter(l => l.y < 0.27
        && isUsernameLine(l.text)
        && !lines.some(o => o !== l && PATTERNS.onClockLabel.test(o.text)
          && Math.abs(o.y - l.y) < 0.06 && o.x < l.x + 0.05));
      for (const u of headerCands) {
        const ucx = centerX(u);
        const colCells = validatedCells.filter(c => c.labelLine.y > u.y
          && Math.abs(centerX(c.labelLine) - ucx) < 0.13);
        if (!colCells.length) continue;
        const slots = new Set(colCells.map(c => slotForOverall(c.overall, teams)));
        if (slots.size !== 1) continue;
        obs.slotAnchors.push({ username: u.text, slot: [...slots][0] });
      }
    }
  } else {
    // Boxless fallback: label, then the overall on the next line, then an
    // optional name + meta. Enough for text-blob replays and unit fixtures.
    for (let i = 0; i < texts.length - 1; i++) {
      const m = texts[i].match(PATTERNS.cellLabel);
      if (!m) continue;
      const round = parseInt(m[1], 10);
      const pickInRound = parseInt(m[2], 10);
      if (!(round >= 1 && round <= 30 && pickInRound >= 1 && pickInRound <= teams)) continue;
      const expected = (round - 1) * teams + pickInRound;
      if (!PATTERNS.overallNum.test(texts[i + 1]) || parseInt(texts[i + 1], 10) !== expected) continue;
      validatedCells.push({ labelLine: lines[i], overall: expected });
      const nameText = i + 2 < texts.length ? cleanRowName(texts[i + 2]) : '';
      if (!PATTERNS.abbrevName.test(nameText)) continue;
      const meta = i + 3 < texts.length ? texts[i + 3].match(PATTERNS.posTeam) : null;
      const posHint = meta ? fuzzyPosition(meta[1]) : null;
      const teamHint = meta && /^[A-Z]{2,3}$/.test(meta[2]) ? meta[2] : null;
      const match = matchDkName(pool, nameText, teamHint, posHint);
      if (match) {
        obs.boardPicks.push({
          overall: expected, round, pickInRound,
          player: match.player, score: match.score, raw: nameText,
        });
        obs.stats.boardMatches++;
        consumedLines.add(lines[i + 2]);
      } else {
        obs.stats.unmatchedNames.push(nameText);
      }
    }
  }

  // ---- Rosters tab: POS rail + owner + fill tally ----
  const railCount = withBoxes
    ? lines.filter(l => l.x < 0.12 && PATTERNS.posRail.test(l.text)).length
    : texts.filter(t => PATTERNS.posRail.test(t)).length;
  const tallyPositions = new Map();
  for (const t of texts) {
    for (const g of t.matchAll(PATTERNS.tallyGroup)) {
      const filled = parseInt(String(g[2]).replace(/O/gi, '0'), 10);
      if (Number.isFinite(filled)) tallyPositions.set(g[1].toUpperCase(), filled);
    }
  }
  const hasTally = tallyPositions.size >= 2;
  obs.rosterPanel = railCount >= 4 || (hasTally && railCount >= 2);
  if (obs.rosterPanel || hasTally) {
    const owner = withBoxes
      ? lines.filter(l => l.y > 0.26 && l.y < 0.37 && isUsernameLine(l.text))
        .sort((a, b) => a.y - b.y)[0]
      : lines.find(l => isUsernameLine(l.text));
    if (owner) obs.rosterOwner = bareUsername(owner.text);
    if (obs.rosterOwner && hasTally) {
      obs.rosterTally = {
        username: obs.rosterOwner,
        tally: {
          QB: tallyPositions.get('QB') ?? 0, RB: tallyPositions.get('RB') ?? 0,
          WR: tallyPositions.get('WR') ?? 0, TE: tallyPositions.get('TE') ?? 0,
        },
      };
    }
  }

  // ---- Player rows (Players / Rosters / Queue): "F. Surname" + meta ----
  // Skipped when the frame is board-shaped (≥2 validated cells even without
  // matched names) — board names are drafted players, and rows would clear
  // their inferred-gone marks.
  if (obs.boardPicks.length < 2 && validatedCells.length < 2) {
    for (let i = 0; i < lines.length; i++) {
      const ln = lines[i];
      if (consumedLines.has(ln)) continue;
      const nameText = cleanRowName(ln.text);
      if (!PATTERNS.abbrevName.test(nameText)) continue;
      // Header artifacts ("Last Pick: …" tails) live above the list zone.
      if (withBoxes && ln.y < 0.3) continue;
      // Find the row meta "RB BAL (BYE 13)" just below / next.
      let meta = null;
      if (withBoxes) {
        const metaLine = lines.find(l => l !== ln && l.y > ln.y && l.y - ln.y < 0.04
          && Math.abs(l.x - ln.x) < 0.1 && PATTERNS.posTeamBye.test(l.text));
        meta = metaLine ? metaLine.text.match(PATTERNS.posTeamBye) : null;
      } else {
        meta = i + 1 < texts.length ? texts[i + 1].match(PATTERNS.posTeamBye) : null;
      }
      const posHint = meta ? fuzzyPosition(meta[1]) : null;
      const teamHint = meta && /^[A-Z]{2,3}$/.test(meta[2].toUpperCase()) ? meta[2].toUpperCase() : null;
      const match = matchDkName(pool, nameText, teamHint, posHint);
      if (!match) {
        obs.stats.unmatchedNames.push(nameText);
        continue;
      }
      obs.rows.push({
        player: match.player, score: match.score, raw: nameText,
        pos: posHint, posRank: null, team: teamHint,
        bye: meta ? parseInt(meta[3], 10) : null,
      });
      obs.stats.matchedRows++;
    }
  }

  // ---- Rosters tab: matched rows + fill tally → roster-set observation ----
  // DK's Rosters tab renders no pick numbers (RANK/ADP right rail only), so
  // the set carries player identities, not overalls; the engine maps a
  // complete self-owned set onto the slot's snake overalls (TASK-352).
  if (obs.rosterPanel && obs.rosterOwner && obs.rows.length) {
    obs.rosterSet = {
      username: obs.rosterOwner,
      players: obs.rows.map(({ player, score, raw }) => ({ player, score, raw })),
      tallyTotal: hasTally
        ? [...tallyPositions.values()].reduce((a, b) => a + b, 0)
        : null,
    };
  }

  // ---- Classification ----
  const hasShowDrafted = texts.some(t => PATTERNS.showDrafted.test(t));
  const emptyQueue = texts.some(t => PATTERNS.emptyQueue.test(t));
  const tabBarCount = new Set(
    lines.filter(l => PATTERNS.tabBar.test(l.text) && (l.y == null || l.y > 0.9))
      .map(l => l.text),
  ).size;
  if (obs.boardPicks.length >= 2 || (validatedCells.length >= 4 && obs.slotAnchors.length)) {
    obs.kind = 'board';
  } else if (obs.rosterPanel) {
    obs.kind = 'roster';
  } else if (emptyQueue) {
    obs.kind = 'queue';
  } else if (obs.rows.length >= 1) {
    obs.kind = 'players';
  } else if (obs.currentOverall != null || obs.picksUntil != null || tabBarCount >= 3) {
    obs.kind = 'header';
  }

  // ---- Availability (Players tab only; same shape as the UD parser) ----
  // Safe under both SHOW DRAFTED toggle states: ALL shows everyone (no gaps ⇒
  // no marks); PLAYERS hides drafted (gaps ⇒ marks). Requires a confident,
  // ADP-ordered visible window.
  if (obs.kind === 'players' && hasShowDrafted && obs.rows.length >= 6) {
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
          unmatchedCount: obs.stats.unmatchedNames.length,
        };
      }
    }
  }

  return obs;
}
