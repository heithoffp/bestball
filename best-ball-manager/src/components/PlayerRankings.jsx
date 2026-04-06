import React, { useState, useMemo, useRef, useCallback, useEffect } from 'react';
import { createPortal } from 'react-dom';
import { useVirtualizer } from '@tanstack/react-virtual';
import { GripVertical, Download, Save, X } from 'lucide-react';
import { DndContext, PointerSensor, TouchSensor, useSensor, useSensors, useDndMonitor, useDroppable, useDraggable } from '@dnd-kit/core';
import { SortableContext, verticalListSortingStrategy, useSortable } from '@dnd-kit/sortable';
import { exportRankingsCSV, saveRankingsToAssets } from '../utils/rankingsExport';
import { canonicalName, expandTeam } from '../utils/helpers';
import FileUploadButton from './FileUploadButton';
import { SearchInput } from './filters';
import useMediaQuery from '../hooks/useMediaQuery';
import TabLayout from './TabLayout';
import s from './PlayerRankings.module.css';

const POS_COLORS = {
  QB: '#bf44ef',
  RB: '#10b981',
  WR: '#f59e0b',
  TE: '#3b82f6',
};

const VIEWS = ['overall', 'QB', 'RB', 'WR', 'TE'];

const TIER_LABELS = [
  'S', 'A+', 'A', 'A-', 'B+', 'B', 'B-', 'C+', 'C', 'C-', 'D+', 'D', 'D-', 'F',
];

const TIER_COLORS = {
  'S':  { bg: 'rgba(255,215,0,0.15)',  text: '#ffd700',  border: '#ffd700' },
  'A+': { bg: 'rgba(239,68,68,0.15)',  text: '#ef4444',  border: '#ef4444' },
  'A':  { bg: 'rgba(239,68,68,0.12)',  text: '#f87171',  border: '#f87171' },
  'A-': { bg: 'rgba(251,146,60,0.12)', text: '#fb923c',  border: '#fb923c' },
  'B+': { bg: 'rgba(245,158,11,0.12)', text: '#f59e0b',  border: '#f59e0b' },
  'B':  { bg: 'rgba(234,179,8,0.12)',  text: '#eab308',  border: '#eab308' },
  'B-': { bg: 'rgba(163,230,53,0.12)', text: '#a3e635',  border: '#a3e635' },
  'C+': { bg: 'rgba(16,185,129,0.12)', text: '#10b981',  border: '#10b981' },
  'C':  { bg: 'rgba(6,182,212,0.12)',  text: '#06b6d4',  border: '#06b6d4' },
  'C-': { bg: 'rgba(59,130,246,0.12)', text: '#3b82f6',  border: '#3b82f6' },
  'D+': { bg: 'rgba(99,102,241,0.12)', text: '#6366f1',  border: '#6366f1' },
  'D':  { bg: 'rgba(139,92,246,0.12)', text: '#8b5cf6',  border: '#8b5cf6' },
  'D-': { bg: 'rgba(168,85,247,0.12)', text: '#a855f7',  border: '#a855f7' },
  'F':  { bg: 'rgba(107,114,128,0.12)', text: '#6b7280', border: '#6b7280' },
};

const HELP_ANNOTATIONS = [
  { id: 'search-controls', label: 'Search & Actions', anchor: 'below', description: 'Search by player or team. Save your rankings, export to CSV, or upload a rankings file.' },
  { id: 'platform-toggle', label: 'Platform Toggle', anchor: 'below', description: 'Switch between Underdog and DraftKings rankings. Each platform has its own saved order.' },
  { id: 'position-filter', label: 'Position Filter', anchor: 'below', description: 'View overall rankings or filter to a single position. Player count updates to match.' },
  { id: 'tier-breaks', label: 'Tier Breaks', anchor: 'below', description: 'Colored dividers group players into tiers. Click a label to rename it, drag to reposition, or ✕ to remove.' },
  { id: 'drag-reorder', label: 'Drag to Reorder', anchor: 'below', description: 'Drag the grip handle to set your personal ranking order. Rankings are per-platform.' },
  { id: 'keyboard-shortcuts', label: 'Keyboard Shortcuts', anchor: 'below', description: 'Arrow keys move selection. T inserts a tier break. Delete removes the selected tier break.' },
];

/* Pointer-based insertion-point collision detection — finds the first droppable
   whose vertical midpoint is at or below the pointer Y. This gives natural
   "insert between" behavior: hovering between items 2 and 3 targets item 3,
   so the dragged player is placed before item 3 (i.e., between 2 and 3). */
function pointerInsertionPoint({ droppableRects, droppableContainers, pointerCoordinates }) {
  if (!pointerCoordinates) return [];
  const { y } = pointerCoordinates;

  const sorted = [...droppableContainers]
    .map(c => ({ container: c, rect: droppableRects.get(c.id) }))
    .filter(c => c.rect)
    .sort((a, b) => a.rect.top - b.rect.top);

  for (const { container, rect } of sorted) {
    if (rect.top + rect.height / 2 >= y) {
      return [{ id: container.id, data: container.data }];
    }
  }

  // Pointer is below all items — return the last one
  if (sorted.length > 0) {
    const last = sorted[sorted.length - 1];
    return [{ id: last.container.id, data: last.container.data }];
  }
  return [];
}

function resolveDropTargetId(id) {
  if (!id) return null;
  if (typeof id !== 'string') return id;
  if (id.startsWith('break:') || id.startsWith('insert:') || id.startsWith('tier-drag:')) {
    return id.split(':').slice(1).join(':');
  }
  return id;
}

function getTierLabel(tierNum) {
  if (tierNum < 1) return TIER_LABELS[0];
  if (tierNum > TIER_LABELS.length) return TIER_LABELS[TIER_LABELS.length - 1];
  return TIER_LABELS[tierNum - 1];
}

function getTierColor(tierNum) {
  return TIER_COLORS[getTierLabel(tierNum)] || TIER_COLORS['F'];
}

/* ── Tier Divider (shared logic, renders differently for table vs cards) ── */
function TierDividerContent({ tierColor, tierLabelText, playerId, onTierLabelChange, onDelete, isMobile, dropId, canDrag }) {
  const [isEditing, setIsEditing] = useState(false);
  const [editValue, setEditValue] = useState('');
  const { setNodeRef: setDropRef, isOver } = useDroppable({
    id: dropId || `break:${playerId}`,
    data: { kind: 'tier-break', playerId },
  });
  const { attributes, listeners, setNodeRef: setDragRef, isDragging } = useDraggable({
    id: `tier-drag:${playerId}`,
    data: { kind: 'tier-drag', playerId, tierLabelText, tierColor },
    disabled: !canDrag,
  });

  const handleLabelClick = (e) => {
    e.stopPropagation();
    setEditValue(tierLabelText || '');
    setIsEditing(true);
  };

  const handleLabelSave = () => {
    setIsEditing(false);
    if (onTierLabelChange && editValue.trim() !== tierLabelText) {
      onTierLabelChange(playerId, editValue.trim());
    }
  };

  const handleDelete = (e) => {
    e.stopPropagation();
    if (onDelete) onDelete(playerId);
  };

  if (isMobile) {
    return (
      <div
        ref={setDropRef}
        className={s.tierDividerMobile}
        style={{
          background: tierColor.border,
          outline: isOver ? '1px solid rgba(255,255,255,0.35)' : 'none',
          opacity: isDragging ? 0.3 : 1,
        }}
      >
        {canDrag && (
          <div ref={setDragRef} className={s.tierDragHandle} {...listeners} {...attributes}>
            <GripVertical size={14} />
          </div>
        )}
        {isEditing ? (
          <input
            autoFocus
            value={editValue}
            onChange={(e) => setEditValue(e.target.value)}
            onBlur={handleLabelSave}
            onKeyDown={(e) => { if (e.key === 'Enter') handleLabelSave(); if (e.key === 'Escape') setIsEditing(false); }}
            onClick={(e) => e.stopPropagation()}
            className={s.tierLabelInputMobile}
          />
        ) : (
          <>
            <span onClick={handleLabelClick} title="Tap to edit tier label" className={s.tierLabelMobile}>
              {tierLabelText}
            </span>
            <button onClick={handleDelete} className={s.tierDeleteBtn} title="Remove tier break">
              <X size={14} />
            </button>
          </>
        )}
      </div>
    );
  }

  return (
    <tr ref={setDropRef} style={{
      ...(isOver ? { boxShadow: 'inset 0 0 0 1px rgba(255,255,255,0.35)' } : undefined),
      opacity: isDragging ? 0.3 : 1,
    }}>
      <td colSpan={10} className={s.tierDivider} style={{ background: tierColor.border }}>
        {canDrag && (
          <div ref={setDragRef} className={s.tierDragHandle} {...listeners} {...attributes}>
            <GripVertical size={14} />
          </div>
        )}
        {isEditing ? (
          <input
            autoFocus
            value={editValue}
            onChange={(e) => setEditValue(e.target.value)}
            onBlur={handleLabelSave}
            onKeyDown={(e) => { if (e.key === 'Enter') handleLabelSave(); if (e.key === 'Escape') setIsEditing(false); }}
            onClick={(e) => e.stopPropagation()}
            className={s.tierLabelInput}
          />
        ) : (
          <>
            <span onClick={handleLabelClick} title="Click to edit tier label" className={s.tierLabel}>
              {tierLabelText}
            </span>
            <button onClick={handleDelete} className={s.tierDeleteBtn} title="Remove tier break">
              <X size={14} />
            </button>
          </>
        )}
      </td>
    </tr>
  );
}

function TierInsertZone({ playerId, isMobile, onClick, dropId }) {
  const { setNodeRef, isOver } = useDroppable({
    id: dropId || `insert:${playerId}`,
    data: { kind: 'tier-insert', playerId },
  });

  if (isMobile) {
    return (
      <div ref={setNodeRef} className={s.tierInsertZoneMobile} onClick={onClick} style={isOver ? { opacity: 0.85 } : undefined}>
        <div className={s.tierInsertMobileLine} />
        <div className={s.tierInsertMobileBtn}>+</div>
      </div>
    );
  }

  return (
    <tr ref={setNodeRef} className={s.tierInsertZone} onClick={onClick} title="Add tier break above this player">
      <td colSpan={10} className={s.tierInsertCell} style={isOver ? { opacity: 0.85 } : undefined}>
        <div className={s.tierInsertIndicator}>
          <div className={s.tierInsertIndicatorLine} />
          <div className={s.tierInsertIndicatorBtn}>+</div>
        </div>
      </td>
    </tr>
  );
}

/* ── Desktop Sortable Row ────────────────────────────────────── */
/* ── Desktop Sortable Row ────────────────────────────────────── */
const SortableRow = React.memo(function SortableRow({
  player, displayRank, posRank, tier, canDrag,
}) {
  const pos = player.slotName || 'N/A';
  const color = POS_COLORS[pos] || '#9ca3af';
  const badgeClass = `badge badge-${pos.toLowerCase()}`;
  const tierLabel = getTierLabel(tier);
  const tierColor = getTierColor(tier);

  const { attributes, listeners, setNodeRef, isDragging } = useSortable({
    id: player.id,
    disabled: !canDrag,
  });

  const rowStyle = {
    opacity: isDragging ? 0.3 : 1,
    background: tier % 2 === 0 ? 'rgba(255,255,255,0.02)' : 'transparent',
    cursor: canDrag ? 'grab' : 'default',
  };

  return (
    <tbody>
      <tr ref={setNodeRef} style={rowStyle} className={s.playerRow}>
        <td className={s.gripCell} {...listeners} {...attributes}>
          {canDrag && <GripVertical size={16} />}
        </td>
        <td className={s.rankCell}>{displayRank}</td>
        <td className={s.posRankCell} style={{ color: POS_COLORS[pos] || 'var(--text-muted)' }}>{posRank}</td>
        <td className={s.tierBadgeCell}>
          <span className={s.tierBadge} style={{
            color: tierColor.text, background: tierColor.bg,
            border: `1px solid ${tierColor.border}40`,
          }}>{tierLabel}</span>
        </td>
        <td className={s.nameCell} style={{ borderLeft: `3px solid ${color}` }}>
          {player.name}
        </td>
        <td className={s.posCell}><span className={badgeClass}>{pos}</span></td>
        <td className={s.teamCell}>{player.teamName || '-'}</td>
        <td className={s.adpCell}>{player.latestAdp ?? player.originalAdp ?? '-'}</td>
        <td className={s.diffCell}>
          {(() => {
            const adpStr = player.latestAdp ?? player.originalAdp;
            const adpNum = parseFloat(adpStr);
            if (!adpStr || adpStr === '-' || isNaN(adpNum)) return <span style={{ color: 'var(--text-muted)' }}>-</span>;
            const diff = +(adpNum - displayRank).toFixed(1);
            const clr = diff > 0 ? '#10b981' : diff < 0 ? '#ef4444' : 'var(--text-secondary)';
            return <span style={{ color: clr, fontWeight: 600 }}>{diff > 0 ? '+' : ''}{diff}</span>;
          })()}
        </td>
        <td className={s.projCell}>{player.projectedPoints || '-'}</td>
      </tr>
    </tbody>
  );
});

/* ── Mobile Sortable Card ────────────────────────────────────── */
const SortableCard = React.memo(function SortableCard({
  player, displayRank, posRank, tier, canDrag,
  isExpanded, onTap,
}) {
  const pos = player.slotName || 'N/A';
  const color = POS_COLORS[pos] || '#9ca3af';
  const tierLabel = getTierLabel(tier);
  const tierColor = getTierColor(tier);

  const { attributes, listeners, setNodeRef, isDragging } = useSortable({
    id: player.id,
    disabled: !canDrag,
  });

  const cardStyle = {
    opacity: isDragging ? 0.3 : 1,
  };

  const adpStr = player.latestAdp ?? player.originalAdp ?? '-';
  const adpNum = parseFloat(adpStr);
  const diff = (!adpStr || adpStr === '-' || isNaN(adpNum)) ? null : +(adpNum - displayRank).toFixed(1);

  return (
      <div ref={setNodeRef} style={cardStyle} className={s.playerCard} onClick={onTap}>
        {/* Drag handle */}
        <div className={s.cardDragHandle} {...listeners} {...attributes} onClick={(e) => e.stopPropagation()}>
          {canDrag && <GripVertical size={16} />}
        </div>

        {/* Rank */}
        <div className={s.cardRank}>{displayRank}</div>

        {/* Body */}
        <div className={s.cardBody}>
          <div className={s.cardRow1}>
            <span className={s.cardName} style={{ borderLeft: `3px solid ${color}`, paddingLeft: 6 }}>
              {player.name}
            </span>
            <span className={s.cardTierBadge} style={{
              color: tierColor.text, background: tierColor.bg,
              border: `1px solid ${tierColor.border}40`,
            }}>{tierLabel}</span>
          </div>

          {/* Expanded detail */}
          {isExpanded && (
            <div className={s.cardExpanded}>
              <div className={s.cardDetailGrid}>
                <div className={s.cardDetailItem}>
                  <span className={s.cardDetailLabel}>Pos Rank</span>
                  <span className={s.cardDetailValue} style={{ color: POS_COLORS[pos] || 'var(--text-primary)' }}>{posRank}</span>
                </div>
                <div className={s.cardDetailItem}>
                  <span className={s.cardDetailLabel}>Team</span>
                  <span className={s.cardDetailValue}>{player.teamName || '-'}</span>
                </div>
                <div className={s.cardDetailItem}>
                  <span className={s.cardDetailLabel}>Diff</span>
                  <span className={s.cardDetailValue} style={{
                    color: diff === null ? 'var(--text-muted)' : diff > 0 ? '#10b981' : diff < 0 ? '#ef4444' : 'var(--text-secondary)',
                  }}>
                    {diff === null ? '-' : `${diff > 0 ? '+' : ''}${diff}`}
                  </span>
                </div>
                <div className={s.cardDetailItem}>
                  <span className={s.cardDetailLabel}>Projected</span>
                  <span className={s.cardDetailValue}>{player.projectedPoints || '-'}</span>
                </div>
                <div className={s.cardDetailItem}>
                  <span className={s.cardDetailLabel}>Position</span>
                  <span className={s.cardDetailValue}>
                    <span className={`badge badge-${pos.toLowerCase()}`}>{pos}</span>
                  </span>
                </div>
              </div>
            </div>
          )}
        </div>

        {/* ADP */}
        <div className={s.cardAdp}>{adpStr}</div>
      </div>
  );
});

/* ── Custom Drag Overlay (portal-based, tracks pointer directly) ── */
function PointerTrackingOverlay({ activePlayer, activeTierDrag, displayedPlayers }) {
  const [pos, setPos] = useState(null);

  useDndMonitor({
    onDragStart(event) {
      const e = event.activatorEvent;
      if (e) setPos({ x: e.clientX, y: e.clientY });
    },
    onDragMove(event) {
      const e = event.activatorEvent;
      if (e && event.delta) {
        setPos({ x: e.clientX + event.delta.x, y: e.clientY + event.delta.y });
      }
    },
    onDragEnd() { setPos(null); },
    onDragCancel() { setPos(null); },
  });

  if (!pos) return null;

  // Tier break drag overlay
  if (activeTierDrag) {
    return createPortal(
      <div className={s.dragOverlayTier} style={{
        left: pos.x + 12, top: pos.y - 16,
        background: activeTierDrag.tierColor.border,
      }}>
        <GripVertical size={14} />
        <span className={s.dragOverlayTierLabel}>{activeTierDrag.tierLabelText}</span>
      </div>,
      document.body
    );
  }

  // Player drag overlay
  if (!activePlayer) return null;

  const rank = displayedPlayers.findIndex(p => p.id === activePlayer.id) + 1;

  return createPortal(
    <div className={s.dragOverlayPortal} style={{ left: pos.x + 12, top: pos.y - 16 }}>
      <span className={s.dragOverlayRank}>{rank}</span>
      <span className={s.dragOverlayName} style={{ borderLeft: `3px solid ${POS_COLORS[activePlayer.slotName] || '#9ca3af'}`, paddingLeft: 8 }}>
        {activePlayer.name}
      </span>
      <span style={{ color: 'var(--text-secondary)', fontSize: 14 }}>
        {activePlayer.latestAdp ?? activePlayer.originalAdp ?? '-'}
      </span>
    </div>,
    document.body
  );
}

/* ── Main component ──────────────────────────────────────────── */
export default function PlayerRankings({ rankingsByPlatform = {}, masterPlayers, onRankingsUpload, uploadAuthGuard, adpByPlatform = {}, helpOpen = false, onHelpToggle }) {
  const { isMobile } = useMediaQuery();

  /* --- state --- */
  const [rankedPlayers, setRankedPlayers] = useState([]);
  const [overallTierBreaks, setOverallTierBreaks] = useState(new Set());
  const [tierLabels, setTierLabels] = useState({});
  const [viewMode, setViewMode] = useState('overall');
  const [searchTerm, setSearchTerm] = useState('');
  const [expandedCardId, setExpandedCardId] = useState(null);
  const [activeId, setActiveId] = useState(null);

  const scrollContainerRef = useRef(null);
  const prevInitialPlayersRef = useRef(null);

  /* --- platform state --- */
  const availablePlatforms = useMemo(
    () => Object.keys(adpByPlatform).filter(p => adpByPlatform[p]?.latestRows?.length > 0),
    [adpByPlatform]
  );
  const [selectedPlatform, setSelectedPlatform] = useState(null);
  const platformInitDone = useRef(false);
  useEffect(() => {
    if (!platformInitDone.current && availablePlatforms.length > 0) {
      platformInitDone.current = true;
      const preferred = availablePlatforms.includes('underdog') ? 'underdog' : availablePlatforms[0];
      setSelectedPlatform(preferred);
    }
  }, [availablePlatforms]);

  /* --- dnd-kit sensors --- */
  const pointerSensor = useSensor(PointerSensor, { activationConstraint: { distance: 2 } });
  const touchSensor = useSensor(TouchSensor, { activationConstraint: { delay: 150, tolerance: 5 } });
  const sensors = useSensors(pointerSensor, touchSensor);

  /* --- active source: saved rankings for selected platform, or ADP rows as fallback --- */
  const activeSource = useMemo(() => {
    const saved = selectedPlatform ? rankingsByPlatform?.[selectedPlatform] : null;
    if (saved?.length > 0) return saved;
    return adpByPlatform?.[selectedPlatform]?.latestRows ?? [];
  }, [rankingsByPlatform, selectedPlatform, adpByPlatform]);

  /* --- ADP lookup from masterPlayers --- */
  const adpLookup = useMemo(() => {
    if (!masterPlayers || masterPlayers.length === 0) return new Map();
    const map = new Map();
    masterPlayers.forEach(p => {
      const key = canonicalName(p.name);
      if (!key) return;
      const adpDisplay = p.latestADPDisplay || p.adpDisplay;
      const adpPick = p.latestADP || p.adp;
      if (adpDisplay && adpDisplay !== 'N/A') {
        map.set(key, adpDisplay);
      } else if (adpPick && !isNaN(adpPick)) {
        map.set(key, String(adpPick));
      }
    });
    return map;
  }, [masterPlayers]);

  /* --- initialise from activeSource --- */
  useEffect(() => {
    if (!activeSource || activeSource.length === 0) return;
    // Only re-seed when the source array identity changes (platform switch or new upload).
    // Excludes adpLookup from deps so ADP refreshes don't wipe manual ranking order.
    if (prevInitialPlayersRef.current === activeSource) return;
    prevInitialPlayersRef.current = activeSource;
    // Clear tier state — ordering changes entirely between platforms/sources
    setOverallTierBreaks(new Set());
    setTierLabels({});
    const projMap = adpByPlatform?.[selectedPlatform]?.projPointsMap ?? {};
    // Build name→id lookup from the platform's ADP rows so saved rankings with stale
    // gen_ IDs get resolved to the real platform ID (e.g. DraftKings numeric IDs).
    const adpRows = adpByPlatform?.[selectedPlatform]?.latestRows ?? [];
    const nameToAdpId = new Map();
    adpRows.forEach(r => {
      const n = canonicalName(
        (`${r.firstName || r.first_name || ''} ${r.lastName || r.last_name || ''}`).trim()
        || r.Name || r.name || ''
      );
      const id = r.id || r.ID;
      if (n && id) nameToAdpId.set(n, String(id));
    });
    let players = activeSource.map(row => {
      const firstName = row.firstName || row.first_name || row['First Name'] || '';
      const lastName = row.lastName || row.last_name || row['Last Name'] || '';
      const name = `${firstName} ${lastName}`.trim() || row['Player Name'] || row.player_name || row.Name || row.name || 'Unknown';
      const adpVal = parseFloat(row.adp ?? row.ADP ?? '');
      const nameKey = canonicalName(name);
      const projRaw = row.projectedPoints || row.projected_points || '';
      const proj = projRaw || (projMap[nameKey] != null ? String(projMap[nameKey]) : '');
      const rawId = row.id || row.ID || '';
      const id = (!rawId || rawId.startsWith('gen_'))
        ? (nameToAdpId.get(nameKey) || `gen_${name.replace(/\s+/g, '_')}`)
        : rawId;
      return {
        id,
        firstName,
        lastName,
        name,
        adp: isNaN(adpVal) ? 9999 : adpVal,
        originalAdp: isNaN(adpVal) ? '-' : String(adpVal),
        latestAdp: adpLookup.get(nameKey) || null,
        projectedPoints: proj,
        positionRank: row.positionRank || '',
        slotName: row.slotName || row.position || row.Position || row.pos || 'N/A',
        teamName: expandTeam(row.teamName || row.team || row.Team || ''),
        lineupStatus: row.lineupStatus || '',
        byeWeek: row.byeWeek || '',
        _csvTier: row.tier || '',
        _csvTierNum: row.tierNum || '',
      };
    });
    players.sort((a, b) => a.adp - b.adp);
    // Only include players that have real ADP data
    players = players.filter(p => p.adp !== 9999);
    setRankedPlayers(players);

    // Restore tier breaks and labels from CSV
    const hasTierNums = players.some(p => p._csvTierNum);
    const hasTiers = players.some(p => p._csvTier);

    if (hasTierNums || hasTiers) {
      const overallBreaks = new Set();
      const restoredLabels = {};
      let prevTierNum = null;
      let prevTierLabel = null;

      players.forEach((p, idx) => {
        const tierNum = p._csvTierNum ? String(p._csvTierNum) : null;
        const tierLabel = p._csvTier || '';

        if (idx === 0 && tierLabel) {
          restoredLabels['__tier1__'] = tierLabel;
        }

        if (hasTierNums) {
          if (prevTierNum !== null && tierNum && tierNum !== prevTierNum) {
            overallBreaks.add(p.id);
            if (tierLabel) restoredLabels[p.id] = tierLabel;
          }
          if (tierNum) prevTierNum = tierNum;
        } else {
          if (prevTierLabel !== null && tierLabel && tierLabel !== prevTierLabel) {
            overallBreaks.add(p.id);
            if (tierLabel) restoredLabels[p.id] = tierLabel;
          }
          if (tierLabel) prevTierLabel = tierLabel;
        }
      });

      setOverallTierBreaks(overallBreaks);
      if (Object.keys(restoredLabels).length > 0) {
        setTierLabels(restoredLabels);
      }
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeSource]); // adpLookup intentionally excluded — ADP refreshes must not wipe manual order

  /* --- derived display list --- */
  const isSearching = searchTerm.trim().length > 0;
  const canDrag = !isSearching;

  const displayedPlayers = useMemo(() => {
    let list = rankedPlayers;
    if (viewMode !== 'overall') {
      list = list.filter(p => p.slotName === viewMode);
    }
    if (isSearching) {
      const q = searchTerm.toLowerCase();
      list = list.filter(p =>
        p.name.toLowerCase().includes(q) || (p.teamName && p.teamName.toLowerCase().includes(q))
      );
    }
    return list;
  }, [rankedPlayers, viewMode, searchTerm, isSearching]);

  /* --- tier computation --- */
  const overallTierSet = overallTierBreaks;
  const fullTierMap = useMemo(() => {
    const map = new Map();
    let tier = 1;
    rankedPlayers.forEach((p, idx) => {
      if (idx > 0 && overallTierSet.has(p.id)) tier++;
      map.set(p.id, tier);
    });
    return map;
  }, [rankedPlayers, overallTierSet]);

  const tierMap = fullTierMap;

  /* --- position rank computation --- */
  const posRankMap = useMemo(() => {
    const map = new Map();
    const counters = {};
    rankedPlayers.forEach(p => {
      const pos = p.slotName || 'N/A';
      counters[pos] = (counters[pos] || 0) + 1;
      map.set(p.id, `${pos}${counters[pos]}`);
    });
    return map;
  }, [rankedPlayers]);

  /* --- effective tier label resolution --- */
  // Build a tierNum → label map so positional views can look up by tier number
  const tierNumLabels = useMemo(() => {
    const map = new Map();
    rankedPlayers.forEach((p, idx) => {
      const tierNum = tierMap.get(p.id) || 1;
      if (map.has(tierNum)) return; // first player in each tier defines the label
      if (idx === 0) {
        map.set(tierNum, tierLabels['__tier1__'] || getTierLabel(tierNum));
      } else if (overallTierSet.has(p.id)) {
        map.set(tierNum, tierLabels[p.id] || getTierLabel(tierNum));
      }
    });
    return map;
  }, [rankedPlayers, tierMap, overallTierSet, tierLabels]);

  /* --- sorted list of all tier numbers (for showing empty tiers in positional views) --- */
  const allTierNums = useMemo(() => {
    const nums = [...tierNumLabels.keys()];
    nums.sort((a, b) => a - b);
    return nums;
  }, [tierNumLabels]);

  /* --- flat items list (interleaves tier dividers + player items) --- */
  const flatItems = useMemo(() => {
    const items = [];
    let lastRenderedTier = 0;

    displayedPlayers.forEach((player, idx) => {
      const playerTier = tierMap.get(player.id) || 1;
      const prevTier = idx > 0 ? (tierMap.get(displayedPlayers[idx - 1].id) || 1) : 0;
      const hasTierAbove = idx === 0 || playerTier !== prevTier;

      // Empty tier dividers for any skipped tiers
      const startTier = idx === 0 ? 1 : prevTier + 1;
      for (let t = startTier; t < playerTier; t++) {
        if (t <= lastRenderedTier) continue;
        items.push({
          type: 'tier-divider',
          key: `empty-tier-${t}`,
          tierColor: getTierColor(t),
          tierLabel: tierNumLabels.get(t) || getTierLabel(t),
          playerId: null,
          editable: false,
        });
        lastRenderedTier = t;
      }

      // Tier divider immediately before this player (player-associated, editable)
      if (hasTierAbove) {
        items.push({
          type: 'tier-divider',
          key: `divider-${player.id}`,
          tierColor: getTierColor(playerTier),
          tierLabel: tierNumLabels.get(playerTier) || getTierLabel(playerTier),
          playerId: player.id,
          editable: true,
        });
      } else {
        // Tier insert zone — clickable affordance to add a tier break
        items.push({
          type: 'tier-insert',
          key: `insert-${player.id}`,
          playerId: player.id,
        });
      }

      items.push({
        type: 'player',
        key: player.id,
        player,
        displayRank: idx + 1,
        posRank: posRankMap.get(player.id) || '',
        tier: playerTier,
      });
      lastRenderedTier = playerTier;
    });

    // Trailing empty tiers
    allTierNums.forEach(t => {
      if (t > lastRenderedTier) {
        items.push({
          type: 'tier-divider',
          key: `empty-tier-${t}`,
          tierColor: getTierColor(t),
          tierLabel: tierNumLabels.get(t) || getTierLabel(t),
          playerId: null,
          editable: false,
        });
      }
    });

    return items;
  }, [displayedPlayers, tierMap, tierNumLabels, posRankMap, allTierNums]);

  /* --- virtualizer --- */
  const rowVirtualizer = useVirtualizer({
    count: flatItems.length,
    getScrollElement: () => scrollContainerRef.current,
    estimateSize: (i) => {
      const item = flatItems[i];
      if (item?.type === 'tier-divider') return isMobile ? 28 : 36;
      if (item?.type === 'tier-insert') return isMobile ? 18 : 14;
      return isMobile ? 42 : 40;
    },
    overscan: 15,
  });

  /* --- dnd-kit handlers --- */
  const handleDragStart = useCallback((event) => {
    setActiveId(event.active.id);
  }, []);

  const handleDragEnd = useCallback((event) => {
    const { active, over } = event;
    setActiveId(null);

    if (!over) return;

    const activeIdStr = String(active.id);

    // ── Tier break drag ──────────────────────────────────────────
    if (activeIdStr.startsWith('tier-drag:')) {
      const sourcePlayerId = activeIdStr.slice('tier-drag:'.length);
      const targetPlayerId = resolveDropTargetId(over.id);
      if (!targetPlayerId || sourcePlayerId === targetPlayerId) return;
      if (!overallTierBreaks.has(sourcePlayerId)) return;

      // Move the tier break from source to target
      setOverallTierBreaks(prev => {
        const next = new Set(prev);
        next.delete(sourcePlayerId);
        next.add(targetPlayerId);
        return next;
      });

      // Migrate the custom label
      setTierLabels(prev => {
        const next = { ...prev };
        const label = next[sourcePlayerId];
        if (label !== undefined) {
          delete next[sourcePlayerId];
          next[targetPlayerId] = label;
        }
        return next;
      });

      return;
    }

    // ── Player drag ──────────────────────────────────────────────
    const overData = over.data?.current;
    const targetId = resolveDropTargetId(over.id);
    if (!targetId) return;

    const fromIdx = rankedPlayers.findIndex(p => p.id === active.id);
    const toIdx = rankedPlayers.findIndex(p => p.id === targetId);
    if (fromIdx === -1 || toIdx === -1) return;

    const isTierBreakDrop = overData?.kind === 'tier-break';

    // If the drop lands directly on a tier break and the dragged player is
    // already touching that break, keep the row order fixed and move the break
    // one slot instead. This lets a player change tiers without changing rank.
    if (isTierBreakDrop) {
      // Dragging the first player in a tier upward across the break.
      if (active.id === targetId && overallTierBreaks.has(active.id)) {
        const nextPlayer = rankedPlayers[fromIdx + 1];

        setOverallTierBreaks(prev => {
          const next = new Set(prev);
          next.delete(active.id);
          if (nextPlayer) next.add(nextPlayer.id);
          return next;
        });

        setTierLabels(prev => {
          const next = { ...prev };
          const label = next[active.id];
          if (label !== undefined) {
            delete next[active.id];
            if (nextPlayer) next[nextPlayer.id] = label;
          }
          return next;
        });

        return;
      }

      // Dragging the last player in a tier downward across the break.
      if (fromIdx + 1 === toIdx && overallTierBreaks.has(targetId)) {
        setOverallTierBreaks(prev => {
          const next = new Set(prev);
          next.delete(targetId);
          next.add(active.id);
          return next;
        });

        setTierLabels(prev => {
          const next = { ...prev };
          const label = next[targetId];
          if (label !== undefined) {
            delete next[targetId];
            next[active.id] = label;
          }
          return next;
        });

        return;
      }

      // General case: player dropped on a tier break from a non-adjacent position.
      // Reorder the player AND reassign the break so the player lands just below
      // the tier bar (becoming the first player in that tier).
      if (active.id !== targetId) {
        setRankedPlayers(prev => {
          const fi = prev.findIndex(p => p.id === active.id);
          const ti = prev.findIndex(p => p.id === targetId);
          if (fi === -1 || ti === -1) return prev;
          const newList = [...prev];
          const [moved] = newList.splice(fi, 1);
          const insertIdx = fi < ti ? ti - 1 : ti;
          newList.splice(insertIdx, 0, moved);
          return newList;
        });

        if (overallTierBreaks.has(targetId)) {
          setOverallTierBreaks(prev => {
            const next = new Set(prev);
            next.delete(targetId);
            next.add(active.id);
            return next;
          });
          setTierLabels(prev => {
            const next = { ...prev };
            const label = next[targetId];
            if (label !== undefined) {
              delete next[targetId];
              next[active.id] = label;
            }
            return next;
          });
        }

        return;
      }
    }

    if (active.id === targetId) return;

    // Reorder the dragged player to the target position.
    setRankedPlayers(prev => {
      const fromIdx = prev.findIndex(p => p.id === active.id);
      const toIdx = prev.findIndex(p => p.id === targetId);
      if (fromIdx === -1 || toIdx === -1) return prev;

      const newList = [...prev];
      const [moved] = newList.splice(fromIdx, 1);

      // When dragging down, removing the item shifts all subsequent indices by -1.
      const insertIdx = fromIdx < toIdx ? toIdx - 1 : toIdx;
      newList.splice(insertIdx, 0, moved);

      return newList;
    });

    // If the target player owns a tier break, the dragged player was just
    // inserted before it — which visually places the player above the break.
    // Reassign the break to the dragged player so it becomes the new first
    // player in that tier (landing below the break, as the user expects).
    if (overallTierBreaks.has(targetId)) {
      setOverallTierBreaks(prev => {
        const next = new Set(prev);
        next.delete(targetId);
        next.add(active.id);
        return next;
      });
      setTierLabels(prev => {
        const next = { ...prev };
        const label = next[targetId];
        if (label !== undefined) {
          delete next[targetId];
          next[active.id] = label;
        }
        return next;
      });
    }
  }, [overallTierBreaks, rankedPlayers]); // needs current rows + breaks for boundary moves

  /* --- tier toggle --- */
  const handleTierToggle = useCallback((playerId) => {
    setOverallTierBreaks(prev => {
      const set = new Set(prev);
      if (set.has(playerId)) {
        set.delete(playerId);
      } else {
        set.add(playerId);
      }
      return set;
    });
  }, []);

  /* --- tier label change --- */
  const handleTierLabelChange = useCallback((playerId, newLabel) => {
    const key = rankedPlayers.length > 0 && rankedPlayers[0].id === playerId
      ? '__tier1__' : playerId;
    setTierLabels(prev => ({ ...prev, [key]: newLabel }));
  }, [rankedPlayers]);

  /* --- export --- */
  const handleExport = useCallback(() => {
    exportRankingsCSV(rankedPlayers, fullTierMap, tierLabels, selectedPlatform || 'underdog');
  }, [rankedPlayers, fullTierMap, tierLabels]);

  /* --- save to assets --- */
  const [saveStatus, setSaveStatus] = useState(null);
  const handleSave = useCallback(async () => {
    setSaveStatus('saving');
    try {
      await saveRankingsToAssets(rankedPlayers, fullTierMap, tierLabels, selectedPlatform || 'underdog');
      setSaveStatus('saved');
      setTimeout(() => setSaveStatus(null), 2000);
    } catch (err) {
      console.error('Save failed:', err);
      setSaveStatus('error');
      setTimeout(() => setSaveStatus(null), 3000);
    }
  }, [rankedPlayers, fullTierMap, tierLabels, selectedPlatform]);

  /* --- drag overlay lookup --- */
  const activeIdStr = activeId ? String(activeId) : '';
  const isTierDragActive = activeIdStr.startsWith('tier-drag:');
  const activePlayer = (!isTierDragActive && activeId) ? rankedPlayers.find(p => p.id === activeId) : null;
  const activeTierDrag = isTierDragActive ? (() => {
    const playerId = activeIdStr.slice('tier-drag:'.length);
    const tierNum = fullTierMap.get(playerId) || 1;
    return {
      playerId,
      tierLabelText: tierNumLabels.get(tierNum) || getTierLabel(tierNum),
      tierColor: getTierColor(tierNum),
    };
  })() : null;

  /* --- empty state --- */
  if (availablePlatforms.length === 0 && Object.values(rankingsByPlatform).every(r => !r?.length)) {
    return (
      <div className={s.emptyState}>
        <div className={s.emptyHeader}>
          {onRankingsUpload && <FileUploadButton label="Upload CSV" onUpload={(text, filename) => onRankingsUpload(text, filename, selectedPlatform || 'underdog')} onBeforeUpload={uploadAuthGuard} className={s.exportBtn} />}
        </div>
        <p className={s.emptyText}>
          No rankings data loaded. Use the Upload button to import a Rankings CSV.
        </p>
      </div>
    );
  }

  /* --- render desktop table --- */
  const renderDesktopTable = () => {
    if (isSearching && displayedPlayers.length === 0) {
      return (
        <div className={s.searchEmpty}>
          No players match &ldquo;<strong>{searchTerm}</strong>&rdquo;
        </div>
      );
    }
    const virtualItems = rowVirtualizer.getVirtualItems();

    return (
    <div ref={scrollContainerRef} className={s.tableWrap}>
      <table className={s.table}>
        <colgroup>
          <col className={s.colGrip} />
          <col className={s.colRank} />
          <col className={s.colPosRank} />
          <col className={s.colTier} />
          <col className={s.colName} />
          <col className={s.colPos} />
          <col className={s.colTeam} />
          <col className={s.colAdp} />
          <col className={s.colDiff} />
          <col className={s.colProj} />
        </colgroup>
        <thead>
          <tr className={s.stickyHead} data-help-id="drag-reorder">
            <th className={s.headerCell} />
            <th className={s.headerCell} data-help-id="keyboard-shortcuts">#</th>
            <th className={s.headerCell}>Pos#</th>
            <th className={s.headerCell} data-help-id="tier-breaks">Tier</th>
            <th className={s.headerCellName}>Player</th>
            <th className={s.headerCell}>Pos</th>
            <th className={s.headerCell}>Team</th>
            <th className={s.headerCell}>ADP</th>
            <th className={s.headerCell}>Diff</th>
            <th className={s.headerCell}>Proj</th>
          </tr>
        </thead>
        {/* Top spacer */}
        {virtualItems.length > 0 && virtualItems[0].start > 0 && (
          <tbody><tr><td colSpan={10} style={{ height: virtualItems[0].start, padding: 0, border: 'none' }} /></tr></tbody>
        )}
        {virtualItems.map(vRow => {
          const item = flatItems[vRow.index];
          if (!item) return null;
          if (item.type === 'tier-divider') {
            return (
              <tbody key={vRow.key}>
                {item.editable ? (
                  <TierDividerContent
                    tierColor={item.tierColor}
                    tierLabelText={item.tierLabel}
                    playerId={item.playerId}
                    onTierLabelChange={handleTierLabelChange}
                    onDelete={handleTierToggle}
                    isMobile={false}
                    dropId={`break:${item.playerId}`}
                    canDrag={canDrag && viewMode === 'overall' && overallTierBreaks.has(item.playerId)}
                  />
                ) : (
                  <tr>
                    <td colSpan={10} className={s.tierDivider} style={{ background: item.tierColor.border }}>
                      <span className={s.tierLabel}>{item.tierLabel}</span>
                    </td>
                  </tr>
                )}
              </tbody>
            );
          }
          if (item.type === 'tier-insert') {
            return (
              <tbody key={vRow.key}>
                <TierInsertZone
                  playerId={item.playerId}
                  isMobile={false}
                  onClick={() => handleTierToggle(item.playerId)}
                  dropId={`insert:${item.playerId}`}
                />
              </tbody>
            );
          }
          return (
            <SortableRow
              key={vRow.key}
              player={item.player}
              displayRank={item.displayRank}
              posRank={item.posRank}
              tier={item.tier}
              canDrag={canDrag}
            />
          );
        })}
        {/* Bottom spacer */}
        {virtualItems.length > 0 && (
          <tbody><tr><td colSpan={10} style={{
            height: rowVirtualizer.getTotalSize() - (virtualItems.at(-1)?.end ?? 0),
            padding: 0, border: 'none',
          }} /></tr></tbody>
        )}
      </table>
    </div>
    );
  };

  /* --- render mobile cards --- */
  const renderMobileCards = () => {
    if (isSearching && displayedPlayers.length === 0) {
      return (
        <div className={s.searchEmpty}>
          No players match &ldquo;<strong>{searchTerm}</strong>&rdquo;
        </div>
      );
    }
    const virtualItems = rowVirtualizer.getVirtualItems();

    return (
    <div
      ref={scrollContainerRef}
      className={s.cardList}
      style={{ position: 'relative', height: rowVirtualizer.getTotalSize() }}
    >
      {virtualItems.map(vRow => {
        const item = flatItems[vRow.index];
        if (!item) return null;
        const wrapperStyle = {
          position: 'absolute', top: 0, left: 0, width: '100%',
          transform: `translateY(${vRow.start}px)`,
        };
        if (item.type === 'tier-divider') {
          return (
            <div key={vRow.key} style={wrapperStyle}>
              {item.editable ? (
                <TierDividerContent
                  tierColor={item.tierColor}
                  tierLabelText={item.tierLabel}
                  playerId={item.playerId}
                  onTierLabelChange={handleTierLabelChange}
                  onDelete={handleTierToggle}
                  isMobile={true}
                  dropId={`break:${item.playerId}`}
                  canDrag={canDrag && viewMode === 'overall' && overallTierBreaks.has(item.playerId)}
                />
              ) : (
                <div className={s.tierDividerMobile} style={{ background: item.tierColor.border }}>
                  <span className={s.tierLabelMobile}>{item.tierLabel}</span>
                </div>
              )}
            </div>
          );
        }
        if (item.type === 'tier-insert') {
          return (
            <div key={vRow.key} style={wrapperStyle}>
              <TierInsertZone
                playerId={item.playerId}
                isMobile={true}
                onClick={() => handleTierToggle(item.playerId)}
                dropId={`insert:${item.playerId}`}
              />
            </div>
          );
        }
        return (
          <div key={vRow.key} style={wrapperStyle}>
            <SortableCard
              player={item.player}
              displayRank={item.displayRank}
              posRank={item.posRank}
              tier={item.tier}
              canDrag={canDrag}
              isExpanded={expandedCardId === item.player.id}
              onTap={() => setExpandedCardId(expandedCardId === item.player.id ? null : item.player.id)}
            />
          </div>
        );
      })}
    </div>
    );
  };

  return (
    <TabLayout flush helpAnnotations={HELP_ANNOTATIONS} helpOpen={helpOpen} onHelpToggle={onHelpToggle}>
    <div className={s.root}>
      {/* Header row */}
      <div className={s.headerRow} data-help-id="search-controls">
        <div className={s.headerRight}>
          {/* Search */}
          <SearchInput
            value={searchTerm}
            onChange={setSearchTerm}
            placeholder="Search player or team..."
            delay={150}
          />
          {/* Save — always visible */}
          <button
            onClick={handleSave}
            disabled={saveStatus === 'saving'}
            className={s.saveBtn}
            style={{
              background: saveStatus === 'saved' ? '#10b981' : saveStatus === 'error' ? '#ef4444' : 'var(--gradient-accent)',
              color: (saveStatus === 'saved' || saveStatus === 'error') ? 'white' : undefined,
              cursor: saveStatus === 'saving' ? 'wait' : 'pointer',
              opacity: saveStatus === 'saving' ? 0.7 : 1,
            }}
          >
            <Save size={14} />
            {isMobile
              ? (saveStatus === 'saving' ? '...' : saveStatus === 'saved' ? '✓' : saveStatus === 'error' ? 'Err' : '')
              : (saveStatus === 'saving' ? 'Saving...' : saveStatus === 'saved' ? 'Saved!' : saveStatus === 'error' ? 'Error' : 'Save')
            }
          </button>
          {/* Export / Upload — desktop only */}
          {!isMobile && (
            <>
              <button onClick={handleExport} className={s.exportBtn}>
                <Download size={14} /> Export
              </button>
              {onRankingsUpload && <FileUploadButton label="Upload CSV" onUpload={(text, filename) => onRankingsUpload(text, filename, selectedPlatform || 'underdog')} onBeforeUpload={uploadAuthGuard} className={s.exportBtn} />}
            </>
          )}
        </div>
      </div>

      {/* Platform toggle — only when multiple platforms have ADP data */}
      {availablePlatforms.length > 1 && (
        <div className="filter-btn-group" style={{ padding: '0 0 8px' }} data-help-id="platform-toggle">
          {['underdog', 'draftkings']
            .filter(p => availablePlatforms.includes(p))
            .map(p => (
              <button
                key={p}
                className={`filter-btn-group__item ${selectedPlatform === p ? 'filter-btn-group__item--active' : ''}`}
                onClick={() => setSelectedPlatform(p)}
              >
                {p === 'underdog' ? 'Underdog Rankings' : 'DraftKings Rankings'}
              </button>
            ))}
        </div>
      )}

      {/* Position toggle */}
      <div className="filter-chip-group" style={{ padding: '0 0 8px' }} data-help-id="position-filter">
        {VIEWS.map(v => {
          const isActive = viewMode === v;
          const posClass = v !== 'overall' ? `filter-chip--pos-${v.toLowerCase()}` : '';
          return (
            <button
              key={v}
              onClick={() => { setViewMode(v); setSearchTerm(''); }}
              className={`filter-chip ${isActive ? `filter-chip--active ${posClass}` : ''}`}
            >
              {v === 'overall' ? 'Overall' : v}
            </button>
          );
        })}
        <span className="filter-count">
          {displayedPlayers.length} players
        </span>
      </div>

      {/* Search notice */}
      {isSearching && (
        <div className={s.searchNotice}>
          Drag disabled while searching. Clear search to reorder.
        </div>
      )}

      {/* DnD context wraps both table and card rendering */}
      <DndContext
        sensors={sensors}
        collisionDetection={pointerInsertionPoint}
        onDragStart={handleDragStart}
        onDragEnd={handleDragEnd}
      >
        <SortableContext
          items={displayedPlayers.map(p => p.id)}
          strategy={verticalListSortingStrategy}
          disabled={!canDrag}
        >
          {isMobile ? renderMobileCards() : renderDesktopTable()}
        </SortableContext>

        {/* Drag overlay — portal-based, tracks pointer directly to avoid virtualizer offset */}
        <PointerTrackingOverlay activePlayer={activePlayer} activeTierDrag={activeTierDrag} displayedPlayers={displayedPlayers} />
      </DndContext>
    </div>
    </TabLayout>
  );
}
