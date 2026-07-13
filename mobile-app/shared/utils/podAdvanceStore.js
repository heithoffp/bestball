// src/utils/podAdvanceStore.js
// Shared compute + cache layer for the pod-exact Adv % column.
//
// userPodAdvance simulates all 12 seats of a captured board, so a large
// portfolio costs seconds of CPU. This store makes that cost invisible:
//   1. the math runs chunked with yields on the JS thread (RN has no Web
//      Worker; this is the web version's fallback path),
//   2. results are memoized per data-version in module memory, so tab
//      revisits within a session render instantly, and
//   3. results persist to AsyncStorage (modelCache.js), so app relaunches render
//      instantly too — a rotated version key (new ADP snapshot, new actuals
//      week) is simply a cache miss and recomputes.
// The model is deterministic (seeded by draftId+slot), so a cached value is
// identical to what the Draft Board modal computes live from the same data.
//
// Concurrent compute calls (the app-level prewarm in rosterPrewarm.js plus a
// mounted Roster Viewer) are deduped per board via an in-flight set; every
// caller sees all results through subscribePodAdv.

import { cacheGet, cachePut } from './modelCache.js';
import { userPodAdvance } from './podAdvance.js';

/** Bump when the advance-model math changes — invalidates persisted results. */
const MODEL_VERSION = 1;
const PERSIST_KEY = 'podAdv';
const MAX_VERSIONS = 4;

const memCache = new Map();   // versionKey → { [draftId]: prob|null }
const inflight = new Map();   // versionKey → Set<draftId> being computed
const listeners = new Map();  // versionKey → Set<fn(results)>
const hydrations = new Map(); // versionKey → Promise<object|null>

/**
 * Version key covering every model input that isn't stable per draftId: the
 * ADP snapshot date, the projection table size (proxy for the bundled
 * projections build), and which actuals weeks are loaded. Board picks and
 * roster names are effectively immutable per draft, so they live in the
 * entry key (the draftId) instead.
 *
 * @param {'real'|'demo'} scope - demo boards are synthetic; keep them out of
 *   the persisted real cache.
 */
export function podAdvVersionKey(adpByPlatform, actuals, scope = 'real') {
  const ud = adpByPlatform?.underdog;
  const adpDate = ud?.snapshots?.[ud.snapshots.length - 1]?.date ?? 'none';
  const projCount = ud?.projPointsMap ? Object.keys(ud.projPointsMap).length : 0;
  const weeks = actuals
    ? ['halfppr', 'fullppr'].map(s => (actuals[s]?.weekNumbers ?? []).join(',')).join(';')
    : 'none';
  return `${scope}|v${MODEL_VERSION}|${adpDate}|p${projCount}|w${weeks}`;
}

/** Synchronously read this session's cached results. Do not mutate. */
export function getMemoPodAdv(versionKey) {
  return memCache.get(versionKey) ?? null;
}

/** Subscribe to result batches for a version key. Returns an unsubscriber. */
export function subscribePodAdv(versionKey, fn) {
  let set = listeners.get(versionKey);
  if (!set) { set = new Set(); listeners.set(versionKey, set); }
  set.add(fn);
  return () => {
    set.delete(fn);
    if (set.size === 0) listeners.delete(versionKey);
  };
}

let persistTimer = null;
function schedulePersist(versionKey) {
  clearTimeout(persistTimer);
  persistTimer = setTimeout(() => {
    const data = memCache.get(versionKey);
    if (data) cachePut(PERSIST_KEY, { version: versionKey, data: { ...data } });
  }, 500);
}

function merge(versionKey, results, persist) {
  let base = memCache.get(versionKey);
  if (!base) {
    base = {};
    memCache.set(versionKey, base);
    for (const key of memCache.keys()) {
      if (memCache.size <= MAX_VERSIONS) break;
      if (key !== versionKey) memCache.delete(key);
    }
  }
  Object.assign(base, results);
  const subs = listeners.get(versionKey);
  if (subs) for (const fn of subs) { try { fn(results); } catch { /* subscriber's problem */ } }
  if (persist) schedulePersist(versionKey);
}

/**
 * Load persisted results for a version key into the memory cache (read once
 * per session). Resolves to the merged map, or null when nothing usable
 * exists. Results computed while the read was in flight win over persisted.
 */
export function hydratePodAdv(versionKey) {
  if (memCache.has(versionKey)) return Promise.resolve(memCache.get(versionKey));
  let p = hydrations.get(versionKey);
  if (!p) {
    p = (async () => {
      const rec = await cacheGet(PERSIST_KEY);
      if (rec?.version === versionKey && rec.data && typeof rec.data === 'object') {
        const live = memCache.get(versionKey);
        memCache.set(versionKey, { ...rec.data, ...(live ?? {}) });
      }
      return memCache.get(versionKey) ?? null;
    })();
    hydrations.set(versionKey, p);
  }
  return p;
}

/**
 * Compute pod advance odds for the given boards off the main thread, merging
 * results into the cache and notifying subscribers as batches land. Boards
 * already being computed by a concurrent call are skipped — their results
 * arrive through the same subscription.
 *
 * @param {{boards: Array<object>, metaById: Object<string, {players: Array<{name: string}>, tournamentTitle: string|null}>,
 *          adp: {latestAdpMap: object, projPointsMap: object}, actuals: object|null,
 *          versionKey: string, persist?: boolean}} opts
 * @returns {{promise: Promise<void>, cancel: () => void}}
 */
export function computePodAdvance({ boards = [], metaById = {}, adp, actuals = null, versionKey, persist = true }) {
  let flight = inflight.get(versionKey);
  if (!flight) { flight = new Set(); inflight.set(versionKey, flight); }
  const todo = boards.filter(b => !flight.has(b.draftId));
  todo.forEach(b => flight.add(b.draftId));

  let cancelled = false;
  const release = () => { todo.forEach(b => flight.delete(b.draftId)); };

  // React Native has no Web Worker; the web version's worker path is removed
  // here and the chunked-with-yields JS-thread path (the web fallback) is the
  // only implementation. The math is identical and deterministic.
  const runInline = async () => {
    const adpByPlatform = { underdog: adp ?? {} };
    const CHUNK = 8;
    for (let i = 0; i < todo.length && !cancelled; i += CHUNK) {
      const results = {};
      for (const board of todo.slice(i, i + CHUNK)) {
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
          results[board.draftId] = null;
        }
      }
      if (cancelled) return;
      merge(versionKey, results, persist);
      if (i + CHUNK < todo.length) await new Promise(r => setTimeout(r, 0));
    }
  };

  const promise = (async () => {
    if (todo.length === 0) return;
    if (!cancelled) await runInline();
  })().finally(() => {
    release();
  });

  return {
    promise,
    cancel: () => {
      cancelled = true;
      release();
    },
  };
}
