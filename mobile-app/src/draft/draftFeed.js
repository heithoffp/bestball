// draftFeed.js — the seam between the Draft Assistant screen and the (future)
// on-device capture/OCR parse engine from the TASK-318 spike line of work.
//
// The parse engine (ADR-021) emits DraftState objects matching the contract in
// chrome-extension/src/adapters/interface.js:
//   { currentPick, currentRound, draftSlot, availablePlayers, myPicks }
// The assistant subscribes here; manual pick entry is the fallback input path
// when no capture session is active. When the native capture module lands in
// mobile-app/modules/, it publishes through publishDraftState() and the screen
// updates automatically — no UI changes required.

const listeners = new Set();
let lastState = null;
let active = false;

/** Subscribe to live DraftState updates. Returns an unsubscriber. */
export function subscribeDraftFeed(fn) {
  listeners.add(fn);
  if (lastState) fn(lastState);
  return () => listeners.delete(fn);
}

/** Publish a DraftState from the capture/parse engine (or a test harness). */
export function publishDraftState(draftState) {
  lastState = draftState;
  active = true;
  for (const fn of listeners) {
    try { fn(draftState); } catch { /* subscriber's problem */ }
  }
}

/** End the capture session — the assistant reverts to manual entry. */
export function endDraftFeed() {
  active = false;
  lastState = null;
  for (const fn of listeners) {
    try { fn(null); } catch { /* subscriber's problem */ }
  }
}

export function isDraftFeedActive() {
  return active;
}

/**
 * Availability of the native capture module (spike-native's successor).
 * Lazy require so the app runs fine in Expo Go / before the module exists.
 */
export function captureModuleAvailable() {
  try {
    // eslint-disable-next-line no-undef
    const { requireOptionalNativeModule } = require('expo');
    return requireOptionalNativeModule?.('BBECapture') != null;
  } catch {
    return false;
  }
}
