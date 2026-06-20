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
 * Bucket a DK contest into a slate. DK does not expose a season-label slate
 * field comparable to Underdog's `slate.title`, so we derive it from the
 * contest name: "Early Bird" tournaments are the pre-NFL-draft pool; everything
 * else is post-draft.
 *
 * @param {string|undefined} contestName
 * @returns {'DK Pre-Draft'|'DK Post-Draft'}
 */
function deriveDkSlate(contestName) {
  const name = (contestName || '').toLowerCase();
  return name.includes('early bird') ? 'DK Pre-Draft' : 'DK Post-Draft';
}

/**
 * Normalize a DraftKings `draftStatus.draftBoard[]` (every pick by every user
 * in the pod) into the shared full-board shape consumed by the web app's
 * DraftBoardModal. Mirrors underdog-bridge.js `normalizeBoard` (ADR-009 /
 * TASK-258) so DK and UD boards are interchangeable downstream.
 *
 * Seat/column derivation: DK does not expose an explicit seat index on a pick,
 * but in a snake draft each user's first-round pick fixes their column. We rank
 * the first-round picks by `overallSelectionNumber` and assign 1-indexed slots,
 * then stamp that slot onto every pick by the same `userKey`. Ranking (rather
 * than using the raw selection number) keeps slots a contiguous 1..entryCount
 * regardless of whether DK numbers picks/rounds 0- or 1-based.
 *
 * The board is keyed by `draftId` = the syncing user's LineupId so it matches
 * that entry's `entry_id` in `extension_entries` — the web app lights up the
 * Board action via `boardIds.has(roster.entry_id)`, so the keys must align
 * (UD has the same identity: entryId === draft.id).
 *
 * Returns null (board omitted) if any pick's player name is unresolved or any
 * seat can't be derived — a nameless or column-less board is useless to the
 * web app and must not be persisted.
 *
 * @param {Array<{draftableId:number, userKey:string, overallSelectionNumber:number, roundNumber:number, teamPositionId:number}>} draftBoard
 * @param {{ didToInfo: Record<number, {position:string|null, team:string|null, displayName:string|null}>, slateTitle: string|null, draftId: string }} ctx
 * @returns {object|null}
 */
function normalizeDkBoard(draftBoard, { didToInfo, slateTitle, draftId }) {
  if (!Array.isArray(draftBoard) || draftBoard.length === 0) return null;

  const minRound = Math.min(...draftBoard.map(p => p.roundNumber));
  const maxRound = Math.max(...draftBoard.map(p => p.roundNumber));
  const rounds = maxRound - minRound + 1;

  // First-round picks fix each user's seat. Rank by selection number → slot.
  const slotByUserKey = {};
  draftBoard
    .filter(p => p.roundNumber === minRound)
    .sort((a, b) => a.overallSelectionNumber - b.overallSelectionNumber)
    .forEach((p, i) => { slotByUserKey[p.userKey] = i + 1; });
  const entryCount = Object.keys(slotByUserKey).length;
  if (entryCount === 0) return null;

  let unresolved = 0;
  const picks = draftBoard.map((p) => {
    const info = didToInfo[p.draftableId] ?? {};
    const name = info.displayName ?? null;
    if (!name) unresolved++;
    const slot = slotByUserKey[p.userKey] ?? null;
    if (slot == null) unresolved++;
    const position = TEAM_POS_MAP[p.teamPositionId] ?? info.position ?? null;
    return {
      pick:         p.overallSelectionNumber,
      round:        p.roundNumber - minRound + 1,
      slot,
      draftEntryId: String(p.userKey),
      userId:       String(p.userKey),
      name,
      position:     position ? String(position).toUpperCase() : null,
      team:         info.team ?? null,
    };
  });

  if (unresolved > 0) return null;

  return {
    draftId:    String(draftId),
    slateTitle: slateTitle ?? null,
    entryCount,
    rounds,
    picks,
  };
}

/**
 * Read the ADP value from a DK player row. react-base-table doesn't reliably
 * put data-key on body cells, so we try several strategies in order:
 *   1) Direct [data-key="averageDraftPosition"] on the row.
 *   2) Header-position match: find the header's averageDraftPosition column
 *      index, then read the body gridcell at the same index.
 *   3) Last `.NumberCell_number-cell` in the row (ADP is the rightmost stat
 *      column on the DK board).
 *
 * Logs the first successful strategy once per session for diagnosis.
 *
 * @param {Element} row
 * @returns {number|null}
 */
let dkAdpStrategyLogged = false;
function readDkRowAdp(row) {
  const parseCell = (el, strategy) => {
    if (!el) return null;
    const text = el.textContent?.trim() ?? '';
    const num = Number.parseFloat(text);
    if (!Number.isFinite(num)) return null;
    if (!dkAdpStrategyLogged) {
      dkAdpStrategyLogged = true;
      console.debug(`[BBM] DK ADP read via strategy: ${strategy}, value=${num}`);
    }
    return num;
  };

  // Strategy 1: data-key on row cell
  const direct = row.querySelector('[data-key="averageDraftPosition"]');
  const v1 = parseCell(direct, 'data-key');
  if (v1 !== null) return v1;

  // Strategy 2: header column index → same index in row
  const headerCell = document.querySelector('.BaseTable__header-cell[data-key="averageDraftPosition"]');
  if (headerCell) {
    const headerRow = headerCell.closest('[role="row"]');
    const headerCells = headerRow ? [...headerRow.querySelectorAll('[role="columnheader"], [role="gridcell"], .BaseTable__header-cell')] : [];
    const idx = headerCells.indexOf(headerCell);
    if (idx >= 0) {
      const bodyCells = [...row.querySelectorAll('[role="gridcell"], .BaseTable__row-cell')];
      const v2 = parseCell(bodyCells[idx], 'header-index');
      if (v2 !== null) return v2;
    }
  }

  // Strategy 3: last NumberCell in the row
  const numberCells = row.querySelectorAll('.NumberCell_number-cell');
  const last = numberCells[numberCells.length - 1];
  const v3 = parseCell(last, 'last-numbercell');
  if (v3 !== null) return v3;

  return null;
}

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
   * Then fetches draftStatus per entry for real pick order and positions, and
   * captures the full pod board (all rosters) from the same draftStatus payload
   * (ADR-009 / TASK-274). Falls back gracefully: if draftStatus fails, uses
   * draftables positions with slot-order picks and the draft yields no board.
   *
   * @returns {Promise<{ newEntries: import('./interface.js').Entry[], currentDraftIds: string[], boards: object[] }>}
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
            displayName: d.displayName ?? null,
          };
        }
      });
    });

    // Step 4: Fetch draftStatus for entries with contest mapping (real pick order)
    // draftableId → { pick, round, position } per lineup
    const draftStatusMap = new Map();
    // Full pod boards keyed by LineupId (ADR-009 / TASK-274). draftBoard[]
    // already carries every user's picks; we keep the whole pod, not just the
    // syncing user's, and normalize it into the shared board shape.
    const boardMap = new Map();
    const statusFetches = nflLineups
      .filter(lineup => contestMap.has(String(lineup.LineupId)))
      .map(lineup => {
        const lid = String(lineup.LineupId);
        const { contestId, userContestId, contestName } = contestMap.get(lid);
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

            // Capture the full pod board (all rosters), keyed by LineupId so it
            // matches this entry's entry_id in the web app's board lookup.
            const board = normalizeDkBoard(ds.draftBoard, {
              didToInfo,
              slateTitle: contestName ?? null,
              draftId: lid,
            });
            if (board) boardMap.set(lid, board);
          })
          .catch(e => console.warn(`[BBM] DK draftStatus failed for lineup ${lid}:`, e.message));
      });

    await Promise.allSettled(statusFetches);

    // Step 5: Build entries with best available data
    const newEntries = nflLineups.map(lineup => {
      const lid = String(lineup.LineupId);
      const contest = contestMap.get(lid);
      const pickMap = draftStatusMap.get(lid);

      const tournamentTitle = contest?.contestName
        ?? `DraftKings #${lineup.ContestDraftGroupId}`;
      return {
        entryId: lid,
        slateTitle: deriveDkSlate(tournamentTitle),
        tournamentTitle,
        draftDate: new Date(
          parseInt(lineup.LastModified.match(/\d+/)[0], 10)
        ).toISOString(),
        players: lineup.Players.map((p, idx) => {
          const dInfo = didToInfo[p.did];   // from draftables (position + team)
          const sInfo = pickMap?.get(p.did); // from draftStatus (pick + round + position)
          return {
            name: dInfo?.displayName ?? `${p.fn} ${p.ln}`,
            position: sInfo?.position ?? dInfo?.position ?? p.pn,
            team: tidToTeam[p.tid] ?? dInfo?.team ?? p.tid?.toString() ?? '',
            pick: sInfo?.pick ?? (idx + 1),
            round: sInfo?.round ?? 0,
          };
        }),
      };
    });

    // Return the incremental shape so content.js routes boards through
    // writeBoards and writeEntries uses its incremental path. DK re-fetches
    // every lineup each sync, so currentDraftIds = all entry ids reproduces the
    // prior full-replace semantics (every entry re-upserted; withdrawn drafts
    // pruned as stale ids).
    return {
      newEntries,
      currentDraftIds: newEntries.map(e => e.entryId),
      boards: [...boardMap.values()],
    };
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
   *
   * IMPORTANT: The roster panel is a react-base-table virtualized list — only
   * rows currently inside the scroll viewport exist in the DOM. The returned
   * array is therefore the *visible subset* of picks, not the full roster.
   * The caller in draft-overlay.js maintains an accumulator across observations
   * so scrolling does not drop previously-seen picks. See TASK-233.
   *
   * Round is read from `aria-rowindex` (react-base-table's stable row-position
   * attribute) when available so a pick's true draft round is recovered even
   * when the row is observed mid-scroll. When the attribute is absent or
   * non-positive, `round` is left null and the accumulator preserves whatever
   * round was recorded on first observation.
   *
   * @returns {Array<{name: string, position: string, team: string, round: number|null}>|null}
   */
  getCurrentPicks() {
    const rosterBody = document.querySelector('.RosterTable_rosterTable-component .BaseTable__body');
    if (!rosterBody) return null;
    const rows = rosterBody.querySelectorAll('[role="row"].BaseTable__row');
    const picks = [];
    rows.forEach(row => {
      const nameEl = row.querySelector('.PlayerCell_player-name');
      if (!nameEl) return;
      const name = nameEl.textContent?.trim();
      if (!name) return;
      const posEl = row.querySelector('.DKResponsiveGrid_dk-grid-cell');
      const position = posEl?.textContent?.trim() ?? '';
      const team = row.querySelector('.PlayerCell_player-team')?.textContent?.trim().toUpperCase() ?? '';
      const ariaRowIndex = parseInt(row.getAttribute('aria-rowindex') ?? '', 10);
      // aria-rowindex is 1-based and typically reserves index 1 for the header
      // row, so subtract 1. If the value is missing or non-positive, leave round
      // null and let the accumulator hold whatever round was seen earlier.
      const round = Number.isFinite(ariaRowIndex) && ariaRowIndex > 1 ? ariaRowIndex - 1 : null;
      picks.push({ name, position, team, round });
    });
    return picks;
  },

  /**
   * Extract position, team, and ADP from a DK player row's DOM.
   * Parses the "RB - LAR" style text in PlayerCell_player-position-and-team
   * and the ADP value from the averageDraftPosition gridcell.
   *
   * @param {Element} row
   * @returns {{ position: string|null, team: string|null, adp: number|null }}
   */
  getPlayerContext(row) {
    const container = row.querySelector('.PlayerCell_player-position-and-team');
    const position = container?.querySelector('.player-position')?.textContent?.trim().toUpperCase() || null;
    const team = container?.querySelector('.PlayerCell_player-team')?.textContent?.trim().toUpperCase() || null;
    const adp = readDkRowAdp(row);
    return { position, team, adp };
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
