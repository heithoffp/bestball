// src/workers/podAdvance.worker.js
// Off-main-thread pod advance computation for the Roster Viewer's Adv %
// column. Each board simulates all 12 seats (utils/podAdvance.js), which
// costs tens of milliseconds per board — a large portfolio is seconds of CPU
// that must not block the UI. The math is deterministic (seeded by
// draftId+slot), so results match the Draft Board modal exactly.
//
// Message in:  { boards, metaById, adp: {latestAdpMap, projPointsMap}, actuals }
// Messages out: { type: 'batch', results: {draftId: prob|null} } (throttled),
//               then { type: 'done' }.

import { userPodAdvance } from '../utils/podAdvance.js';

const BATCH_MS = 250;

self.onmessage = (e) => {
  const { boards = [], metaById = {}, adp = {}, actuals = null } = e.data ?? {};
  const adpByPlatform = { underdog: adp };

  let results = {};
  let lastPost = Date.now();
  for (const board of boards) {
    const meta = metaById[board.draftId];
    if (!meta) continue;
    try {
      results[board.draftId] = userPodAdvance(board, {
        rosterPlayers: meta.players,
        tournamentTitle: meta.tournamentTitle,
        adpByPlatform,
        actuals,
      });
    } catch {
      // Store nulls: "board seen, couldn't model" — consumers distinguish
      // this from "still computing" for tooltips.
      results[board.draftId] = null;
    }
    const now = Date.now();
    if (now - lastPost >= BATCH_MS) {
      self.postMessage({ type: 'batch', results });
      results = {};
      lastPost = now;
    }
  }
  if (Object.keys(results).length > 0) self.postMessage({ type: 'batch', results });
  self.postMessage({ type: 'done' });
};
