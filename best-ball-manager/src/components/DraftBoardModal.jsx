// src/components/DraftBoardModal.jsx
// Full draft-board view for a synced Underdog roster (TASK-240).
// Renders the complete pod board (entryCount columns × rounds rows) from
// draft_boards_admin, with the user's column highlighted and per-column
// portfolio context: projected points, Avg CLV%, and RB/QB/TE archetypes.
// Computed opinions are allowed here per the Roster Viewer carve-out (ADR-002).

import React, { useState, useEffect, useMemo, useCallback } from 'react';
import { createPortal } from 'react-dom';
import { X, LayoutGrid } from 'lucide-react';
import { fetchDraftBoard } from '../utils/draftBoards';
import { calcCLV, clvLabel } from '../utils/clvHelpers';
import { classifyRosterPath, ARCHETYPE_METADATA } from '../utils/rosterArchetypes';
import { canonicalName } from '../utils/helpers';
import { posColor } from '../utils/positionColors';
import css from './DraftBoardModal.module.css';

const CLV_ALPHA = 0.5; // matches RosterViewer's balanced CLV curve

function MiniArchetypePill({ archetypeKey }) {
  const meta = ARCHETYPE_METADATA[archetypeKey];
  if (!meta) return null;
  return (
    <span
      className={css.miniPill}
      title={meta.desc}
      style={{ background: meta.color + '1a', color: meta.color, borderColor: meta.color + '44' }}
    >
      {meta.name}
    </span>
  );
}

export default function DraftBoardModal({ roster, adpByPlatform, onClose, boardOverride = null, hideColumnSummary = false }) {
  const [board, setBoard] = useState(boardOverride);
  const [loading, setLoading] = useState(!boardOverride);

  useEffect(() => {
    if (boardOverride) return undefined;
    let cancelled = false;
    setLoading(true);
    fetchDraftBoard(roster.entry_id).then(b => {
      if (cancelled) return;
      setBoard(b);
      setLoading(false);
    });
    return () => { cancelled = true; };
  }, [roster.entry_id, boardOverride]);

  useEffect(() => {
    const onKey = (e) => { if (e.key === 'Escape') onClose(); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  const handleBackdrop = useCallback((e) => {
    if (e.target === e.currentTarget) onClose();
  }, [onClose]);

  // Derive the grid: picks bucketed by (round, slot), plus per-slot summary
  // stats and the user's slot (matched by name overlap with the clicked roster).
  const derived = useMemo(() => {
    if (!board) return null;
    const udAdpMap = adpByPlatform?.underdog?.latestAdpMap ?? {};
    const projMap = adpByPlatform?.underdog?.projPointsMap ?? {};
    const entryCount = board.entryCount || 12;
    const rounds = board.rounds || Math.ceil(board.picks.length / entryCount);

    const byRoundSlot = {};
    const playersBySlot = {};
    for (const p of board.picks) {
      const round = p.round ?? (p.pick ? Math.ceil(p.pick / entryCount) : null);
      if (round == null || p.slot == null) continue;
      const key = p.name ? canonicalName(p.name) : null;
      const latestADP = key && udAdpMap[key] ? udAdpMap[key].pick : null;
      const enriched = {
        ...p,
        round,
        latestADP: Number.isFinite(latestADP) ? latestADP : null,
        projectedPoints: (key && projMap[key]) || null,
      };
      (byRoundSlot[round] ??= {})[p.slot] = enriched;
      (playersBySlot[p.slot] ??= []).push(enriched);
    }

    const userNames = new Set((roster.players ?? []).map(p => canonicalName(p.name)));
    let userSlot = null;
    let bestOverlap = 0;
    const slots = Array.from({ length: entryCount }, (_, i) => i + 1);

    const slotSummaries = {};
    for (const slot of slots) {
      const players = playersBySlot[slot] ?? [];
      const clvValues = players
        .map(p => calcCLV(p.pick, p.latestADP, CLV_ALPHA))
        .filter(v => v !== null);
      const avgCLV = clvValues.length
        ? clvValues.reduce((a, b) => a + b, 0) / clvValues.length
        : null;
      const projectedPoints = players.reduce((sum, p) => sum + (p.projectedPoints || 0), 0);
      const path = players.length ? classifyRosterPath(players) : null;
      slotSummaries[slot] = { avgCLV, projectedPoints, path };

      const overlap = players.filter(p => p.name && userNames.has(canonicalName(p.name))).length;
      if (overlap > bestOverlap) { bestOverlap = overlap; userSlot = slot; }
    }
    // Demand a real match — over half the column — before claiming a slot as "you".
    if (userSlot != null && bestOverlap <= (playersBySlot[userSlot]?.length ?? 0) / 2) userSlot = null;

    return { entryCount, rounds, slots, byRoundSlot, slotSummaries, userSlot };
  }, [board, roster.players, adpByPlatform]);

  const draftDateLabel = roster.draftDate
    ? roster.draftDate.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })
    : null;

  // Portal to <body>: ancestors animate `transform` (e.g. RosterViewer's
  // fadeSlideIn keeps a transform applied), which would re-anchor
  // position:fixed to the tab container and crop the modal.
  return createPortal(
    <div className={css.backdrop} onMouseDown={handleBackdrop}>
      <div className={css.panel} role="dialog" aria-modal="true" aria-label="Draft board">
        <div className={css.header}>
          <div className={css.headerLeft}>
            <span className={css.headerIcon}><LayoutGrid size={18} /></span>
            <div>
              <h2 className={css.title}>Draft Board</h2>
              <div className={css.subtitle}>
                {roster.tournamentTitle || board?.slateTitle || ''}
                {draftDateLabel ? ` · ${draftDateLabel}` : ''}
                {derived ? ` · ${derived.entryCount} teams · ${derived.rounds} rounds` : ''}
              </div>
            </div>
          </div>
          <button className={css.closeBtn} onClick={onClose} aria-label="Close draft board">
            <X size={18} />
          </button>
        </div>

        {loading && <div className={css.stateMsg}>Loading board…</div>}

        {!loading && !derived && (
          <div className={css.stateMsg}>
            This board isn’t available yet. Boards are added as drafts are captured — check back soon.
          </div>
        )}

        {!loading && derived && (
          <div className={css.gridScroll}>
            <div
              className={css.grid}
              style={{ '--board-cols': derived.entryCount }}
            >
              {/* Header row: corner + one card per draft slot */}
              <div className={`${css.cornerCell} ${css.stickyTop}`} />
              {derived.slots.map(slot => {
                const isUser = slot === derived.userSlot;
                const s = derived.slotSummaries[slot];
                const clv = clvLabel(s?.avgCLV ?? null);
                return (
                  <div key={`h-${slot}`} className={`${css.colHeader} ${css.stickyTop} ${isUser ? css.userColHeader : ''}`}>
                    <div className={css.colHeaderTop}>
                      <span className={css.colTeamLabel}>{isUser ? 'YOU' : `Team ${slot}`}</span>
                      <span className={css.colPick}>#{slot}</span>
                    </div>
                    {!hideColumnSummary && (
                      <div className={css.colStats}>
                        <span className={css.colStat} title="Projected points (sum of player projections)">
                          <span className={css.colStatLabel}>Proj</span>
                          <span className={css.colStatValue} style={{ color: '#60a5fa' }}>
                            {s?.projectedPoints > 0 ? s.projectedPoints.toFixed(0) : '—'}
                          </span>
                        </span>
                        <span className={css.colStat} title="Average Closing Line Value across this team's picks">
                          <span className={css.colStatLabel}>CLV</span>
                          <span className={css.colStatValue} style={{ color: clv.color }}>{clv.text}</span>
                        </span>
                      </div>
                    )}
                    {!hideColumnSummary && s?.path && (
                      <div className={css.colArchRow}>
                        <MiniArchetypePill archetypeKey={s.path.rb} />
                        <MiniArchetypePill archetypeKey={s.path.qb} />
                        <MiniArchetypePill archetypeKey={s.path.te} />
                      </div>
                    )}
                  </div>
                );
              })}

              {/* One row per round */}
              {Array.from({ length: derived.rounds }, (_, i) => i + 1).map(round => (
                <React.Fragment key={round}>
                  <div className={`${css.roundCell} ${css.stickyLeft}`}>
                    <span>R{round}</span>
                    <span className={css.snakeArrow}>{round % 2 === 1 ? '→' : '←'}</span>
                  </div>
                  {derived.slots.map(slot => {
                    const pick = derived.byRoundSlot[round]?.[slot];
                    const isUser = slot === derived.userSlot;
                    if (!pick || !pick.name) {
                      return <div key={`${round}-${slot}`} className={`${css.cell} ${css.emptyCell} ${isUser ? css.userCell : ''}`}>—</div>;
                    }
                    const color = posColor(pick.position);
                    return (
                      <div
                        key={`${round}-${slot}`}
                        className={`${css.cell} ${isUser ? css.userCell : ''}`}
                        style={{ background: color + (isUser ? '20' : '0e'), borderLeft: `3px solid ${color}${isUser ? '' : '88'}` }}
                        title={`${pick.name} — pick ${pick.pick}`}
                      >
                        <div className={css.cellTopRow}>
                          <span className={css.cellPos} style={{ color }}>{pick.position || ''}</span>
                          <span className={css.cellPickNum}>{pick.pick}</span>
                        </div>
                        <div className={css.cellName}>{pick.name}</div>
                        <div className={css.cellTeam}>{pick.team || ''}</div>
                      </div>
                    );
                  })}
                </React.Fragment>
              ))}
            </div>
          </div>
        )}
      </div>
    </div>,
    document.body
  );
}
