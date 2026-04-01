/**
 * Underdog Fantasy Platform Adapter
 *
 * Implements the PlatformAdapter interface for app.underdogfantasy.com.
 * The page bridge (fetch hook + sync logic) lives in
 * src/injected/underdog-bridge.js and is injected at document_start via
 * the manifest (world: MAIN), bypassing Underdog's CSP.
 *
 * @type {import('./interface.js').PlatformAdapter}
 */

const underdogAdapter = {
  isMatch(url) {
    try {
      return new URL(url).hostname === 'app.underdogfantasy.com';
    } catch {
      return false;
    }
  },

  /**
   * Scrapes all completed best-ball entries for the signed-in user.
   * Delegates to the page bridge (underdog-bridge.js) via postMessage.
   *
   * @returns {Promise<import('./interface.js').Entry[]>}
   */
  async getEntries() {
    if (!window.location.href.includes('app.underdogfantasy.com/completed')) {
      throw new Error('Navigate to your Underdog completed entries page first');
    }

    return new Promise((resolve, reject) => {
      const timeout = setTimeout(
        () => reject(new Error('Sync timed out — please retry')),
        60_000
      );

      function handler(event) {
        if (event.source !== window) return;
        if (event.data?.type === 'BBM_SYNC_RESULT') {
          clearTimeout(timeout);
          window.removeEventListener('message', handler);
          resolve(event.data.entries);
        } else if (event.data?.type === 'BBM_SYNC_ERROR') {
          clearTimeout(timeout);
          window.removeEventListener('message', handler);
          reject(new Error(event.data.error));
        }
      }

      window.addEventListener('message', handler);
      window.postMessage({ type: 'BBM_SYNC_REQUEST' }, '*');
    });
  },

  getDraftState() {
    throw new Error('[BBM] getDraftState() not implemented — see TASK-046');
  },

  getInjectionTarget() {
    return null;
  },

  getStyles() {
    return {
      fontFamily:  '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif',
      fontSize:    '13px',
      textColor:   '#e0e0e0',
      bgColor:     'rgba(30, 30, 30, 0.85)',
      borderColor: '#333',
    };
  },

  getPlayerRows() {
    return [];
  },
};

export default underdogAdapter;
