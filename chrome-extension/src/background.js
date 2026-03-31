/**
 * Background Service Worker
 *
 * Detects when the user navigates to a supported draft platform and
 * routes to the correct adapter. Manages extension lifecycle events.
 */

import { getAdapterForUrl } from './adapters/registry.js';

// Track which tabs have an active adapter
const activeTabs = new Map();

chrome.tabs.onUpdated.addListener((tabId, changeInfo, tab) => {
  if (changeInfo.status !== 'complete' || !tab.url) return;

  const adapter = getAdapterForUrl(tab.url);

  if (adapter) {
    activeTabs.set(tabId, { url: tab.url });
    console.log(`[BBM] Adapter matched for tab ${tabId}: ${tab.url}`);
  } else if (activeTabs.has(tabId)) {
    activeTabs.delete(tabId);
    console.log(`[BBM] Tab ${tabId} left supported platform`);
  }
});

chrome.tabs.onRemoved.addListener((tabId) => {
  activeTabs.delete(tabId);
});

// Message handler for content script <-> background communication
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message.type === 'GET_STATUS') {
    const tabId = sender.tab?.id;
    sendResponse({
      active: activeTabs.has(tabId),
      tabCount: activeTabs.size,
    });
  }
  return false;
});

console.log('[BBM] Background service worker initialized');
