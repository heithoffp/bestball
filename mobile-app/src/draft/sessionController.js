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
import { parseUnderdogScreen, textToItems } from './underdogParser';
import { createDraftSession } from './sessionEngine';
import {
  startActivity, updateActivity, endActivity, getActivityPushToken,
  nativeModuleAvailable, liveActivitySupported, activitiesEnabled, frequentPushesEnabled,
  writeSharedValue, readSharedValue, readSharedDouble,
} from './liveActivity';
import { SUPABASE_FUNCTIONS_URL, SUPABASE_ANON_KEY } from '../../shared/config';

export const BROADCAST_EXTENSION_ID = 'com.bestballexposures.app.draftbroadcast';

const SESSION_CONFIG_KEY = 'bbe.sessionConfig';
const RESULT_KEY = 'bbe.extensionResult';
const HEARTBEAT_KEY = 'bbe.extensionHeartbeat';
const USERNAME_KEY = 'bbe.udUsername';

const HEARTBEAT_POLL_MS = 4000;
const HEARTBEAT_FRESH_S = 8;
const LOG_LIMIT = 6;

const state = {
  active: false,
  session: null,
  pool: null,
  teams: 12,
  lastSyncEpoch: 0,
  pushToken: null,
  captureLive: false,
  lastHeartbeatAt: 0,
  lastAbsorbedRaw: null,
  resumeLogged: false,
  activityStarted: false,
  activityError: null,
  lastError: null,
  log: [],
  appStateSub: null,
  heartbeatTimer: null,
  listeners: new Set(),
  baseConfig: null,        // config minus `state`, for warm-restart rewrites
  lastPersistedKey: '',
  lastDiag: null,          // extension's recent-ingest ring buffer (debugging)
  extensionEngine: null,   // version reported by the extension's engine bundle
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
    if (!res.ok) state.activityError = res.error;
  }
}

export function getSnapshot() {
  return {
    active: state.active,
    status: state.session ? state.session.getStatus() : null,
    log: state.log,
    pushToken: !!state.pushToken,
    captureLive: state.captureLive,
    lastHeartbeatAt: state.lastHeartbeatAt,
    activityStarted: state.activityStarted,
    activityError: state.activityError,
    lastError: state.lastError,
    extensionEngine: state.extensionEngine,
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
 */
export async function startSession({
  poolRows, rankMap, exposureMap, slot = null, teams = 12, rounds = 18, username = null,
}) {
  if (state.active) endSession();
  if (!poolRows?.length) {
    state.lastError = 'No Underdog player pool loaded yet';
    notify();
    return false;
  }
  // Username anchors the slot (TASK-328): configured > remembered from a
  // previous draft > auto-learned mid-session (lobby / "Your pick" card).
  const knownUsername = username || readSharedValue(USERNAME_KEY) || null;
  state.pool = buildPool(poolRows);
  state.teams = teams;
  state.session = createDraftSession({
    pool: state.pool, teams, rounds, slot, username: knownUsername, rankMap, exposureMap,
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

  const res = startActivity(stampedGlance(), { withPushToken: true });
  state.activityStarted = res.ok;
  state.activityError = res.ok ? null : res.error;
  if (!res.ok) pushLog(`Live Activity unavailable: ${res.error}`);

  if (res.ok) {
    state.pushToken = await getActivityPushToken();
    if (!state.pushToken) {
      pushLog('No push token — glance updates only while BBE is open');
    }
  }
  // Hand the session to the broadcast extension through the App Group.
  writeSharedValue(RESULT_KEY, null);
  state.baseConfig = {
    poolRows,
    teams,
    rounds,
    slot,
    username: knownUsername,
    rankMap: rankMap ? Object.fromEntries(rankMap) : {},
    exposureMap: exposureMap ? Object.fromEntries(exposureMap) : {},
    pushToken: state.pushToken,
    relayUrl: `${SUPABASE_FUNCTIONS_URL}/live-activity-relay`,
    anonKey: SUPABASE_ANON_KEY,
  };
  state.lastPersistedKey = '';
  writeSharedValue(SESSION_CONFIG_KEY, JSON.stringify({
    ...state.baseConfig,
    state: state.session.serialize(),
  }));
  state.heartbeatTimer = setInterval(pollExtension, HEARTBEAT_POLL_MS);

  state.appStateSub?.remove?.();
  state.appStateSub = AppState.addEventListener('change', (next) => {
    if (next !== 'active' || !state.active) return;
    absorbExtensionState();
    pollExtension();
  });

  pushLog('Session armed — tap record, confirm Start Broadcast, then draft');
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
  if (state.captureLive !== wasLive) notify();
}

function absorbExtensionState() {
  if (!state.active || !state.session) return;
  const raw = readSharedValue(RESULT_KEY);
  if (!raw || raw === state.lastAbsorbedRaw) return;
  state.lastAbsorbedRaw = raw;
  try {
    const result = JSON.parse(raw);
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
      // Persist the merged state back so a broadcast RESTART resumes warm —
      // the extension inits from this config, and the snapshot written at
      // session start is empty (an attempt-2 extension pushed empty-roster
      // glances for the rest of the draft). Rewrite when anything durable
      // (ledger, anchor, username) changed.
      const persistKey = `${s.ledgerSize}:${s.anchoredSlot ?? ''}:${s.learnedUsername ?? ''}`;
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
        pushLog(`Resumed mid-draft — ${s.picksAtStart} picks already on the board`);
      }
      pushLog(`capture · P${s.currentPick}${s.picksUntil != null ? ` · up in ${s.picksUntil}` : ''} · ${s.ledgerSize} picks known`);
      // Remember the auto-learned username for the next draft.
      if (s.learnedUsername && s.learnedUsername !== readSharedValue(USERNAME_KEY)) {
        writeSharedValue(USERNAME_KEY, s.learnedUsername);
      }
      notify();
    }
  } catch { /* partial write — next poll gets it */ }
}

/** Replay the bundled fixture capture end-to-end (no draft needed). */
export function demoSync() {
  if (!state.active) return false;
  // eslint-disable-next-line global-require
  const fx = require('./__fixtures__/underdogOcrFixture');
  for (const screen of fx.ALL_SCREENS) {
    const obs = parseUnderdogScreen(textToItems(screen), { pool: state.pool, teams: state.teams });
    state.session.ingest(obs);
  }
  pushLog('Demo capture replayed (4 screens from a real UD draft)');
  publishAll({ freshSync: true });
  haptic('success');
  notify();
  return true;
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
      slotConflict: s.slotConflict,
      myPicks: s.myPicks,
      opponentTallies: s.opponentTallies,
      usernameSlots: s.usernameSlots,
    },
    captureLive: state.captureLive,
    extensionEngine: state.extensionEngine,
    log: state.log,
    extensionDiag: state.lastDiag,
  }, null, 1);
}

export function setSessionSlot(slot) {
  if (!state.session) return;
  state.session.setManualSlot(slot);
  publishAll();
  notify();
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
  state.lastPersistedKey = '';
  state.extensionEngine = null;
  endDraftFeed();
  pushLog('Session ended');
  notify();
}
