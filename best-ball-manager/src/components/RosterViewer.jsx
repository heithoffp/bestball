// src/components/RosterViewer.jsx
import React, { useState, useMemo } from 'react';

// ── helpers ──────────────────────────────────────────────────────────────────

/**
 * Power-law value curve CLV
 *
 * Maps each pick to a fantasy "value" using V(pick) = 1 / pick^α
 * where α controls how steeply value decays with pick number.
 *
 * α = 1.0  → raw % of pick number (original, too extreme at top)
 * α = 0.5  → sqrt curve (recommended default — still rewards top picks
 *             more but doesn't skew wildly for small movements early)
 * α = 0.35 → gentler, treats all positions more equally
 *
 * CLV% = (V(draftPick) - V(currentADP)) / V(draftPick) * 100
 *
 * Examples at α=0.5:
 *   Drafted 6 → ADP 4   : +22.5%   (was +33% with raw %)
 *   Drafted 20 → ADP 14 : +17.3%
 *   Drafted 50 → ADP 40 : +11.2%
 *   Drafted 120 → ADP 90: +15.5%
 *
 * Positive = good (player's value rose, you got them cheap relative to now)
 */
function calcCLV(pick, latestADP, alpha = 0.5) {
  if (!pick || !latestADP || isNaN(pick) || isNaN(latestADP)) return null;
  const vDraft = 1 / Math.pow(pick, alpha);
  const vNow   = 1 / Math.pow(latestADP, alpha);
  // vNow > vDraft when ADP moved earlier (more valuable) → positive CLV = you got a bargain
  return ((vNow - vDraft) / vDraft) * 100;
}

/**
 * The colour thresholds are tighter now that the scale is compressed.
 * A +15% on the power curve is a genuinely great pick — treat it green.
 */
function clvLabel(pct) {
  if (pct === null) return { text: 'N/A', color: '#666' };
  const sign = pct >= 0 ? '+' : '';
  const color = pct > 15 ? '#00e5a0'
              : pct > 5  ? '#7dffcc'
              : pct > -5 ? '#ff9f43'
              :             '#ff4d6d';
  return { text: `${sign}${pct.toFixed(1)}%`, color };
}

const POS_COLORS = {
  QB: '#f59e0b', RB: '#10b981', WR: '#3b82f6', TE: '#a855f7',
  K: '#6b7280', DEF: '#ef4444', DST: '#ef4444', default: '#6b7280'
};
function posColor(pos) { return POS_COLORS[pos] || POS_COLORS.default; }

// Abbreviate entry IDs for display
function shortEntry(id) {
  if (!id) return '???';
  if (id.length <= 10) return id;
  return id.slice(0, 6) + '…' + id.slice(-4);
}

// ── main component ────────────────────────────────────────────────────────────

export default function RosterViewer({ rosterData = [] }) {
  const [expandedEntry, setExpandedEntry] = useState(null);
  const [sortKey, setSortKey] = useState('avgCLV');
  const [sortDir, setSortDir] = useState('desc');
  const [clvFilter, setClvFilter] = useState('all'); // all | positive | negative
  // α controls how steeply value decays with pick — lower = gentler curve
  const [alpha, setAlpha] = useState(0.5);

  // Group players by entry_id
  const rosters = useMemo(() => {
    const map = {};
    rosterData.forEach(p => {
      const id = p.entry_id || 'Unknown';
      if (!map[id]) map[id] = [];
      map[id].push(p);
    });

    return Object.entries(map).map(([entry_id, players]) => {
      const clvValues = players
        .map(p => calcCLV(p.pick, p.latestADP, alpha))
        .filter(v => v !== null);

      const avgCLV = clvValues.length
        ? clvValues.reduce((a, b) => a + b, 0) / clvValues.length
        : null;

      const totalPick = players.reduce((s, p) => s + (p.pick || 0), 0);
      const avgPick = players.length ? totalPick / players.length : 0;

      // positional snapshot for preview dots
      const posSnap = players.reduce((acc, p) => {
        const pos = p.position || 'N/A';
        acc[pos] = (acc[pos] || 0) + 1;
        return acc;
      }, {});

      return { entry_id, players, avgCLV, avgPick, posSnap, count: players.length };
    });
  }, [rosterData, alpha]);

  // Filter + sort
  const displayed = useMemo(() => {
    let list = [...rosters];
    if (clvFilter === 'positive') list = list.filter(r => r.avgCLV !== null && r.avgCLV >= 0);
    if (clvFilter === 'negative') list = list.filter(r => r.avgCLV !== null && r.avgCLV < 0);

    list.sort((a, b) => {
      let av = a[sortKey] ?? -Infinity;
      let bv = b[sortKey] ?? -Infinity;
      if (sortKey === 'entry_id') { av = a.entry_id; bv = b.entry_id; }
      if (typeof av === 'string') return sortDir === 'asc' ? av.localeCompare(bv) : bv.localeCompare(av);
      return sortDir === 'asc' ? av - bv : bv - av;
    });
    return list;
  }, [rosters, sortKey, sortDir, clvFilter]);

  function toggleSort(key) {
    if (sortKey === key) setSortDir(d => d === 'asc' ? 'desc' : 'asc');
    else { setSortKey(key); setSortDir('desc'); }
  }

  function SortIcon({ col }) {
    if (sortKey !== col) return <span style={{ opacity: 0.3, marginLeft: 4 }}>↕</span>;
    return <span style={{ marginLeft: 4 }}>{sortDir === 'desc' ? '↓' : '↑'}</span>;
  }

  if (!rosterData.length) {
    return (
      <div style={styles.empty}>
        <span style={{ fontSize: 40 }}>📋</span>
        <p>No roster data loaded yet.</p>
      </div>
    );
  }

  return (
    <div style={styles.root}>
      {/* Header */}
      <div style={styles.header}>
        <div>
          <h2 style={styles.title}>ROSTER VIEWER</h2>
          <p style={styles.subtitle}>
            {rosters.length} entries · {rosterData.length} players
          </p>
        </div>
        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: 10 }}>
          {/* CLV curve tuner */}
          <div style={styles.alphaRow}>
            <span style={styles.alphaLabel}>CLV Curve</span>
            <div style={styles.alphaPresets}>
              {[
                { v: 0.35, label: 'Flat' },
                { v: 0.5,  label: 'Balanced' },
                { v: 0.75, label: 'Steep' },
                { v: 1.0,  label: 'Raw' },
              ].map(({ v, label }) => (
                <button
                  key={v}
                  style={{ ...styles.filterBtn, ...(alpha === v ? styles.filterBtnActive : {}) }}
                  onClick={() => setAlpha(v)}
                  title={`α = ${v}`}
                >
                  {label}
                </button>
              ))}
            </div>
            <span style={styles.alphaExplain}>
              α={alpha} · pick 6→4 = {calcCLV(6, 4, alpha) !== null ? `+${calcCLV(6, 4, alpha).toFixed(1)}%` : 'N/A'}
            </span>
          </div>
          {/* Filters */}
          <div style={styles.filters}>
            {['all', 'positive', 'negative'].map(f => (
              <button
                key={f}
                style={{ ...styles.filterBtn, ...(clvFilter === f ? styles.filterBtnActive : {}) }}
                onClick={() => setClvFilter(f)}
              >
                {f === 'all' ? 'All' : f === 'positive' ? '▲ +CLV' : '▼ −CLV'}
              </button>
            ))}
          </div>
        </div>
      </div>

      {/* Table */}
      <div style={styles.tableWrap}>
        <table style={styles.table}>
          <thead>
            <tr style={styles.thead}>
              <th style={styles.th} onClick={() => toggleSort('entry_id')}>
                Entry <SortIcon col="entry_id" />
              </th>
              <th style={{ ...styles.th, textAlign: 'center' }}>Roster Snapshot</th>
              <th style={styles.th} onClick={() => toggleSort('count')}>
                Players <SortIcon col="count" />
              </th>
              <th style={styles.th} onClick={() => toggleSort('avgPick')}>
                Avg Pick <SortIcon col="avgPick" />
              </th>
              <th style={{ ...styles.th, color: '#00e5a0' }} onClick={() => toggleSort('avgCLV')}>
                Avg CLV% <SortIcon col="avgCLV" />
              </th>
              <th style={{ ...styles.th, textAlign: 'center' }}>Expand</th>
            </tr>
          </thead>
          <tbody>
            {displayed.map((roster) => {
              const clv = clvLabel(roster.avgCLV);
              const isOpen = expandedEntry === roster.entry_id;

              return (
                <React.Fragment key={roster.entry_id}>
                  {/* Summary Row */}
                  <tr
                    style={{
                      ...styles.row,
                      ...(isOpen ? styles.rowOpen : {}),
                    }}
                    onClick={() => setExpandedEntry(isOpen ? null : roster.entry_id)}
                  >
                    <td style={styles.td}>
                      <span style={styles.entryId}>{shortEntry(roster.entry_id)}</span>
                    </td>
                    <td style={{ ...styles.td, textAlign: 'center' }}>
                      <PositionSnapshot snap={roster.posSnap} />
                    </td>
                    <td style={{ ...styles.td, textAlign: 'center' }}>
                      {roster.count}
                    </td>
                    <td style={{ ...styles.td, textAlign: 'center', fontVariantNumeric: 'tabular-nums' }}>
                      {roster.avgPick.toFixed(1)}
                    </td>
                    <td style={{ ...styles.td, textAlign: 'center' }}>
                      <span style={{ ...styles.clvBadge, color: clv.color, borderColor: clv.color + '44' }}>
                        {clv.text}
                      </span>
                    </td>
                    <td style={{ ...styles.td, textAlign: 'center' }}>
                      <span style={styles.chevron}>{isOpen ? '▲' : '▼'}</span>
                    </td>
                  </tr>

                  {/* Expanded Player Detail */}
                  {isOpen && (
                    <tr>
                      <td colSpan={6} style={styles.expandTd}>
                        <PlayerDetail players={roster.players} alpha={alpha} />
                      </td>
                    </tr>
                  )}
                </React.Fragment>
              );
            })}
          </tbody>
        </table>
      </div>

      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=Space+Mono:wght@400;700&family=DM+Sans:wght@300;400;500;600&display=swap');
        .rv-row-hover:hover { background: rgba(255,255,255,0.04) !important; cursor: pointer; }
      `}</style>
    </div>
  );
}

// ── Position dots snapshot ────────────────────────────────────────────────────

function PositionSnapshot({ snap }) {
  const positions = ['QB', 'RB', 'WR', 'TE', 'K', 'DST', 'DEF'];
  const entries = positions
    .filter(p => snap[p])
    .map(p => ({ pos: p, count: snap[p] }));

  // Also add any unexpected positions
  Object.keys(snap).forEach(p => {
    if (!positions.includes(p)) entries.push({ pos: p, count: snap[p] });
  });

  return (
    <div style={{ display: 'flex', gap: 4, flexWrap: 'wrap', justifyContent: 'center' }}>
      {entries.map(({ pos, count }) => (
        <span key={pos} style={{
          fontSize: 10, fontFamily: "'Space Mono', monospace",
          background: posColor(pos) + '22',
          color: posColor(pos),
          border: `1px solid ${posColor(pos)}55`,
          borderRadius: 3,
          padding: '1px 5px',
          letterSpacing: 0.5,
        }}>
          {count}{pos}
        </span>
      ))}
    </div>
  );
}

// ── Expanded player detail table ──────────────────────────────────────────────

function PlayerDetail({ players, alpha = 0.5 }) {
  const [pSort, setPSort] = useState('pick');
  const [pDir, setPDir] = useState('asc');

  const sorted = useMemo(() => {
    return [...players].sort((a, b) => {
      let av, bv;
      if (pSort === 'clv') {
        av = calcCLV(a.pick, a.latestADP, alpha) ?? -Infinity;
        bv = calcCLV(b.pick, b.latestADP, alpha) ?? -Infinity;
      } else if (pSort === 'pick') {
        av = a.pick || 0;
        bv = b.pick || 0;
      } else if (pSort === 'adp') {
        av = a.latestADP || 9999;
        bv = b.latestADP || 9999;
      } else if (pSort === 'name') {
        return pDir === 'asc' ? a.name.localeCompare(b.name) : b.name.localeCompare(a.name);
      } else {
        av = a[pSort] ?? -Infinity;
        bv = b[pSort] ?? -Infinity;
      }
      return pDir === 'asc' ? av - bv : bv - av;
    });
  }, [players, pSort, pDir]);

  function toggleP(key) {
    if (pSort === key) setPDir(d => d === 'asc' ? 'desc' : 'asc');
    else { setPSort(key); setPDir(key === 'clv' ? 'desc' : 'asc'); }
  }

  function PSortIcon({ col }) {
    if (pSort !== col) return <span style={{ opacity: 0.25, marginLeft: 3 }}>↕</span>;
    return <span style={{ marginLeft: 3 }}>{pDir === 'desc' ? '↓' : '↑'}</span>;
  }

  return (
    <div style={styles.detail}>
      <table style={{ ...styles.table, marginTop: 0 }}>
        <thead>
          <tr style={{ ...styles.thead, background: '#111' }}>
            <th style={styles.dth} onClick={() => toggleP('name')}>Player <PSortIcon col="name" /></th>
            <th style={{ ...styles.dth, textAlign: 'center' }}>Pos</th>
            <th style={{ ...styles.dth, textAlign: 'center' }}>Team</th>
            <th style={{ ...styles.dth, textAlign: 'center' }} onClick={() => toggleP('pick')}>
              Draft Pick <PSortIcon col="pick" />
            </th>
            <th style={{ ...styles.dth, textAlign: 'center' }}>Round</th>
            <th style={{ ...styles.dth, textAlign: 'center' }} onClick={() => toggleP('adp')}>
              Cur ADP <PSortIcon col="adp" />
            </th>
            <th style={{ ...styles.dth, textAlign: 'center', color: '#00e5a0' }} onClick={() => toggleP('clv')}>
              CLV% <PSortIcon col="clv" />
            </th>
          </tr>
        </thead>
        <tbody>
          {sorted.map((p, i) => {
            const clvPct = calcCLV(p.pick, p.latestADP, alpha);
            const clv = clvLabel(clvPct);
            return (
              <tr key={`${p.name}-${i}`} style={styles.drow}>
                <td style={styles.dtd}>
                  <span style={styles.playerName}>{p.name}</span>
                </td>
                <td style={{ ...styles.dtd, textAlign: 'center' }}>
                  <span style={{ ...styles.posPill, background: posColor(p.position) + '22', color: posColor(p.position), borderColor: posColor(p.position) + '55' }}>
                    {p.position}
                  </span>
                </td>
                <td style={{ ...styles.dtd, textAlign: 'center', color: '#aaa', fontFamily: "'Space Mono', monospace", fontSize: 11 }}>
                  {p.team}
                </td>
                <td style={{ ...styles.dtd, textAlign: 'center', fontFamily: "'Space Mono', monospace", fontSize: 12 }}>
                  {p.pick || '—'}
                </td>
                <td style={{ ...styles.dtd, textAlign: 'center', color: '#888', fontSize: 12 }}>
                  {p.round || '—'}
                </td>
                <td style={{ ...styles.dtd, textAlign: 'center', fontFamily: "'Space Mono', monospace", fontSize: 12, color: '#aaa' }}>
                  {p.latestADPDisplay || '—'}
                </td>
                <td style={{ ...styles.dtd, textAlign: 'center' }}>
                  {clvPct !== null ? (
                    <div style={styles.clvBar}>
                      <div
                        style={{
                          ...styles.clvFill,
                          width: `${Math.min(Math.abs(clvPct), 100)}%`,
                          background: clv.color,
                          marginLeft: clvPct >= 0 ? '50%' : `${50 - Math.min(Math.abs(clvPct), 50)}%`,
                        }}
                      />
                      <span style={{ ...styles.clvText, color: clv.color }}>{clv.text}</span>
                    </div>
                  ) : (
                    <span style={{ color: '#555', fontSize: 11 }}>N/A</span>
                  )}
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

// ── styles ────────────────────────────────────────────────────────────────────

const styles = {
  root: {
    fontFamily: "'DM Sans', sans-serif",
    color: '#e0e0e0',
    padding: '0 0 32px',
  },
  header: {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'flex-end',
    marginBottom: 20,
    paddingBottom: 16,
    borderBottom: '1px solid #222',
  },
  title: {
    fontFamily: "'Space Mono', monospace",
    fontSize: 18,
    fontWeight: 700,
    letterSpacing: 3,
    color: '#fff',
    margin: 0,
  },
  subtitle: {
    fontSize: 12,
    color: '#666',
    margin: '4px 0 0',
    fontFamily: "'Space Mono', monospace",
  },
  alphaRow: {
    display: 'flex',
    alignItems: 'center',
    gap: 8,
  },
  alphaLabel: {
    fontFamily: "'Space Mono', monospace",
    fontSize: 9,
    letterSpacing: 1.5,
    textTransform: 'uppercase',
    color: '#444',
  },
  alphaPresets: {
    display: 'flex',
    gap: 4,
  },
  alphaExplain: {
    fontFamily: "'Space Mono', monospace",
    fontSize: 10,
    color: '#00e5a077',
    marginLeft: 4,
  },
  filterBtn: {
    background: 'transparent',
    border: '1px solid #333',
    color: '#666',
    borderRadius: 4,
    padding: '5px 12px',
    fontSize: 11,
    fontFamily: "'Space Mono', monospace",
    cursor: 'pointer',
    letterSpacing: 0.5,
    transition: 'all 0.15s',
  },
  filterBtnActive: {
    background: '#00e5a022',
    borderColor: '#00e5a0',
    color: '#00e5a0',
  },
  tableWrap: {
    overflowX: 'auto',
    borderRadius: 8,
    border: '1px solid #1e1e1e',
  },
  table: {
    width: '100%',
    borderCollapse: 'collapse',
    fontSize: 13,
  },
  thead: {
    background: '#0d0d0d',
  },
  th: {
    padding: '12px 16px',
    textAlign: 'left',
    fontFamily: "'Space Mono', monospace",
    fontSize: 10,
    fontWeight: 700,
    letterSpacing: 1.5,
    color: '#555',
    textTransform: 'uppercase',
    cursor: 'pointer',
    userSelect: 'none',
    borderBottom: '1px solid #1e1e1e',
    whiteSpace: 'nowrap',
  },
  row: {
    borderBottom: '1px solid #1a1a1a',
    cursor: 'pointer',
    transition: 'background 0.1s',
  },
  rowOpen: {
    background: '#0a1a14',
    borderBottom: '1px solid #00e5a033',
  },
  td: {
    padding: '12px 16px',
    verticalAlign: 'middle',
  },
  entryId: {
    fontFamily: "'Space Mono', monospace",
    fontSize: 11,
    color: '#ccc',
    letterSpacing: 0.5,
  },
  clvBadge: {
    fontFamily: "'Space Mono', monospace",
    fontSize: 12,
    fontWeight: 700,
    border: '1px solid',
    borderRadius: 4,
    padding: '3px 8px',
  },
  chevron: {
    color: '#444',
    fontSize: 10,
    fontFamily: "'Space Mono', monospace",
  },
  // Detail table
  detail: {
    background: '#070f0b',
    borderTop: '1px solid #00e5a022',
    borderBottom: '1px solid #1a1a1a',
    padding: '0 0 8px',
  },
  dth: {
    padding: '10px 14px',
    textAlign: 'left',
    fontFamily: "'Space Mono', monospace",
    fontSize: 9,
    fontWeight: 700,
    letterSpacing: 1.5,
    color: '#444',
    textTransform: 'uppercase',
    cursor: 'pointer',
    userSelect: 'none',
    borderBottom: '1px solid #1a1a1a',
    whiteSpace: 'nowrap',
  },
  drow: {
    borderBottom: '1px solid #111',
  },
  dtd: {
    padding: '9px 14px',
    verticalAlign: 'middle',
  },
  playerName: {
    fontWeight: 500,
    color: '#ddd',
    fontSize: 13,
  },
  posPill: {
    fontSize: 10,
    fontFamily: "'Space Mono', monospace",
    border: '1px solid',
    borderRadius: 3,
    padding: '1px 5px',
    letterSpacing: 0.5,
  },
  clvBar: {
    position: 'relative',
    width: '100%',
    height: 18,
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
  },
  clvFill: {
    position: 'absolute',
    height: 3,
    top: '50%',
    transform: 'translateY(-50%)',
    borderRadius: 2,
    opacity: 0.6,
    maxWidth: '50%',
  },
  clvText: {
    position: 'relative',
    fontFamily: "'Space Mono', monospace",
    fontSize: 11,
    fontWeight: 700,
    zIndex: 1,
    background: '#070f0b',
    padding: '0 4px',
  },
  empty: {
    textAlign: 'center',
    padding: '60px 20px',
    color: '#555',
    fontFamily: "'Space Mono', monospace",
  },
};