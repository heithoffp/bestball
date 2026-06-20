/**
 * Underdog Fantasy Platform Adapter
 *
 * Implements the PlatformAdapter interface for Underdog (app.underdogfantasy.com
 * and app.underdogsports.com — Underdog rebranded the domain in 2026-05).
 * The page bridge (fetch hook + sync logic) lives in
 * src/injected/underdog-bridge.js and is injected at document_start via
 * the manifest (world: MAIN), bypassing Underdog's CSP.
 *
 * @type {import('./interface.js').PlatformAdapter}
 */

const UD_HOSTS = new Set(['app.underdogfantasy.com', 'app.underdogsports.com']);

const underdogAdapter = {
  isMatch(url) {
    try {
      return UD_HOSTS.has(new URL(url).hostname);
    } catch {
      return false;
    }
  },

  /**
   * Scrapes completed best-ball entries for the signed-in user.
   * Incremental: pass previously-synced entry ids to skip re-fetching detail
   * for drafts already stored. The bridge still runs the cheap discovery
   * pagination so removed drafts can be detected via currentDraftIds.
   *
   * @param {string[]} [knownEntryIds] - Previously synced entry/draft ids
   * @returns {Promise<{ newEntries: import('./interface.js').Entry[], currentDraftIds: string[], boards: object[] }>}
   */
  async getEntries(knownEntryIds = []) {
    if (!UD_HOSTS.has(window.location.hostname) || !window.location.pathname.startsWith('/completed')) {
      throw new Error('Navigate to your Underdog completed entries page first');
    }

    return new Promise((resolve, reject) => {
      const timeout = setTimeout(
        () => reject(new Error('Sync timed out — please retry')),
        300_000
      );

      function handler(event) {
        if (event.source !== window) return;
        if (event.data?.type === 'BBM_SYNC_RESULT') {
          clearTimeout(timeout);
          window.removeEventListener('message', handler);
          resolve({
            newEntries:      event.data.newEntries ?? [],
            currentDraftIds: event.data.currentDraftIds ?? [],
            boards:          event.data.boards ?? [],
          });
        } else if (event.data?.type === 'BBM_SYNC_ERROR') {
          clearTimeout(timeout);
          window.removeEventListener('message', handler);
          reject(new Error(event.data.error));
        }
      }

      window.addEventListener('message', handler);
      window.postMessage({ type: 'BBM_SYNC_REQUEST', knownEntryIds }, '*');
    });
  },

  /**
   * TASK-260: re-fetch full pod boards for already-synced drafts that lack one.
   * The caller supplies a pre-capped list of board-less draft ids; the bridge
   * fetches and normalizes each. Supplementary to getEntries — does not touch
   * the user's own roster entries.
   *
   * @param {string[]} draftIds - board-less draft ids to backfill (already capped)
   * @returns {Promise<object[]>} normalized boards
   */
  async getBoards(draftIds = []) {
    if (!draftIds.length) return [];

    return new Promise((resolve, reject) => {
      const timeout = setTimeout(
        () => reject(new Error('Board backfill timed out')),
        300_000
      );

      function handler(event) {
        if (event.source !== window) return;
        if (event.data?.type === 'BBM_BOARDS_RESULT') {
          clearTimeout(timeout);
          window.removeEventListener('message', handler);
          resolve(event.data.boards ?? []);
        } else if (event.data?.type === 'BBM_SYNC_ERROR') {
          clearTimeout(timeout);
          window.removeEventListener('message', handler);
          reject(new Error(event.data.error));
        }
      }

      window.addEventListener('message', handler);
      window.postMessage({ type: 'BBM_BOARDS_REQUEST', draftIds }, '*');
    });
  },

  /**
   * Returns true if the current page is a live draft page.
   */
  isDraftPage() {
    return /^\/draft\/[a-f0-9-]+/i.test(window.location.pathname);
  },

  getDraftState() {
    throw new Error('[BBM] getDraftState() not implemented');
  },

  /**
   * TASK-275: fetch a name→team map for every player in the current draft's slate,
   * resolved by the page bridge from Underdog's own reference data. The Eliminator
   * bye window uses this to resolve teams for freshly-drafted players that aren't in
   * the user's synced portfolio. Best-effort: resolves [] on timeout/error so the
   * overlay falls back to portfolio-derived teams.
   *
   * @returns {Promise<Array<{name: string, team: string}>>}
   */
  getDraftPlayerTeams() {
    return new Promise((resolve) => {
      const timeout = setTimeout(() => {
        window.removeEventListener('message', handler);
        resolve([]);
      }, 15_000);

      function handler(event) {
        if (event.source !== window) return;
        if (event.data?.type === 'BBM_DRAFT_TEAMS_RESULT') {
          clearTimeout(timeout);
          window.removeEventListener('message', handler);
          resolve(event.data.players ?? []);
        } else if (event.data?.type === 'BBM_DRAFT_TEAMS_ERROR') {
          clearTimeout(timeout);
          window.removeEventListener('message', handler);
          resolve([]);
        }
      }

      window.addEventListener('message', handler);
      window.postMessage({ type: 'BBM_DRAFT_TEAMS_REQUEST' }, '*');
    });
  },

  /**
   * Returns the virtualized grid container for overlay injection.
   */
  getInjectionTarget() {
    return document.querySelector('[role="grid"]');
  },

  getRowId(row) {
    return row.getAttribute('data-id');
  },

  /**
   * Underdog: insert inside the rightSide container, before the first stat cell.
   */
  getInjectionPoint(row) {
    const rightSide = row.querySelector('[class*="rightSide"]');
    if (!rightSide) return {};
    const before = rightSide.querySelector('[class*="statCell"]') ?? null;
    return { parent: rightSide, before };
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

  /**
   * Returns all currently rendered player rows in the virtualized draft board.
   */
  getPlayerRows() {
    return [...document.querySelectorAll('[data-testid="player-cell-wrapper"]')];
  },

  selectors: {
    gridSelector:              '[role="grid"]',
    rowSelector:               '[data-testid="player-cell-wrapper"]',
    rightSideSelector:         '[class*="rightSide"]',
    statCellSelector:          '[class*="statCell"]',
    sortButtonsSelector:       '[class*="playerListSortButtons"]',
    myPicksSelector:           '[class*="playerPickCell"]',
    playerNameInRowSelector:   '[class*="playerName"]',
    positionSectionSelector:   '[class*="positionSection"]',
    positionHeaderSelector:    '[class*="positionHeader"]',
    stackPillTargetSelector:   '[class*="playerPosition"]',
  },

  /**
   * Returns true when the draft board is currently sorted by "My Rank".
   *
   * Underdog marks the active sort button by adding a CSS-module-hashed class
   * (verified via DevTools 2026-04-03 — class list is the only DOM change on sort).
   * Pairing the class selector with the span text guards against hash collisions
   * if Underdog re-deploys with a different hash.
   */
  isMyRankSort() {
    const activeBtn = document.querySelector('button.styles__active__A5wMB');
    return activeBtn?.querySelector('span')?.textContent?.trim().toLowerCase() === 'my rank';
  },

  platform: 'underdog',

  syncPageErrorMessage: 'Navigate to your Underdog entries page first',
};

export default underdogAdapter;
