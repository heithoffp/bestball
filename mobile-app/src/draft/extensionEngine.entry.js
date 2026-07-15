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

// Bumped with every engine change: the app JS updates over Metro but this
// bundle ships inside the native broadcast extension, so a stale EAS build
// silently runs old parsing. The version rides in every result so the panel
// can prove which engine is actually running.
export const ENGINE_VERSION = 'task329.4';

// Monotonic build counter (ADR-023). ENGINE_VERSION is a task-string with no
// ordering, so the App Group hot-load path uses this integer to decide whether
// the app-written engine is newer than the one baked into the extension
// bundle. BUMP THIS (by 1) with every engine change, alongside ENGINE_VERSION.
export const ENGINE_BUILD = 1;

let session = null;
let config = null;
let pool = null;
let lastCore = '';
// On-device debugging (TASK-328): ring buffer of recent ingests (parse
// summary + truncated OCR lines) that rides along in every result JSON, so
// the app can export exactly what the extension saw. ~6 KB worst case.
let diagLog = [];

function toMap(obj) {
  const map = new Map();
  if (obj && typeof obj === 'object') {
    for (const [k, v] of Object.entries(obj)) map.set(k, v);
  }
  return map;
}

function buildResult(obsKind, summary) {
  const myPickEvent = !!(summary && summary.myPickEvent);
  const glance = session.getGlance();
  glance.syncedAtEpoch = Math.floor(Date.now() / 1000);
  const status = session.getStatus();

  // Change detection + currentPick drive the event-driven push policy in Swift
  // (ADR-024): Swift pushes priority 10 on each currentPick advance OR on a
  // "significant" transition, floored to 3 s; nothing is pushed while idle.
  // `significant` is retained as the crunch/my-pick guarantee — it bypasses the
  // floor so on-clock is never delayed — but it is no longer the *only* p10
  // trigger (priority 5 is gone; iOS deferred it and the card froze far from
  // the pick).
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
    engine: ENGINE_VERSION,
    kind: obsKind ?? null,
    changed,
    significant: enteredCrunch || myPickLanded || myPickEvent,
    glance,
    state: session.serialize(),
    status: {
      currentPick: status.currentPick,
      picksUntil: status.picksUntil,
      slot: status.slot,
      slotSource: status.slotSource,
      ledgerSize: status.ledgerSize,
      myPickCount: status.myPicks.length,
    },
    summary: summary || null,
    diag: diagLog,
  });
}

globalThis.BBEEngine = {
  // Self-describing identity so an evaluated copy (e.g. the App Group hot-load
  // sanity-eval in FrameProcessor, ADR-023) can read version/build without
  // parsing the source text.
  version: ENGINE_VERSION,
  build: ENGINE_BUILD,

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
        username: config.username || null,
        rankMap: toMap(config.rankMap),
        exposureMap: toMap(config.exposureMap),
      });
      if (config.state) session.hydrate(config.state);
      lastCore = '';
      diagLog = [];
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
      const st = session.getStatus();
      diagLog.push({
        t: Math.floor(Date.now() / 1000),
        kind: obs.kind,
        pu: obs.picksUntil,
        cp: st.currentPick,
        led: st.ledgerSize,
        my: st.myPicks.length,
        confirm: summary?.confirmPick || null,
        lines: items.slice(0, 60).map(it => String(
          (typeof it === 'string' ? it : it?.text) ?? ''
        ).slice(0, 40)),
      });
      if (diagLog.length > 6) diagLog = diagLog.slice(-6);
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
