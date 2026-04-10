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
    return false;
  }

  if (message.type === 'GOOGLE_OAUTH') {
    handleGoogleOAuth().then(sendResponse);
    return true; // keep channel open for async response
  }

  return false;
});

async function handleGoogleOAuth() {
  const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;
  if (!supabaseUrl) return { error: 'Supabase not configured' };

  const redirectUrl = chrome.identity.getRedirectURL();
  const authUrl = `${supabaseUrl}/auth/v1/authorize?provider=google&redirect_to=${encodeURIComponent(redirectUrl)}`;

  try {
    const responseUrl = await chrome.identity.launchWebAuthFlow({
      url: authUrl,
      interactive: true,
    });

    // Supabase returns tokens in the URL hash fragment
    const hash = new URL(responseUrl).hash.substring(1);
    const params = new URLSearchParams(hash);
    const access_token = params.get('access_token');
    const refresh_token = params.get('refresh_token');

    if (!access_token || !refresh_token) {
      return { error: 'No tokens received from Google sign-in' };
    }
    return { access_token, refresh_token };
  } catch (err) {
    if (err.message?.includes('canceled')) {
      return { error: 'Sign-in was cancelled' };
    }
    return { error: err.message ?? 'Google sign-in failed' };
  }
}

