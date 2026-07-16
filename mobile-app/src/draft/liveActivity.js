// liveActivity.js — lazy wrapper around the BBEDraftNative module so the app
// keeps working in Expo Go / web / Android where the pod doesn't exist.
// All functions no-op (with { ok: false }) when the module is unavailable.

let cached = null;
let checked = false;

function native() {
  if (!checked) {
    checked = true;
    try {
      // eslint-disable-next-line global-require
      const { requireOptionalNativeModule } = require('expo');
      cached = requireOptionalNativeModule?.('BBEDraftNative') ?? null;
    } catch {
      cached = null;
    }
  }
  return cached;
}

export function nativeModuleAvailable() {
  return native() != null;
}

export function liveActivitySupported() {
  try { return !!native()?.isLiveActivitySupported(); } catch { return false; }
}

export function activitiesEnabled() {
  try { return !!native()?.areActivitiesEnabled(); } catch { return false; }
}

/** True iff a draft Live Activity is currently alive on screen. False when the
 *  module is unavailable (Expo Go / web / Android) — loss detection only runs
 *  behind a nativeModuleAvailable() guard, so this never false-triggers a
 *  restart off-device. */
export function hasLiveActivity() {
  try { return !!native()?.hasLiveActivity(); } catch { return false; }
}

export function startActivity(glance, { withPushToken = false } = {}) {
  const m = native();
  if (!m) return { ok: false, error: 'native module unavailable' };
  try {
    const id = m.startDraftActivity(JSON.stringify(glance), !!withPushToken);
    return { ok: true, id };
  } catch (e) {
    return { ok: false, error: String(e?.message || e) };
  }
}

/** Hex APNs push token for the running activity (null if unavailable). */
export async function getActivityPushToken() {
  const m = native();
  if (!m?.getActivityPushToken) return null;
  try { return await m.getActivityPushToken(); } catch { return null; }
}

export function frequentPushesEnabled() {
  try { return !!native()?.frequentPushesEnabled(); } catch { return false; }
}

// --- App Group KV shared with the broadcast extension ---

export function writeSharedValue(key, value) {
  try { native()?.writeSharedValue(key, value ?? null); return true; } catch { return false; }
}

export function readSharedValue(key) {
  try { return native()?.readSharedValue(key) ?? null; } catch { return null; }
}

export function readSharedDouble(key) {
  try { return native()?.readSharedDouble(key) ?? 0; } catch { return 0; }
}

/** Write (or, with null, delete) a file in the App Group container. Used to
 *  hand the parse engine to the broadcast extension (ADR-023). */
export function writeSharedFile(name, contents) {
  try { return native()?.writeSharedFile(name, contents ?? null) ?? false; } catch { return false; }
}

export function readSharedFile(name) {
  try { return native()?.readSharedFile?.(name) ?? null; } catch { return null; }
}

/** Path of the newest session frame recording (frames-*.jsonl), or null. */
export function latestFrameLogPath() {
  try { return native()?.latestFrameLogPath?.() ?? null; } catch { return null; }
}

/** True when the build can present the broadcast sheet programmatically. */
export function broadcastPickerLaunchable() {
  return typeof native()?.launchBroadcastPicker === 'function';
}

/** Present the system broadcast sheet (Start Broadcast confirmation). */
export function launchBroadcastPicker(preferredExtension) {
  try { native()?.launchBroadcastPicker?.(preferredExtension ?? null); return true; } catch { return false; }
}

/** Native RPSystemBroadcastPickerView component (null off-device). */
export function getBroadcastPickerComponent() {
  if (!native()) return null;
  try {
    // eslint-disable-next-line global-require
    const { requireNativeViewManager } = require('expo-modules-core');
    return requireNativeViewManager('BBEDraftNative');
  } catch {
    return null;
  }
}

export function updateActivity(glance) {
  const m = native();
  if (!m) return { ok: false, error: 'native module unavailable' };
  try {
    m.updateDraftActivity(JSON.stringify(glance));
    return { ok: true };
  } catch (e) {
    return { ok: false, error: String(e?.message || e) };
  }
}

export function endActivity(finalGlance) {
  const m = native();
  if (!m) return { ok: false, error: 'native module unavailable' };
  try {
    m.endDraftActivity(finalGlance ? JSON.stringify(finalGlance) : null);
    return { ok: true };
  } catch (e) {
    return { ok: false, error: String(e?.message || e) };
  }
}

/** Vision OCR on a ph:// or file:// image. Resolves [{ text, confidence, x, y, w, h }]. */
export async function recognizeText(uri) {
  const m = native();
  if (!m?.recognizeText) throw new Error('OCR requires the BBEDraftNative dev build');
  return m.recognizeText(uri);
}
