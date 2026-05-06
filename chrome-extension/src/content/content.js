/**
 * Content Script
 *
 * Injected into supported draft platform pages. Identifies the correct
 * adapter, injects the page bridge script, and handles sync messages
 * from the popup.
 */

import { getAdapterForUrl } from '../adapters/registry.js';
import { createReconnectingObserver } from '../utils/observer.js';
import { writeEntries, readEntryIds } from '../utils/bridge.js';
import { initDraftOverlay } from './draft-overlay.js';

const adapter = getAdapterForUrl(window.location.href);

if (adapter) {

  // Set up a reconnecting observer on the app root to detect major DOM changes.
  const appRoot = document.querySelector('#root, #app, [data-reactroot]');
  if (appRoot) {
    createReconnectingObserver({
      targetSelector: '#root, #app, [data-reactroot]',
      onMutation: () => {},
      onReconnect: () => {
      },
    });
  }

  async function runSync() {
    // Source knownIds from Supabase (account-scoped) so the per-user filter
    // stays correct after the user signs in as a different account. Stale
    // chrome.storage IDs from a previous session would otherwise cause the
    // bridge to skip-fetch drafts that aren't actually stored for this user.
    const knownIds = await readEntryIds();

    const result = await adapter.getEntries(knownIds);
    return writeEntries(result, { platform: adapter.platform });
  }

  // Initialize draft overlay — pass adapter and sync callback so the overlay can trigger entry scraping
  initDraftOverlay(adapter, runSync);

  // Handle sync request from popup
  chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
    if (message.type !== 'SYNC_ENTRIES') return false;

    runSync()
      .then(({ count }) => sendResponse({ ok: true, count }))
      .catch(err => sendResponse({ ok: false, error: err.message }));

    return true; // keep channel open for async response
  });
} else {
}
