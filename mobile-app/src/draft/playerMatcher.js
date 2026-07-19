// playerMatcher.js — closed-pool fuzzy matching of OCR'd player names (ADR-021).
// The pool is the current Underdog ADP snapshot (~600 names), so heavy OCR error
// is recoverable: "Je Von Achane" -> De'Von Achane, "Amon-Ra st. Brown" ->
// Amon-Ra St. Brown, truncated "Ja'Marr Ch…" -> Ja'Marr Chase.
// Pure JS — no React Native imports (Node fixture tests run this directly).

import { canonicalName } from '../../shared/utils/helpers.js';
import { teamAbbrev } from './nflTeams.js';

/** Levenshtein distance with early-exit cap. */
function levenshtein(a, b, cap = Infinity) {
  if (a === b) return 0;
  if (Math.abs(a.length - b.length) > cap) return cap + 1;
  const m = a.length;
  const n = b.length;
  if (m === 0) return n;
  if (n === 0) return m;
  let prev = new Array(n + 1);
  let curr = new Array(n + 1);
  for (let j = 0; j <= n; j++) prev[j] = j;
  for (let i = 1; i <= m; i++) {
    curr[0] = i;
    let rowMin = i;
    for (let j = 1; j <= n; j++) {
      const cost = a[i - 1] === b[j - 1] ? 0 : 1;
      curr[j] = Math.min(prev[j] + 1, curr[j - 1] + 1, prev[j - 1] + cost);
      if (curr[j] < rowMin) rowMin = curr[j];
    }
    if (rowMin > cap) return cap + 1;
    [prev, curr] = [curr, prev];
  }
  return prev[n];
}

/** Similarity ratio in [0,1] from Levenshtein distance. */
function similarity(a, b) {
  const maxLen = Math.max(a.length, b.length);
  if (maxLen === 0) return 0;
  const d = levenshtein(a, b);
  return 1 - d / maxLen;
}

/** Strip OCR junk that survives canonicalName (brackets, pipes, bullets). */
function scrubOcr(raw) {
  return String(raw)
    .replace(/[[\]|•·*_~<>{}""]+/g, ' ')
    .replace(/…/g, '') // ellipsis from truncated names
    .replace(/\s+/g, ' ')
    .trim();
}

const POS_SET = new Set(['QB', 'RB', 'WR', 'TE']);

/**
 * Normalize a garbled OCR position token to QB/RB/WR/TE (or null).
 * Fixture-observed garbles: "VR" (WR), ":B" (RB), "]B" (RB), "T E".
 */
export function fuzzyPosition(raw) {
  const t = String(raw).toUpperCase().replace(/[^A-Z]/g, '');
  if (POS_SET.has(t)) return t;
  if (t.includes('Q')) return 'QB';
  if (t === 'B' || t === 'RB' || /^[RKPBH]B$/.test(t)) return 'RB';
  if (t === 'VR' || t === 'W' || t === 'WVR' || /^[VWM]R$/.test(t)) return 'WR';
  if (t === 'T' || t === 'TE' || /^T[EF]$/.test(t)) return 'TE';
  return null;
}

/**
 * Build a match pool from ADP rows / master players.
 * Accepts entries shaped like { name, position, team, adp | adpPick } (extra keys kept).
 */
export function buildPool(entries) {
  const players = [];
  const byCanonical = new Map();
  const byLastToken = new Map();
  for (const e of entries || []) {
    if (!e || !e.name) continue;
    const canonical = canonicalName(e.name);
    if (!canonical || byCanonical.has(canonical)) continue;
    const adp = Number.isFinite(e.adp) ? e.adp
      : Number.isFinite(e.adpPick) ? e.adpPick
      : Number.isFinite(parseFloat(e.adp)) ? parseFloat(e.adp)
      : null;
    const player = {
      name: e.name,
      position: fuzzyPosition(e.position) || e.position || 'N/A',
      // Normalize to an abbreviation so every downstream team comparison keys on
      // the same form (playoff schedule, stack, and the confirm-card team
      // tie-break). Underdog ADP stores full names ("Indianapolis Colts"); left
      // un-normalized, "J. Taylor"/IND matched J.J. Taylor over Jonathan Taylor,
      // and playoff/stack badges silently blanked. teamAbbrev is a no-op on
      // already-abbreviated (DraftKings) or unknown ("N/A") values.
      team: teamAbbrev((e.team || 'N/A')).toUpperCase(),
      adp,
      canonical,
      tokens: canonical.split(' '),
    };
    players.push(player);
    byCanonical.set(canonical, player);
    const last = player.tokens[player.tokens.length - 1];
    if (last) {
      if (!byLastToken.has(last)) byLastToken.set(last, []);
      byLastToken.get(last).push(player);
    }
  }
  return { players, byCanonical, byLastToken };
}

/**
 * Match a raw OCR string against the pool.
 * hints: { position, team } corroborate low-similarity matches.
 * Returns { player, score, method } or null.
 */
export function matchPlayer(pool, raw, hints = {}) {
  if (!pool || !raw) return null;
  const scrubbed = scrubOcr(raw);
  if (scrubbed.length < 3) return null;
  const canonical = canonicalName(scrubbed);
  if (!canonical || canonical.length < 3) return null;

  // 1) Exact canonical hit.
  const exact = pool.byCanonical.get(canonical);
  if (exact) return { player: exact, score: 1, method: 'exact' };

  const hintPos = hints.position ? fuzzyPosition(hints.position) : null;
  const hintTeam = hints.team ? teamAbbrev(String(hints.team)).toUpperCase() : null;
  const corroborate = (p, base) => {
    let s = base;
    if (hintPos && p.position === hintPos) s += 0.06;
    if (hintTeam && p.team === hintTeam) s += 0.06;
    return Math.min(1, s);
  };

  // 2) Prefix match for truncated names ("ja'marr ch" -> ja'marr chase).
  if (canonical.length >= 6) {
    const prefixHits = pool.players.filter(p => p.canonical.startsWith(canonical));
    if (prefixHits.length === 1) {
      return { player: prefixHits[0], score: corroborate(prefixHits[0], 0.9), method: 'prefix' };
    }
  }

  // 3) Last-token index: same surname, fuzzy first name / initial forms
  //    ("j jefferson", "je von achane" tokenized differently, etc.).
  const tokens = canonical.split(' ');
  const candidates = new Map();
  for (const tok of tokens) {
    if (tok.length < 3) continue;
    for (const p of pool.byLastToken.get(tok) || []) candidates.set(p.canonical, p);
  }
  let best = null;
  for (const p of candidates.values()) {
    let s = similarity(canonical, p.canonical);
    // Initial form: "j jefferson" vs "justin jefferson".
    const first = tokens[0];
    if (tokens.length >= 2 && first.length <= 2 && p.tokens[0].startsWith(first[0])) {
      s = Math.max(s, 0.8);
    }
    s = corroborate(p, s);
    if (!best || s > best.score) best = { player: p, score: s, method: 'surname' };
  }
  if (best && best.score >= 0.74) return best;

  // 4) Whole-pool scan (bounded: only for plausible name lengths).
  if (canonical.length >= 5) {
    let scanBest = best;
    for (const p of pool.players) {
      if (Math.abs(p.canonical.length - canonical.length) > 4) continue;
      const base = similarity(canonical, p.canonical);
      if (base < 0.6) continue;
      const s = corroborate(p, base);
      if (!scanBest || s > scanBest.score) scanBest = { player: p, score: s, method: 'scan' };
    }
    const threshold = (hintPos || hintTeam) ? 0.7 : 0.76;
    if (scanBest && scanBest.score >= threshold) return scanBest;
  }
  return null;
}

/**
 * OCR-tolerant username equality. Usernames render ALL-CAPS on Underdog and
 * may garble a character, but edge-clipped carousel cards also truncate them
 * ("BIRDENTHUSIAST" -> "BIRD…") — a truncation must NEVER count as a match,
 * so length may differ by at most one.
 */
export function usernameMatches(a, b) {
  if (!a || !b) return false;
  const na = String(a).toUpperCase().replace(/[^A-Z0-9]/g, '');
  const nb = String(b).toUpperCase().replace(/[^A-Z0-9]/g, '');
  if (na.length < 4 || nb.length < 4) return false;
  if (na === nb) return true;
  if (Math.abs(na.length - nb.length) > 1) return false;
  return na.length >= 8 && levenshtein(na, nb, 1) <= 1;
}

/**
 * Truncation-tolerant username equality for anchor evidence (TASK-350).
 * DraftKings board-column headers truncate with an ellipsis
 * ("BirdEnthusi..."), which usernameMatches rightly rejects — but a marked
 * truncation of ≥6 leading characters is safe anchor evidence (a collision
 * needs another drafter sharing that prefix in the same room).
 */
export function anchorUsernameMatches(known, seen) {
  if (!known || !seen) return false;
  const truncated = /(\.{2,3}|…)\s*$/.test(String(seen));
  const bare = String(seen).replace(/(\.{2,3}|…)\s*$/, '').trim();
  if (usernameMatches(known, bare)) return true;
  if (!truncated) return false;
  const norm = s => String(s).toUpperCase().replace(/[^A-Z0-9]/g, '');
  const nk = norm(known);
  const nb = norm(bare);
  return nb.length >= 6 && nk.startsWith(nb);
}

/**
 * Match a carousel pick-confirmation card name ("D. London", "K. Walker III",
 * "J. Smith-Nji…") against the pool. The card renders first-initial + surname,
 * so the general matcher's thresholds don't fit; team is a strong hint here
 * because the card always carries it ("ATL / D. London").
 */
export function matchAbbrevPlayer(pool, raw, teamHint) {
  if (!pool || !raw) return null;
  const scrubbed = scrubOcr(raw);
  const m = scrubbed.match(/^([A-Za-z])[.\s]+(.{2,})$/);
  if (!m) return matchPlayer(pool, scrubbed, { team: teamHint });
  const initial = m[1].toLowerCase();
  const rest = canonicalName(m[2]);
  if (!rest || rest.length < 3) return null;
  const team = teamHint ? teamAbbrev(String(teamHint)).toUpperCase() : null;
  let best = null;
  for (const p of pool.players) {
    if (p.tokens.length < 2) continue;
    if (p.tokens[0][0] !== initial) continue;
    const surname = p.tokens.slice(1).join(' ');
    let s = similarity(rest, surname);
    if (rest.length >= 4 && surname.startsWith(rest)) s = Math.max(s, 0.9); // truncated card
    if (s < 0.7) continue;
    // Team scoring must break same-surname ties ("J. Taylor" → Jonathan
    // Taylor/IND vs J.J. Taylor/no-team), so the bonus is uncapped and a
    // missing team is penalized too — never let it tie a confirmed team hit.
    if (team) {
      if (p.team === team) s += 0.15;
      else if (p.team === 'N/A') s -= 0.05;
      else s -= 0.2;
    }
    if (!best || s > best.score) best = { player: p, score: s, method: 'abbrev' };
  }
  return best && best.score >= 0.78 ? best : null;
}

/**
 * Cheap test used by the parser to decide whether a line even looks like a
 * player name (vs usernames, labels, numbers). Usernames render ALL-CAPS on
 * Underdog; player rows are Title Case.
 */
export function looksLikeNameLine(text) {
  const t = scrubOcr(text);
  if (t.length < 4 || t.length > 30) return false;
  if (!/[a-z]/.test(t)) return false;              // all-caps -> username/label
  if (/\d/.test(t)) return false;                  // numbers -> not a name
  if (!/^[A-Za-z'.\-\s]+$/.test(t)) return false;
  return /[A-Za-z]{2,}/.test(t);
}
