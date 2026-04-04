/**
 * Content Script
 *
 * Injected into supported draft platform pages. Identifies the correct
 * adapter, injects the page bridge script, and handles sync messages
 * from the popup.
 */

import { getAdapterForUrl } from '../adapters/registry.js';
import { createReconnectingObserver } from '../utils/observer.js';
import { writeEntries } from '../utils/bridge.js';
import { initDraftOverlay } from './draft-overlay.js';

const adapter = getAdapterForUrl(window.location.href);

if (adapter) {
  console.log(`[BBM] Content script loaded on ${window.location.hostname}`);

  // Set up a reconnecting observer on the app root to detect major DOM changes.
  const appRoot = document.querySelector('#root, #app, [data-reactroot]');
  if (appRoot) {
    createReconnectingObserver({
      targetSelector: '#root, #app, [data-reactroot]',
      onMutation: () => {},
      onReconnect: () => {
        console.log('[BBM] App root reconnected after re-render');
      },
    });
  }

  // Initialize draft overlay — pass sync callback so the overlay panel can trigger entry scraping
  initDraftOverlay(() => adapter.getEntries().then(entries => writeEntries(entries)));

  // Handle sync request from popup
  chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
    if (message.type !== 'SYNC_ENTRIES') return false;

    adapter.getEntries()
      .then(entries => writeEntries(entries))
      .then(({ count }) => sendResponse({ ok: true, count }))
      .catch(err => sendResponse({ ok: false, error: err.message }));

    return true; // keep channel open for async response
  });
} else {
  console.log('[BBM] Content script loaded but no adapter matched');
}
