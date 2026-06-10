/**
 * BBE Admin content script — relays the UD Bearer token from the page
 * compartment (set by ud-token-bridge.js) to the background service worker.
 *
 * Two paths:
 *  1. Listen for the `bbm-admin-token-ready` CustomEvent fired by the bridge
 *     the moment a token is observed.
 *  2. Poll window.__BBM_ADMIN every 5 s as a fallback in case the event was
 *     dispatched before this content script ran.
 */

function forwardToken(detail) {
  if (!detail?.token) return;
  chrome.runtime.sendMessage({
    type: 'ud_token',
    token: detail.token,
    apiHost: detail.apiHost,
    statsHost: detail.statsHost,
    statsParams: detail.statsParams,
    capturedAt: Date.now(),
  });
}

window.addEventListener('bbm-admin-token-ready', (e) => forwardToken(e.detail));

// Fallback poll — the page-context bridge exposes __BBM_ADMIN on window, but
// content scripts in an isolated world see a sanitized view. Read via a
// script injection that copies the value into a data attribute.
function pollFromPage() {
  const probe = document.createElement('script');
  probe.textContent = `
    (() => {
      const s = window.__BBM_ADMIN;
      if (s?.token) document.documentElement.setAttribute('data-bbm-admin', JSON.stringify({
        token: s.token, apiHost: s.apiHost, statsHost: s.statsHost, statsParams: s.statsParams,
      }));
    })();
  `;
  document.documentElement.appendChild(probe);
  probe.remove();

  const raw = document.documentElement.getAttribute('data-bbm-admin');
  if (raw) {
    try {
      forwardToken(JSON.parse(raw));
      document.documentElement.removeAttribute('data-bbm-admin');
    } catch {}
  }
}

setInterval(pollFromPage, 5000);
pollFromPage();
