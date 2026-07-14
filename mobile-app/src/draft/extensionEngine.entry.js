// extensionEngine.entry.js — the JavaScriptCore entry point for the broadcast
// extension (targets/draft-broadcast). esbuild bundles this (plus the pure
// engine modules and shared/utils/helpers) into an IIFE at
// targets/draft-broadcast/assets/engine.js via `npm run build:engine`.
//
// Running the SAME tested engine in the extension (instead of a Swift port)
// guarantees behavior parity with the in-app path — this is the load-bearing
// decision of the live-capture design (docs/LIVE_SESSION_V1.md).
//
// Swift calls (all JSON strings in/out; no host objects cross the boundary):
//   BBEEngine.init(configJson)  -> "ok" | "error: ..."
//   BBEEngine.ingest(itemsJson) -> resultJson (see below)
//   BBEEngine.snapshot()        -> resultJson without ingest-specific fields
import { buildPool } from './playerMatcher.js';
import { parseUnderdogScreen } from './underdogParser.js';
import { createDraftSession } from './sessionEngine.js';

let session = null;
let config = null;
let pool = null;
let lastCore = '';

function toMap(obj) {
  const map = new Map();
  if (obj && typeof obj === 'object') {
    for (const [k, v] of Object.entries(obj)) map.set(k, v);
  }
  return map;
}

function buildResult(obsKind, summary) {
  const glance = session.getGlance();
  glance.syncedAtEpoch = Math.floor(Date.now() / 1000);
  const status = session.getStatus();

  // Change detection drives push pacing in Swift. "Significant" events get
  // priority-10 pushes; keep them rare (DEVELOPMENT_NOTES p10 budget).
  const core = JSON.stringify([
    glance.phase, glance.picksUntil, glance.currentPick, glance.myNextPick,
    glance.rosterBar, glance.targets,
  ]);
  const changed = core !== lastCore;
  const enteredCrunch = changed
    && (glance.phase === 'onClock' || glance.phase === 'onDeck'
      || (glance.picksUntil >= 0 && glance.picksUntil <= 3));
  const myPickLanded = changed && /QB \d+ · RB \d+/.test(glance.rosterBar)
    && lastCore && JSON.parse(lastCore)[4] !== glance.rosterBar;
  if (changed) lastCore = core;

  return JSON.stringify({
    ok: true,
    kind: obsKind ?? null,
    changed,
    significant: enteredCrunch || myPickLanded,
    glance,
    state: session.serialize(),
    status: {
      currentPick: status.currentPick,
      picksUntil: status.picksUntil,
      slot: status.slot,
      ledgerSize: status.ledgerSize,
      myPickCount: status.myPicks.length,
    },
    summary: summary || null,
  });
}

globalThis.BBEEngine = {
  init(configJson) {
    try {
      config = JSON.parse(configJson);
      pool = buildPool(config.poolRows || []);
      if (!pool.players.length) return 'error: empty player pool';
      session = createDraftSession({
        pool,
        teams: config.teams || 12,
        rounds: config.rounds || 18,
        slot: config.slot || null,
        rankMap: toMap(config.rankMap),
        exposureMap: toMap(config.exposureMap),
      });
      if (config.state) session.hydrate(config.state);
      lastCore = '';
      return 'ok';
    } catch (e) {
      return `error: ${e && e.message ? e.message : String(e)}`;
    }
  },

  /** itemsJson: [{ text, x, y, w, h, confidence }] from Vision (or plain strings). */
  ingest(itemsJson) {
    try {
      if (!session) return JSON.stringify({ ok: false, error: 'not initialized' });
      const items = JSON.parse(itemsJson);
      const obs = parseUnderdogScreen(items, { pool, teams: config.teams || 12 });
      const summary = session.ingest(obs);
      return buildResult(obs.kind, summary);
    } catch (e) {
      return JSON.stringify({ ok: false, error: e && e.message ? e.message : String(e) });
    }
  },

  snapshot() {
    try {
      if (!session) return JSON.stringify({ ok: false, error: 'not initialized' });
      return buildResult(null, null);
    } catch (e) {
      return JSON.stringify({ ok: false, error: e && e.message ? e.message : String(e) });
    }
  },
};
