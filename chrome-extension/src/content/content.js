/**
 * Content Script
 *
 * Injected into supported draft platform pages. Identifies the correct
 * adapter and sets up a MutationObserver for DOM stability.
 */

import { getAdapterForUrl } from '../adapters/registry.js';
import { createReconnectingObserver } from '../utils/observer.js';

const adapter = getAdapterForUrl(window.location.href);

if (adapter) {
  console.log(`[BBM] Content script loaded on ${window.location.hostname}`);

  // Set up a reconnecting observer on the app root to detect major DOM changes.
  // Individual features (scraper, overlay) will set up their own targeted observers.
  const appRoot = document.querySelector('#root, #app, [data-reactroot]');

  if (appRoot) {
    createReconnectingObserver({
      targetSelector: '#root, #app, [data-reactroot]',
      onMutation: () => {
        // Future: notify active features (scraper, overlay) of DOM changes
      },
      onReconnect: () => {
        console.log('[BBM] App root reconnected after re-render');
      },
    });
  }
} else {
  console.log('[BBM] Content script loaded but no adapter matched');
}
