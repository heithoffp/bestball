import React, { useState, useMemo, useRef, useCallback, useEffect } from 'react';
import { GripVertical, Download, Save, Search, X } from 'lucide-react';
import { DndContext, closestCenter, PointerSensor, TouchSensor, useSensor, useSensors, DragOverlay } from '@dnd-kit/core';
import { SortableContext, verticalListSortingStrategy, useSortable } from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import { exportRankingsCSV, saveRankingsToAssets } from '../utils/rankingsExport';
import FileUploadButton from './FileUploadButton';
import useMediaQuery from '../hooks/useMediaQuery';
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

function getTierLabel(tierNum) {
  if (tierNum < 1) return TIER_LABELS[0];
  if (tierNum > TIER_LABELS.length) return TIER_LABELS[TIER_LABELS.length - 1];
  return TIER_LABELS[tierNum - 1];
}

function getTierColor(tierNum) {
  return TIER_COLORS[getTierLabel(tierNum)] || TIER_COLORS['F'];
}

/* ── Tier Divider (shared logic, renders differently for table vs cards) ── */
function TierDividerContent({ tierColor, tierLabelText, playerId, onTierLabelChange, onDelete, isMobile }) {
  const [isEditing, setIsEditing] = useState(false);
  const [editValue, setEditValue] = useState('');

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
      <div className={s.tierDividerMobile} style={{ background: tierColor.border }}>
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
    <tr>
      <td colSpan={10} className={s.tierDivider} style={{ background: tierColor.border }}>
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

/* ── Desktop Sortable Row ────────────────────────────────────── */
const SortableRow = React.memo(function SortableRow({
  player, displayRank, posRank, tier, canDrag,
  onTierToggle, hasTierAbove, tierLabelText, onTierLabelChange,
}) {
  const pos = player.slotName || 'N/A';
  const color = POS_COLORS[pos] || '#9ca3af';
  const badgeClass = `badge badge-${pos.toLowerCase()}`;
  const tierLabel = getTierLabel(tier);
  const tierColor = getTierColor(tier);

  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({
    id: player.id,
    disabled: !canDrag,
  });

  const rowStyle = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.4 : 1,
    background: tier % 2 === 0 ? 'rgba(255,255,255,0.02)' : 'transparent',
    cursor: canDrag ? 'grab' : 'default',
  };

  return (
    <>
      {hasTierAbove && (
        <TierDividerContent
          tierColor={tierColor}
          tierLabelText={tierLabelText}
          playerId={player.id}
          onTierLabelChange={onTierLabelChange}
          onDelete={onTierToggle}
          isMobile={false}
        />
      )}

      {/* Tier toggle zone */}
      <tr onClick={() => onTierToggle(player.id)} title="Click to toggle tier break">
        <td colSpan={10} className={s.tierToggleZone} />
      </tr>

      {/* Player row */}
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
    </>
  );
});

/* ── Mobile Sortable Card ────────────────────────────────────── */
const SortableCard = React.memo(function SortableCard({
  player, displayRank, posRank, tier, canDrag,
  onTierToggle, hasTierAbove, tierLabelText, onTierLabelChange,
  isExpanded, onTap,
}) {
  const pos = player.slotName || 'N/A';
  const color = POS_COLORS[pos] || '#9ca3af';
  const tierLabel = getTierLabel(tier);
  const tierColor = getTierColor(tier);

  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({
    id: player.id,
    disabled: !canDrag,
  });

  const cardStyle = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.4 : 1,
  };

  const adpStr = player.latestAdp ?? player.originalAdp ?? '-';
  const adpNum = parseFloat(adpStr);
  const diff = (!adpStr || adpStr === '-' || isNaN(adpNum)) ? null : +(adpNum - displayRank).toFixed(1);

  return (
    <>
      {hasTierAbove && (
        <TierDividerContent
          tierColor={tierColor}
          tierLabelText={tierLabelText}
          playerId={player.id}
          onTierLabelChange={onTierLabelChange}
          onDelete={onTierToggle}
          isMobile={true}
        />
      )}

      {/* Tier toggle zone */}
      <div className={s.tierToggleZoneMobile} onClick={() => onTierToggle(player.id)} />

      {/* Player card */}
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
    </>
  );
});

/* ── Main component ──────────────────────────────────────────── */
export default function PlayerRankings({ initialPlayers, masterPlayers, onRankingsUpload }) {
  const { isMobile } = useMediaQuery();

  /* --- state --- */
  const [rankedPlayers, setRankedPlayers] = useState([]);
  const [tierBreaks, setTierBreaks] = useState({
    overall: new Set(), QB: new Set(), RB: new Set(), WR: new Set(), TE: new Set(),
  });
  const [tierLabels, setTierLabels] = useState({});
  const [viewMode, setViewMode] = useState('overall');
  const [searchTerm, setSearchTerm] = useState('');
  const [expandedCardId, setExpandedCardId] = useState(null);
  const [activeId, setActiveId] = useState(null);

  const scrollContainerRef = useRef(null);

  /* --- dnd-kit sensors --- */
  const pointerSensor = useSensor(PointerSensor, { activationConstraint: { distance: 5 } });
  const touchSensor = useSensor(TouchSensor, { activationConstraint: { delay: 150, tolerance: 5 } });
  const sensors = useSensors(pointerSensor, touchSensor);

  /* --- ADP lookup from masterPlayers --- */
  const adpLookup = useMemo(() => {
    if (!masterPlayers || masterPlayers.length === 0) return new Map();
    const map = new Map();
    masterPlayers.forEach(p => {
      const key = (p.name || '').trim().replace(/\s+/g, ' ').toLowerCase();
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

  /* --- initialise from props --- */
  useEffect(() => {
    if (!initialPlayers || initialPlayers.length === 0) return;
    const players = initialPlayers.map(row => {
      const firstName = row.firstName || row.first_name || row['First Name'] || '';
      const lastName = row.lastName || row.last_name || row['Last Name'] || '';
      const name = `${firstName} ${lastName}`.trim() || row['Player Name'] || row.player_name || 'Unknown';
      const adpVal = parseFloat(row.adp ?? row.ADP ?? '');
      const nameKey = name.trim().replace(/\s+/g, ' ').toLowerCase();
      return {
        id: row.id || `gen_${name.replace(/\s+/g, '_')}`,
        firstName,
        lastName,
        name,
        adp: isNaN(adpVal) ? 9999 : adpVal,
        originalAdp: isNaN(adpVal) ? '-' : String(adpVal),
        latestAdp: adpLookup.get(nameKey) || null,
        projectedPoints: row.projectedPoints || row.projected_points || '',
        positionRank: row.positionRank || '',
        slotName: row.slotName || row.position || 'N/A',
        teamName: row.teamName || row.team || '',
        lineupStatus: row.lineupStatus || '',
        byeWeek: row.byeWeek || '',
        _csvTier: row.tier || '',
        _csvTierNum: row.tierNum || '',
      };
    });
    players.sort((a, b) => a.adp - b.adp);
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

      setTierBreaks(prev => ({ ...prev, overall: overallBreaks }));
      if (Object.keys(restoredLabels).length > 0) {
        setTierLabels(restoredLabels);
      }
    }
  }, [initialPlayers, adpLookup]);

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
  const overallTierSet = tierBreaks.overall;
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

  /* --- dnd-kit handlers --- */
  const handleDragStart = useCallback((event) => {
    setActiveId(event.active.id);
  }, []);

  const handleDragEnd = useCallback((event) => {
    const { active, over } = event;
    setActiveId(null);

    if (!over || active.id === over.id) return;

    // Transfer tier breaks so they stay at the boundary
    setTierBreaks(prev => {
      const set = new Set(prev.overall);
      const hadBreak = set.has(active.id);
      if (!hadBreak) return prev;

      const fromIdx = rankedPlayers.findIndex(p => p.id === active.id);
      const successor = rankedPlayers[fromIdx + 1];

      set.delete(active.id);
      if (successor && successor.id !== over.id) {
        set.add(successor.id);
      }

      return { ...prev, overall: set };
    });

    // Reorder players
    setRankedPlayers(prev => {
      const newList = [...prev];
      const fromIdx = newList.findIndex(p => p.id === active.id);
      if (fromIdx === -1) return prev;
      newList.splice(fromIdx, 1);
      const toIdx = newList.findIndex(p => p.id === over.id);
      if (toIdx === -1) return prev;
      newList.splice(toIdx, 0, prev[fromIdx]);
      return newList;
    });
  }, [rankedPlayers]);

  /* --- tier toggle --- */
  const handleTierToggle = useCallback((playerId) => {
    setTierBreaks(prev => {
      const next = { ...prev };
      const set = new Set(next.overall);
      if (set.has(playerId)) {
        set.delete(playerId);
      } else {
        set.add(playerId);
      }
      next.overall = set;
      return next;
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
    exportRankingsCSV(rankedPlayers, fullTierMap, tierLabels);
  }, [rankedPlayers, fullTierMap, tierLabels]);

  /* --- save to assets --- */
  const [saveStatus, setSaveStatus] = useState(null);
  const handleSave = useCallback(async () => {
    setSaveStatus('saving');
    try {
      await saveRankingsToAssets(rankedPlayers, fullTierMap, tierLabels);
      setSaveStatus('saved');
      setTimeout(() => setSaveStatus(null), 2000);
    } catch (err) {
      console.error('Save failed:', err);
      setSaveStatus('error');
      setTimeout(() => setSaveStatus(null), 3000);
    }
  }, [rankedPlayers, fullTierMap, tierLabels]);

  /* --- drag overlay player lookup --- */
  const activePlayer = activeId ? rankedPlayers.find(p => p.id === activeId) : null;

  /* --- empty state --- */
  if (!initialPlayers || initialPlayers.length === 0) {
    return (
      <div className={s.emptyState}>
        <div className={s.emptyHeader}>
          <h2 className={s.headerTitle}>Player Rankings</h2>
          {onRankingsUpload && <FileUploadButton label="Upload Rankings CSV" onUpload={onRankingsUpload} />}
        </div>
        <p className={s.emptyText}>
          No rankings data loaded. Use the Upload button to import a Rankings CSV.
        </p>
      </div>
    );
  }

  /* --- render desktop table --- */
  const renderDesktopTable = () => (
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
          <tr className={s.stickyHead}>
            <th className={s.headerCell} />
            <th className={s.headerCell}>#</th>
            <th className={s.headerCell}>Pos#</th>
            <th className={s.headerCell}>Tier</th>
            <th className={s.headerCellName}>Player</th>
            <th className={s.headerCell}>Pos</th>
            <th className={s.headerCell}>Team</th>
            <th className={s.headerCell}>ADP</th>
            <th className={s.headerCell}>Diff</th>
            <th className={s.headerCell}>Proj</th>
          </tr>
        </thead>
        <tbody>
          {(() => {
            const rows = [];
            let lastRenderedTier = 0;
            displayedPlayers.forEach((player, idx) => {
              const playerTier = tierMap.get(player.id) || 1;
              const prevTier = idx > 0 ? (tierMap.get(displayedPlayers[idx - 1].id) || 1) : 0;

              // Insert empty tier dividers for any skipped tiers
              const startTier = idx === 0 ? 1 : prevTier + 1;
              for (let t = startTier; t < playerTier; t++) {
                if (t <= lastRenderedTier) continue;
                const tc = getTierColor(t);
                const label = tierNumLabels.get(t) || getTierLabel(t);
                rows.push(
                  <tr key={`empty-tier-${t}`}>
                    <td colSpan={10} className={s.tierDivider} style={{ background: tc.border }}>
                      <span className={s.tierLabel}>{label}</span>
                    </td>
                  </tr>
                );
                lastRenderedTier = t;
              }

              rows.push(
                <SortableRow
                  key={player.id}
                  player={player}
                  displayRank={idx + 1}
                  posRank={posRankMap.get(player.id) || ''}
                  tier={playerTier}
                  canDrag={canDrag}
                  onTierToggle={handleTierToggle}
                  hasTierAbove={idx === 0 || playerTier !== prevTier}
                  tierLabelText={tierNumLabels.get(playerTier) || getTierLabel(playerTier)}
                  onTierLabelChange={handleTierLabelChange}
                />
              );
              lastRenderedTier = playerTier;
            });

            // Trailing empty tiers after the last player
            allTierNums.forEach(t => {
              if (t > lastRenderedTier) {
                const tc = getTierColor(t);
                const label = tierNumLabels.get(t) || getTierLabel(t);
                rows.push(
                  <tr key={`empty-tier-${t}`}>
                    <td colSpan={10} className={s.tierDivider} style={{ background: tc.border }}>
                      <span className={s.tierLabel}>{label}</span>
                    </td>
                  </tr>
                );
              }
            });

            return rows;
          })()}
        </tbody>
      </table>
    </div>
  );

  /* --- render mobile cards --- */
  const renderMobileCards = () => (
    <div ref={scrollContainerRef} className={s.cardList}>
      {(() => {
        const items = [];
        let lastRenderedTier = 0;
        displayedPlayers.forEach((player, idx) => {
          const playerTier = tierMap.get(player.id) || 1;
          const prevTier = idx > 0 ? (tierMap.get(displayedPlayers[idx - 1].id) || 1) : 0;

          // Insert empty tier dividers for skipped tiers
          const startTier = idx === 0 ? 1 : prevTier + 1;
          for (let t = startTier; t < playerTier; t++) {
            if (t <= lastRenderedTier) continue;
            const tc = getTierColor(t);
            const label = tierNumLabels.get(t) || getTierLabel(t);
            items.push(
              <div key={`empty-tier-${t}`} className={s.tierDividerMobile} style={{ background: tc.border }}>
                <span className={s.tierLabelMobile}>{label}</span>
              </div>
            );
            lastRenderedTier = t;
          }

          items.push(
            <SortableCard
              key={player.id}
              player={player}
              displayRank={idx + 1}
              posRank={posRankMap.get(player.id) || ''}
              tier={playerTier}
              canDrag={canDrag}
              onTierToggle={handleTierToggle}
              hasTierAbove={idx === 0 || playerTier !== prevTier}
              tierLabelText={tierNumLabels.get(playerTier) || getTierLabel(playerTier)}
              onTierLabelChange={handleTierLabelChange}
              isExpanded={expandedCardId === player.id}
              onTap={() => setExpandedCardId(expandedCardId === player.id ? null : player.id)}
            />
          );
          lastRenderedTier = playerTier;
        });

        // Trailing empty tiers
        allTierNums.forEach(t => {
          if (t > lastRenderedTier) {
            const tc = getTierColor(t);
            const label = tierNumLabels.get(t) || getTierLabel(t);
            items.push(
              <div key={`empty-tier-${t}`} className={s.tierDividerMobile} style={{ background: tc.border }}>
                <span className={s.tierLabelMobile}>{label}</span>
              </div>
            );
          }
        });

        return items;
      })()}
    </div>
  );

  return (
    <div className={s.root}>
      {/* Header row */}
      <div className={s.headerRow}>
        <div className={s.headerLeft}>
          <h2 className={s.headerTitle}>Player Rankings</h2>
        </div>
        <div className={s.headerRight}>
          {/* Search */}
          <div className={s.searchWrap}>
            <Search size={14} className={s.searchIcon} />
            <input
              type="text"
              placeholder="Search player or team..."
              value={searchTerm}
              onChange={e => setSearchTerm(e.target.value)}
              className={s.searchInput}
            />
          </div>
          {/* Save — always visible */}
          <button
            onClick={handleSave}
            disabled={saveStatus === 'saving'}
            className={s.saveBtn}
            style={{
              background: saveStatus === 'saved' ? '#10b981' : saveStatus === 'error' ? '#ef4444' : 'var(--gradient-primary)',
              cursor: saveStatus === 'saving' ? 'wait' : 'pointer',
              opacity: saveStatus === 'saving' ? 0.7 : 1,
            }}
          >
            <Save size={14} />
            {isMobile
              ? (saveStatus === 'saving' ? '...' : saveStatus === 'saved' ? '!' : saveStatus === 'error' ? '!' : '')
              : (saveStatus === 'saving' ? 'Saving...' : saveStatus === 'saved' ? 'Saved!' : saveStatus === 'error' ? 'Error' : 'Save')
            }
          </button>
          {/* Export / Upload — desktop only */}
          {!isMobile && (
            <>
              <button onClick={handleExport} className={s.exportBtn}>
                <Download size={14} /> Export
              </button>
              {onRankingsUpload && <FileUploadButton label="Upload Rankings CSV" onUpload={onRankingsUpload} />}
            </>
          )}
        </div>
      </div>

      {/* Position toggle */}
      <div className={s.viewToggle}>
        {VIEWS.map(v => {
          const isActive = viewMode === v;
          const posColor = v === 'overall' ? null : POS_COLORS[v];
          return (
            <button
              key={v}
              onClick={() => { setViewMode(v); setSearchTerm(''); }}
              className={s.viewChip}
              style={{
                background: isActive
                  ? (posColor ? `${posColor}20` : 'var(--bg-hover)')
                  : 'transparent',
                border: `1px solid ${posColor ? posColor + '60' : 'var(--border)'}`,
                color: posColor || 'var(--text-primary)',
                fontWeight: isActive ? 700 : 400,
              }}
            >
              {v === 'overall' ? 'Overall' : v}
            </button>
          );
        })}
        <span className={s.playerCount}>
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
        collisionDetection={closestCenter}
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

        {/* Drag overlay — rendered outside the list for smooth visuals */}
        <DragOverlay>
          {activePlayer ? (
            <div className={s.dragOverlay}>
              <span className={s.dragOverlayRank}>
                {displayedPlayers.findIndex(p => p.id === activePlayer.id) + 1}
              </span>
              <span className={s.dragOverlayName} style={{ borderLeft: `3px solid ${POS_COLORS[activePlayer.slotName] || '#9ca3af'}`, paddingLeft: 8 }}>
                {activePlayer.name}
              </span>
              <span style={{ color: 'var(--text-secondary)', fontSize: 14 }}>
                {activePlayer.latestAdp ?? activePlayer.originalAdp ?? '-'}
              </span>
            </div>
          ) : null}
        </DragOverlay>
      </DndContext>
    </div>
  );
}
