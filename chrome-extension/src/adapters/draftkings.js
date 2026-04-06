/**
 * DraftKings Platform Adapter
 *
 * Implements the PlatformAdapter interface for www.draftkings.com.
 * Handles two pages:
 *   - /mycontests  — scrapes completed NFL lineup entries via same-origin API
 *   - /draft/snake/* — injects the Exp/Corr overlay on live best-ball drafts
 *
 * No page bridge script needed: the lineup API is same-origin so the content
 * script can fetch it directly with credentials: 'include'.
 *
 * @type {import('./interface.js').PlatformAdapter}
 */

/**
 * Manual draft-group-ID → metadata map.
 * DK doesn't expose historical contest names via any public API,
 * so known contest metadata is maintained here by hand.
 *   name  — tournament/contest name (falls back to "DraftKings #<id>")
 *   slate — slate grouping label   (falls back to "DraftKings")
 */
const DRAFT_GROUP_META = {
  141336: { name: 'Pre-Draft Best Ball', slate: 'DraftKings' },
};

const draftkingsAdapter = {
  isMatch(url) {
    try {
      const { hostname, pathname } = new URL(url);
      return (
        hostname === 'www.draftkings.com' &&
        (pathname.startsWith('/mycontests') || pathname.startsWith('/draft/snake/'))
      );
    } catch {
      return false;
    }
  },

  /**
   * Scrapes all completed NFL best-ball entries for the signed-in user.
   * Calls the same-origin DraftKings lineup API directly.
   *
   * Pick numbers are set to roster-slot index (1-based) because the API
   * returns players in slot order, not draft-pick order. Round is 0.
   * This is acceptable for exposure analysis which relies on player presence.
   *
   * @returns {Promise<import('./interface.js').Entry[]>}
   */
  async getEntries() {
    if (!window.location.pathname.startsWith('/mycontests')) {
      throw new Error(draftkingsAdapter.syncPageErrorMessage);
    }

    const resp = await fetch(
      'https://www.draftkings.com/lineup/getlineupswithplayersforuser',
      { credentials: 'include' }
    );

    if (!resp.ok) {
      throw new Error(`DraftKings API error: ${resp.status}`);
    }

    const lineups = await resp.json();
    const nflLineups = lineups.filter(lineup => lineup.SportId === 1); // NFL only

    // Batch-fetch draftables per unique draft group ID for team abbreviation mapping.
    // DK's lineup API only provides numeric team IDs (tid); the draftables endpoint
    // has the corresponding teamAbbreviation strings.
    const uniqueDraftGroupIds = [...new Set(nflLineups.map(l => l.ContestDraftGroupId))];
    const draftableResults = await Promise.allSettled(
      uniqueDraftGroupIds.map(id =>
        fetch(
          `https://api.draftkings.com/draftgroups/v1/draftgroups/${id}/draftables`
        ).then(r => r.ok ? r.json() : Promise.reject(new Error(`${r.status}`)))
      )
    );

    // Build teamId → teamAbbreviation from draftables responses.
    const tidToTeam = {};
    draftableResults.forEach((result) => {
      if (result.status !== 'fulfilled') return;
      (result.value?.draftables ?? []).forEach(d => {
        if (d.teamAbbreviation && d.teamId != null) {
          tidToTeam[d.teamId] = d.teamAbbreviation;
        }
      });
    });

    return nflLineups.map(lineup => ({
      entryId: String(lineup.LineupId),
      slateTitle:
        DRAFT_GROUP_META[lineup.ContestDraftGroupId]?.slate ?? 'DraftKings',
      tournamentTitle:
        DRAFT_GROUP_META[lineup.ContestDraftGroupId]?.name ??
        `DraftKings #${lineup.ContestDraftGroupId}`,
      draftDate: new Date(
        parseInt(lineup.LastModified.match(/\d+/)[0], 10)
      ).toISOString(),
      players: lineup.Players.map((p, idx) => ({
        name: `${p.fn} ${p.ln}`,
        position: p.pn,
        // pick/round reflect roster-slot order, not draft-pick order — DK API limitation
        team: tidToTeam[p.tid] ?? p.tid?.toString() ?? '',
        pick: idx + 1,
        round: 0,
      })),
    }));
  },

  isDraftPage() {
    return window.location.pathname.startsWith('/draft/snake/');
  },

  getDraftState() {
    throw new Error('[BBM] getDraftState() not implemented for DraftKings');
  },

  /**
   * DK rows have no data-id attribute. Use the player name as the row key.
   */
  getRowId(row) {
    return row.querySelector('.PlayerCell_player-name')?.textContent?.trim() || null;
  },

  /**
   * DK draft board: BaseTable manages cell layout internally, so injecting
   * new gridcells doesn't work. Instead, create an absolutely positioned
   * container anchored to the right of the last native column (ADP).
   * Returns the container as the parent — caller appends Exp/Corr into it.
   */
  getInjectionPoint(row) {
    const statCells = row.querySelectorAll('.CellBase_cellbase');
    if (statCells.length === 0) return {};

    // Calculate left offset: sum of all native gridcell widths
    const gridcells = row.querySelectorAll('[role="gridcell"]');
    let totalWidth = 0;
    gridcells.forEach(gc => { totalWidth += gc.offsetWidth; });

    // Store the computed offset on the row so processRow can position cells
    row.dataset.bbmLeft = totalWidth;

    // Return the row as parent — processRow appends, then we position in postInject
    return { parent: row, before: null };
  },

  /**
   * Called after Exp/Corr elements are appended to the row.
   * Applies absolute positioning so they appear after the last native column.
   */
  postInjectRow(row, expEl, corrEl) {
    const left = parseInt(row.dataset.bbmLeft, 10) || 635;
    console.log(`[BBM] postInjectRow: left=${left}, row width=${row.style.width}`);
    row.style.setProperty('overflow', 'visible', 'important');

    expEl.setAttribute('style', `position: absolute; left: ${left}px; top: 0; width: 50px; height: 100%; display: flex; align-items: center; justify-content: center; font-size: 11px; opacity: 0.7; z-index: 100; pointer-events: auto;`);
    corrEl.setAttribute('style', `position: absolute; left: ${left + 50}px; top: 0; width: 50px; height: 100%; display: flex; align-items: center; justify-content: center; font-size: 11px; opacity: 0.7; z-index: 100; pointer-events: auto; cursor: pointer;`);
  },

  /**
   * Returns the player list body element for overlay injection.
   * Both the player list and picks panel use BaseTable__body — distinguish
   * by finding the body that is NOT inside the picks panel table.
   */
  getInjectionTarget() {
    const picksTable = document
      .querySelector('[data-key="position"]')
      ?.closest('.BaseTable__table');
    const allBodies = [...document.querySelectorAll('.BaseTable__body')];
    return allBodies.find(b => !picksTable?.contains(b)) ?? null;
  },

  // No wrapOverlayCell — DK uses absolute positioning via getInjectionPoint.

  /**
   * Inject Exp and Corr header cells as proper BaseTable gridcells.
   * Finds the column-level header row via the BYE column's data-key
   * attribute rather than relying on which header row was passed in.
   */
  /**
   * Inject Exp/Corr header labels as an absolutely positioned overlay
   * anchored to the right of the last native header column.
   */
  injectHeaderCells(_headerRow) {
    // Prevent duplicate injection
    if (document.querySelector('.bbm-dk-header-overlay')) return;

    const adpCell = document.querySelector('.BaseTable__header-cell[data-key="averageDraftPosition"]');
    if (!adpCell) return;
    const columnRow = adpCell.closest('[role="row"]');
    if (!columnRow) return;

    // Calculate left offset — same approach as postInjectRow for data cells
    const headerCells = columnRow.querySelectorAll('[role="gridcell"]');
    let totalWidth = 0;
    headerCells.forEach(hc => { totalWidth += hc.offsetWidth; });

    columnRow.style.position = 'relative';
    columnRow.style.setProperty('overflow', 'visible', 'important');

    // Two separate absolute elements — mirrors postInjectRow positioning exactly
    const makeLabel = (text, left) => {
      const el = document.createElement('div');
      el.className = 'bbm-header-label bbm-dk-header-overlay';
      el.style.cssText = `position: absolute; left: ${left}px; top: 15px; width: 50px; height: 100%; display: flex; align-items: center; justify-content: center; font-size: 12px; font-weight: 600; opacity: 0.7;`;
      el.textContent = text;
      return el;
    };

    columnRow.appendChild(makeLabel('Exp', totalWidth));
    columnRow.appendChild(makeLabel('Corr', totalWidth + 60));
  },

  getStyles() {
    return {
      fontFamily:  '"Open Sans", sans-serif',
      fontSize:    '12px',
      textColor:   '#1a1a1a',
      bgColor:     'rgba(255, 255, 255, 0.95)',
      borderColor: '#e0e0e0',
    };
  },

  /**
   * Returns all currently rendered player rows in the player list.
   * Excludes the picks panel rows by scoping to the player list body only.
   */
  getPlayerRows() {
    const picksTable = document
      .querySelector('[data-key="position"]')
      ?.closest('.BaseTable__table');
    const allBodies = [...document.querySelectorAll('.BaseTable__body')];
    const playerListBody = allBodies.find(b => !picksTable?.contains(b));
    return [...(playerListBody?.querySelectorAll('[role="row"].BaseTable__row') ?? [])];
  },

  /**
   * Read current picks from the DK roster panel.
   * Returns an array of {name, position, round} for filled slots,
   * or null if the roster panel isn't found.
   *
   * @returns {Array<{name: string, position: string, round: number}>|null}
   */
  getCurrentPicks() {
    const rosterBody = document.querySelector('.RosterTable_rosterTable-component .BaseTable__body');
    if (!rosterBody) return null;
    const rows = rosterBody.querySelectorAll('[role="row"].BaseTable__row');
    const picks = [];
    rows.forEach((row, idx) => {
      const nameEl = row.querySelector('.PlayerCell_player-name');
      if (!nameEl) return;
      const name = nameEl.textContent?.trim();
      if (!name) return;
      const posEl = row.querySelector('.DKResponsiveGrid_dk-grid-cell');
      const position = posEl?.textContent?.trim() ?? '';
      picks.push({ name, position, round: idx + 1 });
    });
    return picks;
  },

  /**
   * Extract position and team from a DK player row's DOM.
   * Parses the "RB - LAR" style text in PlayerCell_player-position-and-team.
   *
   * @param {Element} row
   * @returns {{ position: string|null, team: string|null }}
   */
  getPlayerContext(row) {
    const container = row.querySelector('.PlayerCell_player-position-and-team');
    if (!container) return { position: null, team: null };
    const position = container.querySelector('.player-position')?.textContent?.trim().toUpperCase() || null;
    const team = container.querySelector('.PlayerCell_player-team')?.textContent?.trim().toUpperCase() || null;
    return { position, team };
  },

  selectors: {
    gridSelector:              '.BaseTable__body',
    rowSelector:               '[role="row"].BaseTable__row',
    rightSideSelector:         '.CellBase_cellbase',
    statCellSelector:          '.NumberCell_number-cell',
    sortButtonsSelector:       '.BaseTable__header-row',
    myPicksSelector:           '.PlayerCell_player-name',
    playerNameInRowSelector:   '.PlayerCell_player-name',
    playerContextSelector:     '.PlayerCell_player-position-and-team',
    positionSectionSelector:   '[role="row"].BaseTable__row',
    positionHeaderSelector:    '.DKResponsiveGrid_dk-grid-cell',
    stackPillTargetSelector:   '.PlayerCell_player-position-and-team',
  },

  /**
   * Returns true when the draft board is sorted by the user's custom Rank column.
   * DK marks the active sort column with the `--sorting` modifier class.
   */
  isMyRankSort() {
    const sortingCell = document.querySelector('.BaseTable__header-cell--sorting');
    return sortingCell?.textContent?.trim() === 'Rank';
  },

  platform: 'draftkings',

  syncPageErrorMessage: 'Navigate to your DraftKings My Contests page first',
};

export default draftkingsAdapter;
