import React, { useState, useMemo, useRef, useCallback, useEffect, useLayoutEffect } from 'react';
import { useVirtualizer } from '@tanstack/react-virtual';
import { GripVertical, Lock, Unlock, X, Save } from 'lucide-react';
import { DndContext, PointerSensor, useSensor, useSensors } from '@dnd-kit/core';
import { SortableContext, verticalListSortingStrategy, useSortable } from '@dnd-kit/sortable';
import { SearchInput } from '../filters';
import CompareCurves from './CompareCurves';
import { buildPlayersFromSource, deriveTierBreaks, getTierLabel, getTierColor } from './buildPlayers';
import { saveRankingsToAssets } from '../../utils/rankingsExport';
import { pointerInsertionPoint, resolveDropTargetId } from './tierEditingHelpers';
import {
  TierDividerEditable,
  TierInsertZone,
  PointerTrackingOverlay,
} from './tierEditingShared';
import s from './CompareView.module.css';

const ROW_HEIGHT = 40;
const TIER_DIVIDER_HEIGHT = 36;
const TIER_INSERT_HEIGHT = 14;
const VIEWS = ['overall', 'QB', 'RB', 'WR', 'TE'];

const POS_COLORS = {
  QB: 'var(--pos-qb)',
  RB: 'var(--pos-rb)',
  WR: 'var(--pos-wr)',
  TE: 'var(--pos-te)',
};

const CompareRow = React.memo(function CompareRow({
  player, displayRank, isHovered, isSearchMatch, onHover, onLeave, canDrag, accentColor,
}) {
  const { attributes, listeners, setNodeRef, isDragging } = useSortable({
    id: player.id,
    disabled: !canDrag,
  });
  const pos = player.slotName || 'N/A';
  const posColor = POS_COLORS[pos] || 'var(--text-muted)';

  return (
    <div
      ref={setNodeRef}
      className={[
        s.compareRow,
        isHovered ? s.rowHovered : '',
        isSearchMatch ? s.rowSearchMatch : '',
      ].filter(Boolean).join(' ')}
      style={{
        opacity: isDragging ? 0.3 : 1,
        cursor: canDrag ? 'grab' : 'default',
        boxShadow: isHovered ? `inset 3px 0 0 ${accentColor}` : undefined,
      }}
      onMouseEnter={() => onHover(player.id)}
      onMouseLeave={onLeave}
    >
      <div className={s.gripCell} {...listeners} {...attributes}>
        {canDrag && <GripVertical size={12} />}
      </div>
      <div className={s.rankCell}>{displayRank}</div>
      <div className={s.nameCell} style={{ borderLeft: `3px solid ${posColor}` }}>
        <span className={s.nameText}>{player.name}</span>
      </div>
      <div className={s.posBadgeCell}>
        <span className={`badge badge-${pos.toLowerCase()}`}>{pos}</span>
      </div>
      <div className={s.adpCell}>{player.adpStr}</div>
    </div>
  );
});

function MirrorPill({ proposal, onApply, onDismiss }) {
  if (!proposal) return null;
  const { toPlatform, delta, targetRank } = proposal;
  const sign = delta > 0 ? '+' : '';
  const label = `Apply to ${toPlatform === 'underdog' ? 'UD' : 'DK'} (${sign}${delta})`;
  return (
    <div className={s.mirrorPill}>
      <button onClick={onApply} className={s.mirrorPillApply} title={`Move to rank ${targetRank}`}>
        {label}
      </button>
      <button onClick={onDismiss} className={s.mirrorPillDismiss} title="Dismiss">
        <X size={12} />
      </button>
    </div>
  );
}

export default function CompareView({
  rankingsByPlatform = {},
  adpByPlatform = {},
}) {
  /* ── per-platform ranked lists + tier breaks ───────────────────────── */
  const [udRanked, setUdRanked] = useState([]);
  const [dkRanked, setDkRanked] = useState([]);
  const [udSource, setUdSource] = useState(null); // 'saved' | 'adp'
  const [dkSource, setDkSource] = useState(null);
  const [udBreaks, setUdBreaks] = useState(new Set());
  const [dkBreaks, setDkBreaks] = useState(new Set());
  const [udTierLabels, setUdTierLabels] = useState({});
  const [dkTierLabels, setDkTierLabels] = useState({});

  // Track input identity to avoid re-seeding on every render
  const seededUdRef = useRef(null);
  const seededDkRef = useRef(null);

  useEffect(() => {
    const projMap = adpByPlatform?.underdog?.projPointsMap ?? {};
    const saved = rankingsByPlatform?.underdog;
    const adp = adpByPlatform?.underdog?.latestRows ?? [];
    const sourceArr = saved?.length > 0 ? saved : adp;
    if (sourceArr === seededUdRef.current) return;
    seededUdRef.current = sourceArr;
    let players = [];
    if (saved?.length > 0) {
      players = buildPlayersFromSource(saved, projMap, false);
      setUdSource('saved');
    } else if (adp.length > 0) {
      players = buildPlayersFromSource(adp, projMap, true);
      setUdSource('adp');
    } else {
      setUdSource(null);
    }
    setUdRanked(players);
    const { breaks, labels } = deriveTierBreaks(players);
    setUdBreaks(breaks);
    setUdTierLabels(labels);
  }, [rankingsByPlatform?.underdog, adpByPlatform?.underdog]);

  useEffect(() => {
    const projMap = adpByPlatform?.draftkings?.projPointsMap ?? {};
    const saved = rankingsByPlatform?.draftkings;
    const adp = adpByPlatform?.draftkings?.latestRows ?? [];
    const sourceArr = saved?.length > 0 ? saved : adp;
    if (sourceArr === seededDkRef.current) return;
    seededDkRef.current = sourceArr;
    let players = [];
    if (saved?.length > 0) {
      players = buildPlayersFromSource(saved, projMap, false);
      setDkSource('saved');
    } else if (adp.length > 0) {
      players = buildPlayersFromSource(adp, projMap, true);
      setDkSource('adp');
    } else {
      setDkSource(null);
    }
    setDkRanked(players);
    const { breaks, labels } = deriveTierBreaks(players);
    setDkBreaks(breaks);
    setDkTierLabels(labels);
  }, [rankingsByPlatform?.draftkings, adpByPlatform?.draftkings]);

  /* ── controls ─────────────────────────────────────────────────────── */
  const [viewMode, setViewMode] = useState('overall');
  const [searchTerm, setSearchTerm] = useState('');
  const [moversThreshold, setMoversThreshold] = useState(0);
  const [scrollLocked, setScrollLocked] = useState(true);
  const [activePlayerId, setActivePlayerId] = useState(null);
  const [mirrorProposal, setMirrorProposal] = useState(null);

  const isSearching = searchTerm.trim().length > 0;
  const canDrag = !isSearching;

  /* ── rank maps (by canonical id) ──────────────────────────────────── */
  const udRankMap = useMemo(() => {
    const m = new Map();
    udRanked.forEach((p, i) => m.set(p.id, i + 1));
    return m;
  }, [udRanked]);
  const dkRankMap = useMemo(() => {
    const m = new Map();
    dkRanked.forEach((p, i) => m.set(p.id, i + 1));
    return m;
  }, [dkRanked]);

  /* ── filter helper applied to both columns ────────────────────────── */
  const passesFilters = useCallback((player) => {
    if (viewMode !== 'overall' && player.slotName !== viewMode) return false;
    if (isSearching) {
      const q = searchTerm.toLowerCase();
      const hit = player.name.toLowerCase().includes(q) ||
        (player.teamName && player.teamName.toLowerCase().includes(q));
      if (!hit) return false;
    }
    if (moversThreshold > 0) {
      const u = udRankMap.get(player.id);
      const d = dkRankMap.get(player.id);
      if (u != null && d != null && Math.abs(u - d) < moversThreshold) return false;
    }
    return true;
  }, [viewMode, isSearching, searchTerm, moversThreshold, udRankMap, dkRankMap]);

  const udDisplayed = useMemo(() => udRanked.filter(passesFilters), [udRanked, passesFilters]);
  const dkDisplayed = useMemo(() => dkRanked.filter(passesFilters), [dkRanked, passesFilters]);

  /* ── displayed rank lookup (1-indexed positions in each filtered column) ── */
  const udDisplayRankMap = useMemo(() => {
    const m = new Map();
    udDisplayed.forEach((p, i) => m.set(p.id, i + 1));
    return m;
  }, [udDisplayed]);
  const dkDisplayRankMap = useMemo(() => {
    const m = new Map();
    dkDisplayed.forEach((p, i) => m.set(p.id, i + 1));
    return m;
  }, [dkDisplayed]);

  /* ── tier number per player (built from full ranked list) ─────────── */
  const udTierMap = useMemo(() => {
    const m = new Map();
    let tier = 1;
    udRanked.forEach((p, idx) => {
      if (idx > 0 && udBreaks.has(p.id)) tier++;
      m.set(p.id, tier);
    });
    return m;
  }, [udRanked, udBreaks]);
  const dkTierMap = useMemo(() => {
    const m = new Map();
    let tier = 1;
    dkRanked.forEach((p, idx) => {
      if (idx > 0 && dkBreaks.has(p.id)) tier++;
      m.set(p.id, tier);
    });
    return m;
  }, [dkRanked, dkBreaks]);

  /* ── flat items (interleave tier dividers + insert zones between players) ── */
  const buildFlatItems = useCallback((displayed, tierMap, labels) => {
    if (displayed.length === 0) return { items: [], yMap: new Map() };
    const items = [];
    const yMap = new Map();
    let y = 0;
    let lastTier = -1;
    displayed.forEach((p, idx) => {
      const playerTier = tierMap.get(p.id) ?? 1;
      const hasTierAbove = playerTier !== lastTier;
      if (hasTierAbove) {
        const labelKey = idx === 0 ? '__tier1__' : p.id;
        const label = labels[labelKey] || getTierLabel(playerTier);
        const color = getTierColor(playerTier);
        items.push({
          type: 'tier',
          key: `tier-${p.id}`,
          tierNum: playerTier,
          tierColor: color,
          tierLabel: label,
          playerId: p.id,
          isFirstTier: idx === 0,
          height: TIER_DIVIDER_HEIGHT,
          y,
        });
        y += TIER_DIVIDER_HEIGHT;
        lastTier = playerTier;
      } else {
        items.push({
          type: 'tier-insert',
          key: `insert-${p.id}`,
          playerId: p.id,
          height: TIER_INSERT_HEIGHT,
          y,
        });
        y += TIER_INSERT_HEIGHT;
      }
      yMap.set(p.id, y);
      items.push({
        type: 'player',
        key: p.id,
        player: p,
        displayRank: idx + 1,
        height: ROW_HEIGHT,
        y,
      });
      y += ROW_HEIGHT;
    });
    return { items, yMap };
  }, []);

  const { items: udFlatItems, yMap: udPlayerYMap } = useMemo(
    () => buildFlatItems(udDisplayed, udTierMap, udTierLabels),
    [udDisplayed, udTierMap, udTierLabels, buildFlatItems]
  );
  const { items: dkFlatItems, yMap: dkPlayerYMap } = useMemo(
    () => buildFlatItems(dkDisplayed, dkTierMap, dkTierLabels),
    [dkDisplayed, dkTierMap, dkTierLabels, buildFlatItems]
  );

  /* ── virtualizers ─────────────────────────────────────────────────── */
  const udScrollRef = useRef(null);
  const dkScrollRef = useRef(null);
  const isProgrammaticScroll = useRef(false);

  const udVirtualizer = useVirtualizer({
    count: udFlatItems.length,
    getScrollElement: () => udScrollRef.current,
    estimateSize: (i) => udFlatItems[i]?.height ?? ROW_HEIGHT,
    getItemKey: (i) => udFlatItems[i]?.key ?? i,
    overscan: 12,
  });
  const dkVirtualizer = useVirtualizer({
    count: dkFlatItems.length,
    getScrollElement: () => dkScrollRef.current,
    estimateSize: (i) => dkFlatItems[i]?.height ?? ROW_HEIGHT,
    getItemKey: (i) => dkFlatItems[i]?.key ?? i,
    overscan: 12,
  });

  /* ── scroll sync ──────────────────────────────────────────────────── */
  const onScrollContainer = useCallback((source) => () => {
    if (!scrollLocked) return;
    if (isProgrammaticScroll.current) {
      isProgrammaticScroll.current = false;
      return;
    }
    const sourceEl = source === 'ud' ? udScrollRef.current : dkScrollRef.current;
    const targetEl = source === 'ud' ? dkScrollRef.current : udScrollRef.current;
    if (!sourceEl || !targetEl) return;
    if (Math.abs(targetEl.scrollTop - sourceEl.scrollTop) > 0.5) {
      isProgrammaticScroll.current = true;
      targetEl.scrollTop = sourceEl.scrollTop;
    }
  }, [scrollLocked]);

  /* ── helper: find the flatItems index of a player ─────────────────── */
  const findPlayerFlatIndex = useCallback((items, playerId) => {
    return items.findIndex(it => it.type === 'player' && it.player.id === playerId);
  }, []);

  /* ── auto-scroll-to single search match ───────────────────────────── */
  useEffect(() => {
    if (!isSearching) return;
    if (udDisplayed.length === 1 && dkDisplayed.length === 1 &&
        udDisplayed[0].id === dkDisplayed[0].id) {
      const playerId = udDisplayed[0].id;
      const udIdx = findPlayerFlatIndex(udFlatItems, playerId);
      const dkIdx = findPlayerFlatIndex(dkFlatItems, playerId);
      if (udIdx >= 0) udVirtualizer.scrollToIndex(udIdx, { align: 'center' });
      if (dkIdx >= 0) dkVirtualizer.scrollToIndex(dkIdx, { align: 'center' });
    }
  }, [isSearching, udDisplayed, dkDisplayed, udFlatItems, dkFlatItems, udVirtualizer, dkVirtualizer, findPlayerFlatIndex]);

  /* ── viewport height tracking for curve canvas ────────────────────── */
  const [viewportHeight, setViewportHeight] = useState(600);
  const containerRef = useRef(null);
  useLayoutEffect(() => {
    if (!containerRef.current) return;
    const measure = () => {
      const el = containerRef.current?.querySelector(`.${s.columnsArea}`);
      if (el) setViewportHeight(el.clientHeight);
    };
    measure();
    const ro = new ResizeObserver(measure);
    ro.observe(containerRef.current);
    return () => ro.disconnect();
  }, []);

  /* ── scroll offsets (re-render on scroll for curve refresh) ───────── */
  const [scrollOffsetUd, setScrollOffsetUd] = useState(0);
  const [scrollOffsetDk, setScrollOffsetDk] = useState(0);
  useEffect(() => {
    const u = udScrollRef.current;
    const d = dkScrollRef.current;
    if (!u || !d) return;
    // Separate raf ids — when scroll-sync fires both handlers in the same frame,
    // a shared raf id would let one cancel the other and leave one offset stale.
    let rafU = 0;
    let rafD = 0;
    const onU = () => {
      cancelAnimationFrame(rafU);
      rafU = requestAnimationFrame(() => setScrollOffsetUd(u.scrollTop));
    };
    const onD = () => {
      cancelAnimationFrame(rafD);
      rafD = requestAnimationFrame(() => setScrollOffsetDk(d.scrollTop));
    };
    u.addEventListener('scroll', onU, { passive: true });
    d.addEventListener('scroll', onD, { passive: true });
    return () => {
      u.removeEventListener('scroll', onU);
      d.removeEventListener('scroll', onD);
      cancelAnimationFrame(rafU);
      cancelAnimationFrame(rafD);
    };
  }, [udFlatItems.length, dkFlatItems.length]);

  /* ── wheel events outside the column scroll containers (gutter / headers /
       any whitespace between the columns) forward to both columns. The native
       scroll path on each column handles wheel-over-column directly. */
  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;
    const onWheel = (e) => {
      const ud = udScrollRef.current;
      const dk = dkScrollRef.current;
      if (!ud || !dk) return;
      // Skip if the wheel happened inside a column's scroll container — let
      // native scroll handle it (sync handler propagates to the other side).
      if (ud.contains(e.target) || dk.contains(e.target)) return;
      e.preventDefault();
      ud.scrollTop += e.deltaY;
      // When unlocked, scroll-sync won't run — scroll DK directly so the
      // gutter feels like it belongs to both columns.
      if (!scrollLocked) dk.scrollTop += e.deltaY;
    };
    el.addEventListener('wheel', onWheel, { passive: false });
    return () => el.removeEventListener('wheel', onWheel);
  }, [scrollLocked]);

  /* ── curve data for visible-or-overscan players ───────────────────── */
  const curves = useMemo(() => {
    if (!udPlayerYMap.size || !dkPlayerYMap.size) return [];
    const out = [];
    const seen = new Set();

    const overscan = ROW_HEIGHT * 6;
    const udTop = scrollOffsetUd - overscan;
    const udBot = scrollOffsetUd + viewportHeight + overscan;
    const dkTop = scrollOffsetDk - overscan;
    const dkBot = scrollOffsetDk + viewportHeight + overscan;

    const addCurve = (id) => {
      if (seen.has(id)) return;
      const lr = udDisplayRankMap.get(id);
      const rr = dkDisplayRankMap.get(id);
      const leftYContent = udPlayerYMap.get(id);
      const rightYContent = dkPlayerYMap.get(id);
      if (lr == null || rr == null || leftYContent == null || rightYContent == null) return;
      const leftY = leftYContent + ROW_HEIGHT / 2 - scrollOffsetUd;
      const rightY = rightYContent + ROW_HEIGHT / 2 - scrollOffsetDk;
      const leftVisible = leftY >= -ROW_HEIGHT && leftY <= viewportHeight + ROW_HEIGHT;
      const rightVisible = rightY >= -ROW_HEIGHT && rightY <= viewportHeight + ROW_HEIGHT;
      if (!leftVisible && !rightVisible) return;
      const player = udDisplayed.find(p => p.id === id) || dkDisplayed.find(p => p.id === id);
      out.push({
        id,
        name: player?.name || '',
        leftY,
        rightY,
        leftRank: lr,
        rightRank: rr,
        leftVisible,
        rightVisible,
      });
      seen.add(id);
    };

    udPlayerYMap.forEach((y, id) => {
      if (y >= udTop && y <= udBot) addCurve(id);
    });
    dkPlayerYMap.forEach((y, id) => {
      if (y >= dkTop && y <= dkBot) addCurve(id);
    });
    return out;
  }, [udPlayerYMap, dkPlayerYMap, udDisplayed, dkDisplayed, udDisplayRankMap, dkDisplayRankMap, scrollOffsetUd, scrollOffsetDk, viewportHeight]);

  /* ── DnD setup (per-column) ───────────────────────────────────────── */
  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 2 } }));

  /* Per-column active-drag id (for pointer-tracking overlay) */
  const [activeUdId, setActiveUdId] = useState(null);
  const [activeDkId, setActiveDkId] = useState(null);

  /* ── Tier toggle / label-change (per column) ───────────────────────── */
  const handleUdTierToggle = useCallback((playerId) => {
    setUdBreaks(prev => {
      const next = new Set(prev);
      if (next.has(playerId)) next.delete(playerId);
      else next.add(playerId);
      return next;
    });
  }, []);

  const handleDkTierToggle = useCallback((playerId) => {
    setDkBreaks(prev => {
      const next = new Set(prev);
      if (next.has(playerId)) next.delete(playerId);
      else next.add(playerId);
      return next;
    });
  }, []);

  const handleUdTierLabelChange = useCallback((playerId, newLabel) => {
    const key = udRanked.length > 0 && udRanked[0].id === playerId ? '__tier1__' : playerId;
    setUdTierLabels(prev => ({ ...prev, [key]: newLabel }));
  }, [udRanked]);

  const handleDkTierLabelChange = useCallback((playerId, newLabel) => {
    const key = dkRanked.length > 0 && dkRanked[0].id === playerId ? '__tier1__' : playerId;
    setDkTierLabels(prev => ({ ...prev, [key]: newLabel }));
  }, [dkRanked]);

  const buildProposal = useCallback((playerId, delta, fromPlatform) => {
    const toPlatform = fromPlatform === 'underdog' ? 'draftkings' : 'underdog';
    const otherCurrent = fromPlatform === 'underdog' ? dkRankMap.get(playerId) : udRankMap.get(playerId);
    const otherLength = fromPlatform === 'underdog' ? dkRanked.length : udRanked.length;
    const targetVirtualizer = fromPlatform === 'underdog' ? dkVirtualizer : udVirtualizer;
    const targetItems = fromPlatform === 'underdog' ? dkFlatItems : udFlatItems;
    if (delta === 0 || otherCurrent == null) return null;
    const targetRank = Math.max(1, Math.min(otherLength, otherCurrent + delta));
    // Find the player at targetRank in the displayed list, then map to flatItems index.
    const targetDisplayed = fromPlatform === 'underdog' ? dkDisplayed : udDisplayed;
    const targetPlayer = targetDisplayed[targetRank - 1];
    if (targetPlayer) {
      const flatIdx = findPlayerFlatIndex(targetItems, targetPlayer.id);
      if (flatIdx >= 0) targetVirtualizer.scrollToIndex(flatIdx, { align: 'center' });
    }
    return { playerId, fromPlatform, toPlatform, targetRank, delta };
  }, [udRankMap, dkRankMap, udRanked.length, dkRanked.length, udVirtualizer, dkVirtualizer, udFlatItems, dkFlatItems, udDisplayed, dkDisplayed, findPlayerFlatIndex]);

  /* Per-column drag-end factory. Handles three cases:
     1. Tier-break drag (active id starts with `tier-drag:`) — moves the break
        between players, migrates label, no mirror proposal.
     2. Player dropped on a tier-break drop zone — boundary-aware reorder so
        the player lands as the first row in the new tier.
     3. Player dropped on insert zone or another player — regular reorder,
        plus break reassignment if target player owned a break, plus mirror
        proposal calc. */
  const buildHandleDragEnd = useCallback((opts) => (event) => {
    const { setRanked, ranked, breaks, setBreaks, setLabels, rankMap, setActiveId, platform } = opts;
    setActiveId(null);
    const { active, over } = event;
    if (!over) return;

    const activeIdStr = String(active.id);

    // ── Tier-break drag ────────────────────────────────────────────
    if (activeIdStr.startsWith('tier-drag:')) {
      const sourcePlayerId = activeIdStr.slice('tier-drag:'.length);
      const targetPlayerId = resolveDropTargetId(over.id);
      if (!targetPlayerId || sourcePlayerId === targetPlayerId) return;
      if (!breaks.has(sourcePlayerId)) return;

      setBreaks(prev => {
        const next = new Set(prev);
        next.delete(sourcePlayerId);
        next.add(targetPlayerId);
        return next;
      });
      setLabels(prev => {
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

    // ── Player drag ────────────────────────────────────────────────
    const overData = over.data?.current;
    const targetId = resolveDropTargetId(over.id);
    if (!targetId) return;

    const fromIdx = ranked.findIndex(p => p.id === active.id);
    const toIdx = ranked.findIndex(p => p.id === targetId);
    if (fromIdx === -1 || toIdx === -1) return;

    const isTierBreakDrop = overData?.kind === 'tier-break';
    const oldRank = rankMap.get(active.id);

    // Drop on tier break — three boundary sub-cases.
    if (isTierBreakDrop) {
      // Dragging the first player in a tier upward across the break.
      if (active.id === targetId && breaks.has(active.id)) {
        const nextPlayer = ranked[fromIdx + 1];
        setBreaks(prev => {
          const next = new Set(prev);
          next.delete(active.id);
          if (nextPlayer) next.add(nextPlayer.id);
          return next;
        });
        setLabels(prev => {
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
      if (fromIdx + 1 === toIdx && breaks.has(targetId)) {
        setBreaks(prev => {
          const next = new Set(prev);
          next.delete(targetId);
          next.add(active.id);
          return next;
        });
        setLabels(prev => {
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

      // General case: non-adjacent drop on a tier break — reorder AND reassign
      // the break to the dragged player so they land as the first in the tier.
      if (active.id !== targetId) {
        let newRank = null;
        setRanked(prev => {
          const fi = prev.findIndex(p => p.id === active.id);
          const ti = prev.findIndex(p => p.id === targetId);
          if (fi === -1 || ti === -1) return prev;
          const newList = [...prev];
          const [moved] = newList.splice(fi, 1);
          const insertIdx = fi < ti ? ti - 1 : ti;
          newList.splice(insertIdx, 0, moved);
          newRank = insertIdx + 1;
          return newList;
        });
        if (breaks.has(targetId)) {
          setBreaks(prev => {
            const next = new Set(prev);
            next.delete(targetId);
            next.add(active.id);
            return next;
          });
          setLabels(prev => {
            const next = { ...prev };
            const label = next[targetId];
            if (label !== undefined) {
              delete next[targetId];
              next[active.id] = label;
            }
            return next;
          });
        }
        if (newRank != null && oldRank != null) {
          setMirrorProposal(buildProposal(active.id, newRank - oldRank, platform));
        }
        return;
      }
    }

    if (active.id === targetId) return;

    // Standard reorder.
    let newRank = null;
    setRanked(prev => {
      const fi = prev.findIndex(p => p.id === active.id);
      const ti = prev.findIndex(p => p.id === targetId);
      if (fi === -1 || ti === -1) return prev;
      const newList = [...prev];
      const [moved] = newList.splice(fi, 1);
      const insertIdx = fi < ti ? ti - 1 : ti;
      newList.splice(insertIdx, 0, moved);
      newRank = insertIdx + 1;
      return newList;
    });

    // If the target player owned a break, reassign it to the dragged player.
    if (breaks.has(targetId)) {
      setBreaks(prev => {
        const next = new Set(prev);
        next.delete(targetId);
        next.add(active.id);
        return next;
      });
      setLabels(prev => {
        const next = { ...prev };
        const label = next[targetId];
        if (label !== undefined) {
          delete next[targetId];
          next[active.id] = label;
        }
        return next;
      });
    }

    if (newRank != null && oldRank != null) {
      setMirrorProposal(buildProposal(active.id, newRank - oldRank, platform));
    }
  }, [buildProposal]);

  const handleUdDragStart = useCallback((event) => setActiveUdId(event.active.id), []);
  const handleDkDragStart = useCallback((event) => setActiveDkId(event.active.id), []);

  const handleUdDragEnd = useCallback((event) => {
    return buildHandleDragEnd({
      setRanked: setUdRanked,
      ranked: udRanked,
      breaks: udBreaks,
      setBreaks: setUdBreaks,
      setLabels: setUdTierLabels,
      rankMap: udRankMap,
      setActiveId: setActiveUdId,
      platform: 'underdog',
    })(event);
  }, [buildHandleDragEnd, udRanked, udBreaks, udRankMap]);

  const handleDkDragEnd = useCallback((event) => {
    return buildHandleDragEnd({
      setRanked: setDkRanked,
      ranked: dkRanked,
      breaks: dkBreaks,
      setBreaks: setDkBreaks,
      setLabels: setDkTierLabels,
      rankMap: dkRankMap,
      setActiveId: setActiveDkId,
      platform: 'draftkings',
    })(event);
  }, [buildHandleDragEnd, dkRanked, dkBreaks, dkRankMap]);

  /* ── overlay lookups ─────────────────────────────────────────────── */
  const udActiveStr = activeUdId ? String(activeUdId) : '';
  const dkActiveStr = activeDkId ? String(activeDkId) : '';
  const udTierDragActive = udActiveStr.startsWith('tier-drag:');
  const dkTierDragActive = dkActiveStr.startsWith('tier-drag:');
  const udActivePlayer = (!udTierDragActive && activeUdId) ? udRanked.find(p => p.id === activeUdId) : null;
  const dkActivePlayer = (!dkTierDragActive && activeDkId) ? dkRanked.find(p => p.id === activeDkId) : null;
  const udActiveTierDrag = udTierDragActive ? (() => {
    const playerId = udActiveStr.slice('tier-drag:'.length);
    const tierNum = udTierMap.get(playerId) || 1;
    return {
      playerId,
      tierLabelText: udTierLabels[playerId] || udTierLabels['__tier1__'] || getTierLabel(tierNum),
      tierColor: getTierColor(tierNum),
    };
  })() : null;
  const dkActiveTierDrag = dkTierDragActive ? (() => {
    const playerId = dkActiveStr.slice('tier-drag:'.length);
    const tierNum = dkTierMap.get(playerId) || 1;
    return {
      playerId,
      tierLabelText: dkTierLabels[playerId] || dkTierLabels['__tier1__'] || getTierLabel(tierNum),
      tierColor: getTierColor(tierNum),
    };
  })() : null;

  /* ── apply mirror proposal ────────────────────────────────────────── */
  const applyMirror = useCallback(() => {
    if (!mirrorProposal) return;
    const { playerId, toPlatform, targetRank } = mirrorProposal;
    if (toPlatform === 'underdog') {
      setUdRanked(prev => {
        const fi = prev.findIndex(p => p.id === playerId);
        if (fi === -1) return prev;
        const next = [...prev];
        const [moved] = next.splice(fi, 1);
        next.splice(Math.max(0, targetRank - 1), 0, moved);
        return next;
      });
    } else {
      setDkRanked(prev => {
        const fi = prev.findIndex(p => p.id === playerId);
        if (fi === -1) return prev;
        const next = [...prev];
        const [moved] = next.splice(fi, 1);
        next.splice(Math.max(0, targetRank - 1), 0, moved);
        return next;
      });
    }
    setMirrorProposal(null);
  }, [mirrorProposal]);

  /* ── auto-dismiss mirror proposal after 10s ───────────────────────── */
  useEffect(() => {
    if (!mirrorProposal) return;
    const t = setTimeout(() => setMirrorProposal(null), 10000);
    return () => clearTimeout(t);
  }, [mirrorProposal]);

  /* ── save both platforms ──────────────────────────────────────────── */
  const [saveStatus, setSaveStatus] = useState(null);
  const handleSave = useCallback(async () => {
    setSaveStatus('saving');
    try {
      await Promise.all([
        saveRankingsToAssets(udRanked, udTierMap, udTierLabels, 'underdog'),
        saveRankingsToAssets(dkRanked, dkTierMap, dkTierLabels, 'draftkings'),
      ]);
      setSaveStatus('saved');
      setTimeout(() => setSaveStatus(null), 2000);
    } catch (err) {
      console.error('Save failed:', err);
      setSaveStatus('error');
      setTimeout(() => setSaveStatus(null), 3000);
    }
  }, [udRanked, udTierMap, udTierLabels, dkRanked, dkTierMap, dkTierLabels]);

  /* ── empty state ──────────────────────────────────────────────────── */
  if (udRanked.length === 0 && dkRanked.length === 0) {
    return (
      <div className={s.emptyState}>
        No rankings or ADP loaded for either platform — sync data or upload a CSV to compare.
      </div>
    );
  }

  /* ── header pills ─────────────────────────────────────────────────── */
  const sourcePill = (source) => {
    if (source === 'saved') return <span className={s.sourcePillSaved}>Saved</span>;
    if (source === 'adp') return <span className={s.sourcePillAdp}>ADP fallback</span>;
    return <span className={s.sourcePillEmpty}>—</span>;
  };

  /* ── render ───────────────────────────────────────────────────────── */
  return (
    <div className={s.root} ref={containerRef}>
      {/* Compare controls row */}
      <div className={s.controlsRow}>
        <SearchInput
          value={searchTerm}
          onChange={setSearchTerm}
          placeholder="Search both columns..."
          delay={150}
        />

        <div className="filter-chip-group">
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
        </div>

        <label className={s.sliderLabel}>
          Movers ≥
          <input
            type="range"
            min={0}
            max={50}
            step={1}
            value={moversThreshold}
            onChange={(e) => setMoversThreshold(parseInt(e.target.value, 10))}
            className={s.slider}
          />
          <span className={s.sliderValue}>{moversThreshold}</span>
        </label>

        <button
          className={s.lockToggle}
          onClick={() => setScrollLocked(v => !v)}
          title={scrollLocked ? 'Scroll lock on — click to unlock' : 'Scroll lock off — click to lock'}
        >
          {scrollLocked ? <Lock size={14} /> : <Unlock size={14} />}
          {scrollLocked ? 'Locked' : 'Unlocked'}
        </button>

        <button
          onClick={handleSave}
          disabled={saveStatus === 'saving'}
          className={s.saveBtn}
          title="Save both Underdog and DraftKings rankings"
          style={{
            background: saveStatus === 'saved' ? '#10b981' : saveStatus === 'error' ? '#ef4444' : 'var(--gradient-accent)',
            color: (saveStatus === 'saved' || saveStatus === 'error') ? 'white' : undefined,
            cursor: saveStatus === 'saving' ? 'wait' : 'pointer',
            opacity: saveStatus === 'saving' ? 0.7 : 1,
          }}
        >
          <Save size={14} />
          {saveStatus === 'saving' ? 'Saving...' : saveStatus === 'saved' ? 'Saved!' : saveStatus === 'error' ? 'Error' : 'Save Both'}
        </button>
      </div>

      {/* Column header strips */}
      <div className={s.columnHeaders}>
        <div className={s.columnHeader} style={{ borderBottomColor: 'var(--platform-ud)' }}>
          <span className={s.platformLabel} style={{ color: 'var(--platform-ud)' }}>Underdog</span>
          {sourcePill(udSource)}
          <span className={s.countLabel}>{udDisplayed.length}</span>
        </div>
        <div className={s.gutterHeader} aria-hidden="true" />
        <div className={s.columnHeader} style={{ borderBottomColor: 'var(--platform-dk)' }}>
          <span className={s.platformLabel} style={{ color: 'var(--platform-dk)' }}>DraftKings</span>
          {sourcePill(dkSource)}
          <span className={s.countLabel}>{dkDisplayed.length}</span>
        </div>
      </div>

      {/* Columns area */}
      <div className={s.columnsArea}>
        {/* UD column */}
        <div className={s.column}>
          <DndContext
            sensors={sensors}
            collisionDetection={pointerInsertionPoint}
            onDragStart={handleUdDragStart}
            onDragEnd={handleUdDragEnd}
            onDragCancel={() => setActiveUdId(null)}
          >
            <SortableContext
              items={udDisplayed.map(p => p.id)}
              strategy={verticalListSortingStrategy}
              disabled={!canDrag}
            >
              <div
                ref={udScrollRef}
                className={s.scrollContainer}
                onScroll={onScrollContainer('ud')}
              >
                <div style={{ height: udVirtualizer.getTotalSize(), position: 'relative' }}>
                  {udVirtualizer.getVirtualItems().map(vRow => {
                    const item = udFlatItems[vRow.index];
                    if (!item) return null;
                    const wrapperStyle = {
                      position: 'absolute', top: 0, left: 0, width: '100%',
                      height: vRow.size, transform: `translateY(${vRow.start}px)`,
                    };
                    if (item.type === 'tier') {
                      return (
                        <div key={vRow.key} style={wrapperStyle}>
                          <TierDividerEditable
                            styles={s}
                            tierColor={item.tierColor}
                            tierLabelText={item.tierLabel}
                            playerId={item.playerId}
                            onTierLabelChange={handleUdTierLabelChange}
                            onDelete={handleUdTierToggle}
                            dropId={`break:${item.playerId}`}
                            dragId={`tier-drag:${item.playerId}`}
                            canDrag={canDrag && udBreaks.has(item.playerId)}
                          />
                        </div>
                      );
                    }
                    if (item.type === 'tier-insert') {
                      return (
                        <div key={vRow.key} style={wrapperStyle}>
                          <TierInsertZone
                            styles={s}
                            playerId={item.playerId}
                            onClick={() => handleUdTierToggle(item.playerId)}
                            dropId={`insert:${item.playerId}`}
                            disabled={!canDrag}
                          />
                        </div>
                      );
                    }
                    return (
                      <div key={vRow.key} style={wrapperStyle}>
                        <CompareRow
                          player={item.player}
                          displayRank={item.displayRank}
                          isHovered={activePlayerId === item.player.id}
                          isSearchMatch={isSearching}
                          onHover={setActivePlayerId}
                          onLeave={() => setActivePlayerId(null)}
                          canDrag={canDrag}
                          accentColor="var(--platform-ud)"
                        />
                      </div>
                    );
                  })}
                  {/* Mirror ghost target on UD column */}
                  {mirrorProposal && mirrorProposal.toPlatform === 'underdog' && udDisplayed[mirrorProposal.targetRank - 1] && (
                    <div
                      className={s.ghostTarget}
                      style={{ top: udPlayerYMap.get(udDisplayed[mirrorProposal.targetRank - 1].id) ?? 0 }}
                    >
                      Proposed: {mirrorProposal.targetRank}
                    </div>
                  )}
                </div>
              </div>
            </SortableContext>
            <PointerTrackingOverlay
              styles={s}
              activePlayer={udActivePlayer}
              activeTierDrag={udActiveTierDrag}
              displayedPlayers={udDisplayed}
              accentColor="var(--platform-ud)"
            />
          </DndContext>
        </div>

        {/* Curve canvas gutter */}
        <div className={s.gutter}>
          <CompareCurves
            width={120}
            height={viewportHeight}
            curves={curves}
            activePlayerId={activePlayerId}
          />
          {/* Mirror pill positioned over the gutter */}
          <MirrorPill
            proposal={mirrorProposal}
            onApply={applyMirror}
            onDismiss={() => setMirrorProposal(null)}
          />
        </div>

        {/* DK column */}
        <div className={s.column}>
          <DndContext
            sensors={sensors}
            collisionDetection={pointerInsertionPoint}
            onDragStart={handleDkDragStart}
            onDragEnd={handleDkDragEnd}
            onDragCancel={() => setActiveDkId(null)}
          >
            <SortableContext
              items={dkDisplayed.map(p => p.id)}
              strategy={verticalListSortingStrategy}
              disabled={!canDrag}
            >
              <div
                ref={dkScrollRef}
                className={s.scrollContainer}
                onScroll={onScrollContainer('dk')}
              >
                <div style={{ height: dkVirtualizer.getTotalSize(), position: 'relative' }}>
                  {dkVirtualizer.getVirtualItems().map(vRow => {
                    const item = dkFlatItems[vRow.index];
                    if (!item) return null;
                    const wrapperStyle = {
                      position: 'absolute', top: 0, left: 0, width: '100%',
                      height: vRow.size, transform: `translateY(${vRow.start}px)`,
                    };
                    if (item.type === 'tier') {
                      return (
                        <div key={vRow.key} style={wrapperStyle}>
                          <TierDividerEditable
                            styles={s}
                            tierColor={item.tierColor}
                            tierLabelText={item.tierLabel}
                            playerId={item.playerId}
                            onTierLabelChange={handleDkTierLabelChange}
                            onDelete={handleDkTierToggle}
                            dropId={`break:${item.playerId}`}
                            dragId={`tier-drag:${item.playerId}`}
                            canDrag={canDrag && dkBreaks.has(item.playerId)}
                          />
                        </div>
                      );
                    }
                    if (item.type === 'tier-insert') {
                      return (
                        <div key={vRow.key} style={wrapperStyle}>
                          <TierInsertZone
                            styles={s}
                            playerId={item.playerId}
                            onClick={() => handleDkTierToggle(item.playerId)}
                            dropId={`insert:${item.playerId}`}
                            disabled={!canDrag}
                          />
                        </div>
                      );
                    }
                    return (
                      <div key={vRow.key} style={wrapperStyle}>
                        <CompareRow
                          player={item.player}
                          displayRank={item.displayRank}
                          isHovered={activePlayerId === item.player.id}
                          isSearchMatch={isSearching}
                          onHover={setActivePlayerId}
                          onLeave={() => setActivePlayerId(null)}
                          canDrag={canDrag}
                          accentColor="var(--platform-dk)"
                        />
                      </div>
                    );
                  })}
                  {mirrorProposal && mirrorProposal.toPlatform === 'draftkings' && dkDisplayed[mirrorProposal.targetRank - 1] && (
                    <div
                      className={s.ghostTarget}
                      style={{ top: dkPlayerYMap.get(dkDisplayed[mirrorProposal.targetRank - 1].id) ?? 0 }}
                    >
                      Proposed: {mirrorProposal.targetRank}
                    </div>
                  )}
                </div>
              </div>
            </SortableContext>
            <PointerTrackingOverlay
              styles={s}
              activePlayer={dkActivePlayer}
              activeTierDrag={dkActiveTierDrag}
              displayedPlayers={dkDisplayed}
              accentColor="var(--platform-dk)"
            />
          </DndContext>
        </div>
      </div>

      {isSearching && udDisplayed.length === 0 && dkDisplayed.length === 0 && (
        <div className={s.searchEmpty}>
          No players match &ldquo;<strong>{searchTerm}</strong>&rdquo;
        </div>
      )}
    </div>
  );
}
