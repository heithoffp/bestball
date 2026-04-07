/**
 * Background Service Worker
 *
 * Detects when the user navigates to a supported draft platform and
 * routes to the correct adapter. Manages extension lifecycle events.
 *
 * Note: page bridge injection is handled via manifest content_scripts
 * (world: MAIN, document_start) — no scripting API calls needed here.
 */

import { getAdapterForUrl } from './adapters/registry.js';

// Track which tabs have an active adapter
const activeTabs = new Map();

chrome.tabs.onUpdated.addListener((tabId, changeInfo, tab) => {
  if (changeInfo.status !== 'complete' || !tab.url) return;

  const adapter = getAdapterForUrl(tab.url);

  if (adapter) {
    activeTabs.set(tabId, { url: tab.url });
  } else if (activeTabs.has(tabId)) {
    activeTabs.delete(tabId);
  }
});

chrome.tabs.onRemoved.addListener((tabId) => {
  activeTabs.delete(tabId);
});

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message.type === 'GET_STATUS') {
    const tabId = sender.tab?.id;
    sendResponse({
      active:   activeTabs.has(tabId),
      tabCount: activeTabs.size,
    });
  }
  return false;
});

