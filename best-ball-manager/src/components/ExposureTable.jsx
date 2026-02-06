// src/components/ExposureTable.jsx
import React, { useMemo, useState } from 'react';

/**
 * Exposures table with:
 * - search (name, team, position)
 * - sortable columns (name, position, team, exposure, count, adp)
 * - single-table layout with scrollable tbody (header aligned)
 *
 * masterPlayers entries must include:
 *  - name, position, team, exposure, count
 *  - adpDisplay (string) and adpPick (number|null)
 */
export default function ExposureTable({ masterPlayers }) {
  const [search, setSearch] = useState('');
  const [sortField, setSortField] = useState('exposure'); // default
  const [sortDir, setSortDir] = useState('desc');

  const onSort = (field) => {
    if (field === sortField) {
      setSortDir(prev => (prev === 'asc' ? 'desc' : 'asc'));
    } else {
      setSortField(field);
      if (field === 'adp') setSortDir('asc');
      else if (field === 'name') setSortDir('asc');
      else setSortDir('desc');
    }
  };

  const normalizedQuery = (s) => (s || '').toLowerCase().trim();

  const filteredAndSorted = useMemo(() => {
    const q = normalizedQuery(search);
    const filtered = q
      ? masterPlayers.filter(p => {
          const hay = `${p.name} ${p.team} ${p.position}`.toLowerCase();
          return hay.includes(q);
        })
      : masterPlayers.slice();

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

    filtered.sort((a, b) => {
      const res = compare(a, b);
      return sortDir === 'asc' ? res : -res;
    });

    return filtered;
  }, [masterPlayers, search, sortField, sortDir]);

  const sortArrow = (field) => {
    if (field !== sortField) return '⇅';
    return sortDir === 'asc' ? '▲' : '▼';
  };

  return (
    <>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 12, marginBottom: 12 }}>
        <h2 style={{ margin: 0 }}>Exposures</h2>
        <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
          <input
            aria-label="Search players"
            placeholder="Search name, team, pos..."
            value={search}
            onChange={e => setSearch(e.target.value)}
            className="path-input"
            style={{ width: 300, margin: 0 }}
          />
          <button className="load-button" onClick={() => { setSearch(''); setSortField('exposure'); setSortDir('desc'); }} style={{ width: 'auto', padding: '0.5rem 1rem' }}>
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
              </tr>
            </thead>

            <tbody>
              {filteredAndSorted.length === 0 && (
                <tr>
                  <td colSpan={6} style={{ padding: '1rem' }}>No players match your search.</td>
                </tr>
              )}

              {filteredAndSorted.map(p => (
                <tr key={p.player_id}>
                  <td className="col-name">{p.name}</td>
                  <td className="col-pos">{p.position}</td>
                  <td className="col-team">{p.team}</td>
                  <td className="col-exposure">{p.exposure}%</td>
                  <td className="col-count">{p.count}</td>
                  <td className="col-adp">{p.adpDisplay !== '-' ? p.adpDisplay : '-'}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </>
  );
}
