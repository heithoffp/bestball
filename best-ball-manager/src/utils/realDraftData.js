// src/utils/realDraftData.js
// Real-draft frequency tables — computed from actual drafts instead of the
// Monte Carlo simulation:
//   1. Every seat of every captured pod board in draft_boards_admin
//      (participant-authorized capture per ADR-009 + admin scraper per ADR-008).
//      Each board holds all 12 real rosters of a pod.
//   2. The user's own extension-synced rosters for drafts that have no stored
//      board (DK entries, uncaptured UD pods). Drafts WITH a board are skipped
//      here — the board already contains the user's seat, and counting both
//      would double-count it.
//
// Output shapes mirror the bundled sim files so uniquenessEngine / draftModel
// lookups work unchanged:
//   tier1: { combos: { "pid|pid|pid|pid": count }, metadata }
//   r1: { pid: count }
//   r2: { pid1: { pid2: count } }
//   r3: { "pid1|pid2": { pid3: count } }
//   r4: { "pid1|pid2|pid3": { pid4: count } }
//
// Combo keys are built from each roster's FIRST FOUR PICKS in draft order,
// sorted by player_id (metadata.key_basis = 'picks'). The sim keyed on the
// 4 lowest-ADP players instead; callers must read metadata.key_basis and build
// lookup keys the same way the loaded table was keyed.
//
// All reads fail soft: guests, missing grants, and fetch errors yield empty
// tables, and callers fall back to the bundled simulation files.

import { supabase } from './supabaseClient';
import { canonicalName } from './helpers';

const PAGE = 250;
const PATH_ROUNDS = 4;

let _boardsPromise = null; // boards are fetched once per session
const _builds = new Map(); // input signature → Promise<{ pre, post }>

function emptyTables() {
  // tier1.metadata and the top-level metadata are deliberately the same
  // object, so total_rosters stays in sync across both lookups.
  const metadata = { total_rosters: 0, data_source: 'real', key_basis: 'picks' };
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
  if (!p4) return;
  const r4 = (tables.r4[`${p1}|${p2}|${p3}`] ||= {});
  r4[p4] = (r4[p4] || 0) + 1;
  const comboKey = [p1, p2, p3, p4].sort((a, b) => a.localeCompare(b)).join('|');
  tables.tier1.combos[comboKey] = (tables.tier1.combos[comboKey] || 0) + 1;
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
