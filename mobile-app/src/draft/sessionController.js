// sessionController.js — the singleton that glues the pieces of a Live Draft
// Session together. UI talks to this, never to the engine directly.
//
// Live capture (docs/LIVE_SESSION_V1.md): a ReplayKit broadcast extension
// captures the screen continuously, runs the same JS engine (JSC), and pushes
// Live Activity updates via the live-activity-relay Edge Function. The app
// hands the session config through the App Group, then absorbs the extension's
// serialized state whenever it foregrounds. This is the sole capture path —
// the earlier screenshot fallback was removed once live capture was proven on
// device (TASK-327).
import { AppState } from 'react-native';
import { publishDraftState, endDraftFeed } from './draftFeed';
import { buildPool } from './playerMatcher';
import { createDraftSession } from './sessionEngine';
import {
  startActivity, updateActivity, endActivity, getActivityPushToken, hasLiveActivity,
  nativeModuleAvailable, liveActivitySupported, activitiesEnabled, frequentPushesEnabled,
  writeSharedValue, readSharedValue, readSharedDouble, latestFrameLogPath,
  writeSharedFile,
} from './liveActivity';
import { ENGINE_SOURCE, ENGINE_BUILD, ENGINE_VERSION } from './generated/engineSource';
import { SUPABASE_FUNCTIONS_URL, SUPABASE_ANON_KEY } from '../../shared/config';

export const BROADCAST_EXTENSION_ID = 'com.bestballexposures.app.draftbroadcast';

const SESSION_CONFIG_KEY = 'bbe.sessionConfig';
const RESULT_KEY = 'bbe.extensionResult';
const HEARTBEAT_KEY = 'bbe.extensionHeartbeat';
// Per-platform remembered usernames (TASK-350) — DK and UD accounts differ,
// so each platform keeps its own. 'bbe.udUsername' predates the split and
// stays as the Underdog key so existing installs keep their prefill.
const USERNAME_KEYS = {
  underdog: 'bbe.udUsername',
  draftkings: 'bbe.dkUsername',
};
// The platform picked at the last session start, prefilling the setup screen.
const PLATFORM_KEY = 'bbe.draftPlatform';
const PLATFORM_LABELS = { underdog: 'Underdog', draftkings: 'DraftKings' };
// TASK-338: single source of truth for the activity's APNs push token. The
// native pushTokenUpdates observer keeps this current (initial token, iOS
// rotation, every recovery re-request); FrameProcessor reads it fresh per push
// so a restarted activity's new token reaches the running extension without an
// engine-destroying epoch bump. The app also writes it belt-and-braces below.
const PUSH_TOKEN_KEY = 'bbe.pushToken';
// TASK-336 reset flow: bumping this epoch tells a RUNNING broadcast extension
// to re-init its engine from the (rewritten) session config — the board
// resets for the next draft room without ending the broadcast.
const EPOCH_KEY = 'bbe.configEpoch';
// ADR-023 engine hot-load: the app hands its current parse engine to the
// broadcast extension through the App Group, so parser fixes reach the
// extension via a JS reload with no native rebuild.
const ENGINE_FILE = 'engine-hotload.js';
const ENGINE_BUILD_KEY = 'bbe.engineBuild';
const ENGINE_VERSION_KEY = 'bbe.engineVersion';

const HEARTBEAT_POLL_MS = 4000;
const HEARTBEAT_FRESH_S = 8;
const LOG_LIMIT = 6;

const state = {
  active: false,
  session: null,
  pool: null,
  platform: 'underdog',
  teams: 12,
  lastSyncEpoch: 0,
  pushToken: null,
  captureLive: false,
  lastHeartbeatAt: 0,
  lastAbsorbedRaw: null,
  resumeLogged: false,
  activityStarted: false,
  activityError: null,
  lastActivityRestartAt: 0,  // debounce for the loss-detection re-request
  lastError: null,
  log: [],
  appStateSub: null,
  heartbeatTimer: null,
  listeners: new Set(),
  baseConfig: null,        // config minus `state`, for warm-restart rewrites
  startInputs: null,       // raw startSession inputs, for resetDraftBoard()
  configEpoch: 0,          // bumped per session start and per board reset
  lastPersistedKey: '',
  lastDiag: null,          // extension's recent-ingest ring buffer (debugging)
  debug: false,            // internal-tester session: frame recording + debug UI
  extensionEngine: null,   // version reported by the extension's engine bundle
  lastDraftGen: 0,         // engine draft generation (auto new-draft reset)
};

function notify() {
  for (const fn of state.listeners) {
    try { fn(getSnapshot()); } catch { /* subscriber's problem */ }
  }
}

function pushLog(message) {
  state.log = [{ at: Date.now(), message }, ...state.log].slice(0, LOG_LIMIT);
}

function haptic(kind) {
  try {
    // eslint-disable-next-line global-require
    const Haptics = require('expo-haptics');
    if (kind === 'success') Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    else if (kind === 'warning') Haptics.notificationAsync(Haptics.NotificationFeedbackType.Warning);
  } catch { /* haptics optional */ }
}

function stampedGlance(phaseOverride) {
  const glance = state.session.getGlance(phaseOverride ? { phaseOverride } : {});
  glance.syncedAtEpoch = state.lastSyncEpoch;
  return glance;
}

function publishAll({ freshSync = false } = {}) {
  if (!state.session) return;
  if (freshSync) state.lastSyncEpoch = Math.floor(Date.now() / 1000);
  const status = state.session.getStatus();
  if (status.syncCount > 0 || status.manualSlot) {
    publishDraftState(state.session.getDraftState());
  }
  if (state.activityStarted) {
    const res = updateActivity(stampedGlance());
    // Clear on success so a transient failure doesn't leave a permanent warning
    // (TASK-338: this row was only ever set, never cleared).
    state.activityError = res.ok ? null : res.error;
  }
}

/** The username remembered from the last session on `platform` (configured or
 *  auto-learned). */
export function getRememberedUsername(platform = 'underdog') {
  return readSharedValue(USERNAME_KEYS[platform] || USERNAME_KEYS.underdog);
}

/** The platform picked at the last session start ('underdog' | 'draftkings'). */
export function getRememberedPlatform() {
  const p = readSharedValue(PLATFORM_KEY);
  return p === 'draftkings' ? 'draftkings' : 'underdog';
}

export function getSnapshot() {
  return {
    active: state.active,
    platform: state.platform,
    status: state.session ? state.session.getStatus() : null,
    log: state.log,
    pushToken: !!state.pushToken,
    captureLive: state.captureLive,
    lastHeartbeatAt: state.lastHeartbeatAt,
    activityStarted: state.activityStarted,
    activityError: state.activityError,
    lastError: state.lastError,
    extensionEngine: state.extensionEngine,
    debug: state.debug,
    capabilities: {
      nativeModule: nativeModuleAvailable(),
      liveActivity: liveActivitySupported(),
      activitiesEnabled: nativeModuleAvailable() ? activitiesEnabled() : false,
      frequentPushes: nativeModuleAvailable() ? frequentPushesEnabled() : false,
    },
  };
}

export function subscribeSession(fn) {
  state.listeners.add(fn);
  fn(getSnapshot());
  return () => state.listeners.delete(fn);
}

/**
 * Start a Live Draft Session (live capture — ReplayKit broadcast).
 * poolRows: [{ name, position, team, adp }] (UD ADP snapshot)
 * rankMap / exposureMap: Map keyed by canonical name (optional)
 * rosterIndexMap: Map(canonical -> Set(entryId)) for the glance correlation
 * column (TASK-337, optional)
 */
export async function startSession({
  poolRows, rankMap, exposureMap, rosterIndexMap,
  slot = null, teams = 12, rounds = 18, username = null, platform = 'underdog',
  debug = false,
}) {
  if (state.active) endSession();
  const platformLabel = PLATFORM_LABELS[platform] || 'Underdog';
  const usernameKey = USERNAME_KEYS[platform] || USERNAME_KEYS.underdog;
  if (!poolRows?.length) {
    state.lastError = `No ${platformLabel} player pool loaded yet`;
    notify();
    return false;
  }
  // Username anchors the slot (TASK-328): configured > remembered from a
  // previous draft > auto-learned mid-session (lobby / "Your pick" card).
  // TASK-339: required to start — auto slot detection keys on it, and the setup
  // screen gates Start on it.
  const knownUsername = username || readSharedValue(usernameKey) || null;
  if (!knownUsername) {
    state.lastError = `Enter your ${platformLabel} username to start`;
    notify();
    return false;
  }
  // Remember a configured username immediately (not just when auto-learned)
  // so the setup screen prefills it next time (TASK-339), and the platform
  // choice so the selector defaults to it (TASK-350).
  if (username) writeSharedValue(usernameKey, username);
  writeSharedValue(PLATFORM_KEY, platform);
  state.debug = !!debug;
  state.pool = buildPool(poolRows);
  state.platform = platform;
  state.teams = teams;
  state.session = createDraftSession({
    pool: state.pool, teams, rounds, slot, username: knownUsername,
    rankMap, exposureMap, rosterIndexMap,
  });
  state.active = true;
  state.lastSyncEpoch = 0;
  state.lastAbsorbedRaw = null;
  state.resumeLogged = false;
  state.captureLive = false;
  state.pushToken = null;
  state.log = [];
  state.lastError = null;
  state.activityError = null;
  state.lastActivityRestartAt = 0;
  state.lastDraftGen = 0;

  const res = startActivity(stampedGlance(), { withPushToken: true });
  state.activityStarted = res.ok;
  state.activityError = res.ok ? null : res.error;
  if (!res.ok) pushLog(`Live Activity unavailable: ${res.error}`);

  if (res.ok) {
    state.pushToken = await getActivityPushToken();
    if (state.pushToken) {
      // Belt-and-braces for builds where the native pushTokenUpdates observer
      // hasn't landed; harmless duplication otherwise (TASK-338).
      writeSharedValue(PUSH_TOKEN_KEY, state.pushToken);
    } else {
      pushLog('No push token. Glance updates only while BBE is open');
    }
  }
  // Hand the current parse engine to the broadcast extension (ADR-023) BEFORE
  // the session config that triggers capture, so the extension's setUp reads a
  // fresh engine. The extension only adopts it when its build is newer than
  // the one baked into the native bundle and it passes a sanity-eval; else it
  // falls back to its bundled asset. The engine text rides this JS bundle, so
  // a Metro reload updates it with no native rebuild.
  writeSharedFile(ENGINE_FILE, ENGINE_SOURCE);
  writeSharedValue(ENGINE_BUILD_KEY, String(ENGINE_BUILD));
  writeSharedValue(ENGINE_VERSION_KEY, ENGINE_VERSION);

  // Hand the session to the broadcast extension through the App Group.
  writeSharedValue(RESULT_KEY, null);
  state.startInputs = { poolRows, rankMap, exposureMap, rosterIndexMap, teams, rounds };
  state.configEpoch += 1;
  state.baseConfig = {
    poolRows,
    teams,
    rounds,
    slot,
    // The extension engine selects the platform's parser from this (TASK-350).
    platform,
    username: knownUsername,
    rankMap: rankMap ? Object.fromEntries(rankMap) : {},
    exposureMap: exposureMap ? Object.fromEntries(exposureMap) : {},
    // Sets don't survive JSON — entry-id Sets ride as arrays (TASK-337).
    rosterIndexMap: rosterIndexMap
      ? Object.fromEntries([...rosterIndexMap].map(([k, ids]) => [k, [...ids]])) : {},
    pushToken: state.pushToken,
    relayUrl: `${SUPABASE_FUNCTIONS_URL}/live-activity-relay`,
    anonKey: SUPABASE_ANON_KEY,
    configEpoch: state.configEpoch,
    // TASK-331: the extension records every OCR frame (JSONL in the App
    // Group) so whole drafts replay offline via scripts/replay-frames.mjs.
    // Author-account sessions only (authorPreview allowlist) — off for users.
    recordFrames: state.debug,
  };
  state.lastPersistedKey = '';
  writeSharedValue(SESSION_CONFIG_KEY, JSON.stringify({
    ...state.baseConfig,
    state: state.session.serialize(),
  }));
  writeSharedValue(EPOCH_KEY, String(state.configEpoch));
  state.heartbeatTimer = setInterval(pollExtension, HEARTBEAT_POLL_MS);

  state.appStateSub?.remove?.();
  state.appStateSub = AppState.addEventListener('change', (next) => {
    if (next !== 'active' || !state.active) return;
    absorbExtensionState();
    pollExtension();
  });

  pushLog('Session armed. Tap record, confirm Start Broadcast, then draft');
  notify();
  return true;
}

// ---- live mode: extension state absorption + heartbeat ----

function pollExtension() {
  if (!state.active) return;
  const hb = readSharedDouble(HEARTBEAT_KEY);
  state.lastHeartbeatAt = hb > 0 ? hb * 1000 : 0;
  const wasLive = state.captureLive;
  state.captureLive = hb > 0 && (Date.now() / 1000 - hb) < HEARTBEAT_FRESH_S;
  if (state.captureLive && !wasLive) pushLog('Broadcast capture is live');
  if (!state.captureLive && wasLive) pushLog('Broadcast capture stopped or stalled');
  absorbExtensionState();
  // Runs on the 4 s foreground poll and on the AppState 'active' handoff (which
  // calls pollExtension): exactly when the app can legally re-request an
  // activity (Activity.request requires foreground). Fire-and-forget — the
  // debounce inside guards re-entrancy across overlapping polls.
  ensureActivityAlive();
  if (state.captureLive !== wasLive) notify();
}

/**
 * Loss detection + auto-restart (TASK-338). iOS ends a Live Activity at its
 * 8-hour lifetime cap, and the user can swipe it off the lock screen; either
 * leaves `activityStarted` true forever while the extension keeps pushing to a
 * dead APNs token for the rest of the draft. When the activity is gone,
 * silently re-request it and re-hand the fresh token to the running extension.
 */
async function ensureActivityAlive() {
  if (!state.active || !state.activityStarted || !nativeModuleAvailable()) return;
  if (hasLiveActivity()) return;
  // Debounce: a device refusing requests (e.g. Live Activities toggled off
  // mid-draft) must not spin. Stamp BEFORE the await so overlapping polls can't
  // launch a second attempt while the token poll is in flight (~8 s).
  const now = Date.now();
  if (now - state.lastActivityRestartAt < 30000) return;
  state.lastActivityRestartAt = now;

  // The native start ends lingering orphan cards first, so the dead card is
  // cleaned up as part of the re-request.
  const res = startActivity(stampedGlance(), { withPushToken: true });
  if (!state.active) return;
  if (!res.ok) {
    state.activityError = res.error; // panel row surfaces it; retry after debounce
    notify();
    return;
  }
  const token = await getActivityPushToken();
  if (!state.active || !state.session) return; // endSession() ran during the poll
  state.pushToken = token;
  if (token) writeSharedValue(PUSH_TOKEN_KEY, token);
  // Rewrite the session config with the new token so a future broadcast RESTART
  // inits warm. Do NOT bump configEpoch — that re-inits the LIVE extension's
  // engine mid-draft; the extension already adopts the new token per push from
  // bbe.pushToken (written above + by the native observer).
  if (state.baseConfig) {
    state.baseConfig.pushToken = token;
    writeSharedValue(SESSION_CONFIG_KEY, JSON.stringify({
      ...state.baseConfig,
      state: state.session.serialize(),
    }));
  }
  state.activityError = null;
  pushLog('Live Activity restarted. It was ended by iOS or dismissed');
  notify();
}

function absorbExtensionState() {
  if (!state.active || !state.session) return;
  const raw = readSharedValue(RESULT_KEY);
  if (!raw || raw === state.lastAbsorbedRaw) return;
  state.lastAbsorbedRaw = raw;
  try {
    const result = JSON.parse(raw);
    // A result stamped with an older config epoch predates the last board
    // reset — absorbing it would resurrect the previous draft (TASK-336).
    if (result?.epoch != null && result.epoch !== state.configEpoch) return;
    if (result?.diag) state.lastDiag = result.diag;
    // Version handshake: an extension without `engine` predates TASK-328 —
    // the phone is running a stale EAS build and needs a rebuild.
    const reportedEngine = result?.engine || 'stale (rebuild needed)';
    if (reportedEngine !== state.extensionEngine) {
      state.extensionEngine = reportedEngine;
      pushLog(`Extension engine: ${reportedEngine}`);
    }
    if (result?.ok && result.state && state.session.hydrate(result.state)) {
      publishAll({ freshSync: true });
      const s = state.session.getStatus();
      // Auto new-draft reset (the extension spotted the user's roster panel
      // contradicting the held board): the hydrate above already wiped and
      // reseeded the app-side session — just tell the user.
      if (s.draftGen !== state.lastDraftGen) {
        state.lastDraftGen = s.draftGen;
        pushLog('New draft detected. Board reset automatically');
        haptic('success');
      }
      // Persist the merged state back so a broadcast RESTART resumes warm —
      // the extension inits from this config, and the snapshot written at
      // session start is empty (an attempt-2 extension pushed empty-roster
      // glances for the rest of the draft). Rewrite when anything durable
      // (ledger, anchor, username) changed.
      const persistKey = `${s.draftGen}:${s.ledgerSize}:${s.anchoredSlot ?? ''}:${s.learnedUsername ?? ''}`;
      if (state.baseConfig && persistKey !== state.lastPersistedKey) {
        state.lastPersistedKey = persistKey;
        writeSharedValue(SESSION_CONFIG_KEY, JSON.stringify({
          ...state.baseConfig,
          state: state.session.serialize(),
        }));
      }
      // One-time note when we've joined a draft already underway.
      if (s.isResume && !state.resumeLogged) {
        state.resumeLogged = true;
        pushLog(`Resumed mid-draft: ${s.picksAtStart} picks already on the board`);
      }
      pushLog(`capture · P${s.currentPick}${s.picksUntil != null ? ` · up in ${s.picksUntil}` : ''} · ${s.ledgerSize} picks known`);
      // Remember the auto-learned username for the next draft (per platform).
      const usernameKey = USERNAME_KEYS[state.platform] || USERNAME_KEYS.underdog;
      if (s.learnedUsername && s.learnedUsername !== readSharedValue(usernameKey)) {
        writeSharedValue(usernameKey, s.learnedUsername);
      }
      notify();
    }
  } catch { /* partial write — next poll gets it */ }
}

/**
 * Debug bundle for the confidence hub's share button: app-side session status
 * plus the extension's recent-ingest ring buffer (what it actually OCR'd).
 */
export function exportDebug() {
  const s = state.session ? state.session.getStatus() : null;
  return JSON.stringify({
    at: new Date().toISOString(),
    status: s && {
      slot: s.slot,
      slotSource: s.slotSource,
      learnedUsername: s.learnedUsername,
      currentPick: s.currentPick,
      picksUntil: s.picksUntil,
      myNextPick: s.myNextPick,
      ledgerSize: s.ledgerSize,
      inferredGone: s.inferredGone,
      syncCount: s.syncCount,
      draftGen: s.draftGen,
      slotConflict: s.slotConflict,
      myPicks: s.myPicks,
      opponentTallies: s.opponentTallies,
      usernameSlots: s.usernameSlots,
    },
    captureLive: state.captureLive,
    // TASK-338: answer "was the Live Activity alive?" directly in the bundle.
    activityStarted: state.activityStarted,
    activityError: state.activityError,
    pushToken: !!state.pushToken,
    lastHeartbeatAt: state.lastHeartbeatAt,
    capabilities: {
      nativeModule: nativeModuleAvailable(),
      liveActivity: liveActivitySupported(),
      activitiesEnabled: nativeModuleAvailable() ? activitiesEnabled() : false,
      frequentPushes: nativeModuleAvailable() ? frequentPushesEnabled() : false,
    },
    extensionEngine: state.extensionEngine,
    log: state.log,
    extensionDiag: state.lastDiag,
  }, null, 1);
}

/** Newest session frame recording written by the extension (or null). */
export function getFrameLogPath() {
  return latestFrameLogPath();
}

export function setSessionSlot(slot) {
  if (!state.session) return;
  state.session.setManualSlot(slot);
  publishAll();
  notify();
}

/**
 * Manually reset the board for the next draft in a back-to-back slow-draft
 * session (TASK-336). Now a fallback: the engine auto-detects the next room
 * when the user taps their profile card there (sessionEngine new-draft
 * detection) — this path keeps the pool, rankings, exposures, and remembered username;
 * drops the ledger, availability marks, slot anchor, and pick position. The
 * configEpoch bump tells the running broadcast extension to re-init its
 * engine from the rewritten config — the broadcast itself never stops.
 */
export function resetDraftBoard() {
  if (!state.active || !state.startInputs || !state.session) return false;
  const { rankMap, exposureMap, rosterIndexMap, teams, rounds } = state.startInputs;
  const usernameKey = USERNAME_KEYS[state.platform] || USERNAME_KEYS.underdog;
  const knownUsername = readSharedValue(usernameKey) || state.baseConfig?.username || null;
  state.session = createDraftSession({
    pool: state.pool, teams, rounds, slot: null, username: knownUsername,
    rankMap, exposureMap, rosterIndexMap,
  });
  state.configEpoch += 1;
  state.lastSyncEpoch = 0;
  state.lastAbsorbedRaw = null;
  state.resumeLogged = false;
  state.lastPersistedKey = '';
  state.lastDiag = null;
  state.lastDraftGen = 0;
  writeSharedValue(RESULT_KEY, null);
  state.baseConfig = {
    ...state.baseConfig, slot: null, username: knownUsername, configEpoch: state.configEpoch,
  };
  // Config first, then the epoch marker — the extension re-reads the config
  // the moment it sees the new epoch, so this order can't race a stale read.
  writeSharedValue(SESSION_CONFIG_KEY, JSON.stringify({
    ...state.baseConfig,
    state: state.session.serialize(),
  }));
  writeSharedValue(EPOCH_KEY, String(state.configEpoch));
  endDraftFeed();
  if (state.activityStarted) {
    const res = updateActivity(stampedGlance('waiting'));
    if (!res.ok) state.activityError = res.error;
  }
  pushLog('Board reset. Ready for the next draft room');
  haptic('success');
  notify();
  return true;
}

export function endSession() {
  if (!state.active) return;
  if (state.session && state.activityStarted) {
    const finalGlance = stampedGlance('done');
    finalGlance.headline = 'Session ended';
    endActivity(finalGlance);
  }
  // Clearing the config tells the extension to end its broadcast.
  writeSharedValue(SESSION_CONFIG_KEY, null);
  writeSharedValue(RESULT_KEY, null);
  writeSharedValue(PUSH_TOKEN_KEY, null);
  if (state.heartbeatTimer) { clearInterval(state.heartbeatTimer); state.heartbeatTimer = null; }
  state.appStateSub?.remove?.();
  state.appStateSub = null;
  state.active = false;
  state.activityStarted = false;
  state.captureLive = false;
  state.pushToken = null;
  state.session = null;
  state.pool = null;
  state.baseConfig = null;
  state.startInputs = null;
  state.lastPersistedKey = '';
  state.extensionEngine = null;
  endDraftFeed();
  pushLog('Session ended');
  notify();
}
