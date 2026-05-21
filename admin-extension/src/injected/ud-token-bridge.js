/**
 * BBE Admin — UD Token Bridge
 *
 * Injected into the page execution context (world: MAIN) at document_start.
 * Intercepts XMLHttpRequest to capture the Bearer token and api host from
 * the first UD API call made by the page.
 *
 * Lifted and simplified from chrome-extension/src/injected/underdog-bridge.js
 * — this admin tool needs the token only, not the entry-sync machinery.
 */

if (!window.__BBM_ADMIN_initialized) {
  window.__BBM_ADMIN_initialized = true;

  window.__BBM_ADMIN = {
    token:   null,
    apiHost: 'api.underdogsports.com',
    userId:  null,
  };

  const UD_API_RE = /^api\.underdog(fantasy|sports)\.com$/;

  const _open             = XMLHttpRequest.prototype.open;
  const _setRequestHeader = XMLHttpRequest.prototype.setRequestHeader;
  const _send             = XMLHttpRequest.prototype.send;

  XMLHttpRequest.prototype.open = function (method, url) {
    this._bbmUrl     = typeof url === 'string' ? url : String(url);
    this._bbmHeaders = {};
    return _open.apply(this, arguments);
  };

  XMLHttpRequest.prototype.setRequestHeader = function (name, value) {
    if (this._bbmHeaders) this._bbmHeaders[name] = value;
    return _setRequestHeader.apply(this, arguments);
  };

  XMLHttpRequest.prototype.send = function () {
    const url     = this._bbmUrl     ?? '';
    const headers = this._bbmHeaders ?? {};

    let urlHost = '';
    try { urlHost = new URL(url, window.location.origin).hostname; } catch {}

    if (UD_API_RE.test(urlHost)) {
      window.__BBM_ADMIN.apiHost = urlHost;
      if (!window.__BBM_ADMIN.token) {
        const raw = headers['Authorization'] || headers['authorization'];
        if (raw) {
          const auth = raw.startsWith('Bearer ') ? raw : 'Bearer ' + raw;
          window.__BBM_ADMIN.token = auth;
          try {
            const payload = JSON.parse(atob(auth.replace('Bearer ', '').split('.')[1]));
            window.__BBM_ADMIN.userId = payload.sub ?? payload.user_id ?? null;
          } catch {}
          // Signal to the content script that the token is ready.
          window.dispatchEvent(new CustomEvent('bbm-admin-token-ready', {
            detail: { token: auth, apiHost: urlHost },
          }));
        }
      }
    }

    return _send.apply(this, arguments);
  };
}
