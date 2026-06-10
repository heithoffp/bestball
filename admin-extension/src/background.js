/**
 * BBE Admin background service worker.
 *
 * - Receives UD-token messages from the content script and persists them.
 * - Receives "run_now" messages from the popup and dispatches the scraper.
 * - Tracks an in-flight flag so a second "Run now" click during a run is rejected.
 */

import { runScraper } from './scraper/run.js';

let runInFlight = false;

chrome.runtime.onMessage.addListener((msg, _sender, sendResponse) => {
  if (msg?.type === 'ud_token' && msg.token) {
    chrome.storage.local.set({
      bbe_admin_auth: {
        token: msg.token,
        apiHost: msg.apiHost,
        statsHost: msg.statsHost || 'stats.underdogsports.com',
        statsParams: msg.statsParams || '',
        capturedAt: msg.capturedAt ?? Date.now(),
      },
    });
    sendResponse({ ok: true });
    return false;
  }

  if (msg?.type === 'run_now') {
    if (runInFlight) {
      sendResponse({ ok: false, reason: 'already-running' });
      return false;
    }
    runInFlight = true;
    runScraper()
      .catch((e) => ({ ok: false, reason: 'exception', error: String(e) }))
      .then((result) => {
        runInFlight = false;
        sendResponse(result);
      });
    return true; // keep channel open for async response
  }

  if (msg?.type === 'reenable_scraper') {
    chrome.storage.local.remove('scraper_disabled_until_manual_reenable', () => {
      sendResponse({ ok: true });
    });
    return true;
  }

  return false;
});
