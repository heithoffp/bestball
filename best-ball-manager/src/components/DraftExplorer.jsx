import React, { useMemo, useState, useEffect, useCallback } from 'react';
import { loadTier3Initial, getTier3Cache, computeDraftState } from '../utils/draftModel';
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
// Pre-draft pods were drafted Feb–Apr, so the Pre-Draft grid orders players by
// a mid-April ADP snapshot rather than today's ADP.
const PRE_DRAFT_ADP_DATE = '2026-04-13';

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
  const [dataVersion, setDataVersion] = useState(0); // bumped when a source's cache lands
  const [mode, setMode] = useState(defaultMode === 'post' ? 'post' : 'pre');

  const source = mode === 'post' ? 'post' : 'pre';
  const dataReady = dataVersion > 0;

  // Build pick-path data for the active source from real drafts (captured
  // boards + the user's synced rosters). Re-runs when `source` flips so the
  // other cache builds on first toggle; per-source caches in draftModel make
  // repeat toggles instant.
  useEffect(() => {
    let cancelled = false;
    loadTier3Initial(source, { masterPlayers, rosterData })
      .then(() => { if (!cancelled) setDataVersion(v => v + 1); })
      .catch(() => { if (!cancelled) setDataVersion(v => v + 1); }); // fail-soft: empty cache
    return () => { cancelled = true; };
  }, [source, masterPlayers, rosterData]);

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
    if (gridPlayers.length === 0 || !dataReady) {
      return { probMap: new Map(), selectedSet: new Set(), currentRound: 1 };
    }
    const cache = getTier3Cache(source);
    return computeDraftState(selections, gridPlayers, playerIdToGrid, cache);
    // dataVersion dependency triggers recompute when a source's cache lands
  }, [source, selections, dataReady, dataVersion, gridPlayers, playerIdToGrid]);

  // ── Cumulative counts at each prefix length ──────────────────────────────
  // counts[i] = number of real rosters that drafted players[0..i] in order.
  // Drives the waterfall bar widths.
  const cumulativeCounts = useMemo(() => {
    if (selections.length === 0 || !dataReady) return [];
    const cache = getTier3Cache(source);
    const pids = selections.map(s => gridPlayers[s.gridIndex]?.player_id).filter(Boolean);
    const counts = [];
    if (pids.length >= 1) counts[0] = cache.r1?.[pids[0]] || 0;
    if (pids.length >= 2) counts[1] = cache.r2?.[pids[0]]?.[pids[1]] || 0;
    if (pids.length >= 3) counts[2] = cache.r3?.[`${pids[0]}|${pids[1]}`]?.[pids[2]] || 0;
    if (pids.length >= 4) counts[3] = cache.r4?.[`${pids[0]}|${pids[1]}|${pids[2]}`]?.[pids[3]] || 0;
    return counts;
  }, [source, selections, gridPlayers, dataReady, dataVersion]);

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

  // ── Selection frequency — how often this exact path appears in real drafts ──
  const selectionFrequency = useMemo(() => {
    if (selections.length === 0 || !dataReady) return null;
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
  }, [source, selections, gridPlayers, dataReady, dataVersion]);

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
  if (!dataReady) {
    return <div className={styles.loading}>Loading draft data...</div>;
  }

  if (gridPlayers.length === 0) {
    return <div className={styles.emptyPrompt}>No ADP data available. Load roster data to explore draft combos.</div>;
  }

  const cache = getTier3Cache(source);
  const totalRostersNum = cache.metadata?.total_rosters || 0;

  const modeToggle = (
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
  );

  if (totalRostersNum === 0) {
    return (
      <div className={styles.root}>
        <div className={styles.pathBar}>{modeToggle}</div>
        <div className={styles.emptyPrompt}>
          No tracked {mode === 'post' ? 'post-draft' : 'pre-draft'} rosters yet.
          Sign in and sync your drafts to explore real draft data, or toggle the other mode.
        </div>
      </div>
    );
  }

  // ── Helpers for rendering ────────────────────────────────────────────────
  const maxProb = Math.max(0.01, ...probMap.values());

  function fillPct(gridIndex) {
    const prob = probMap.get(gridIndex);
    if (prob == null || prob <= 0) return 0;
    return Math.round((prob / maxProb) * 100);
  }

  const totalRostersLabel = totalRostersNum.toLocaleString();

  // ── Render ───────────────────────────────────────────────────────────────
  return (
    <div className={styles.root}>
      {/* Mode Toggle + Path Breadcrumb */}
      <div className={styles.pathBar}>
        {modeToggle}
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
      <div className={styles.gridContainer} data-help-id="draft-grid">
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
                        title={`${rosterCount} of your rosters drafted this player in R${currentRound}${isUnseen ? ' — never seen in any tracked draft' : ''}`}
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

      {/* Combo Waterfall — cumulative sim counts cascading down with each pick */}
      {selections.length >= 1 && (
        <div className={styles.waterfallPanel} data-help-id="combo-results">
          <div className={styles.waterfallPanelHeader}>
            <span className={styles.waterfallPanelTitle}>Combo Waterfall</span>
            <span className={styles.waterfallPanelDivider}>·</span>
            <span className={styles.waterfallPanelSubtitle}>
              rosters out of <strong>{totalRostersNum.toLocaleString()}</strong> real drafts
            </span>
          </div>
          <div className={styles.waterfallBody}>
            <div className={styles.waterfallBars}>
              {selections.map((sel, i) => {
                const player = gridPlayers[sel.gridIndex];
                if (!player) return null;
                const posColor = POS_COLORS[player.position] || '#6b7280';
                const count = cumulativeCounts[i] ?? 0;
                const maxCount = cumulativeCounts[0] || 1;
                // Square-root scale so the dropoff feels dramatic but later bars stay legible
                const ratio = maxCount > 0 ? Math.sqrt(count / maxCount) : 0;
                const widthPct = count > 0 ? Math.max(2, ratio * 100) : 0;
                const pctOfSim = (count / (totalRostersNum || 1)) * 100;

                return (
                  <div key={i} className={styles.waterfallRow}>
                    <div className={styles.waterfallLabel}>
                      <span className={styles.waterfallStep}>{i === 0 ? '' : '+'}</span>
                      <span
                        className={styles.posBadge}
                        style={{ backgroundColor: posColor }}
                      >
                        {player.position}
                      </span>
                      <span className={styles.waterfallPlayerName} title={player.name}>
                        {player.name}
                      </span>
                    </div>
                    <div className={styles.waterfallBarTrack}>
                      {count > 0 ? (
                        <div
                          className={styles.waterfallBar}
                          style={{
                            width: `${widthPct}%`,
                            background: `linear-gradient(90deg, ${posColor} 0%, ${posColor}b3 100%)`,
                            boxShadow: `0 0 18px ${posColor}40`,
                          }}
                        />
                      ) : null}
                      <span
                        className={count > 0 ? styles.waterfallCount : styles.waterfallCountZero}
                        title={count > 0 ? `${pctOfSim < 0.1 ? pctOfSim.toFixed(2) : pctOfSim.toFixed(1)}% of real drafts` : 'Never seen in any tracked draft'}
                      >
                        {count > 0 ? count.toLocaleString() : 'never seen'}
                      </span>
                    </div>
                  </div>
                );
              })}
            </div>

            <aside className={styles.waterfallSidebar}>
              <div className={styles.sidebarSection}>
                <div className={styles.sidebarLabel}>Draft Frequency</div>
                <div className={styles.sidebarValue}>
                  {selectionFrequency?.count > 0 ? (
                    <>
                      Seen <strong>{selectionFrequency.count.toLocaleString()}</strong> times
                    </>
                  ) : (
                    <em className={styles.sidebarNeverSeen}>Never seen</em>
                  )}
                </div>
                <div className={styles.sidebarSubtext}>
                  in {selectionFrequency?.totalRosters
                    ? selectionFrequency.totalRosters.toLocaleString()
                    : ''} real rosters
                  {selectionFrequency?.count > 0 && (() => {
                    const pct = (selectionFrequency.count / selectionFrequency.totalRosters) * 100;
                    return (
                      <> · <span className={styles.sidebarPct}>{pct < 0.1 ? pct.toFixed(2) : pct.toFixed(1)}%</span></>
                    );
                  })()}
                </div>
              </div>

              <div className={styles.sidebarDivider} />

              <div className={styles.sidebarSection}>
                <div className={styles.sidebarLabel}>Your Portfolio</div>
                <div className={styles.sidebarValue}>
                  <strong>{matchingRosters.length}</strong>
                  <span className={styles.sidebarOf}> / {rostersByEntry.size}</span>
                </div>
                <div className={styles.sidebarSubtext}>
                  rosters {selections.length === 1 ? 'have this player' : 'have this combo'}
                </div>
                {matchingRosters.length > 0 && onNavigateToRosters && (
                  <button
                    className={styles.seeRostersBtn}
                    onClick={() => onNavigateToRosters({ players: selections.map(s => gridPlayers[s.gridIndex].name) })}
                  >
                    See Rosters →
                  </button>
                )}
              </div>
            </aside>
          </div>
        </div>
      )}

      {/* Explainer */}
      <div className={styles.explainer}>
        Based on {totalRostersLabel} real {mode === 'post' ? 'post-draft' : 'pre-draft'} rosters
        from captured draft boards and your synced entries.
        {' '}Percentages show how often each player was picked in that round given your prior selections.
        Select a player to see how the next round's distribution shifts based on that specific pick.
      </div>
    </div>
  );
}
