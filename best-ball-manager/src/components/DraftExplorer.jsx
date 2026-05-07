import React, { useMemo, useState, useEffect, useCallback } from 'react';
import { loadTier3Initial, getTier3Cache, computeDraftState } from '../utils/draftModel';
import { loadSimData } from '../utils/uniquenessEngine';
import { canonicalName } from '../utils/helpers';
import styles from './DraftExplorer.module.css';

const POS_COLORS = {
  QB: '#bf44ef',
  RB: '#10b981',
  WR: '#f59e0b',
  TE: '#3b82f6',
};

const TEAMS = 12;
const MAX_DISPLAY_ROUNDS = 6;
const MAX_PICK_ROUNDS = 4;
const PRE_DRAFT_ADP_DATE = '2026-04-13'; // matches pre sim metadata.adp_date

/** Look up a player's ADP at a specific snapshot date, averaging across platforms.
 *  Falls back to the nearest earlier snapshot if the exact date isn't available. */
function adpAtDate(player, targetDate) {
  const hist = Array.isArray(player.history) ? player.history : [];
  if (hist.length === 0) return { adpPick: player.adpPick ?? null, adpDisplay: player.adpDisplay ?? '-' };

  const exact = hist.filter(h => h.date === targetDate && Number.isFinite(h.adpPick));
  if (exact.length > 0) {
    const avg = exact.reduce((s, h) => s + h.adpPick, 0) / exact.length;
    return { adpPick: avg, adpDisplay: avg.toFixed(1) };
  }

  const earlier = hist
    .filter(h => h.date <= targetDate && Number.isFinite(h.adpPick))
    .sort((a, b) => (a.date < b.date ? 1 : -1));
  if (earlier.length === 0) return { adpPick: null, adpDisplay: '-' };
  const latestDate = earlier[0].date;
  const sameDate = earlier.filter(h => h.date === latestDate);
  const avg = sameDate.reduce((s, h) => s + h.adpPick, 0) / sameDate.length;
  return { adpPick: avg, adpDisplay: avg.toFixed(1) };
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export default function DraftExplorer({ masterPlayers = [], rosterData = [], tournamentStatuses = {}, onNavigateToRosters = null, defaultMode = 'pre' }) {
  const [selections, setSelections] = useState([]); // [{gridIndex}]
  const [tier3Ready, setTier3Ready] = useState(false);
  const [tier3Version, setTier3Version] = useState(0); // bumped when new round data arrives
  const [mode, setMode] = useState(defaultMode === 'post' ? 'post' : 'pre');
  const [postUnavailable, setPostUnavailable] = useState(false);

  const source = mode === 'post' ? 'post' : 'pre';

  // Load R1 + tier1 for the active source, then background-load R2-R4.
  // Re-runs when `source` flips so the post cache loads on first toggle.
  // tier3Ready/tier1 stay sticky across source changes — the per-source caches
  // in draftModel/uniquenessEngine guarantee getTier3Cache(source) returns the
  // right data, and the useMemo guards on cache.r1 being non-null.
  useEffect(() => {
    let cancelled = false;
    Promise.all([loadTier3Initial(source), loadSimData(source)])
      .then(() => {
        if (cancelled) return;
        setTier3Ready(true);
        // Bump version so useMemo recomputes — setTier3Ready(true) is a no-op
        // when toggling between sources after the first load.
        setTier3Version(v => v + 1);
      })
      .catch(() => {
        if (cancelled) return;
        if (source === 'post') setPostUnavailable(true);
      });

    const checkLoaded = setInterval(() => {
      const cache = getTier3Cache(source);
      const loaded = [cache.r1, cache.r2, cache.r3, cache.r4].filter(Boolean).length;
      setTier3Version(loaded);
      if (loaded === 4) clearInterval(checkLoaded);
    }, 500);
    return () => { cancelled = true; clearInterval(checkLoaded); };
  }, [source]);

  // ── Grid players sorted by ADP ───────────────────────────────────────────
  // Pre-Draft: snap to the pre sim's ADP date so grid order matches the sim.
  // Post-Draft: use the player's latest ADP (which is what the post sim consumed).
  const gridPlayers = useMemo(() => {
    if (!masterPlayers.length) return [];
    const annotated = masterPlayers.map(p => {
      const adp = mode === 'pre'
        ? adpAtDate(p, PRE_DRAFT_ADP_DATE)
        : { adpPick: p.adpPick ?? null, adpDisplay: p.adpDisplay ?? '-' };
      return {
        player_id: p.player_id,
        name: p.name,
        position: p.position,
        team: p.team,
        adp: adp.adpPick,
        adpDisplay: adp.adpDisplay,
      };
    });
    return annotated
      .filter(p => p.adp != null && Number.isFinite(p.adp) && p.adp <= 120)
      .sort((a, b) => a.adp - b.adp)
      .slice(0, TEAMS * MAX_DISPLAY_ROUNDS);
  }, [masterPlayers, mode]);

  // ── Player ID → grid index lookup ────────────────────────────────────────
  // The pre sim was generated when several rookies had no NFL team yet, so its
  // player_ids carry an empty team segment (e.g., id-JeremiyahLove-RB-).
  // Current masterPlayers carry a populated team segment. To bridge the two,
  // we register both the exact player_id AND a team-stripped variant as keys
  // pointing at the same grid index.
  const playerIdToGrid = useMemo(() => {
    const map = new Map();
    gridPlayers.forEach((p, i) => {
      map.set(p.player_id, i);
      const teamStripped = p.player_id.replace(/^(id-[^-]+-[^-]+-).*$/, '$1');
      if (teamStripped !== p.player_id && !map.has(teamStripped)) {
        map.set(teamStripped, i);
      }
    });
    return map;
  }, [gridPlayers]);

  // ── 2D draft board layout (snake order) with grid indices ─────────────────
  const draftBoard = useMemo(() => {
    const board = [];
    for (let r = 0; r < MAX_DISPLAY_ROUNDS; r++) {
      const start = r * TEAMS;
      const end = Math.min(start + TEAMS, gridPlayers.length);
      const row = [];
      for (let i = start; i < end; i++) {
        row.push({ ...gridPlayers[i], _gridIndex: i });
      }
      board.push(r % 2 === 0 ? row : row.reverse());
    }
    return board;
  }, [gridPlayers]);

  // ── Roster matching (progressive) ────────────────────────────────────────
  // Mode-scoped: in Post-Draft mode count post-draft rosters; in Pre-Draft mode
  // count pre-draft rosters. Drives "matching rosters" and the next-round badges.
  const rostersByEntry = useMemo(() => {
    const map = new Map();
    rosterData.forEach(p => {
      const tStatus = tournamentStatuses[p.tournamentTitle];
      if (tStatus && tStatus !== mode) return;
      const id = p.entry_id || 'unknown';
      if (!map.has(id)) map.set(id, []);
      map.get(id).push(p);
    });
    return map;
  }, [rosterData, tournamentStatuses, mode]);

  // ── Probability computation ──────────────────────────────────────────────
  const { probMap, selectedSet, currentRound } = useMemo(() => {
    if (gridPlayers.length === 0 || !tier3Ready) {
      return { probMap: new Map(), selectedSet: new Set(), currentRound: 1 };
    }
    const cache = getTier3Cache(source);
    return computeDraftState(selections, gridPlayers, playerIdToGrid, cache);
    // tier3Version dependency triggers recompute when background data arrives
  }, [source, selections, tier3Ready, tier3Version, gridPlayers, playerIdToGrid]);

  const matchingRosters = useMemo(() => {
    if (selections.length < 1) return [];
    const selectedCanonical = selections.map(s => canonicalName(gridPlayers[s.gridIndex]?.name));
    const matches = [];
    for (const [entryId, roster] of rostersByEntry) {
      const rosterCanonical = new Set(roster.map(p => canonicalName(p.name)));
      if (selectedCanonical.every(n => rosterCanonical.has(n))) {
        matches.push({ entryId, tournamentTitle: roster[0]?.tournamentTitle || entryId });
      }
    }
    return matches;
  }, [selections, gridPlayers, rostersByEntry]);

  // ── Roster extensions: which next-round pick did the path-matching rosters take?
  const rosterExtensions = useMemo(() => {
    if (selections.length === 0 || currentRound > MAX_PICK_ROUNDS) return new Map();
    const gridCanonical = gridPlayers.map(p => canonicalName(p.name));

    const extensions = new Map();

    for (const [, roster] of rostersByEntry) {
      const byRound = {};
      for (const p of roster) {
        const r = Number(p.round);
        if (r >= 1 && r <= MAX_PICK_ROUNDS + 1) {
          byRound[r] = canonicalName(p.name);
        }
      }

      let matches = true;
      for (let i = 0; i < selections.length; i++) {
        const selectedName = canonicalName(gridPlayers[selections[i].gridIndex]?.name);
        if (byRound[i + 1] !== selectedName) {
          matches = false;
          break;
        }
      }
      if (!matches) continue;

      const nextRoundName = byRound[currentRound];
      if (!nextRoundName) continue;

      for (let i = 0; i < gridPlayers.length; i++) {
        if (selectedSet.has(i)) continue;
        if (gridCanonical[i] === nextRoundName) {
          extensions.set(i, (extensions.get(i) || 0) + 1);
          break;
        }
      }
    }
    return extensions;
  }, [selections, gridPlayers, rostersByEntry, selectedSet, currentRound]);

  // ── Selection frequency — how often this exact path appeared in the sim ──
  const selectionFrequency = useMemo(() => {
    if (selections.length === 0 || !tier3Ready) return null;
    const cache = getTier3Cache(source);
    const pids = selections.map(s => gridPlayers[s.gridIndex].player_id);
    const totalRosters = cache.metadata?.total_rosters || 1;
    let count = 0;

    if (pids.length === 1) {
      count = cache.r1?.[pids[0]] || 0;
    } else if (pids.length === 2) {
      count = cache.r2?.[pids[0]]?.[pids[1]] || 0;
    } else if (pids.length === 3) {
      count = cache.r3?.[`${pids[0]}|${pids[1]}`]?.[pids[2]] || 0;
    } else if (pids.length === 4) {
      count = cache.r4?.[`${pids[0]}|${pids[1]}|${pids[2]}`]?.[pids[3]] || 0;
    }

    return { count, totalRosters };
  }, [source, selections, gridPlayers, tier3Ready, tier3Version]);

  // ── Handlers ─────────────────────────────────────────────────────────────
  const handleCellClick = useCallback((gridIndex) => {
    if (selections.length >= MAX_PICK_ROUNDS) return;
    setSelections(prev => [...prev, { gridIndex }]);
  }, [selections.length]);

  const handleUndo = useCallback(() => {
    setSelections(prev => prev.slice(0, -1));
  }, []);

  const handleReset = useCallback(() => {
    setSelections([]);
  }, []);

  // ── Loading / error states ───────────────────────────────────────────────
  if (postUnavailable) {
    return (
      <div className={styles.emptyPrompt}>
        Post-draft simulation data is not available on this build. Toggle Pre-Draft to use the existing cache.
      </div>
    );
  }

  if (!tier3Ready) {
    return <div className={styles.loading}>Loading simulation data...</div>;
  }

  if (gridPlayers.length === 0) {
    return <div className={styles.emptyPrompt}>No ADP data available. Load roster data to explore draft combos.</div>;
  }

  // ── Helpers for rendering ────────────────────────────────────────────────
  const maxProb = Math.max(0.01, ...probMap.values());

  function fillPct(gridIndex) {
    const prob = probMap.get(gridIndex);
    if (prob == null || prob <= 0) return 0;
    return Math.round((prob / maxProb) * 100);
  }

  const cache = getTier3Cache(source);
  const totalRostersLabel = cache.metadata?.total_rosters
    ? `${(cache.metadata.total_rosters / 1e6).toFixed(0)}M`
    : 'millions of';

  // ── Render ───────────────────────────────────────────────────────────────
  return (
    <div className={styles.root}>
      {/* Mode Toggle + Path Breadcrumb */}
      <div className={styles.pathBar}>
        <div className={styles.modeToggle} role="tablist" aria-label="Draft data source">
          <button
            type="button"
            role="tab"
            aria-selected={mode === 'pre'}
            className={`${styles.modeToggleBtn} ${mode === 'pre' ? styles.modeToggleBtnActive : ''}`}
            onClick={() => setMode('pre')}
          >
            Pre-Draft
          </button>
          <button
            type="button"
            role="tab"
            aria-selected={mode === 'post'}
            className={`${styles.modeToggleBtn} ${mode === 'post' ? styles.modeToggleBtnActive : ''}`}
            onClick={() => setMode('post')}
          >
            Post-Draft
          </button>
        </div>
        {Array.from({ length: MAX_PICK_ROUNDS }, (_, i) => {
          const sel = selections[i];
          const player = sel ? gridPlayers[sel.gridIndex] : null;
          const isActive = i + 1 === currentRound && currentRound <= MAX_PICK_ROUNDS;
          return (
            <React.Fragment key={i}>
              {i > 0 && <span className={styles.pathArrow}>→</span>}
              <span className={styles.pathStep}>
                <span className={styles.pathRound}>R{i + 1}:</span>
                {player ? (
                  <>
                    <span
                      className={styles.posBadge}
                      style={{ backgroundColor: POS_COLORS[player.position] || '#6b7280' }}
                    >
                      {player.position}
                    </span>
                    <span className={styles.pathPlayer}>{player.name}</span>
                  </>
                ) : (
                  <span className={styles.pathPending}>{isActive ? 'pick...' : '—'}</span>
                )}
              </span>
            </React.Fragment>
          );
        })}
        <span className={styles.pathActions}>
          {selections.length > 0 && (
            <>
              <button className={styles.pathActionBtn} onClick={handleUndo}>Undo</button>
              <button className={styles.pathActionBtn} onClick={handleReset}>Reset</button>
            </>
          )}
        </span>
      </div>

      {/* Draft Board Grid */}
      <div className={styles.gridContainer}>
        {draftBoard.map((row, roundIdx) => {
          const isActiveRound = roundIdx + 1 === currentRound && currentRound <= MAX_PICK_ROUNDS;

          return (
            <React.Fragment key={roundIdx}>
              <div className={`${styles.roundLabel} ${isActiveRound ? styles.roundLabelActive : ''}`}>
                R{roundIdx + 1}
              </div>

              {row.map((player) => {
                const gridIndex = player._gridIndex;
                const prob = probMap.get(gridIndex);
                const isSelected = selectedSet.has(gridIndex);
                const hasProb = prob != null && prob > 0;
                const isZero = !isSelected && !hasProb;
                const isSelectable = !isSelected && currentRound <= MAX_PICK_ROUNDS;
                const fill = fillPct(gridIndex);
                const posColor = POS_COLORS[player.position] || '#6b7280';
                const rosterCount = rosterExtensions.get(gridIndex);
                const hasRosters = rosterCount > 0;
                const isUnseen = isZero && hasRosters;

                return (
                  <div
                    key={player.player_id}
                    className={[
                      styles.cell,
                      isSelected && styles.cellSelected,
                      isZero && !isUnseen && styles.cellDepleted,
                      isUnseen && styles.cellUnseen,
                      isSelectable && styles.cellSelectable,
                    ].filter(Boolean).join(' ')}
                    onClick={isSelectable ? () => handleCellClick(gridIndex) : undefined}
                  >
                    {fill > 0 && (
                      <div
                        className={styles.cellFill}
                        style={{ height: `${fill}%`, backgroundColor: posColor }}
                      />
                    )}
                    {hasRosters && (
                      <div
                        className={isUnseen ? styles.unseenBadge : styles.rosterBadge}
                        title={`${rosterCount} of your rosters drafted this player in R${currentRound}${isUnseen ? ' — never seen in sim' : ''}`}
                      >
                        {rosterCount}
                      </div>
                    )}
                    <div className={styles.cellContent}>
                      <span
                        className={styles.posBadge}
                        style={{ backgroundColor: posColor }}
                      >
                        {player.position}
                      </span>
                      <span className={styles.cellName}>{player.name}</span>
                      <span className={styles.cellAdp}>{player.adpDisplay}</span>
                      {hasProb && (
                        <span className={styles.cellPct}>{(prob * 100).toFixed(1)}%</span>
                      )}
                    </div>
                  </div>
                );
              })}
            </React.Fragment>
          );
        })}
      </div>

      {/* Combo info — shown as soon as 1+ players selected */}
      {selections.length >= 1 && (
        <div className={styles.comboResults}>
          <div className={styles.comboFrequency}>
            {selectionFrequency?.count > 0
              ? `Seen ${selectionFrequency.count.toLocaleString()} times in ${(selectionFrequency.totalRosters / 1e6).toFixed(0)}M simulated rosters (${((selectionFrequency.count / selectionFrequency.totalRosters) * 100).toFixed(4)}%)`
              : `Never seen in ${selectionFrequency?.totalRosters ? `${(selectionFrequency.totalRosters / 1e6).toFixed(0)}M` : ''} simulated rosters — extremely rare combo`
            }
          </div>
          <div className={styles.comboRosterCount}>
            <span>
              {matchingRosters.length > 0
                ? `${matchingRosters.length} of your ${rostersByEntry.size} rosters have ${selections.length === 1 ? 'this player' : 'this combo'}`
                : `None of your ${rostersByEntry.size} rosters have ${selections.length === 1 ? 'this player' : 'this combo'}`
              }
            </span>
            {matchingRosters.length > 0 && onNavigateToRosters && (
              <button
                className={styles.seeRostersBtn}
                onClick={() => onNavigateToRosters({ players: selections.map(s => gridPlayers[s.gridIndex].name) })}
              >
                See Rosters →
              </button>
            )}
          </div>
        </div>
      )}

      {/* Explainer */}
      <div className={styles.explainer}>
        Based on {totalRostersLabel} simulated drafts using {mode === 'post' ? 'post-draft' : 'pre-draft'} ADP.
        Percentages show how often each player was picked in that round given your prior selections.
        Select a player to see how the next round's distribution shifts based on that specific pick.
      </div>
    </div>
  );
}
