import React, { useMemo, useState } from 'react';
import AdpSparkline from './AdpSparkline';
import { ARCHETYPE_METADATA, classifyRosterPath } from '../utils/rosterArchetypes';

// --- Shared Utilities ---
const COLORS = {
  QB: '#bf44ef',
  RB: '#10b981',
  WR: '#f59e0b',
  TE: '#3b82f6',
  default: '#6b7280'
};

const getPosColor = (pos) => COLORS[pos] || COLORS.default;

// Archetype filter options
const RB_OPTIONS = ['Any', 'RB_ZERO', 'RB_HYPER_FRAGILE', 'RB_HERO', 'RB_VALUE'];
const QB_OPTIONS = ['Any', 'QB_ELITE', 'QB_CORE', 'QB_LATE'];
const TE_OPTIONS = ['Any', 'TE_ELITE', 'TE_ANCHOR', 'TE_LATE'];

export default function ExposureTable({ masterPlayers = [], rosterData = [] }) {
  // ... your existing state and memo logic unchanged (omitted here for brevity)
  // Copy-paste the same logic you already have above (search, sorting, useMemos, etc.)
  // For clarity I'm keeping only the render part here — assume the rest of your logic remains.

  // --- (Start of unchanged logic - paste all your useState/useMemo/etc from original) ---
  const [search, setSearch] = useState('');
  const [sortField, setSortField] = useState('exposure');
  const [sortDir, setSortDir] = useState('desc');
  const [showUndrafted, setShowUndrafted] = useState(false);

  const [rbFilter, setRbFilter] = useState('Any');
  const [qbFilter, setQbFilter] = useState('Any');
  const [teFilter, setTeFilter] = useState('Any');

  const onSort = (field) => {
    if (field === sortField) {
      setSortDir(prev => (prev === 'asc' ? 'desc' : 'asc'));
    } else {
      setSortField(field);
      if (field === 'adp' || field === 'name') setSortDir('asc');
      else setSortDir('desc');
    }
  };

  const normalizedQuery = (s) => (s || '').toLowerCase().trim();

  const { filteredRosters, totalFilteredEntries, playerExposures } = useMemo(() => {
    if (!rosterData || rosterData.length === 0) {
      return { filteredRosters: [], totalFilteredEntries: 0, playerExposures: {} };
    }
    const entriesMap = {};
    rosterData.forEach(p => {
      const id = p.entry_id ?? p.entryId ?? 'unknown';
      if (!entriesMap[id]) entriesMap[id] = [];
      entriesMap[id].push(p);
    });

    const filtered = [];
    Object.entries(entriesMap).forEach(([id, roster]) => {
      const path = classifyRosterPath(roster);
      const rbMatch = rbFilter === 'Any' || path.rb === rbFilter;
      const qbMatch = qbFilter === 'Any' || path.qb === qbFilter;
      const teMatch = teFilter === 'Any' || path.te === teFilter;

      if (rbMatch && qbMatch && teMatch) {
        filtered.push({ id, roster, path });
      }
    });

    const playerCounts = {};
    filtered.forEach(({ roster }) => {
      roster.forEach(player => {
        const key = String(player.name || '').trim();
        if (!key) return;
        if (!playerCounts[key]) playerCounts[key] = { count: 0 };
        playerCounts[key].count++;
      });
    });

    const exposures = {};
    const rosterCount = filtered.length;
    Object.entries(playerCounts).forEach(([nameKey, { count }]) => {
      exposures[nameKey] = {
        count,
        exposure: rosterCount > 0 ? (count / rosterCount) * 100 : 0,
      };
    });

    return {
      filteredRosters: filtered,
      totalFilteredEntries: filtered.length,
      playerExposures: exposures
    };
  }, [rosterData, rbFilter, qbFilter, teFilter]);

  const playersWithFilteredExposure = useMemo(() => {
    return masterPlayers.map(p => {
      const nameKey = String(p.name || '').trim();
      const filtered = playerExposures[nameKey];

      return {
        ...p,
        filteredExposure: filtered ? filtered.exposure : 0,
        filteredCount: filtered ? filtered.count : 0
      };
    });
  }, [masterPlayers, playerExposures]);

  const hasActiveFilter = rbFilter !== 'Any' || qbFilter !== 'Any' || teFilter !== 'Any';

  const filteredAndSorted = useMemo(() => {
    const q = normalizedQuery(search);
    const dataToUse = hasActiveFilter ? playersWithFilteredExposure : masterPlayers;

    let list = showUndrafted
      ? dataToUse
      : dataToUse.filter(p => {
          const count = hasActiveFilter ? (p.filteredCount || 0) : (p.count || 0);
          return count > 0;
        });

    if (q) {
      list = list.filter(p => {
        const hay = `${p.name || ''} ${p.team || ''} ${p.position || ''}`.toLowerCase();
        return hay.includes(q);
      });
    }

    const compare = (a, b) => {
      if (sortField === 'name') return (a.name || '').localeCompare(b.name || '');
      if (sortField === 'position') return (a.position || '').localeCompare(b.position || '');
      if (sortField === 'team') return (a.team || '').localeCompare(b.team || '');
      
      const aVal = hasActiveFilter 
        ? (sortField === 'count' ? a.filteredCount : a.filteredExposure)
        : (sortField === 'count' ? a.count : a.exposure);
      const bVal = hasActiveFilter 
        ? (sortField === 'count' ? b.filteredCount : b.filteredExposure)
        : (sortField === 'count' ? b.count : b.exposure);

      if (sortField === 'adp') {
        const aPick = (a.adpPick ?? Number.POSITIVE_INFINITY);
        const bPick = (b.adpPick ?? Number.POSITIVE_INFINITY);
        return aPick - bPick;
      }
      return (parseFloat(aVal) || 0) - (parseFloat(bVal) || 0);
    };

    return [...list].sort((a, b) => {
      const res = compare(a, b);
      return sortDir === 'asc' ? res : -res;
    });
  }, [playersWithFilteredExposure, masterPlayers, search, sortField, sortDir, showUndrafted, hasActiveFilter]);

  const sortArrow = (field) => {
    if (field !== sortField) return '⇅';
    return sortDir === 'asc' ? '▲' : '▼';
  };

  const resetFilters = () => {
    setSearch('');
    setSortField('exposure');
    setSortDir('desc');
    setShowUndrafted(false);
    setRbFilter('Any');
    setQbFilter('Any');
    setTeFilter('Any');
  };
  // --- (End of unchanged logic) ---

  // Shared cell styles for consistent alignment
  const cellBaseStyle = {
    padding: '8px 10px',
    whiteSpace: 'nowrap',
    overflow: 'hidden',
    textOverflow: 'ellipsis',
    verticalAlign: 'middle',
    borderBottom: '1px solid rgba(255,255,255,0.04)'
  };

  const headerStyle = {
    ...cellBaseStyle,
    fontSize: 12,
    fontWeight: 700,
    textTransform: 'uppercase',
    cursor: 'pointer',
    color: 'var(--text-secondary)'
  };

  return (
    <>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 12, marginBottom: 12 }}>
        <h2 style={{ margin: 0 }}>Exposures</h2>
        <div style={{ display: 'flex', gap: 16, alignItems: 'center' }}>
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
            onClick={resetFilters}
            style={{ width: 'auto', padding: '0.5rem 1rem' }}
          >
            Reset
          </button>
        </div>
      </div>

      {/* (Filters area unchanged) */}
      <div style={{
        display: 'flex',
        gap: 12,
        padding: '16px',
        background: 'rgba(0,0,0,0.2)',
        borderRadius: 8,
        border: '1px solid rgba(255,255,255,0.1)',
        marginBottom: 16,
        alignItems: 'center',
        flexWrap: 'wrap'
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, flex: '0 0 auto' }}>
          <span style={{
            fontSize: 12,
            fontWeight: 700,
            textTransform: 'uppercase',
            letterSpacing: '0.05em',
            color: 'var(--text-secondary)'
          }}>
            Filter by Strategy:
          </span>
        </div>

        <div style={{ display: 'flex', flexDirection: 'column', gap: 4, minWidth: 180 }}>
          <label style={{ fontSize: 10, fontWeight: 600, color: getPosColor('RB'), textTransform: 'uppercase' }}>
            RB Strategy
          </label>
          <select
            value={rbFilter}
            onChange={e => setRbFilter(e.target.value)}
            style={{
              padding: '6px 8px',
              borderRadius: 4,
              border: '1px solid rgba(255,255,255,0.2)',
              background: 'rgba(0,0,0,0.3)',
              color: 'inherit',
              fontSize: 12,
              cursor: 'pointer'
            }}
          >
            {RB_OPTIONS.map(opt => (
              <option key={opt} value={opt}>
                {opt === 'Any' ? 'Any' : ARCHETYPE_METADATA[opt]?.name || opt}
              </option>
            ))}
          </select>
        </div>

        <div style={{ display: 'flex', flexDirection: 'column', gap: 4, minWidth: 180 }}>
          <label style={{ fontSize: 10, fontWeight: 600, color: getPosColor('QB'), textTransform: 'uppercase' }}>
            QB Strategy
          </label>
          <select
            value={qbFilter}
            onChange={e => setQbFilter(e.target.value)}
            style={{
              padding: '6px 8px',
              borderRadius: 4,
              border: '1px solid rgba(255,255,255,0.2)',
              background: 'rgba(0,0,0,0.3)',
              color: 'inherit',
              fontSize: 12,
              cursor: 'pointer'
            }}
          >
            {QB_OPTIONS.map(opt => (
              <option key={opt} value={opt}>
                {opt === 'Any' ? 'Any' : ARCHETYPE_METADATA[opt]?.name || opt}
              </option>
            ))}
          </select>
        </div>

        <div style={{ display: 'flex', flexDirection: 'column', gap: 4, minWidth: 180 }}>
          <label style={{ fontSize: 10, fontWeight: 600, color: getPosColor('TE'), textTransform: 'uppercase' }}>
            TE Strategy
          </label>
          <select
            value={teFilter}
            onChange={e => setTeFilter(e.target.value)}
            style={{
              padding: '6px 8px',
              borderRadius: 4,
              border: '1px solid rgba(255,255,255,0.2)',
              background: 'rgba(0,0,0,0.3)',
              color: 'inherit',
              fontSize: 12,
              cursor: 'pointer'
            }}
          >
            {TE_OPTIONS.map(opt => (
              <option key={opt} value={opt}>
                {opt === 'Any' ? 'Any' : ARCHETYPE_METADATA[opt]?.name || opt}
              </option>
            ))}
          </select>
        </div>

        {hasActiveFilter && (
          <div style={{
            flex: 1,
            display: 'flex',
            justifyContent: 'flex-end',
            alignItems: 'center',
            gap: 8
          }}>
            <span style={{
              fontSize: 11,
              color: 'var(--text-secondary)',
              fontStyle: 'italic'
            }}>
              Showing {totalFilteredEntries} rosters matching:
            </span>
            <div style={{ display: 'flex', gap: 6 }}>
              {rbFilter !== 'Any' && (
                <span style={{
                  padding: '3px 8px',
                  borderRadius: 4,
                  fontSize: 10,
                  fontWeight: 700,
                  background: `${getPosColor('RB')}20`,
                  border: `1px solid ${getPosColor('RB')}40`,
                  color: getPosColor('RB')
                }}>
                  {ARCHETYPE_METADATA[rbFilter]?.name}
                </span>
              )}
              {qbFilter !== 'Any' && (
                <span style={{
                  padding: '3px 8px',
                  borderRadius: 4,
                  fontSize: 10,
                  fontWeight: 700,
                  background: `${getPosColor('QB')}20`,
                  border: `1px solid ${getPosColor('QB')}40`,
                  color: getPosColor('QB')
                }}>
                  {ARCHETYPE_METADATA[qbFilter]?.name}
                </span>
              )}
              {teFilter !== 'Any' && (
                <span style={{
                  padding: '3px 8px',
                  borderRadius: 4,
                  fontSize: 10,
                  fontWeight: 700,
                  background: `${getPosColor('TE')}20`,
                  border: `1px solid ${getPosColor('TE')}40`,
                  color: getPosColor('TE')
                }}>
                  {ARCHETYPE_METADATA[teFilter]?.name}
                </span>
              )}
            </div>
          </div>
        )}
      </div>

      <div className="exposure-table card" style={{ padding: 0 }}>
        <div className="table-container" style={{ overflowX: 'auto' }}>
          {/* table-layout: fixed + colgroup ensures headers and data line up */}
          <table
            className="exposure-fixed-table"
            style={{ width: '100%', minWidth: 4800, borderCollapse: 'collapse', tableLayout: 'fixed' }}
          >
            <colgroup>
              <col style={{ width: '30%' }} />
              <col style={{ width: '6%' }} />
              <col style={{ width: '10%' }} />
              <col style={{ width: '14%' }} />
              <col style={{ width: '8%' }} />
              <col style={{ width: '8%' }} />
              <col style={{ width: '24%' }} />
            </colgroup>

            <thead>
              <tr>
                <th style={headerStyle} onClick={() => onSort('name')}>Player {sortArrow('name')}</th>
                <th style={headerStyle} onClick={() => onSort('position')}>Pos {sortArrow('position')}</th>
                <th style={headerStyle} onClick={() => onSort('team')}>Team {sortArrow('team')}</th>
                <th style={headerStyle} onClick={() => onSort('exposure')}>Exposure % {sortArrow('exposure')}</th>
                <th style={{ ...headerStyle, textAlign: 'right' }} onClick={() => onSort('count')}>Count {sortArrow('count')}</th>
                <th style={{ ...headerStyle, textAlign: 'right' }} onClick={() => onSort('adp')}>ADP {sortArrow('adp')}</th>
                <th style={headerStyle}>ADP Trend</th>
              </tr>
            </thead>

            <tbody>
              {filteredAndSorted.length === 0 ? (
                <tr>
                  <td colSpan={7} style={{ padding: '2rem', textAlign: 'center' }}>No players match.</td>
                </tr>
              ) : (
                filteredAndSorted.map(p => {
                  const posColor = getPosColor(p.position);
                  const displayExp = hasActiveFilter ? (p.filteredExposure || 0) : (p.exposure || 0);
                  const displayCount = hasActiveFilter ? (p.filteredCount || 0) : (p.count || 0);

                  return (
                    <tr key={p.name} style={{ opacity: displayCount === 0 ? 0.5 : 1 }}>
                      <td style={{ ...cellBaseStyle, fontWeight: 600, borderLeft: `4px solid ${posColor}` }}>{p.name}</td>
                      <td style={cellBaseStyle}>{p.position}</td>
                      <td style={cellBaseStyle}>{p.team}</td>
                      <td style={cellBaseStyle}>{parseFloat(displayExp).toFixed(1)}%</td>
                      <td style={{ ...cellBaseStyle, textAlign: 'right' }}>{displayCount}</td>
                      <td style={{ ...cellBaseStyle, textAlign: 'right' }}>{p.adpDisplay}</td>
                      <td style={{ ...cellBaseStyle, padding: '6px 8px' }}>
                        <div style={{ width: '100%', height: '30px', minWidth: '100px' }}>
                          <AdpSparkline history={p.history} />
                        </div>
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
      </div>
    </>
  );
}
