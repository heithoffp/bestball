import React, { useState, useMemo, useRef, useCallback, useEffect } from 'react';
import { GripVertical, Download, Save, Search } from 'lucide-react';
import { exportRankingsCSV, saveRankingsToAssets } from '../utils/rankingsExport';
import FileUploadButton from './FileUploadButton';

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

/* ── Memoised row ────────────────────────────────────────────── */
const RankingRow = React.memo(function RankingRow({
  player, displayRank, posRank, tier, isDragSource, isDropTarget,
  onDragStart, onDragOver, onDrop, onDragEnd,
  onTierToggle, hasTierAbove, canDrag,
  tierLabelText, onTierLabelChange,
}) {
  const pos = player.slotName || 'N/A';
  const color = POS_COLORS[pos] || '#9ca3af';
  const badgeClass = `badge badge-${pos.toLowerCase()}`;
  const tierLabel = getTierLabel(tier);
  const tierColor = getTierColor(tier);

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
      onTierLabelChange(player.id, editValue.trim());
    }
  };

  return (
    <>
      {/* Tier break divider */}
      {hasTierAbove && (
        <tr>
          <td colSpan={10} style={{
            padding: 0, height: 36, border: 'none',
            background: tierColor.border,
            position: 'relative',
          }}>
            {isEditing ? (
              <input
                autoFocus
                value={editValue}
                onChange={(e) => setEditValue(e.target.value)}
                onBlur={handleLabelSave}
                onKeyDown={(e) => { if (e.key === 'Enter') handleLabelSave(); if (e.key === 'Escape') setIsEditing(false); }}
                onClick={(e) => e.stopPropagation()}
                style={{
                  width: '100%', height: '100%',
                  position: 'absolute', top: 0, left: 0,
                  background: 'rgba(0,0,0,0.4)', color: '#fff',
                  border: 'none', borderRadius: 0,
                  padding: '0 8px', boxSizing: 'border-box',
                  fontSize: 16, fontWeight: 700, textAlign: 'center',
                  fontFamily: 'inherit', outline: 'none',
                }}
              />
            ) : (
              <span
                onClick={handleLabelClick}
                title="Click to edit tier label"
                style={{
                  position: 'absolute', top: '50%', left: '50%',
                  transform: 'translate(-50%, -50%)',
                  fontSize: 16, fontWeight: 700, color: '#fff',
                  textShadow: '0 1px 3px rgba(0,0,0,0.5)',
                  cursor: 'pointer', userSelect: 'none',
                  background: 'rgba(0,0,0,0.25)', borderRadius: 4,
                  padding: '2px 12px',
                }}
              >
                {tierLabelText}
              </span>
            )}
          </td>
        </tr>
      )}

      {/* Tier toggle zone — clickable area between rows */}
      <tr
        className="tier-toggle-zone"
        onClick={() => onTierToggle(player.id)}
        title="Click to toggle tier break"
      >
        <td colSpan={10} style={{
          padding: 0, height: 6, border: 'none', cursor: 'pointer',
        }} />
      </tr>

      {/* Player row */}
      <tr
        draggable={canDrag}
        onDragStart={(e) => onDragStart(e, player)}
        onDragOver={(e) => onDragOver(e, player)}
        onDrop={(e) => onDrop(e, player)}
        onDragEnd={onDragEnd}
        style={{
          opacity: isDragSource ? 0.4 : 1,
          borderTop: isDropTarget ? '3px solid var(--accent-blue)' : undefined,
          background: tier % 2 === 0 ? 'rgba(255,255,255,0.02)' : 'transparent',
          cursor: canDrag ? 'grab' : 'default',
        }}
      >
        <td style={{ padding: '8px 5px', color: 'var(--text-muted)' }}>
          {canDrag && <GripVertical size={16} />}
        </td>
        <td style={{ padding: '8px 5px', textAlign: 'center', color: 'var(--text-secondary)', fontSize: 16 }}>
          {displayRank}
        </td>
        <td style={{ padding: '8px 5px', textAlign: 'center', color: POS_COLORS[pos] || 'var(--text-muted)', fontSize: 15 }}>
          {posRank}
        </td>
        <td style={{ padding: '8px 5px', textAlign: 'center' }}>
          <span style={{
            fontSize: 14, fontWeight: 700, color: tierColor.text,
            background: tierColor.bg, borderRadius: 4, padding: '2px 6px',
            border: `1px solid ${tierColor.border}40`,
          }}>{tierLabel}</span>
        </td>
        <td style={{
          padding: '8px 6px', fontWeight: 500,
          borderLeft: `3px solid ${color}`, paddingLeft: 8,
          overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
          fontSize: 16,
        }}>
          {player.name}
        </td>
        <td style={{ padding: '8px 5px' }}>
          <span className={badgeClass}>{pos}</span>
        </td>
        <td style={{ padding: '8px 5px', color: 'var(--text-secondary)', fontSize: 16, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
          {player.teamName || '-'}
        </td>
        <td style={{ padding: '8px 5px', color: 'var(--text-secondary)', fontSize: 16 }}>
          {player.latestAdp ?? player.originalAdp ?? '-'}
        </td>
        <td style={{ padding: '8px 5px', fontSize: 16 }}>
          {(() => {
            const adpStr = player.latestAdp ?? player.originalAdp;
            const adpNum = parseFloat(adpStr);
            if (!adpStr || adpStr === '-' || isNaN(adpNum)) return <span style={{ color: 'var(--text-muted)' }}>-</span>;
            const diff = +(adpNum - displayRank).toFixed(1);
            const color = diff > 0 ? '#10b981' : diff < 0 ? '#ef4444' : 'var(--text-secondary)';
            return <span style={{ color, fontWeight: 600 }}>{diff > 0 ? '+' : ''}{diff}</span>;
          })()}
        </td>
        <td style={{ padding: '8px 5px', color: 'var(--text-secondary)', fontSize: 16 }}>
          {player.projectedPoints || '-'}
        </td>
      </tr>
    </>
  );
});

/* ── Main component ──────────────────────────────────────────── */
export default function PlayerRankings({ initialPlayers, masterPlayers, onRankingsUpload }) {
  /* --- state --- */
  const [rankedPlayers, setRankedPlayers] = useState([]);
  const [tierBreaks, setTierBreaks] = useState({
    overall: new Set(), QB: new Set(), RB: new Set(), WR: new Set(), TE: new Set(),
  });
  const [tierLabels, setTierLabels] = useState({});
  const [viewMode, setViewMode] = useState('overall');
  const [searchTerm, setSearchTerm] = useState('');
  const [dropTargetId, setDropTargetId] = useState(null);

  const dragPlayerRef = useRef(null);
  const scrollContainerRef = useRef(null);
  const autoScrollRef = useRef(null);

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
          // Store first tier label
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

  /* --- tier computation (always based on overall ranking order) --- */
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

  /* --- position rank computation (based on overall ranking order) --- */
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
  const effectiveTierLabels = useMemo(() => {
    const labels = new Map();
    rankedPlayers.forEach((p, idx) => {
      const tierNum = tierMap.get(p.id) || 1;
      if (idx === 0) {
        labels.set(p.id, tierLabels['__tier1__'] || getTierLabel(tierNum));
      } else if (overallTierSet.has(p.id)) {
        labels.set(p.id, tierLabels[p.id] || getTierLabel(tierNum));
      }
    });
    return labels;
  }, [rankedPlayers, tierMap, overallTierSet, tierLabels]);

  /* --- drag & drop handlers --- */
  const handleDragStart = useCallback((e, player) => {
    dragPlayerRef.current = player;
    e.dataTransfer.effectAllowed = 'move';
    e.dataTransfer.setData('text/plain', player.id);
  }, []);

  const handleDragOver = useCallback((e, player) => {
    e.preventDefault();
    e.dataTransfer.dropEffect = 'move';
    setDropTargetId(player.id);

    const container = scrollContainerRef.current;
    if (!container) return;
    const rect = container.getBoundingClientRect();
    const y = e.clientY;
    if (y - rect.top < 50) {
      container.scrollTop -= 6;
    } else if (rect.bottom - y < 50) {
      container.scrollTop += 6;
    }
  }, []);

  const handleDrop = useCallback((e, targetPlayer) => {
    e.preventDefault();
    const dragPlayer = dragPlayerRef.current;
    if (!dragPlayer || dragPlayer.id === targetPlayer.id) {
      setDropTargetId(null);
      return;
    }

    // Transfer tier breaks so they stay at the boundary, not follow the player
    setTierBreaks(prev => {
      const set = new Set(prev.overall);
      const hadBreak = set.has(dragPlayer.id);
      if (!hadBreak) return prev;

      // Find the player that will fill the dragged player's old slot
      const fromIdx = rankedPlayers.findIndex(p => p.id === dragPlayer.id);
      const successor = rankedPlayers[fromIdx + 1];

      // Remove break from dragged player (they join the destination tier)
      set.delete(dragPlayer.id);

      // Transfer break to successor so the boundary stays in place
      if (successor && successor.id !== targetPlayer.id) {
        set.add(successor.id);
      }

      return { ...prev, overall: set };
    });

    setRankedPlayers(prev => {
      const newList = [...prev];
      const fromIdx = newList.findIndex(p => p.id === dragPlayer.id);
      if (fromIdx === -1) return prev;
      newList.splice(fromIdx, 1);
      const toIdx = newList.findIndex(p => p.id === targetPlayer.id);
      if (toIdx === -1) return prev;
      newList.splice(toIdx, 0, dragPlayer);
      return newList;
    });

    setDropTargetId(null);
    dragPlayerRef.current = null;
  }, [rankedPlayers]);

  const handleDragEnd = useCallback(() => {
    setDropTargetId(null);
    dragPlayerRef.current = null;
    if (autoScrollRef.current) {
      clearInterval(autoScrollRef.current);
      autoScrollRef.current = null;
    }
  }, []);

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
    // First player's label is stored under __tier1__
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

  /* --- empty state --- */
  if (!initialPlayers || initialPlayers.length === 0) {
    return (
      <div style={{ padding: 24, textAlign: 'center' }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 10, marginBottom: 16 }}>
          <h2 style={{ fontSize: 18, fontWeight: 700, margin: 0 }}>Player Rankings</h2>
          {onRankingsUpload && <FileUploadButton label="Upload Rankings CSV" onUpload={onRankingsUpload} />}
        </div>
        <p style={{ color: 'var(--text-secondary)' }}>
          No rankings data loaded. Use the Upload button to import a Rankings CSV.
        </p>
      </div>
    );
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%', minHeight: 0 }}>
      {/* Header row */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12, gap: 12, flexWrap: 'wrap' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <h2 style={{ fontSize: 18, fontWeight: 700, margin: 0 }}>Player Rankings</h2>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, flex: 1, justifyContent: 'flex-end' }}>
          {/* Search */}
          <div style={{ position: 'relative', maxWidth: 240 }}>
            <Search size={14} style={{ position: 'absolute', left: 8, top: '50%', transform: 'translateY(-50%)', color: 'var(--text-muted)' }} />
            <input
              type="text"
              placeholder="Search player or team..."
              value={searchTerm}
              onChange={e => setSearchTerm(e.target.value)}
              style={{
                background: 'var(--bg-hover)', border: '1px solid var(--border)',
                color: 'var(--text-primary)', padding: '6px 10px 6px 28px',
                borderRadius: 6, fontSize: 13, width: '100%',
                fontFamily: 'inherit',
              }}
            />
          </div>
          {/* Save */}
          <button
            onClick={handleSave}
            disabled={saveStatus === 'saving'}
            style={{
              display: 'flex', alignItems: 'center', gap: 6,
              background: saveStatus === 'saved' ? '#10b981' : saveStatus === 'error' ? '#ef4444' : 'var(--gradient-primary)',
              color: 'white',
              border: 'none', padding: '6px 14px', borderRadius: 6,
              cursor: saveStatus === 'saving' ? 'wait' : 'pointer',
              fontWeight: 600, fontSize: 13,
              opacity: saveStatus === 'saving' ? 0.7 : 1,
            }}
          >
            <Save size={14} />
            {saveStatus === 'saving' ? 'Saving...' : saveStatus === 'saved' ? 'Saved!' : saveStatus === 'error' ? 'Error' : 'Save'}
          </button>
          {/* Export */}
          <button
            onClick={handleExport}
            style={{
              display: 'flex', alignItems: 'center', gap: 6,
              background: 'var(--bg-hover)', color: 'var(--text-primary)',
              border: '1px solid var(--border)', padding: '6px 14px', borderRadius: 6,
              cursor: 'pointer', fontWeight: 600, fontSize: 13,
            }}
          >
            <Download size={14} /> Export
          </button>
          {onRankingsUpload && <FileUploadButton label="Upload Rankings CSV" onUpload={onRankingsUpload} />}
        </div>
      </div>

      {/* Position toggle */}
      <div style={{ display: 'flex', gap: 6, marginBottom: 12, flexWrap: 'wrap' }}>
        {VIEWS.map(v => {
          const isActive = viewMode === v;
          const posColor = v === 'overall' ? null : POS_COLORS[v];
          return (
            <button
              key={v}
              onClick={() => { setViewMode(v); setSearchTerm(''); }}
              style={{
                background: isActive
                  ? (posColor ? `${posColor}20` : 'var(--bg-hover)')
                  : 'transparent',
                border: `1px solid ${posColor ? posColor + '60' : 'var(--border)'}`,
                color: posColor || 'var(--text-primary)',
                padding: '5px 14px', borderRadius: 6, cursor: 'pointer',
                fontWeight: isActive ? 700 : 400, fontSize: 13,
              }}
            >
              {v === 'overall' ? 'Overall' : v}
            </button>
          );
        })}
        <span style={{ marginLeft: 8, fontSize: 12, color: 'var(--text-muted)', alignSelf: 'center' }}>
          {displayedPlayers.length} players
        </span>
      </div>

      {/* Search notice */}
      {isSearching && (
        <div style={{ fontSize: 12, color: 'var(--text-muted)', marginBottom: 8 }}>
          Drag disabled while searching. Clear search to reorder.
        </div>
      )}

      {/* Table */}
      <div
        ref={scrollContainerRef}
        style={{ flex: 1, minHeight: 0, overflowY: 'auto', borderRadius: 8, border: '1px solid var(--border)' }}
      >
        <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 16, tableLayout: 'fixed' }}>
          <colgroup>
            <col style={{ width: '3%' }} />
            <col style={{ width: '4%' }} />
            <col style={{ width: '5%' }} />
            <col style={{ width: '5%' }} />
            <col style={{ width: '21%' }} />
            <col style={{ width: '6%' }} />
            <col style={{ width: '15%' }} />
            <col style={{ width: '7%' }} />
            <col style={{ width: '6%' }} />
            <col style={{ width: '7%' }} />
          </colgroup>
          <thead>
            <tr style={{ position: 'sticky', top: 0, background: 'var(--bg-card)', zIndex: 2 }}>
              <th style={{ padding: '10px 5px' }} />
              <th style={{ padding: '10px 5px', textAlign: 'center', color: 'var(--text-secondary)', fontWeight: 600, fontSize: 15 }}>#</th>
              <th style={{ padding: '10px 5px', textAlign: 'center', color: 'var(--text-secondary)', fontWeight: 600, fontSize: 15 }}>Pos#</th>
              <th style={{ padding: '10px 5px', textAlign: 'center', color: 'var(--text-secondary)', fontWeight: 600, fontSize: 15 }}>Tier</th>
              <th style={{ padding: '10px 6px', textAlign: 'left', color: 'var(--text-secondary)', fontWeight: 600, fontSize: 15, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>Player</th>
              <th style={{ padding: '10px 5px', color: 'var(--text-secondary)', fontWeight: 600, fontSize: 15 }}>Pos</th>
              <th style={{ padding: '10px 5px', color: 'var(--text-secondary)', fontWeight: 600, fontSize: 15 }}>Team</th>
              <th style={{ padding: '10px 5px', color: 'var(--text-secondary)', fontWeight: 600, fontSize: 15 }}>ADP</th>
              <th style={{ padding: '10px 5px', color: 'var(--text-secondary)', fontWeight: 600, fontSize: 15 }}>Diff</th>
              <th style={{ padding: '10px 5px', color: 'var(--text-secondary)', fontWeight: 600, fontSize: 15 }}>Proj</th>
            </tr>
          </thead>
          <tbody>
            {displayedPlayers.map((player, idx) => (
              <RankingRow
                key={player.id}
                player={player}
                displayRank={idx + 1}
                posRank={posRankMap.get(player.id) || ''}
                tier={tierMap.get(player.id) || 1}
                isDragSource={dragPlayerRef.current?.id === player.id}
                isDropTarget={dropTargetId === player.id}
                onDragStart={handleDragStart}
                onDragOver={handleDragOver}
                onDrop={handleDrop}
                onDragEnd={handleDragEnd}
                onTierToggle={handleTierToggle}
                hasTierAbove={idx === 0 || tierMap.get(player.id) !== tierMap.get(displayedPlayers[idx - 1].id)}
                canDrag={canDrag}
                tierLabelText={effectiveTierLabels.get(player.id) || getTierLabel(tierMap.get(player.id) || 1)}
                onTierLabelChange={handleTierLabelChange}
              />
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
