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

/** Maps teamPositionId from the draftStatus API to standard position abbreviations. */
const TEAM_POS_MAP = { 1: 'QB', 2: 'RB', 3: 'WR', 4: 'TE' };

/**
 * Parse the /contest/mycontests HTML page to extract contest-entry mappings.
 * The page embeds JSON objects containing ContestId, UserContestId, and
 * ActiveLineupId which map lineup data to draftStatus URL parameters.
 *
 * Uses brace-counting to extract each complete JSON object around a
 * UserContestId field, avoiding cross-match between adjacent entries.
 *
 * @param {string} html
 * @returns {Map<string, {contestId: string, userContestId: string, contestName: string}>}
 *   Map keyed by LineupId (as string)
 */
function parseMyContestsHtml(html) {
  const map = new Map();
  const re = /"UserContestId":(\d+)/g;
  let m;
  while ((m = re.exec(html)) !== null) {
    // Walk backwards to find the opening { of this JSON object
    let depth = 0;
    let objStart = -1;
    for (let i = m.index - 1; i >= 0; i--) {
      if (html[i] === '}') depth++;
      if (html[i] === '{') {
        if (depth === 0) { objStart = i; break; }
        depth--;
      }
    }
    if (objStart === -1) continue;

    // Walk forward to find the matching closing }
    depth = 0;
    let objEnd = -1;
    for (let i = objStart; i < html.length; i++) {
      if (html[i] === '{') depth++;
      if (html[i] === '}') {
        depth--;
        if (depth === 0) { objEnd = i + 1; break; }
      }
    }
    if (objEnd === -1) continue;

    try {
      const entry = JSON.parse(html.slice(objStart, objEnd));
      const contestId = String(entry.ActiveContestId ?? entry.ContestId ?? '');
      const lineupId = String(entry.ActiveLineupId ?? entry.LineupId ?? '');
      const sport = entry.Sport;
      if (contestId && lineupId && sport === 1) {
        map.set(lineupId, {
          contestId,
          userContestId: String(entry.UserContestId),
          contestName: entry.ContestName ?? 'DraftKings',
        });
      }
    } catch {
      // Not valid standalone JSON — skip
    }

    // Advance past this object to avoid re-matching nested occurrences
    if (objEnd > 0) re.lastIndex = objEnd;
  }
  return map;
}

const draftkingsAdapter = {
  isMatch(url) {
    try {
      const { hostname } = new URL(url);
      return hostname === 'www.draftkings.com';
    } catch {
      return false;
    }
  },

  /**
   * Scrapes all completed NFL best-ball entries for the signed-in user.
   *
   * Fetches three data sources in parallel:
   *   1. Lineup API — player lists per entry (same-origin)
   *   2. /contest/mycontests — maps LineupId → ContestId + UserContestId
   *   3. Draftables API — real positions and team abbreviations (public)
   *
   * Then fetches draftStatus per entry for real pick order and positions.
   * Falls back gracefully: if draftStatus fails, uses draftables positions
   * with slot-order picks.
   *
   * @returns {Promise<import('./interface.js').Entry[]>}
   */
  async getEntries() {
    if (!window.location.pathname.startsWith('/mycontests')) {
      throw new Error(draftkingsAdapter.syncPageErrorMessage);
    }

    // Step 1: Fetch lineup data and mycontests mapping in parallel
    const [lineupResp, myContestsResp] = await Promise.all([
      fetch('https://www.draftkings.com/lineup/getlineupswithplayersforuser', { credentials: 'include' }),
      fetch('https://www.draftkings.com/contest/mycontests', { credentials: 'include' }).catch(() => null),
    ]);

    if (!lineupResp.ok) {
      throw new Error(`DraftKings API error: ${lineupResp.status}`);
    }

    const lineups = await lineupResp.json();
    const nflLineups = lineups.filter(lineup => lineup.SportId === 1);

    // Step 2: Parse mycontests HTML for contest → entry ID mapping
    let contestMap = new Map();
    if (myContestsResp?.ok) {
      try {
        const html = await myContestsResp.text();
        contestMap = parseMyContestsHtml(html);
      } catch (e) {
        console.warn('[BBM] DK mycontests parse failed, using fallback:', e.message);
      }
    }

    // Step 3: Fetch draftables for team abbreviations and real positions
    const uniqueDraftGroupIds = [...new Set(nflLineups.map(l => l.ContestDraftGroupId))];
    const draftableResults = await Promise.allSettled(
      uniqueDraftGroupIds.map(id =>
        fetch(
          `https://api.draftkings.com/draftgroups/v1/draftgroups/${id}/draftables`
        ).then(r => r.ok ? r.json() : Promise.reject(new Error(`${r.status}`)))
      )
    );

    // Build lookup maps from draftables: teamId → abbreviation, draftableId → info
    const tidToTeam = {};
    const didToInfo = {};
    draftableResults.forEach((result) => {
      if (result.status !== 'fulfilled') return;
      (result.value?.draftables ?? []).forEach(d => {
        if (d.teamAbbreviation && d.teamId != null) {
          tidToTeam[d.teamId] = d.teamAbbreviation;
        }
        if (d.draftableId != null) {
          didToInfo[d.draftableId] = {
            position: d.position ?? null,
            team: d.teamAbbreviation ?? null,
          };
        }
      });
    });

    // Step 4: Fetch draftStatus for entries with contest mapping (real pick order)
    // draftableId → { pick, round, position } per lineup
    const draftStatusMap = new Map();
    const statusFetches = nflLineups
      .filter(lineup => contestMap.has(String(lineup.LineupId)))
      .map(lineup => {
        const lid = String(lineup.LineupId);
        const { contestId, userContestId } = contestMap.get(lid);
        return fetch(
          `https://api.draftkings.com/drafts/v1/${contestId}/entries/${userContestId}/draftStatus?format=json`,
          { credentials: 'include' }
        )
          .then(r => {
            if (r.status === 404) {
              return null;
            }
            return r.ok ? r.json() : null;
          })
          .then(ds => {
            if (!ds?.draftBoard) return;
            // Identify user's picks by matching draftableIds from the lineup
            const lineupDids = new Set(lineup.Players.map(p => p.did));
            const userKey = ds.draftBoard.find(pick => lineupDids.has(pick.draftableId))?.userKey;
            if (!userKey) return;

            const pickMap = new Map();
            for (const pick of ds.draftBoard) {
              if (pick.userKey !== userKey) continue;
              pickMap.set(pick.draftableId, {
                pick: pick.overallSelectionNumber,
                round: pick.roundNumber,
                position: TEAM_POS_MAP[pick.teamPositionId] ?? null,
              });
            }
            draftStatusMap.set(lid, pickMap);
          })
          .catch(e => console.warn(`[BBM] DK draftStatus failed for lineup ${lid}:`, e.message));
      });

    await Promise.allSettled(statusFetches);

    // Step 5: Build entries with best available data
    return nflLineups.map(lineup => {
      const lid = String(lineup.LineupId);
      const contest = contestMap.get(lid);
      const pickMap = draftStatusMap.get(lid);

      return {
        entryId: lid,
        slateTitle: 'DK Pre-Draft',
        tournamentTitle: contest?.contestName
          ?? `DraftKings #${lineup.ContestDraftGroupId}`,
        draftDate: new Date(
          parseInt(lineup.LastModified.match(/\d+/)[0], 10)
        ).toISOString(),
        players: lineup.Players.map((p, idx) => {
          const dInfo = didToInfo[p.did];   // from draftables (position + team)
          const sInfo = pickMap?.get(p.did); // from draftStatus (pick + round + position)
          return {
            name: `${p.fn} ${p.ln}`,
            position: sInfo?.position ?? dInfo?.position ?? p.pn,
            team: tidToTeam[p.tid] ?? dInfo?.team ?? p.tid?.toString() ?? '',
            pick: sInfo?.pick ?? (idx + 1),
            round: sInfo?.round ?? 0,
          };
        }),
      };
    });
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
