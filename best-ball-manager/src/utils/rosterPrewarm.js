// src/utils/rosterPrewarm.js
// Fire-and-forget warm-up of everything the Roster Viewer's slow columns
// need, kicked off from App bootstrap the moment roster data is loaded — so
// by the time the user opens the Rosters tab, Adv % and Early Combo % are
// already fetched, computed, and cached (podAdvanceStore + realDraftData
// module caches), and the tab renders them immediately.
//
// Everything here is best-effort and shares module-level caches with the
// Roster Viewer: whichever side starts first wins, the other reuses. Demo
// mode is excluded — demo boards are synthesized inside the Roster Viewer.

import { loadRealDraftData } from './realDraftData';
import { fetchUserBoardsOnce } from './draftBoards';
import { podAdvVersionKey, getMemoPodAdv, hydratePodAdv, computePodAdvance } from './podAdvanceStore';

let _lastKey = null;

export function prewarmRosterModels({ rosterData = [], masterPlayers = [], adpByPlatform = {}, actuals = null } = {}) {
  if (!rosterData.length) return;
  const versionKey = podAdvVersionKey(adpByPlatform, actuals, 'real');
  const key = `${masterPlayers.length}:${rosterData.length}:${versionKey}`;
  if (_lastKey === key) return; // already warming/warmed for these inputs
  _lastKey = key;

  // Early Combo tables: full board fetch + aggregation, promise-cached per
  // session inside realDraftData — the Roster Viewer's loadComboTable calls
  // resolve from the same promise.
  loadRealDraftData(masterPlayers, rosterData).catch(() => {});

  // Pod-exact Adv %: fetch the user's captured boards, then compute any odds
  // missing from the memory/IndexedDB cache in the worker.
  (async () => {
    try {
      const ids = [...new Set(rosterData.map(p => p.entry_id))];
      const boards = await fetchUserBoardsOnce(ids);
      if (!boards.length) return;

      const byEntry = new Map(); // draftId → { players, tournamentTitle }
      for (const row of rosterData) {
        const id = row?.entry_id != null ? String(row.entry_id) : '';
        if (!id || !row.name) continue;
        let meta = byEntry.get(id);
        if (!meta) {
          meta = { players: [], tournamentTitle: row.tournamentTitle ?? null };
          byEntry.set(id, meta);
        }
        meta.players.push({ name: row.name });
      }

      const known = getMemoPodAdv(versionKey) ?? await hydratePodAdv(versionKey);
      const missing = boards.filter(b => byEntry.has(b.draftId) && !(known && b.draftId in known));
      if (!missing.length) return;
      const metaById = {};
      for (const b of missing) metaById[b.draftId] = byEntry.get(b.draftId);

      computePodAdvance({
        boards: missing,
        metaById,
        adp: {
          latestAdpMap: adpByPlatform?.underdog?.latestAdpMap ?? {},
          projPointsMap: adpByPlatform?.underdog?.projPointsMap ?? {},
        },
        actuals,
        versionKey,
        persist: true,
      });
    } catch {
      // prewarm is best-effort — the Roster Viewer computes on demand anyway
    }
  })();
}
