import React, { useMemo, useState } from 'react';
import {
  ResponsiveContainer, BarChart, Bar, XAxis, YAxis,
  Tooltip, Legend, CartesianGrid
} from 'recharts';
import { computePortfolioJaccard, computePlayerImpact, groupByRoster } from '../utils/jaccardAnalysis';

function SortHeader({ label, field, sortKey, sortAsc, handleSort, style = {} }) {
  return (
    <th
      onClick={() => handleSort(field)}
      style={{ padding: '10px 12px', textAlign: 'left', cursor: 'pointer', userSelect: 'none', ...style }}
    >
      {label} {sortKey === field ? (sortAsc ? '▲' : '▼') : ''}
    </th>
  );
}

export default function JaccardAnalysis({ rosterData = [] }) {
  const [activeTab, setActiveTab] = useState('overview');
  const [sortKey, setSortKey] = useState('deltaJaccard');
  const [sortAsc, setSortAsc] = useState(false);

  const rosterCount = useMemo(() => groupByRoster(rosterData).size, [rosterData]);

  const categoryData = useMemo(() => computePortfolioJaccard(rosterData), [rosterData]);

  const playerImpact = useMemo(() => computePlayerImpact(rosterData), [rosterData]);

  const handleSort = (key) => {
    if (sortKey === key) setSortAsc(!sortAsc);
    else { setSortKey(key); setSortAsc(false); }
  };

  const sortedImpact = useMemo(() => {
    const arr = [...playerImpact];
    arr.sort((a, b) => {
      let va = a[sortKey], vb = b[sortKey];
      if (typeof va === 'string') va = parseFloat(va) || 0;
      if (typeof vb === 'string') vb = parseFloat(vb) || 0;
      return sortAsc ? va - vb : vb - va;
    });
    return arr;
  }, [playerImpact, sortKey, sortAsc]);

  if (rosterCount < 2) {
    return (
      <div className="card" style={{ padding: 24, textAlign: 'center', color: 'var(--text-muted)' }}>
        Jaccard analysis requires at least 2 rosters.
      </div>
    );
  }

  const overall = categoryData.find(c => c.key === 'overall');

  // Auto-generated insight
  const insight = (() => {
    const posCategories = categoryData.filter(c => ['qb', 'rb', 'wr', 'te'].includes(c.key));
    const concentrated = posCategories.filter(c => c.weightedPct > c.unweightedPct * 1.3 && c.weightedPct > 3);
    if (concentrated.length > 0) {
      const names = concentrated.map(c => c.label).join(', ');
      return `Early-round concentration detected in ${names} — weighted Jaccard significantly exceeds unweighted, meaning overlap is concentrated in high-capital picks.`;
    }
    if (overall && overall.unweightedPct < 8) {
      return 'Portfolio is well-diversified — low overlap across rosters.';
    }
    return null;
  })();

  // Flagged players for impact tab
  const flagged = playerImpact.filter(p => parseFloat(p.exposure) > 30 && p.deltaJaccard > 0);

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
      {/* Sub-tab controls */}
      <div className="card" style={{ display: 'flex', gap: 20, alignItems: 'center', flexWrap: 'wrap', padding: '12px 20px' }}>
        <div style={{ display: 'flex', background: 'rgba(0,0,0,0.2)', padding: 4, borderRadius: 8 }}>
          {['overview', 'impact'].map(t => (
            <button
              key={t}
              className={`tab-button ${activeTab === t ? 'active' : ''}`}
              onClick={() => setActiveTab(t)}
            >
              {t === 'overview' ? 'Overview' : 'Player Impact'}
            </button>
          ))}
        </div>
      </div>

      {/* Overview Tab */}
      {activeTab === 'overview' && (
        <>
          {/* Summary cards */}
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(160px, 1fr))', gap: 12 }}>
            {[
              { label: 'Total Rosters', value: rosterCount },
              { label: 'Unweighted Jaccard', value: overall ? `${overall.unweightedPct.toFixed(1)}%` : '-' },
              { label: 'Weighted Jaccard', value: overall ? `${overall.weightedPct.toFixed(1)}%` : '-' },
              { label: 'Avg Shared Players', value: overall ? overall.avgSharedPlayers.toFixed(1) : '-' },
            ].map(card => (
              <div key={card.label} className="card" style={{ padding: '16px 20px', textAlign: 'center' }}>
                <div style={{ fontSize: 11, color: 'var(--text-muted)', marginBottom: 4, textTransform: 'uppercase', fontWeight: 700 }}>{card.label}</div>
                <div style={{ fontSize: 24, fontWeight: 800 }}>{card.value}</div>
              </div>
            ))}
          </div>

          {/* Bar chart */}
          <div className="card" style={{ padding: '20px 16px' }}>
            <ResponsiveContainer width="100%" height={340}>
              <BarChart data={categoryData} margin={{ top: 10, right: 20, left: 0, bottom: 5 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.06)" />
                <XAxis dataKey="label" tick={{ fill: 'var(--text-secondary)', fontSize: 12 }} />
                <YAxis tick={{ fill: 'var(--text-secondary)', fontSize: 12 }} tickFormatter={v => `${v.toFixed(0)}%`} />
                <Tooltip
                  contentStyle={{ background: '#1e1e2e', border: '1px solid rgba(255,255,255,0.1)', borderRadius: 8 }}
                  formatter={(value) => `${value.toFixed(2)}%`}
                />
                <Legend />
                <Bar dataKey="unweightedPct" name="Unweighted" fill="#3b82f6" radius={[4, 4, 0, 0]} />
                <Bar dataKey="weightedPct" name="Weighted" fill="#f59e0b" radius={[4, 4, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>

            {/* Avg shared players row */}
            <div style={{ display: 'flex', justifyContent: 'space-around', marginTop: 8, fontSize: 11, color: 'var(--text-muted)' }}>
              {categoryData.map(c => (
                <div key={c.key} style={{ textAlign: 'center', minWidth: 70 }}>
                  <div style={{ fontWeight: 700 }}>{c.avgSharedPlayers.toFixed(1)}</div>
                  <div>avg shared</div>
                </div>
              ))}
            </div>
          </div>

          {/* Insight callout */}
          {insight && (
            <div className="card" style={{ padding: '14px 20px', borderLeft: '4px solid #f59e0b', background: 'rgba(245,158,11,0.06)' }}>
              <div style={{ fontSize: 12, fontWeight: 700, color: '#f59e0b', marginBottom: 4 }}>INSIGHT</div>
              <div style={{ fontSize: 13, color: 'var(--text-secondary)' }}>{insight}</div>
            </div>
          )}
        </>
      )}

      {/* Player Impact Tab */}
      {activeTab === 'impact' && (
        <>
          {/* Flagged players warning */}
          {flagged.length > 0 && (
            <div className="card" style={{ padding: '14px 20px', borderLeft: '4px solid #ef4444', background: 'rgba(239,68,68,0.06)' }}>
              <div style={{ fontSize: 12, fontWeight: 700, color: '#ef4444', marginBottom: 4 }}>CONCENTRATION WARNING</div>
              <div style={{ fontSize: 13, color: 'var(--text-secondary)' }}>
                {flagged.map(p => p.name).join(', ')} — high exposure (&gt;30%) and increasing portfolio overlap.
              </div>
            </div>
          )}

          {/* Impact table */}
          <div className="card" style={{ padding: 0, overflow: 'hidden' }}>
            <div style={{ overflowX: 'auto', maxHeight: '65vh', overflowY: 'auto' }}>
              <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                <thead style={{ background: 'rgba(255,255,255,0.03)', fontSize: 12, color: 'var(--text-secondary)', position: 'sticky', top: 0 }}>
                  <tr>
                    <SortHeader label="Player" field="name" sortKey={sortKey} sortAsc={sortAsc} handleSort={handleSort} />
                    <SortHeader label="Pos" field="position" sortKey={sortKey} sortAsc={sortAsc} handleSort={handleSort} style={{ width: 50 }} />
                    <SortHeader label="Team" field="team" sortKey={sortKey} sortAsc={sortAsc} handleSort={handleSort} style={{ width: 60 }} />
                    <SortHeader label="Exp %" field="exposure" sortKey={sortKey} sortAsc={sortAsc} handleSort={handleSort} style={{ width: 70, textAlign: 'right' }} />
                    <SortHeader label="Rosters" field="rosterCount" sortKey={sortKey} sortAsc={sortAsc} handleSort={handleSort} style={{ width: 70, textAlign: 'right' }} />
                    <SortHeader label="Δ Jaccard" field="deltaJaccard" sortKey={sortKey} sortAsc={sortAsc} handleSort={handleSort} style={{ width: 90, textAlign: 'right' }} />
                    <SortHeader label="Δ Shared" field="deltaSharedPlayers" sortKey={sortKey} sortAsc={sortAsc} handleSort={handleSort} style={{ width: 90, textAlign: 'right' }} />
                  </tr>
                </thead>
                <tbody>
                  {sortedImpact.map(p => {
                    const isConcentrating = p.deltaJaccard > 0;
                    const color = isConcentrating ? '#ef4444' : '#10b981';
                    return (
                      <tr key={p.name} style={{ borderBottom: '1px solid var(--border)' }}>
                        <td style={{ padding: '10px 12px', fontWeight: 600 }}>{p.name}</td>
                        <td style={{ padding: '10px 12px', fontSize: 12 }}>{p.position}</td>
                        <td style={{ padding: '10px 12px', fontSize: 12, color: 'var(--text-muted)' }}>{p.team}</td>
                        <td style={{ padding: '10px 12px', textAlign: 'right', fontFamily: 'monospace' }}>{p.exposure}%</td>
                        <td style={{ padding: '10px 12px', textAlign: 'right' }}>{p.rosterCount}</td>
                        <td style={{ padding: '10px 12px', textAlign: 'right', fontFamily: 'monospace', fontWeight: 700, color }}>
                          {p.deltaJaccard > 0 ? '+' : ''}{(p.deltaJaccard * 100).toFixed(2)}%
                        </td>
                        <td style={{ padding: '10px 12px', textAlign: 'right', fontFamily: 'monospace', color }}>
                          {p.deltaSharedPlayers > 0 ? '+' : ''}{p.deltaSharedPlayers.toFixed(2)}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>
        </>
      )}
    </div>
  );
}
