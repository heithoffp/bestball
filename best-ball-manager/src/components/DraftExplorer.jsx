import React, { useMemo, useState, useEffect, useCallback } from 'react';
import { loadTier3Initial, getTier3Cache, ensureRound, computeDraftState } from '../utils/draftModel';
import { loadSimData, buildComboKey, lookupTier1 } from '../utils/uniquenessEngine';
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

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export default function DraftExplorer({ masterPlayers = [], rosterData = [], onNavigateToRosters = null }) {
  const [selections, setSelections] = useState([]); // [{gridIndex}]
  const [tier3Ready, setTier3Ready] = useState(false);
  const [tier3Version, setTier3Version] = useState(0); // bumped when new round data arrives
  const [tier1, setTier1] = useState(null);

  // Load R1 immediately + tier1, then background-load R2-R4
  useEffect(() => {
    let cancelled = false;
    Promise.all([loadTier3Initial(), loadSimData()])
      .then(([, t1]) => {
        if (!cancelled) {
          setTier3Ready(true);
          setTier1(t1);
        }
      });
    // Bump version as each background round finishes loading
    const checkLoaded = setInterval(() => {
      const cache = getTier3Cache();
      const loaded = [cache.r1, cache.r2, cache.r3, cache.r4].filter(Boolean).length;
      setTier3Version(loaded);
      if (loaded === 4) clearInterval(checkLoaded);
    }, 500);
    return () => { cancelled = true; clearInterval(checkLoaded); };
  }, []);

  // ── Grid players sorted by ADP ───────────────────────────────────────────
  const gridPlayers = useMemo(() => {
    if (!masterPlayers.length) return [];
    return masterPlayers
      .filter(p => p.adpPick != null && Number.isFinite(p.adpPick) && p.adpPick <= 120)
      .sort((a, b) => a.adpPick - b.adpPick)
      .slice(0, TEAMS * MAX_DISPLAY_ROUNDS)
      .map(p => ({
        player_id: p.player_id,
        name: p.name,
        position: p.position,
        team: p.team,
        adp: p.adpPick,
        adpDisplay: p.adpDisplay,
      }));
  }, [masterPlayers]);

  // ── Player ID → grid index lookup ────────────────────────────────────────
  const playerIdToGrid = useMemo(() => {
    const map = new Map();
    gridPlayers.forEach((p, i) => map.set(p.player_id, i));
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
      // Even-index rounds (0, 2, 4 → R1, R3, R5) = left-to-right
      // Odd-index rounds (1, 3, 5 → R2, R4, R6) = reversed (snake)
      board.push(r % 2 === 0 ? row : row.reverse());
    }
    return board;
  }, [gridPlayers]);

  // ── Probability computation from tier3 per-player sim data ────────────────
  const { probMap, selectedSet, currentRound } = useMemo(() => {
    if (!tier3Ready || gridPlayers.length === 0) {
      return { probMap: new Map(), selectedSet: new Set(), currentRound: 1 };
    }
    const cache = getTier3Cache();
    return computeDraftState(selections, gridPlayers, playerIdToGrid, cache);
    // tier3Version dependency triggers recompute when background data arrives
  }, [selections, tier3Ready, tier3Version, gridPlayers, playerIdToGrid]);

  // ── Roster matching (progressive) ────────────────────────────────────────
  const rostersByEntry = useMemo(() => {
    const map = new Map();
    rosterData.forEach(p => {
      const id = p.entry_id || 'unknown';
      if (!map.has(id)) map.set(id, []);
      map.get(id).push(p);
    });
    return map;
  }, [rosterData]);

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

  // ── Roster extensions — round-aware: "of rosters where I drafted player X in R1,
  // player Y in R2, etc., which players appear in the NEXT round?"
  const rosterExtensions = useMemo(() => {
    if (selections.length === 0 || currentRound > MAX_PICK_ROUNDS) return new Map();
    const gridCanonical = gridPlayers.map(p => canonicalName(p.name));

    // Build a round → canonicalName lookup for each roster
    const extensions = new Map(); // gridIndex → roster count

    for (const [, roster] of rostersByEntry) {
      // Build round → canonical name map for this roster
      const byRound = {};
      for (const p of roster) {
        const r = Number(p.round);
        if (r >= 1 && r <= MAX_PICK_ROUNDS + 1) {
          byRound[r] = canonicalName(p.name);
        }
      }

      // Check if this roster matches all selections by round
      let matches = true;
      for (let i = 0; i < selections.length; i++) {
        const selectedName = canonicalName(gridPlayers[selections[i].gridIndex]?.name);
        if (byRound[i + 1] !== selectedName) {
          matches = false;
          break;
        }
      }
      if (!matches) continue;

      // Find what this roster has in the next round
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

  // ── Selection frequency — how often this exact path appeared in the sim
  const selectionFrequency = useMemo(() => {
    if (selections.length === 0 || !tier3Ready) return null;
    const cache = getTier3Cache();
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
  }, [selections, gridPlayers, tier3Ready, tier3Version]);

  // ── Combo result (after 4 picks) — tier1 exact frequency ────────────────
  const comboResult = useMemo(() => {
    if (selections.length < MAX_PICK_ROUNDS || !tier1) return null;
    const players = selections.map(s => {
      const p = gridPlayers[s.gridIndex];
      return { player_id: p.player_id, latestADP: p.adp };
    });
    const key = buildComboKey(players);
    if (!key) return null;
    const lookup = lookupTier1(key, tier1);
    return { key, lookup };
  }, [selections, gridPlayers, tier1]);

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

  // ── Loading state ────────────────────────────────────────────────────────
  if (!tier3Ready) {
    return <div className={styles.loading}>Loading simulation data...</div>;
  }

  if (gridPlayers.length === 0) {
    return <div className={styles.emptyPrompt}>No ADP data available. Load roster data to explore draft combos.</div>;
  }

  // ── Helpers for rendering ────────────────────────────────────────────────
  const maxProb = Math.max(0.01, ...probMap.values());

  /** Fill height as percentage (0-100), normalized to max observed probability. */
  function fillPct(gridIndex) {
    const prob = probMap.get(gridIndex);
    if (prob == null || prob <= 0) return 0;
    return Math.round((prob / maxProb) * 100);
  }

  // ── Render ───────────────────────────────────────────────────────────────
  return (
    <div className={styles.root}>
      {/* Path Breadcrumb */}
      <div className={styles.pathBar}>
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
              {/* Round label */}
              <div className={`${styles.roundLabel} ${isActiveRound ? styles.roundLabelActive : ''}`}>
                R{roundIdx + 1}
              </div>

              {/* Player cells */}
              {row.map((player, colIdx) => {
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
                    {/* Fill bar — rises from bottom proportional to probability */}
                    {fill > 0 && (
                      <div
                        className={styles.cellFill}
                        style={{ height: `${fill}%`, backgroundColor: posColor }}
                      />
                    )}
                    {/* Roster count badge — how many of your rosters have this next-round pick */}
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
        Based on {getTier3Cache().metadata?.total_rosters ? `${(getTier3Cache().metadata.total_rosters / 1e6).toFixed(0)}M` : 'millions of'} simulated
        drafts. Percentages show how often each player was picked in that round given your prior selections.
        Select a player to see how the next round's distribution shifts based on that specific pick.
      </div>
    </div>
  );
}
