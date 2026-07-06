// src/utils/realDraftData.js
// Real-draft frequency tables — computed from actual drafts:
//   1. Every seat of every captured pod board in draft_boards_admin
//      (participant-authorized capture per ADR-009 + admin scraper per ADR-008).
//      Each board holds all 12 real rosters of a pod.
//   2. The user's own extension-synced rosters for drafts that have no stored
//      board (DK entries, uncaptured UD pods). Drafts WITH a board are skipped
//      here — the board already contains the user's seat, and counting both
//      would double-count it.
//
// Output shapes:
//   tier1: { combos: { "pid|pid|pid": count }, metadata }
//   r1: { pid: count }
//   r2: { pid1: { pid2: count } }
//   r3: { "pid1|pid2": { pid3: count } }
//   r4: { "pid1|pid2|pid3": { pid4: count } }
//
// Combo keys are built from each roster's FIRST THREE PICKS in draft order,
// sorted by player_id. Three (not four) is deliberate: against ~14K tracked
// rosters, 64% of first-4 combos are one-of-one (the stat reads flat "unique"
// everywhere), while first-3 combos spread 1×–47× with a mean near 7 — an
// actually differentiating rarity signal (2026-07-05 evaluation).
//
// All reads fail soft: guests, missing grants, and fetch errors yield empty
// tables and consumers render an em-dash / empty state.

import { supabase } from './supabaseClient';
import { canonicalName } from './helpers';

const PAGE = 250;
const PATH_ROUNDS = 4;

/** Number of earliest picks that form the Early Combo key. */
export const COMBO_PICKS = 3;

let _boardsPromise = null; // boards are fetched once per session
const _builds = new Map(); // input signature → Promise<{ pre, post }>

function emptyTables() {
  // tier1.metadata and the top-level metadata are deliberately the same
  // object, so total_rosters stays in sync across both lookups.
  const metadata = { total_rosters: 0 };
  return { tier1: { combos: {}, metadata }, r1: {}, r2: {}, r3: {}, r4: {}, metadata };
}

// Mirrors the name-based classification used in ComboAnalysis / RosterViewer.
function isPreDraftSlate(slateTitle, tournamentTitle) {
  const slate = (slateTitle || '').toLowerCase();
  const tourn = (tournamentTitle || '').toLowerCase();
  if (slate.includes('pre-draft') || slate.includes('predraft')) return true;
  if (tourn.includes('early bird')) return true;
  return false;
}

// Superflex and Eliminator pods draft to a different shape (QB values shift,
// Eliminator runs short 6-round drafts); mixing them would pollute the path
// tables the same way DraftExplorer already excludes superflex rosters.
// Exported so score consumers can render "not comparable" instead of a
// misleading zero for rosters that are deliberately left out of the tables.
export function isExcludedSlate(slateTitle) {
  const slate = (slateTitle || '').toLowerCase();
  return slate.includes('superflex') || slate.includes('eliminator');
}

async function fetchAllBoards() {
  if (!supabase) return [];
  const out = [];
  try {
    for (let from = 0; ; from += PAGE) {
      const { data, error } = await supabase
        .from('draft_boards_admin')
        .select('draft_id, slate_title, picks')
        .order('draft_id')
        .range(from, from + PAGE - 1);
      if (error || !data) break;
      out.push(...data);
      if (data.length < PAGE) break;
    }
  } catch {
    // fail soft — callers fall back to the bundled sim
  }
  return out;
}

function fetchAllBoardsOnce() {
  if (!_boardsPromise) _boardsPromise = fetchAllBoards();
  return _boardsPromise;
}

function resolvePid(name, nameToPid) {
  if (!name) return null;
  const key = canonicalName(name);
  if (!key) return null;
  // Names missing from masterPlayers still count consistently under a
  // synthetic id, so two rosters sharing an unmapped player still collide.
  return nameToPid.get(key) ?? `unk-${key.replace(/[^\w-]/g, '')}`;
}

/**
 * Count one real roster (its first-4-pick path) into a source's tables.
 * @param {object} tables - a value produced by emptyTables()
 * @param {Array<string|null>} pids - player_ids of the first 4 picks, in draft order
 */
function addSeat(tables, pids) {
  const [p1, p2, p3, p4] = pids;
  if (!p1) return;
  tables.metadata.total_rosters += 1;
  tables.r1[p1] = (tables.r1[p1] || 0) + 1;
  if (!p2) return;
  const r2 = (tables.r2[p1] ||= {});
  r2[p2] = (r2[p2] || 0) + 1;
  if (!p3) return;
  const r3 = (tables.r3[`${p1}|${p2}`] ||= {});
  r3[p3] = (r3[p3] || 0) + 1;
  // Early Combo key: the first COMBO_PICKS picks, order-independent.
  const comboKey = pids.slice(0, COMBO_PICKS).sort((a, b) => a.localeCompare(b)).join('|');
  tables.tier1.combos[comboKey] = (tables.tier1.combos[comboKey] || 0) + 1;
  if (!p4) return;
  const r4 = (tables.r4[`${p1}|${p2}|${p3}`] ||= {});
  r4[p4] = (r4[p4] || 0) + 1;
}

async function build(masterPlayers, rosterRows) {
  const nameToPid = new Map();
  for (const p of masterPlayers) {
    if (p.player_id && p.name) nameToPid.set(canonicalName(p.name), p.player_id);
  }

  // Board slate_title actually stores the TOURNAMENT name as the platform
  // reported it ("The Big Board"), not the slate the extension entries carry
  // ("UD 2026 Pre-Draft Best Ball") — the name heuristic alone misclassifies
  // pre-draft tournaments as post. Classify boards in priority order:
  //   1. the user's own entry for that draft_id (authoritative for their pods),
  //   2. a status map learned from the user's entries, keyed by tournament AND
  //      slate title (covers other users' pods in tournaments the user plays),
  //   3. the name heuristic, treating the board title as both slate and
  //      tournament (catches "Pre-Draft" and DK "Early Bird" titles).
  const entryStatus = new Map();   // draft_id → 'pre' | 'post'
  const titleStatus = new Map();   // lowercased tournament/slate title → 'pre' | 'post'
  const excludedTitles = new Set(); // lowercased tournament titles on excluded slates
  for (const row of rosterRows) {
    const id = row?.entry_id != null ? String(row.entry_id) : '';
    const tourn = (row.tournamentTitle || '').toLowerCase();
    if (isExcludedSlate(row.slateTitle)) {
      if (tourn) excludedTitles.add(tourn);
      continue;
    }
    const status = isPreDraftSlate(row.slateTitle, row.tournamentTitle) ? 'pre' : 'post';
    if (id && !entryStatus.has(id)) entryStatus.set(id, status);
    if (tourn && !titleStatus.has(tourn)) titleStatus.set(tourn, status);
    const slate = (row.slateTitle || '').toLowerCase();
    if (slate && !titleStatus.has(slate)) titleStatus.set(slate, status);
  }

  const data = { pre: emptyTables(), post: emptyTables() };
  const boards = await fetchAllBoardsOnce();
  const boardIds = new Set();

  for (const b of boards) {
    const draftId = String(b.draft_id);
    boardIds.add(draftId);
    const title = (b.slate_title || '').toLowerCase();
    if (isExcludedSlate(b.slate_title) || excludedTitles.has(title)) continue;
    const picks = Array.isArray(b.picks) ? b.picks : [];
    // Boards from the pre-fix scraper hold null player names — unusable.
    if (picks.length === 0 || picks[0]?.name == null) continue;
    const status = entryStatus.get(draftId)
      ?? titleStatus.get(title)
      ?? (isPreDraftSlate(b.slate_title, b.slate_title) ? 'pre' : 'post');
    const tables = status === 'pre' ? data.pre : data.post;

    const bySeat = new Map();
    for (const pk of picks) {
      // draftEntryId can be an empty string on older captures — fall back to
      // the seat's slot index rather than lumping those picks together.
      let seat = pk?.draftEntryId;
      if (seat == null || seat === '') seat = pk?.slot;
      if (seat == null) continue;
      if (!bySeat.has(seat)) bySeat.set(seat, []);
      bySeat.get(seat).push(pk);
    }
    for (const seatPicks of bySeat.values()) {
      seatPicks.sort((a, b) => (Number(a.pick) || 0) - (Number(b.pick) || 0));
      addSeat(tables, seatPicks.slice(0, PATH_ROUNDS).map(pk => resolvePid(pk.name, nameToPid)));
    }
  }

  // The user's own rosters for drafts without a captured board.
  const byEntry = new Map();
  for (const row of rosterRows) {
    const id = row?.entry_id != null ? String(row.entry_id) : '';
    if (!id || boardIds.has(id)) continue;
    if (isExcludedSlate(row.slateTitle)) continue;
    if (!byEntry.has(id)) byEntry.set(id, []);
    byEntry.get(id).push(row);
  }
  for (const players of byEntry.values()) {
    const tables = isPreDraftSlate(players[0]?.slateTitle, players[0]?.tournamentTitle)
      ? data.pre
      : data.post;
    const sorted = players
      .filter(p => Number(p.pick) > 0)
      .sort((a, b) => Number(a.pick) - Number(b.pick));
    addSeat(tables, sorted.slice(0, PATH_ROUNDS).map(p => resolvePid(p.name, nameToPid)));
  }

  // Carried on the result so snapshot consumers (Arena) can resolve names and
  // classify pre/post the same way the tables were built.
  data.nameToPid = nameToPid;
  data.classify = (slateTitle, tournamentTitle) => {
    const tourn = (tournamentTitle || '').toLowerCase();
    const slate = (slateTitle || '').toLowerCase();
    return titleStatus.get(tourn)
      ?? titleStatus.get(slate)
      ?? (isPreDraftSlate(slateTitle, tournamentTitle) ? 'pre' : 'post');
  };

  return data;
}

/**
 * Load (and cache) real-draft frequency tables for both sources.
 * Rebuilds when the inputs change shape (e.g., masterPlayers arrives after an
 * early call) but never refetches boards within a session.
 *
 * @param {Array} masterPlayers - enriched master list (name + player_id)
 * @param {Array} rosterRows - flat roster rows (extension entries)
 * @returns {Promise<{ pre: object, post: object }>}
 */
export async function loadRealDraftData(masterPlayers = [], rosterRows = []) {
  const sig = `${masterPlayers.length}:${rosterRows.length}`;
  let promise = _builds.get(sig);
  if (!promise) {
    promise = build(masterPlayers, rosterRows);
    _builds.set(sig, promise);
    if (_builds.size > 6) _builds.delete(_builds.keys().next().value);
  }
  return promise;
}

/**
 * Format a combo occurrence as a share of all tracked drafts.
 * @returns {string|null} e.g. "0.09%", "<0.01%"; null when there is no data
 */
export function formatComboPct(count, totalRosters) {
  if (!totalRosters || count == null) return null;
  const pct = (count / totalRosters) * 100;
  if (pct === 0) return '0%';
  return pct < 0.01 ? '<0.01%' : `${pct.toFixed(2)}%`;
}

/**
 * Early Combo rate for an Arena display snapshot (or any object carrying
 * `players` with name+pick, plus slate/tournament titles). Classifies the
 * snapshot pre/post the same way the tables were built; if its combo is
 * missing from the classified source (e.g. a pod whose tournament the viewer
 * has no entries in), the other source is checked before giving up.
 *
 * @param {object} data - resolved value of loadRealDraftData()
 * @param {object} snapshot - { players: [{name, pick}], slateTitle, tournamentTitle }
 * @returns {{ count: number, totalRosters: number, pctText: string }|null}
 */
export function comboRateForSnapshot(data, snapshot) {
  if (!data || !snapshot || isExcludedSlate(snapshot.slateTitle)) return null;
  const picks = (snapshot.players ?? [])
    .filter(p => p?.name && Number(p.pick) > 0)
    .sort((a, b) => Number(a.pick) - Number(b.pick))
    .slice(0, COMBO_PICKS);
  if (picks.length < COMBO_PICKS) return null;
  const key = picks
    .map(p => resolvePid(p.name, data.nameToPid ?? new Map()))
    .sort((a, b) => a.localeCompare(b))
    .join('|');

  const primary = data.classify?.(snapshot.slateTitle, snapshot.tournamentTitle) ?? 'post';
  const fallback = primary === 'pre' ? 'post' : 'pre';
  for (const src of [primary, fallback]) {
    const t = data[src];
    const total = t?.metadata?.total_rosters ?? 0;
    if (!total) continue;
    const count = t.tier1.combos[key];
    if (count != null) {
      return { count, totalRosters: total, pctText: formatComboPct(count, total) };
    }
  }
  const total = data[primary]?.metadata?.total_rosters ?? 0;
  return total ? { count: 0, totalRosters: total, pctText: formatComboPct(0, total) } : null;
}
