import React, { useMemo, useState, useRef } from 'react';
import TabLayout from './TabLayout';

// Position palette — shared across all views
const POS_COLORS = {
  QB: '#bf44ef',
  RB: '#10b981',
  WR: '#f59e0b',
  TE: '#3b82f6',
  default: '#6b7280',
};

// Distinct palette for stack combo segments — index-based, not position-based.
const COMBO_PALETTE = [
  '#10B981', // green
  '#EC4899', // pink
  '#14B8A6', // teal
  '#F97316', // orange
  '#8B5CF6', // violet
  '#06B6D4', // cyan
  '#F43F5E', // rose
  '#A3E635', // lime
  '#60A5FA', // sky blue
  '#FB923C', // amber-orange
];

function comboColor(index) {
  return COMBO_PALETTE[index % COMBO_PALETTE.length];
}

function PlayerBadge({ name, position }) {
  return (
    <span style={{
      display: 'inline-flex', alignItems: 'center', gap: 6,
      background: 'var(--surface-2)', padding: '3px 10px',
      borderRadius: 4, border: '1px solid var(--border-subtle)', fontSize: 14,
    }}>
      <span style={{ color: POS_COLORS[position] || POS_COLORS.default, fontWeight: 800, fontSize: 12 }}>
        {position}
      </span>
      <span style={{ fontWeight: 500 }}>{name}</span>
    </span>
  );
}

// Lightweight hover tooltip for stack diversity bar segments
function SegmentTooltip({ children, label, style }) {
  const [visible, setVisible] = useState(false);
  return (
    <div
      style={{ position: 'relative', display: 'flex', height: '100%', ...style }}
      onMouseEnter={() => setVisible(true)}
      onMouseLeave={() => setVisible(false)}
    >
      {children}
      {visible && (
        <div style={{
          position: 'absolute',
          bottom: 'calc(100% + 6px)',
          left: '50%',
          transform: 'translateX(-50%)',
          background: 'var(--surface-3)',
          border: '1px solid var(--border-default)',
          borderRadius: 8,
          padding: '6px 12px',
          fontSize: 12,
          color: 'var(--text-primary)',
          whiteSpace: 'nowrap',
          zIndex: 100,
          boxShadow: '0 4px 12px rgba(0,0,0,0.3)',
          pointerEvents: 'none',
          fontFamily: 'var(--font-body)',
        }}>
          {label}
        </div>
      )}
    </div>
  );
}

export default function ComboAnalysis({ rosterData = [] }) {
  const [activeTab, setActiveTab] = useState('stacks');
  const [expandedQBs, setExpandedQBs] = useState(new Set());
  const [minCount, setMinCount] = useState(1);
  const [playerSearch, setPlayerSearch] = useState('');
  const [selectedPlayer, setSelectedPlayer] = useState('');
  const [showDropdown, setShowDropdown] = useState(false);
  const [excludeTE, setExcludeTE] = useState(false);
  const [excludeRB, setExcludeRB] = useState(false);
  const [sortKey, setSortKey] = useState('stackPct');
  const [sortDir, setSortDir] = useState('desc');
  const blurTimeout = useRef(null);

  // Group flat player rows into per-roster arrays
  const rosters = useMemo(() => {
    const map = new Map();
    rosterData.forEach(p => {
      const id = p.entry_id || 'unknown';
      if (!map.has(id)) map.set(id, []);
      map.get(id).push(p);
    });
    return Array.from(map.values());
  }, [rosterData]);

  const totalRosters = rosters.length;

  // ─── View 1: Stack Profiles ────────────────────────────────────────────────
  const stackProfilesData = useMemo(() => {
    if (activeTab !== 'stacks') return null;

    const allowedPositions = ['WR', 'TE', 'RB'].filter(pos =>
      !(pos === 'TE' && excludeTE) && !(pos === 'RB' && excludeRB)
    );

    const qbGroups = new Map();

    rosters.forEach(roster => {
      const qbs = roster.filter(p => p.position === 'QB');
      qbs.forEach(qb => {
        if (!qbGroups.has(qb.name)) {
          qbGroups.set(qb.name, { qb, totalDrafts: 0, combos: new Map() });
        }
        const group = qbGroups.get(qb.name);
        group.totalDrafts += 1;

        const teammates = roster
          .filter(p =>
            p.team === qb.team &&
            p.name !== qb.name &&
            allowedPositions.includes(p.position)
          )
          .sort((a, b) => a.name.localeCompare(b.name));

        const key = teammates.length === 0
          ? 'NAKED'
          : teammates.map(t => t.name).join(' | ');

        if (!group.combos.has(key)) {
          group.combos.set(key, { players: teammates, count: 0 });
        }
        group.combos.get(key).count += 1;
      });
    });

    return Array.from(qbGroups.values())
      .map(g => {
        const nakedCount = Array.from(g.combos.values())
          .filter(c => c.players.length === 0)
          .reduce((sum, c) => sum + c.count, 0);
        const stackPct = ((g.totalDrafts - nakedCount) / g.totalDrafts) * 100;
        return {
          ...g,
          stackPct,
          // Non-naked sorted by count desc, naked always last
          sortedCombos: [
            ...Array.from(g.combos.values()).filter(c => c.players.length > 0).sort((a, b) => b.count - a.count),
            ...Array.from(g.combos.values()).filter(c => c.players.length === 0),
          ],
        };
      })
      .sort((a, b) => b.stackPct - a.stackPct || b.totalDrafts - a.totalDrafts);
  }, [rosters, activeTab, excludeTE, excludeRB]);

  // Player names present in any stack (for autocomplete)
  const allStackPlayerNames = useMemo(() => {
    if (!stackProfilesData) return [];
    const names = new Set();
    stackProfilesData.forEach(g => {
      g.sortedCombos.forEach(c => {
        c.players.forEach(p => names.add(p.name));
      });
    });
    return [...names].sort();
  }, [stackProfilesData]);

  // Autocomplete suggestions — substring match while typing, exact match on select
  const playerSuggestions = useMemo(() => {
    if (!playerSearch.trim() || selectedPlayer) return [];
    const q = playerSearch.trim().toLowerCase();
    return allStackPlayerNames.filter(n => n.toLowerCase().includes(q)).slice(0, 8);
  }, [playerSearch, selectedPlayer, allStackPlayerNames]);

  // ─── View 2: QB Pairs ─────────────────────────────────────────────────────
  const qbPairsData = useMemo(() => {
    if (activeTab !== 'qbpairs') return null;

    const pairMap = new Map();

    rosters.forEach(roster => {
      const qbs = roster.filter(p => p.position === 'QB');
      if (qbs.length < 2) return;

      for (let i = 0; i < qbs.length; i++) {
        for (let j = i + 1; j < qbs.length; j++) {
          const sorted = [qbs[i].name, qbs[j].name].sort();
          const key = sorted.join('||');
          if (!pairMap.has(key)) {
            const [name1] = sorted;
            const p1 = qbs[i].name === name1 ? qbs[i] : qbs[j];
            const p2 = qbs[i].name === name1 ? qbs[j] : qbs[i];
            pairMap.set(key, { qb1: p1, qb2: p2, count: 0 });
          }
          pairMap.get(key).count += 1;
        }
      }
    });

    return Array.from(pairMap.values())
      .sort((a, b) => b.count - a.count)
      .slice(0, 20)
      .map((p, i) => ({
        ...p,
        rank: i + 1,
        pct: ((p.count / totalRosters) * 100).toFixed(1),
      }));
  }, [rosters, activeTab, totalRosters]);

  const toggleQB = (name) => {
    setExpandedQBs(prev => {
      const next = new Set(prev);
      if (next.has(name)) next.delete(name); else next.add(name);
      return next;
    });
  };

  const handleTabClick = (tab) => {
    setActiveTab(tab);
    setExpandedQBs(new Set());
    setPlayerSearch('');
    setSelectedPlayer('');
    setExcludeTE(false);
    setExcludeRB(false);
    setSortKey('stackPct');
    setSortDir('desc');
  };

  const handleSort = (key) => {
    if (key === sortKey) {
      setSortDir(d => d === 'desc' ? 'asc' : 'desc');
    } else {
      setSortKey(key);
      setSortDir('desc');
    }
  };

  const handleSelectPlayer = (name) => {
    clearTimeout(blurTimeout.current);
    setSelectedPlayer(name);
    setPlayerSearch(name);
    setShowDropdown(false);
    setExpandedQBs(new Set());
  };

  const handleClearPlayer = () => {
    setSelectedPlayer('');
    setPlayerSearch('');
    setExpandedQBs(new Set());
  };

  if (totalRosters === 0) {
    return (
      <div className="card" style={{ padding: 40, textAlign: 'center', color: 'var(--text-muted)' }}>
        No roster data available. Sync your portfolio to view combo analysis.
      </div>
    );
  }

  const toolbarControls = (
    <div style={{ display: 'flex', width: '100%', alignItems: 'center', justifyContent: 'space-between', gap: 8 }}>
      <div className="filter-btn-group">
        {[
          { key: 'stacks', label: 'Stack Profiles' },
          { key: 'qbpairs', label: 'QB Pairs' },
        ].map(t => (
          <button
            key={t.key}
            className={`filter-btn-group__item ${activeTab === t.key ? 'filter-btn-group__item--active' : ''}`}
            onClick={() => handleTabClick(t.key)}
          >
            {t.label}
          </button>
        ))}
      </div>

      <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
        <label className="filter-select-label" style={{ marginBottom: 0 }}>Min stacks</label>
        <input
          type="number"
          value={minCount}
          min={1}
          onChange={e => setMinCount(Math.max(1, Number(e.target.value) || 1))}
          className="filter-select"
          style={{ width: 52 }}
        />
      </div>
    </div>
  );

  return (
    <TabLayout toolbar={toolbarControls}>

      {/* ── Stack Profiles ─────────────────────────────────────────────────── */}
      {activeTab === 'stacks' && (
        <>
          {/* Position exclusion toggles + player filter */}
          <div style={{ display: 'flex', alignItems: 'flex-start', gap: 8, marginBottom: 8, flexWrap: 'wrap' }}>
          <div className="filter-btn-group">
            <button
              className={`filter-btn-group__item${excludeTE ? ' filter-btn-group__item--active' : ''}`}
              onClick={() => setExcludeTE(v => !v)}
            >
              Exclude TE
            </button>
            <button
              className={`filter-btn-group__item${excludeRB ? ' filter-btn-group__item--active' : ''}`}
              onClick={() => setExcludeRB(v => !v)}
            >
              Exclude RB
            </button>
          </div>

          {/* Player filter with autocomplete */}
          <div style={{ position: 'relative', maxWidth: 320, flex: '1 1 200px' }}>
            <input
              type="text"
              placeholder="Filter by player…"
              value={playerSearch}
              onChange={e => {
                setPlayerSearch(e.target.value);
                setSelectedPlayer('');
                setShowDropdown(true);
                setExpandedQBs(new Set());
              }}
              onFocus={() => setShowDropdown(true)}
              onBlur={() => { blurTimeout.current = setTimeout(() => setShowDropdown(false), 150); }}
              style={{
                width: '100%',
                background: 'var(--surface-2)',
                border: `1px solid ${selectedPlayer ? 'var(--accent)' : 'var(--border-subtle)'}`,
                borderRadius: 6,
                padding: '6px 12px',
                color: 'var(--text-primary)',
                fontSize: 13,
                fontFamily: 'var(--font-body)',
                outline: 'none',
                boxSizing: 'border-box',
              }}
            />
            {playerSearch && (
              <button
                onMouseDown={e => { e.preventDefault(); handleClearPlayer(); }}
                style={{
                  position: 'absolute', right: 8, top: '50%', transform: 'translateY(-50%)',
                  background: 'none', border: 'none', cursor: 'pointer',
                  color: 'var(--text-muted)', fontSize: 14, lineHeight: 1, padding: 2,
                }}
              >✕</button>
            )}
            {showDropdown && playerSuggestions.length > 0 && (
              <div style={{
                position: 'absolute', top: 'calc(100% + 4px)', left: 0, right: 0,
                background: 'var(--surface-3)',
                border: '1px solid var(--border-default)',
                borderRadius: 8,
                boxShadow: '0 4px 12px rgba(0,0,0,0.3)',
                zIndex: 200,
                overflow: 'hidden',
              }}>
                {playerSuggestions.map(name => (
                  <div
                    key={name}
                    onMouseDown={e => { e.preventDefault(); handleSelectPlayer(name); }}
                    style={{
                      padding: '8px 14px',
                      fontSize: 13,
                      cursor: 'pointer',
                      color: 'var(--text-primary)',
                      borderBottom: '1px solid var(--border-subtle)',
                    }}
                    onMouseEnter={e => { e.currentTarget.style.background = 'var(--surface-2)'; }}
                    onMouseLeave={e => { e.currentTarget.style.background = 'transparent'; }}
                  >
                    {name}
                  </div>
                ))}
              </div>
            )}
          </div>
          </div>

          <div className="card" style={{ padding: 0, overflow: 'auto' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse' }}>
              <thead style={{ background: 'var(--surface-2)', fontSize: 12, color: 'var(--text-secondary)', letterSpacing: '0.05em' }}>
                {(() => {
                  const SortHeader = ({ label, colKey, align = 'left', width }) => (
                    <th
                      onClick={() => handleSort(colKey)}
                      style={{
                        padding: '12px 20px',
                        textAlign: align,
                        width,
                        cursor: 'pointer',
                        userSelect: 'none',
                        whiteSpace: 'nowrap',
                      }}
                    >
                      {label}{sortKey === colKey ? (sortDir === 'desc' ? ' ↓' : ' ↑') : ''}
                    </th>
                  );
                  return (
                    <tr>
                      <SortHeader label="QB" colKey="name" width={180} />
                      <th style={{ padding: '12px 20px', textAlign: 'left' }}>STACK DIVERSITY</th>
                      <SortHeader label="STACK %" colKey="stackPct" align="center" width={80} />
                      <SortHeader label="DRAFTS" colKey="totalDrafts" align="center" width={80} />
                    </tr>
                  );
                })()}
              </thead>
              <tbody>
                {(() => {
                  const filtered = (stackProfilesData ?? []).filter(g => {
                    if (g.qb.team === 'N/A') return false;
                    const qualifying = g.sortedCombos.filter(c => c.count >= minCount && c.players.length > 0);
                    if (qualifying.length === 0) return false;
                    if (selectedPlayer) return qualifying.some(c => c.players.some(p => p.name === selectedPlayer));
                    return true;
                  });
                  const sorted = [...filtered].sort((a, b) => {
                    let cmp = 0;
                    if (sortKey === 'stackPct') cmp = a.stackPct - b.stackPct;
                    else if (sortKey === 'totalDrafts') cmp = a.totalDrafts - b.totalDrafts;
                    else if (sortKey === 'name') cmp = a.qb.name.localeCompare(b.qb.name);
                    return sortDir === 'desc' ? -cmp : cmp;
                  });
                  return sorted.map(group => {
                    const isExpanded = expandedQBs.has(group.qb.name);

                    // Bar segments: filter by minCount, exclude naked, reorder if player active
                    const barCombos = (() => {
                      const qualified = group.sortedCombos
                        .map((combo, idx) => ({ combo, idx }))
                        .filter(({ combo }) => combo.count >= minCount && combo.players.length > 0);
                      if (!selectedPlayer) return qualified;
                      const matching = qualified.filter(({ combo }) => combo.players.some(p => p.name === selectedPlayer));
                      const rest = qualified.filter(({ combo }) => !combo.players.some(p => p.name === selectedPlayer));
                      return [...matching, ...rest];
                    })();

                    return (
                      <React.Fragment key={group.qb.name}>
                        <tr
                          onClick={() => toggleQB(group.qb.name)}
                          style={{
                            borderTop: '1px solid var(--border-subtle)',
                            cursor: 'pointer',
                            background: isExpanded ? 'var(--surface-2)' : 'transparent',
                          }}
                        >
                          {/* QB name + team */}
                          <td style={{ padding: '14px 20px', verticalAlign: 'middle' }}>
                            <div style={{ fontWeight: 700, fontSize: 15 }}>{group.qb.name}</div>
                            <div style={{ fontSize: 12, color: 'var(--text-muted)', marginTop: 2 }}>{group.qb.team}</div>
                          </td>

                          {/* Diversity bar + legend */}
                          <td style={{ padding: '12px 20px', verticalAlign: 'middle' }}>
                            <div style={{ height: 18, display: 'flex', width: '100%', gap: 1 }}>
                              {barCombos.map(({ combo, idx }, barPos) => {
                                const w = (combo.count / group.totalDrafts) * 100;
                                const isMatch = selectedPlayer && combo.players.some(p => p.name === selectedPlayer);
                                const segColor = comboColor(idx);
                                const segOpacity = 0.85;
                                const label = `${combo.players.map(p => p.name).join(' + ')}: ${combo.count} roster${combo.count !== 1 ? 's' : ''}`;
                                const isFirst = barPos === 0;
                                const isLast = barPos === barCombos.length - 1;
                                const radius = `${isFirst ? 3 : 0}px ${isLast ? 3 : 0}px ${isLast ? 3 : 0}px ${isFirst ? 3 : 0}px`;
                                return (
                                  <SegmentTooltip key={idx} label={label} style={{ width: `${w}%`, minWidth: 2 }}>
                                    <div style={{
                                      width: '100%', height: '100%',
                                      background: segColor,
                                      opacity: segOpacity,
                                      transition: 'box-shadow 0.15s',
                                      cursor: 'default',
                                      borderRadius: radius,
                                      boxShadow: isMatch ? 'inset 0 0 0 2px #E8BF4A' : 'none',
                                    }} />
                                  </SegmentTooltip>
                                );
                              })}
                            </div>
                            {/* Legend for top bar combos */}
                            <div style={{ display: 'flex', gap: 12, marginTop: 5, flexWrap: 'wrap' }}>
                              {barCombos.slice(0, 4).map(({ combo, idx }) => {
                                const isMatch = selectedPlayer && combo.players.some(p => p.name === selectedPlayer);
                                const label = combo.players.map(p => p.name.split(' ').pop()).join('+');
                                return (
                                  <span key={idx} style={{ display: 'flex', alignItems: 'center', gap: 4, fontSize: 12, color: 'var(--text-muted)' }}>
                                    <span style={{
                                      width: 8, height: 8, borderRadius: 2,
                                      background: comboColor(idx), opacity: 0.85,
                                      display: 'inline-block', flexShrink: 0,
                                      boxShadow: isMatch ? 'inset 0 0 0 2px #E8BF4A' : 'none',
                                    }} />
                                    {label}
                                  </span>
                                );
                              })}
                              {barCombos.length > 4 && (
                                <span style={{ fontSize: 12, color: 'var(--text-muted)' }}>
                                  +{barCombos.length - 4} more
                                </span>
                              )}
                            </div>
                          </td>

                          <td style={{ padding: '14px 20px', textAlign: 'center', fontWeight: 700, fontSize: 15 }}>
                            {group.stackPct.toFixed(1)}%
                          </td>

                          <td style={{ padding: '14px 20px', textAlign: 'center', fontWeight: 700, fontSize: 15 }}>
                            {group.totalDrafts}
                          </td>
                        </tr>

                        {/* Expanded combo detail */}
                        {isExpanded && (
                          <tr style={{ background: 'var(--surface-0)' }}>
                            <td colSpan={3} style={{ padding: '4px 20px 16px 20px' }}>
                              <div style={{ paddingTop: 10, display: 'flex', flexDirection: 'column', gap: 8 }}>
                                {group.sortedCombos
                                  .map((combo, i) => ({ combo, i }))
                                  .filter(({ combo }) => {
                                    if (combo.count < minCount) return false;
                                    if (combo.players.length === 0) return false;
                                    if (selectedPlayer) return combo.players.some(p => p.name === selectedPlayer);
                                    return true;
                                  })
                                  .map(({ combo, i }) => {
                                    const pct = ((combo.count / group.totalDrafts) * 100).toFixed(1);
                                    const color = comboColor(i);
                                    return (
                                      <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                                        <div style={{
                                          width: 3, alignSelf: 'stretch', borderRadius: 2,
                                          background: color, opacity: 0.85, flexShrink: 0,
                                        }} />
                                        <div style={{ flex: 1, display: 'flex', gap: 6, flexWrap: 'wrap', alignItems: 'center' }}>
                                          {combo.players.map((p, j) => <PlayerBadge key={j} name={p.name} position={p.position} />)}
                                        </div>
                                        <div style={{ textAlign: 'right', flexShrink: 0 }}>
                                          <span style={{ fontWeight: 700, fontSize: 14 }}>{combo.count}</span>
                                          <span style={{ fontSize: 13, color: 'var(--text-muted)', marginLeft: 6 }}>{pct}%</span>
                                        </div>
                                      </div>
                                    );
                                  })}
                              </div>
                            </td>
                          </tr>
                        )}
                      </React.Fragment>
                    );
                  });
                })()}
              </tbody>
            </table>
          </div>
        </>
      )}

      {/* ── QB Pairs — Frequency Leaderboard ───────────────────────────────── */}
      {activeTab === 'qbpairs' && (
        <div className="card" style={{ padding: '16px 24px', overflow: 'auto' }}>
          <div style={{ fontSize: 13, color: 'var(--text-secondary)', marginBottom: 16 }}>
            Most frequent QB pairings on the same roster.
          </div>
          {(qbPairsData?.filter(p => p.count >= minCount) ?? []).length === 0 ? (
            <div style={{ color: 'var(--text-muted)', padding: '20px 0' }}>
              No QB pairs found. Rosters with only one QB will not appear here.
            </div>
          ) : (() => {
            const filtered = qbPairsData.filter(p => p.count >= minCount);
            const maxCount = filtered[0]?.count || 1;
            return (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 3 }}>
                {filtered.map(pair => {
                  const isTop = pair.rank === 1;
                  const fillPct = (pair.count / maxCount) * 100;
                  return (
                    <div
                      key={`${pair.qb1.name}||${pair.qb2.name}`}
                      style={{
                        position: 'relative',
                        overflow: 'hidden',
                        borderRadius: 6,
                        border: `1px solid ${isTop ? 'rgba(232, 191, 74, 0.25)' : 'var(--border-subtle)'}`,
                        background: 'var(--surface-1)',
                      }}
                    >
                      {/* Frequency fill bar */}
                      <div style={{
                        position: 'absolute',
                        top: 0, left: 0, bottom: 0,
                        width: `${fillPct}%`,
                        background: isTop
                          ? 'rgba(232, 191, 74, 0.07)'
                          : 'rgba(139, 148, 176, 0.05)',
                        borderRight: `1px solid ${isTop ? 'rgba(232, 191, 74, 0.2)' : 'rgba(139, 148, 176, 0.1)'}`,
                        pointerEvents: 'none',
                      }} />

                      {/* Row content */}
                      <div style={{ position: 'relative', display: 'flex', alignItems: 'center', gap: 14, padding: '11px 18px' }}>
                        <span style={{
                          fontFamily: 'var(--font-mono)',
                          fontSize: 12,
                          fontWeight: 700,
                          color: isTop ? 'var(--accent)' : 'var(--text-muted)',
                          minWidth: 28,
                          textAlign: 'right',
                          letterSpacing: '0.02em',
                        }}>
                          #{pair.rank}
                        </span>

                        <div style={{ flex: 1, display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
                          <PlayerBadge name={pair.qb1.name} position="QB" />
                          <span style={{
                            color: 'var(--text-muted)',
                            fontSize: 14,
                            fontWeight: 300,
                            fontFamily: 'var(--font-mono)',
                            lineHeight: 1,
                          }}>+</span>
                          <PlayerBadge name={pair.qb2.name} position="QB" />
                        </div>

                        <div style={{ textAlign: 'right', flexShrink: 0 }}>
                          <span style={{
                            fontFamily: 'var(--font-mono)',
                            fontWeight: 700,
                            fontSize: 15,
                            color: isTop ? 'var(--accent)' : 'var(--text-primary)',
                          }}>
                            {pair.count}
                          </span>
                          <span style={{ fontSize: 12, color: 'var(--text-muted)', marginLeft: 7 }}>
                            {pair.pct}%
                          </span>
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            );
          })()}
        </div>
      )}

    </TabLayout>
  );
}
