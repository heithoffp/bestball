// sessionController.js — the singleton that glues the pieces of a Live Draft
// Session together. UI talks to this, never to the engine directly.
//
// Two capture modes (docs/LIVE_SESSION_V1.md):
//   'live'  — ReplayKit broadcast extension captures the screen continuously;
//             it runs the same JS engine (JSC) and pushes Live Activity
//             updates via the live-activity-relay Edge Function. The app
//             hands the session config through the App Group, then absorbs
//             the extension's serialized state whenever it foregrounds.
//   'shots' — the v1 screenshot flow: Photos sweep → Vision OCR → engine,
//             kept as the zero-infrastructure fallback.
import { AppState } from 'react-native';
import { publishDraftState, endDraftFeed } from './draftFeed';
import { buildPool } from './playerMatcher';
import { parseUnderdogScreen, textToItems } from './underdogParser';
import { createDraftSession } from './sessionEngine';
import {
  startActivity, updateActivity, endActivity, recognizeText, getActivityPushToken,
  nativeModuleAvailable, liveActivitySupported, activitiesEnabled, frequentPushesEnabled,
  writeSharedValue, readSharedValue, readSharedDouble,
} from './liveActivity';
import { ensurePhotoPermission, fetchNewScreenshots } from './screenshotSync';
import { SUPABASE_FUNCTIONS_URL, SUPABASE_ANON_KEY } from '../../shared/config';

export const BROADCAST_EXTENSION_ID = 'com.bestballexposures.app.draftbroadcast';

const SESSION_CONFIG_KEY = 'bbe.sessionConfig';
const RESULT_KEY = 'bbe.extensionResult';
const HEARTBEAT_KEY = 'bbe.extensionHeartbeat';

const AUTO_SYNC_DEBOUNCE_MS = 2500;
const HEARTBEAT_POLL_MS = 4000;
const HEARTBEAT_FRESH_S = 8;
const LOG_LIMIT = 6;

const state = {
  active: false,
  mode: 'shots',
  session: null,
  pool: null,
  teams: 12,
  startedAtMs: 0,
  lastSyncEpoch: 0,
  processedIds: new Set(),
  syncing: false,
  photoAccess: null, // null unknown | true | false
  pushToken: null,
  captureLive: false,
  lastHeartbeatAt: 0,
  lastAbsorbedRaw: null,
  activityStarted: false,
  activityError: null,
  lastError: null,
  lastAutoSyncMs: 0,
  log: [],
  appStateSub: null,
  heartbeatTimer: null,
  listeners: new Set(),
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
    mode: state.mode,
    syncing: state.syncing,
    status: state.session ? state.session.getStatus() : null,
    log: state.log,
    photoAccess: state.photoAccess,
    pushToken: !!state.pushToken,
    captureLive: state.captureLive,
    lastHeartbeatAt: state.lastHeartbeatAt,
    activityStarted: state.activityStarted,
    activityError: state.activityError,
    lastError: state.lastError,
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
 * Start a Live Draft Session.
 * poolRows: [{ name, position, team, adp }] (UD ADP snapshot)
 * rankMap / exposureMap: Map keyed by canonical name (optional)
 * mode: 'live' (broadcast capture) | 'shots' (screenshot sweep)
 */
export async function startSession({
  poolRows, rankMap, exposureMap, slot = null, teams = 12, rounds = 18, mode = 'shots',
}) {
  if (state.active) endSession();
  if (!poolRows?.length) {
    state.lastError = 'No Underdog player pool loaded yet';
    notify();
    return false;
  }
  state.pool = buildPool(poolRows);
  state.teams = teams;
  state.mode = mode;
  state.session = createDraftSession({ pool: state.pool, teams, rounds, slot, rankMap, exposureMap });
  state.active = true;
  state.startedAtMs = Date.now();
  state.lastSyncEpoch = 0;
  state.processedIds = new Set();
  state.lastAbsorbedRaw = null;
  state.captureLive = false;
  state.pushToken = null;
  state.log = [];
  state.lastError = null;
  state.activityError = null;

  if (mode === 'shots') {
    state.photoAccess = await ensurePhotoPermission();
    if (!state.photoAccess) {
      pushLog('Photos access denied — enable "All Photos" for BBE in Settings');
    }
  }

  const res = startActivity(stampedGlance(), { withPushToken: mode === 'live' });
  state.activityStarted = res.ok;
  state.activityError = res.ok ? null : res.error;
  if (!res.ok) pushLog(`Live Activity unavailable: ${res.error}`);

  if (mode === 'live') {
    if (res.ok) {
      state.pushToken = await getActivityPushToken();
      if (!state.pushToken) {
        pushLog('No push token — glance updates only while BBE is open');
      }
    }
    // Hand the session to the broadcast extension through the App Group.
    writeSharedValue(RESULT_KEY, null);
    writeSharedValue(SESSION_CONFIG_KEY, JSON.stringify({
      poolRows,
      teams,
      rounds,
      slot,
      rankMap: rankMap ? Object.fromEntries(rankMap) : {},
      exposureMap: exposureMap ? Object.fromEntries(exposureMap) : {},
      pushToken: state.pushToken,
      relayUrl: `${SUPABASE_FUNCTIONS_URL}/live-activity-relay`,
      anonKey: SUPABASE_ANON_KEY,
      state: state.session.serialize(),
    }));
    state.heartbeatTimer = setInterval(pollExtension, HEARTBEAT_POLL_MS);
  }

  state.appStateSub?.remove?.();
  state.appStateSub = AppState.addEventListener('change', (next) => {
    if (next !== 'active' || !state.active) return;
    if (state.mode === 'live') {
      absorbExtensionState();
      pollExtension();
    } else {
      const now = Date.now();
      if (now - state.lastAutoSyncMs > AUTO_SYNC_DEBOUNCE_MS) {
        state.lastAutoSyncMs = now;
        syncNow('auto').catch(() => {});
      }
    }
  });

  pushLog(mode === 'live'
    ? `Session armed — tap record, pick "BBE Draft Capture", then draft`
    : `Session armed (${teams}-team · ${rounds} rounds${slot ? ` · slot ${slot}` : ' · slot auto'})`);
  notify();
  return true;
}

// ---- live mode: extension state absorption + heartbeat ----

function pollExtension() {
  if (!state.active || state.mode !== 'live') return;
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
  if (!state.active || state.mode !== 'live' || !state.session) return;
  const raw = readSharedValue(RESULT_KEY);
  if (!raw || raw === state.lastAbsorbedRaw) return;
  state.lastAbsorbedRaw = raw;
  try {
    const result = JSON.parse(raw);
    if (result?.ok && result.state && state.session.hydrate(result.state)) {
      publishAll({ freshSync: true });
      const s = state.session.getStatus();
      pushLog(`capture · P${s.currentPick}${s.picksUntil != null ? ` · up in ${s.picksUntil}` : ''} · ${s.ledgerSize} picks known`);
      notify();
    }
  } catch { /* partial write — next poll gets it */ }
}

/** Sweep new screenshots, OCR, and merge (shots mode / manual fallback). */
export async function syncNow(trigger = 'manual') {
  if (!state.active || state.syncing) return 0;
  state.syncing = true;
  state.lastError = null;
  notify();
  let ingested = 0;
  try {
    if (state.photoAccess !== true) state.photoAccess = await ensurePhotoPermission();
    const shots = await fetchNewScreenshots({
      sinceMs: state.startedAtMs,
      excludeIds: state.processedIds,
    });
    for (const shot of shots) {
      state.processedIds.add(shot.id);
      try {
        const items = await recognizeText(shot.uri);
        const obs = parseUnderdogScreen(items, { pool: state.pool, teams: state.teams });
        const summary = state.session.ingest(obs);
        ingested++;
        pushLog(summaryLine(obs, summary));
      } catch (e) {
        pushLog(`OCR failed on a screenshot: ${String(e?.message || e)}`);
      }
    }
    if (ingested > 0) {
      publishAll({ freshSync: true });
      haptic('success');
    } else if (trigger === 'manual') {
      pushLog('No new draft screenshots found');
      haptic('warning');
    }
  } catch (e) {
    state.lastError = String(e?.message || e);
    pushLog(`Sync failed: ${state.lastError}`);
  } finally {
    state.syncing = false;
    notify();
  }
  return ingested;
}

function summaryLine(obs, summary) {
  const s = state.session.getStatus();
  const bits = [];
  if (obs.kind === 'board') bits.push(`board · ${summary?.newBoardPicks ?? 0} new picks`);
  else if (obs.kind === 'players') bits.push(`players list · ${obs.rows.length} rows`);
  else if (obs.kind === 'queue') bits.push(`queue · ${obs.queueNames.length} queued`);
  else if (obs.kind === 'header') bits.push('header only');
  else bits.push('unrecognized screen');
  if (s.picksUntil != null) bits.push(s.picksUntil === 0 ? 'ON THE CLOCK' : `up in ${s.picksUntil}`);
  bits.push(`P${s.currentPick}`);
  return bits.join(' · ');
}

/** Ingest pre-extracted OCR text (deep link / Shortcuts path). */
export function ingestOcrText(text) {
  if (!state.active) {
    state.lastError = 'Start a Live Session before sending OCR text';
    notify();
    return false;
  }
  const obs = parseUnderdogScreen(textToItems(text), { pool: state.pool, teams: state.teams });
  const summary = state.session.ingest(obs);
  pushLog(`link · ${summaryLine(obs, summary)}`);
  publishAll({ freshSync: true });
  haptic('success');
  notify();
  return true;
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
  if (state.mode === 'live') {
    writeSharedValue(SESSION_CONFIG_KEY, null);
    writeSharedValue(RESULT_KEY, null);
  }
  if (state.heartbeatTimer) { clearInterval(state.heartbeatTimer); state.heartbeatTimer = null; }
  state.appStateSub?.remove?.();
  state.appStateSub = null;
  state.active = false;
  state.activityStarted = false;
  state.captureLive = false;
  state.pushToken = null;
  state.session = null;
  state.pool = null;
  endDraftFeed();
  pushLog('Session ended');
  notify();
}
