import React, { useMemo, useState } from 'react';
import AdpSparkline from './AdpSparkline';

// --- Shared Utilities ---
const COLORS = {
  QB: '#bf44ef',
  RB: '#10b981',
  WR: '#f59e0b',
  TE: '#3b82f6',
  default: '#6b7280'
};

const getPosColor = (pos) => COLORS[pos] || COLORS.default;

export default function ExposureTable({ masterPlayers }) {
  const [search, setSearch] = useState('');
  const [sortField, setSortField] = useState('exposure');
  const [sortDir, setSortDir] = useState('desc');
  // New state to toggle showing players with 0% exposure
  const [showUndrafted, setShowUndrafted] = useState(false);

  const onSort = (field) => {
    if (field === sortField) {
      setSortDir(prev => (prev === 'asc' ? 'desc' : 'asc'));
    } else {
      setSortField(field);
      // Logic for natural sorting: names and ADP usually start ASC, stats DESC
      if (field === 'adp' || field === 'name') setSortDir('asc');
      else setSortDir('desc');
    }
  };

  const normalizedQuery = (s) => (s || '').toLowerCase().trim();

  const filteredAndSorted = useMemo(() => {
    const q = normalizedQuery(search);

    // 1. First, handle the 0% exposure toggle
    let list = showUndrafted
      ? masterPlayers
      : masterPlayers.filter(p => parseFloat(p.exposure) > 0);

    // 2. Filter by search query
    if (q) {
      list = list.filter(p => {
        const hay = `${p.name} ${p.team} ${p.position}`.toLowerCase();
        return hay.includes(q);
      });
    }

    // 3. Sort the results
    const compare = (a, b) => {
      if (sortField === 'name') return a.name.localeCompare(b.name);
      if (sortField === 'position') return (a.position || '').localeCompare(b.position || '');
      if (sortField === 'team') return (a.team || '').localeCompare(b.team || '');
      if (sortField === 'count') return (a.count || 0) - (b.count || 0);
      if (sortField === 'exposure') return parseFloat(a.exposure || 0) - parseFloat(b.exposure || 0);
      if (sortField === 'adp') {
        const aPick = (a.adpPick === null || a.adpPick === undefined) ? Number.POSITIVE_INFINITY : a.adpPick;
        const bPick = (b.adpPick === null || b.adpPick === undefined) ? Number.POSITIVE_INFINITY : b.adpPick;
        return aPick - bPick;
      }
      return parseFloat(a.exposure || 0) - parseFloat(b.exposure || 0);
    };

    return [...list].sort((a, b) => {
      const res = compare(a, b);
      return sortDir === 'asc' ? res : -res;
    });
  }, [masterPlayers, search, sortField, sortDir, showUndrafted]);

  const sortArrow = (field) => {
    if (field !== sortField) return '⇅';
    return sortDir === 'asc' ? '▲' : '▼';
  };

  return (
    <>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 12, marginBottom: 12 }}>
        <h2 style={{ margin: 0 }}>Exposures</h2>

        <div style={{ display: 'flex', gap: 16, alignItems: 'center' }}>
          {/* Show/Hide 0% Toggle */}
          <label style={{
            display: 'flex',
            alignItems: 'center',
            gap: 6,
            fontSize: '12px',
            fontWeight: 600,
            cursor: 'pointer',
            color: 'var(--text-secondary)'
          }}>
            <input
              type="checkbox"
              checked={showUndrafted}
              onChange={e => setShowUndrafted(e.target.checked)}
              style={{ cursor: 'pointer' }}
            />
            Show 0% Exposure
          </label>

          <input
            aria-label="Search players"
            placeholder="Search name, team, pos..."
            value={search}
            onChange={e => setSearch(e.target.value)}
            className="path-input"
            style={{ width: 250, margin: 0 }}
          />

          <button
            className="load-button"
            onClick={() => {
              setSearch('');
              setSortField('exposure');
              setSortDir('desc');
              setShowUndrafted(false);
            }}
            style={{ width: 'auto', padding: '0.5rem 1rem' }}
          >
            Reset
          </button>
        </div>
      </div>

      <div className="exposure-table card" style={{ padding: 0 }}>
        <div className="table-container">
          <table className="exposure-fixed-table">
            <thead>
              <tr>
                <th className="col-name" onClick={() => onSort('name')}>Player {sortArrow('name')}</th>
                <th className="col-pos" onClick={() => onSort('position')}>Pos {sortArrow('position')}</th>
                <th className="col-team" onClick={() => onSort('team')}>Team {sortArrow('team')}</th>
                <th className="col-exposure" onClick={() => onSort('exposure')}>Exposure % {sortArrow('exposure')}</th>
                <th className="col-count" onClick={() => onSort('count')}>Count {sortArrow('count')}</th>
                <th className="col-adp" onClick={() => onSort('adp')}>ADP {sortArrow('adp')}</th>
                <th>ADP Trend</th>
              </tr>
            </thead>

            <tbody>
              {filteredAndSorted.length === 0 && (
                <tr>
                  <td colSpan={7} style={{ padding: '2rem', textAlign: 'center', color: 'var(--text-secondary)' }}>
                    No players match your filters.
                  </td>
                </tr>
              )}

              {filteredAndSorted.map(p => {
                const posColor = getPosColor(p.position);
                const isUndrafted = parseFloat(p.exposure) === 0;

                return (
                  <tr key={p.player_id} style={{ opacity: isUndrafted ? 0.6 : 1 }}>
                    {/* Player Name with a colored accent border */}
                    <td className="col-name" style={{ borderLeft: `4px solid ${posColor}`, fontWeight: 600 }}>
                      {p.name}
                    </td>

                    {/* Position with a colored badge */}
                    <td className="col-pos">
                      <span style={{
                        backgroundColor: `${posColor}20`,
                        color: posColor,
                        padding: '2px 8px',
                        borderRadius: '4px',
                        fontSize: '10px',
                        fontWeight: '800',
                        border: `1px solid ${posColor}40`
                      }}>
                        {p.position}
                      </span>
                    </td>

                    <td className="col-team" style={{ opacity: 0.8 }}>{p.team}</td>

                    {/* Exposure Column */}
                    <td className="col-exposure" style={{
                      fontWeight: isUndrafted ? 400 : 700,
                      color: isUndrafted ? 'var(--text-secondary)' : 'inherit'
                    }}>
                      {p.exposure}%
                    </td>

                    <td className="col-count">{p.count}</td>

                    <td className="col-adp" style={{ fontSize: '11px' }}>
                      {p.adpDisplay !== '-' ? p.adpDisplay : '-'}
                    </td>

                    <td style={{ minWidth: 120 }}>
                      <AdpSparkline history={p.history} />
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>
    </>
  );
}