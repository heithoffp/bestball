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
  // "UP IN 2 PICKS" header ticker; on-the-clock variants.
  upInPicks: /UP\s+IN\s+(\d{1,2})\s+PICKS?/i,
  onTheClock: /(YOUR\s+PICK|ON\s+THE\s+CLOCK|YOU'?RE\s+UP)/i,
  upNext: /\bUP\s+NEXT\b/i,
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
};

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
  const lines = normalizeItems(items);
  const texts = lines.map(l => l.text);

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
    stats: { lines: lines.length, matchedRows: 0, boardMatches: 0, unmatchedNames: [] },
  };

  // ---- Header signals (any tab) ----
  for (const t of texts) {
    const up = t.match(PATTERNS.upInPicks);
    if (up) obs.picksUntil = parseInt(up[1], 10);
    else if (PATTERNS.onTheClock.test(t)) { obs.onClock = true; obs.picksUntil = 0; }
    else if (obs.picksUntil == null && PATTERNS.upNext.test(t)) obs.picksUntil = 1;

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

  // ---- Board cells: "<Name lines> / RB - DET (1.1)" -> exact ledger picks ----
  const consumedIdx = new Set();
  for (let i = 0; i < texts.length; i++) {
    const m = texts[i].match(PATTERNS.boardPick);
    if (!m) continue;
    const round = parseInt(m[3], 10);
    const pickInRound = parseInt(m[4], 10);
    if (!(round >= 1 && round <= 30 && pickInRound >= 1 && pickInRound <= teams)) continue;
    const overall = (round - 1) * teams + pickInRound;

    // Gather up to 2 contiguous name-ish lines immediately above.
    const nameParts = [];
    for (let j = i - 1; j >= Math.max(0, i - 2); j--) {
      if (consumedIdx.has(j)) break;
      const frag = texts[j];
      const nameish = looksLikeNameLine(frag)
        || /^[A-Z][A-Za-z'.-]{2,}$/.test(frag); // single fragment: "Gibbs", "Achane"
      if (!nameish) break;
      nameParts.unshift(frag);
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
      for (let j = i - nameParts.length; j <= i; j++) consumedIdx.add(j);
    } else {
      obs.stats.unmatchedNames.push(raw);
    }
  }

  // ---- Players/Queue rows: name line + lookahead posRank / team-bye ----
  if (obs.boardPicks.length < 2) {
    for (let i = 0; i < texts.length; i++) {
      if (consumedIdx.has(i)) continue;
      const t = texts[i];
      if (!looksLikeNameLine(t)) continue;
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
  if (obs.boardPicks.length >= 2) {
    obs.kind = 'board';
  } else if (obs.rows.length >= 1 && unitLabels >= 2 && obs.rows.length <= 4) {
    obs.kind = 'queue';
    obs.queueNames = obs.rows.map(r => r.player.canonical);
  } else if (obs.rows.length >= 1) {
    obs.kind = 'players';
  } else if (obs.picksUntil != null || obs.upcomingOveralls.length) {
    obs.kind = 'header';
  }

  // Availability inference is only safe on a confident, ADP-sorted Players list:
  // everything with meaningfully lower ADP than the top visible player is gone.
  if (obs.kind === 'players' && obs.rows.length >= 6) {
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
          positionsSeen,
          visibleCanonicals: obs.rows.map(r => r.player.canonical),
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
