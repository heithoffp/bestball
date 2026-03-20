import React, { useEffect, useMemo, useRef, useState } from 'react';
import { useVirtualizer } from '@tanstack/react-virtual';
import AdpSparkline from './AdpSparkline';
import { ARCHETYPE_METADATA, classifyRosterPath } from '../utils/rosterArchetypes';
import FileUploadButton from './FileUploadButton';
import useMediaQuery from '../hooks/useMediaQuery';
import styles from './ExposureTable.module.css';

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
const RB_OPTIONS = ['Any', 'RB_ZERO', 'RB_HYPER_FRAGILE', 'RB_HERO', 'RB_BALANCED'];
const QB_OPTIONS = ['Any', 'QB_ELITE', 'QB_CORE', 'QB_LATE'];
const TE_OPTIONS = ['Any', 'TE_ELITE', 'TE_ANCHOR', 'TE_LATE'];

// All chip options grouped by position for mobile filter chips
const CHIP_GROUPS = [
  { pos: 'RB', options: RB_OPTIONS.filter(o => o !== 'Any') },
  { pos: 'QB', options: QB_OPTIONS.filter(o => o !== 'Any') },
  { pos: 'TE', options: TE_OPTIONS.filter(o => o !== 'Any') },
];

const SORT_OPTIONS = [
  { value: 'exposure', label: 'Exposure %' },
  { value: 'adp', label: 'ADP' },
  { value: 'name', label: 'Name' },
  { value: 'count', label: 'Count' },
  { value: 'adpTrend', label: 'Trend' },
];

export default function ExposureTable({ masterPlayers = [], rosterData = [], onRosterUpload }) {
  const { isMobile } = useMediaQuery();

  const [searchInput, setSearchInput] = useState('');
  const [search, setSearch] = useState('');

  useEffect(() => {
    const timer = setTimeout(() => setSearch(searchInput), 250);
    return () => clearTimeout(timer);
  }, [searchInput]);
  const [sortField, setSortField] = useState(rosterData.length === 0 ? 'adp' : 'exposure');
  const [sortDir, setSortDir] = useState(rosterData.length === 0 ? 'asc' : 'desc');
  const [showUndrafted, setShowUndrafted] = useState(rosterData.length === 0);

  const [rbFilter, setRbFilter] = useState('Any');
  const [qbFilter, setQbFilter] = useState('Any');
  const [teFilter, setTeFilter] = useState('Any');

  const [expandedId, setExpandedId] = useState(null);

  // Reset expandedId when filters/sort/search change
  useEffect(() => {
    setExpandedId(null);
  }, [search, sortField, sortDir, rbFilter, qbFilter, teFilter, showUndrafted]);

  const onSort = (field) => {
    if (field === sortField) {
      setSortDir(prev => (prev === 'asc' ? 'desc' : 'asc'));
    } else {
      setSortField(field);
      if (field === 'adp' || field === 'name' || field === 'adpTrend') setSortDir('asc');
      else setSortDir('desc');
    }
  };

  const normalizedQuery = (s) => (s || '').toLowerCase().trim();

  const { totalFilteredEntries, playerExposures } = useMemo(() => {
    if (!rosterData || rosterData.length === 0) {
      return { totalFilteredEntries: 0, playerExposures: {} };
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
      totalFilteredEntries: filtered.length,
      playerExposures: exposures
    };
  }, [rosterData, rbFilter, qbFilter, teFilter]);

  const playersWithFilteredExposure = useMemo(() => {
    const now = new Date();
    const twoWeeksAgo = new Date(now);
    twoWeeksAgo.setDate(twoWeeksAgo.getDate() - 14);

    return masterPlayers.map(p => {
      const nameKey = String(p.name || '').trim();
      const filtered = playerExposures[nameKey];

      // Compute 2-week ADP trend
      let trendValue = null;
      if (p.history && p.history.length >= 2) {
        const valid = p.history.filter(h => h.adpPick !== null);
        if (valid.length >= 2) {
          const latest = valid[valid.length - 1];
          // Find the entry closest to 14 days ago
          let baseline = valid[0];
          for (const h of valid) {
            if (new Date(h.date) <= twoWeeksAgo) {
              baseline = h;
            } else {
              break;
            }
          }
          if (baseline !== latest) {
            trendValue = latest.adpPick - baseline.adpPick;
          }
        }
      }

      return {
        ...p,
        trendValue,
        filteredExposure: filtered ? filtered.exposure : 0,
        filteredCount: filtered ? filtered.count : 0
      };
    });
  }, [masterPlayers, playerExposures]);

  const hasActiveFilter = rbFilter !== 'Any' || qbFilter !== 'Any' || teFilter !== 'Any';

  const filteredAndSorted = useMemo(() => {
    const q = normalizedQuery(search);
    const dataToUse = playersWithFilteredExposure;

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
      if (sortField === 'adpTrend') {
        const aTrend = (a.trendValue ?? Number.POSITIVE_INFINITY);
        const bTrend = (b.trendValue ?? Number.POSITIVE_INFINITY);
        return aTrend - bTrend;
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
    setSearchInput('');
    setSearch('');
    setSortField('exposure');
    setSortDir('desc');
    setShowUndrafted(false);
    setRbFilter('Any');
    setQbFilter('Any');
    setTeFilter('Any');
  };

  const tableContainerRef = useRef(null);

  const virtualizer = useVirtualizer({
    count: filteredAndSorted.length,
    getScrollElement: () => tableContainerRef.current,
    estimateSize: () => isMobile ? 72 : 51,
    overscan: 10,
  });

  // --- Chip filter toggle ---
  const toggleChip = (optionKey) => {
    // Determine which position group this belongs to
    if (RB_OPTIONS.includes(optionKey)) {
      setRbFilter(prev => prev === optionKey ? 'Any' : optionKey);
    } else if (QB_OPTIONS.includes(optionKey)) {
      setQbFilter(prev => prev === optionKey ? 'Any' : optionKey);
    } else if (TE_OPTIONS.includes(optionKey)) {
      setTeFilter(prev => prev === optionKey ? 'Any' : optionKey);
    }
  };

  const isChipActive = (optionKey) => {
    return rbFilter === optionKey || qbFilter === optionKey || teFilter === optionKey;
  };

  // --- Render helpers ---

  const renderToolbar = () => {
    if (isMobile) {
      return (
        <div className={styles.toolbar}>
          <div className={styles.toolbarRow1}>
            <h2 style={{ margin: 0 }}>Exposures</h2>
            {onRosterUpload && <FileUploadButton label="Upload CSV" onUpload={onRosterUpload} />}
          </div>
          <input
            aria-label="Search players"
            placeholder="Search name, team, pos..."
            value={searchInput}
            onChange={e => setSearchInput(e.target.value)}
            className={`path-input ${styles.searchInput}`}
          />
          <div style={{ display: 'flex', gap: 10, alignItems: 'center', justifyContent: 'space-between' }}>
            <label className={styles.checkboxLabel}>
              <input
                type="checkbox"
                checked={showUndrafted}
                onChange={e => setShowUndrafted(e.target.checked)}
                style={{ cursor: 'pointer' }}
              />
              Show 0%
            </label>
            <button
              className="load-button"
              onClick={resetFilters}
              style={{ width: 'auto', padding: '0.5rem 1rem' }}
            >
              Reset
            </button>
          </div>
        </div>
      );
    }

    return (
      <div className={styles.toolbar}>
        <div className={styles.toolbarLeft}>
          <h2 style={{ margin: 0 }}>Exposures</h2>
        </div>
        <div className={styles.toolbarRight}>
          <label className={styles.checkboxLabel}>
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
            value={searchInput}
            onChange={e => setSearchInput(e.target.value)}
            className={`path-input ${styles.searchInput}`}
          />
          <button
            className="load-button"
            onClick={resetFilters}
            style={{ width: 'auto', padding: '0.5rem 1rem' }}
          >
            Reset
          </button>
          {onRosterUpload && <FileUploadButton label="Upload Underdog Exposure CSV" onUpload={onRosterUpload} />}
        </div>
      </div>
    );
  };

  const renderFilters = () => {
    if (isMobile) {
      return (
        <div className={styles.chipStrip}>
          {CHIP_GROUPS.map((group, gi) => (
            <React.Fragment key={group.pos}>
              {gi > 0 && <div className={styles.chipSeparator} />}
              {group.options.map(opt => {
                const active = isChipActive(opt);
                const color = getPosColor(group.pos);
                return (
                  <button
                    key={opt}
                    className={`${styles.chip} ${active ? styles.chipActive : ''}`}
                    style={active ? {
                      background: `${color}25`,
                      borderColor: color,
                      color: color
                    } : undefined}
                    onClick={() => toggleChip(opt)}
                  >
                    {ARCHETYPE_METADATA[opt]?.name || opt}
                  </button>
                );
              })}
            </React.Fragment>
          ))}
        </div>
      );
    }

    return (
      <div className={styles.filterPanel}>
        <div className={styles.filterLabel}>
          <span>Filter by Strategy:</span>
        </div>

        <div className={styles.filterColumn}>
          <label style={{ fontSize: 13, fontWeight: 600, color: getPosColor('RB'), textTransform: 'uppercase' }}>
            RB Strategy
          </label>
          <select
            value={rbFilter}
            onChange={e => setRbFilter(e.target.value)}
            className={styles.filterSelect}
          >
            {RB_OPTIONS.map(opt => (
              <option key={opt} value={opt}>
                {opt === 'Any' ? 'Any' : ARCHETYPE_METADATA[opt]?.name || opt}
              </option>
            ))}
          </select>
        </div>

        <div className={styles.filterColumn}>
          <label style={{ fontSize: 13, fontWeight: 600, color: getPosColor('QB'), textTransform: 'uppercase' }}>
            QB Strategy
          </label>
          <select
            value={qbFilter}
            onChange={e => setQbFilter(e.target.value)}
            className={styles.filterSelect}
          >
            {QB_OPTIONS.map(opt => (
              <option key={opt} value={opt}>
                {opt === 'Any' ? 'Any' : ARCHETYPE_METADATA[opt]?.name || opt}
              </option>
            ))}
          </select>
        </div>

        <div className={styles.filterColumn}>
          <label style={{ fontSize: 13, fontWeight: 600, color: getPosColor('TE'), textTransform: 'uppercase' }}>
            TE Strategy
          </label>
          <select
            value={teFilter}
            onChange={e => setTeFilter(e.target.value)}
            className={styles.filterSelect}
          >
            {TE_OPTIONS.map(opt => (
              <option key={opt} value={opt}>
                {opt === 'Any' ? 'Any' : ARCHETYPE_METADATA[opt]?.name || opt}
              </option>
            ))}
          </select>
        </div>

        {hasActiveFilter && (
          <div className={styles.filterResults}>
            <span style={{ fontSize: 14, color: 'var(--text-secondary)', fontStyle: 'italic' }}>
              Showing {totalFilteredEntries} rosters matching:
            </span>
            <div className={styles.filterBadgeRow}>
              {rbFilter !== 'Any' && (
                <span className={styles.filterBadge} style={{
                  background: `${getPosColor('RB')}20`,
                  border: `1px solid ${getPosColor('RB')}40`,
                  color: getPosColor('RB')
                }}>
                  {ARCHETYPE_METADATA[rbFilter]?.name}
                </span>
              )}
              {qbFilter !== 'Any' && (
                <span className={styles.filterBadge} style={{
                  background: `${getPosColor('QB')}20`,
                  border: `1px solid ${getPosColor('QB')}40`,
                  color: getPosColor('QB')
                }}>
                  {ARCHETYPE_METADATA[qbFilter]?.name}
                </span>
              )}
              {teFilter !== 'Any' && (
                <span className={styles.filterBadge} style={{
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
    );
  };

  const renderMobileSortBar = () => (
    <div className={styles.sortBar}>
      <select
        className={styles.sortSelect}
        value={sortField}
        onChange={e => {
          const field = e.target.value;
          setSortField(field);
          if (field === 'adp' || field === 'name' || field === 'adpTrend') setSortDir('asc');
          else setSortDir('desc');
        }}
      >
        {SORT_OPTIONS.map(opt => (
          <option key={opt.value} value={opt.value}>{opt.label}</option>
        ))}
      </select>
      <button
        className={styles.sortDirButton}
        onClick={() => setSortDir(prev => prev === 'asc' ? 'desc' : 'asc')}
        aria-label={`Sort ${sortDir === 'asc' ? 'ascending' : 'descending'}`}
      >
        {sortDir === 'asc' ? '▲' : '▼'}
      </button>
    </div>
  );

  const renderPlayerCard = (p, virtualRow) => {
    const posColor = getPosColor(p.position);
    const displayExp = hasActiveFilter ? (p.filteredExposure || 0) : (p.exposure || 0);
    const displayCount = hasActiveFilter ? (p.filteredCount || 0) : (p.count || 0);
    const isExpanded = expandedId === (p.stableId || p.name);

    return (
      <div
        key={virtualRow.key}
        data-index={virtualRow.index}
        ref={virtualizer.measureElement}
        className={styles.playerCard}
        style={{
          position: 'absolute',
          top: 0,
          left: 0,
          width: '100%',
          transform: `translateY(${virtualRow.start}px)`,
          borderLeft: `4px solid ${posColor}`,
          opacity: displayCount === 0 ? 0.5 : 1,
        }}
        onClick={() => setExpandedId(isExpanded ? null : (p.stableId || p.name))}
      >
        <div className={styles.cardRow1}>
          <span className={styles.cardName}>{p.name}</span>
          <span
            className={styles.cardPosBadge}
            style={{ background: `${posColor}25`, color: posColor }}
          >
            {p.position}
          </span>
          <span className={styles.cardTeam}>{p.team}</span>
        </div>
        <div className={styles.cardRow2}>
          <div className={styles.cardStat}>
            <span className={styles.cardStatLabel}>Exp</span>
            <span className={styles.cardStatValue}>{parseFloat(displayExp).toFixed(1)}%</span>
          </div>
          <div className={styles.cardStat}>
            <span className={styles.cardStatLabel}>Count</span>
            <span className={styles.cardStatValue}>{displayCount}</span>
          </div>
          <div className={styles.cardStat}>
            <span className={styles.cardStatLabel}>ADP</span>
            <span className={styles.cardStatValue}>{p.adpDisplay}</span>
          </div>
        </div>
        {isExpanded && (
          <div className={styles.cardExpanded}>
            <div className={styles.cardSparkline}>
              <AdpSparkline history={p.history} />
            </div>
            {p.trendValue !== null && (
              <div className={styles.cardTrend}>
                2-wk trend: {p.trendValue > 0 ? '+' : ''}{p.trendValue.toFixed(1)} picks
              </div>
            )}
          </div>
        )}
      </div>
    );
  };

  const renderCardList = () => (
    <div
      className="exposure-table card"
      style={{ padding: 0, flex: 1, minHeight: 0 }}
    >
      <div
        ref={tableContainerRef}
        style={{ overflowY: 'auto', flex: 1, minHeight: 0 }}
      >
        {filteredAndSorted.length === 0 ? (
          <div style={{ padding: '2rem', textAlign: 'center', color: 'var(--text-secondary)' }}>
            {masterPlayers.length === 0
              ? 'No data loaded. Use the Upload button above to import your Underdog Exposure CSV.'
              : 'No players match.'}
          </div>
        ) : (
          <div
            className={styles.cardList}
            style={{ height: virtualizer.getTotalSize(), position: 'relative' }}
          >
            {virtualizer.getVirtualItems().map(virtualRow => {
              const p = filteredAndSorted[virtualRow.index];
              return renderPlayerCard(p, virtualRow);
            })}
          </div>
        )}
      </div>
    </div>
  );

  const renderTable = () => (
    <div className={`exposure-table card ${styles.tableCard}`}>
      <div
        className="table-container"
        ref={tableContainerRef}
        style={{ overflowY: 'auto', flex: 1, minHeight: 0 }}
      >
        <table
          className="exposure-fixed-table"
          style={{ width: '100%', borderCollapse: 'collapse', tableLayout: 'fixed' }}
        >
          <colgroup>
            <col className={styles.colName} />
            <col className={styles.colPos} />
            <col className={styles.colTeam} />
            <col className={styles.colExposure} />
            <col className={styles.colCount} />
            <col className={styles.colAdp} />
            <col className={`${styles.colTrend} ${styles.trendCol}`} />
          </colgroup>

          <thead className={styles.thead}>
            <tr>
              <th className={styles.headerCell} onClick={() => onSort('name')}>Player {sortArrow('name')}</th>
              <th className={styles.headerCell} onClick={() => onSort('position')}>Pos {sortArrow('position')}</th>
              <th className={styles.headerCell} onClick={() => onSort('team')}>Team {sortArrow('team')}</th>
              <th className={styles.headerCell} onClick={() => onSort('exposure')}>Exposure % {sortArrow('exposure')}</th>
              <th className={styles.headerCell} style={{ textAlign: 'right' }} onClick={() => onSort('count')}>Count {sortArrow('count')}</th>
              <th className={styles.headerCell} style={{ textAlign: 'right' }} onClick={() => onSort('adp')}>ADP {sortArrow('adp')}</th>
              <th className={`${styles.headerCell} ${styles.trendCol}`} onClick={() => onSort('adpTrend')}>ADP Trend {sortArrow('adpTrend')}</th>
            </tr>
          </thead>

          <tbody>
            {filteredAndSorted.length === 0 ? (
              <tr>
                <td colSpan={7} style={{ padding: '2rem', textAlign: 'center', color: 'var(--text-secondary)' }}>
                  {masterPlayers.length === 0
                    ? 'No data loaded. Use the Upload button above to import your Underdog Exposure CSV.'
                    : 'No players match.'}
                </td>
              </tr>
            ) : (
              <>
                {virtualizer.getVirtualItems().length > 0 && (
                  <tr><td colSpan={7} style={{ height: virtualizer.getVirtualItems()[0].start, padding: 0, border: 'none' }} /></tr>
                )}
                {virtualizer.getVirtualItems().map(virtualRow => {
                  const p = filteredAndSorted[virtualRow.index];
                  const posColor = getPosColor(p.position);
                  const displayExp = hasActiveFilter ? (p.filteredExposure || 0) : (p.exposure || 0);
                  const displayCount = hasActiveFilter ? (p.filteredCount || 0) : (p.count || 0);

                  return (
                    <tr
                      key={virtualRow.key}
                      data-index={virtualRow.index}
                      ref={virtualizer.measureElement}
                      style={{ opacity: displayCount === 0 ? 0.5 : 1 }}
                    >
                      <td className={styles.cell} style={{ fontWeight: 600, borderLeft: `4px solid ${posColor}` }}>{p.name}</td>
                      <td className={styles.cell}>{p.position}</td>
                      <td className={styles.cell}>{p.team}</td>
                      <td className={styles.cell}>{parseFloat(displayExp).toFixed(1)}%</td>
                      <td className={styles.cell} style={{ textAlign: 'right' }}>{displayCount}</td>
                      <td className={styles.cell} style={{ textAlign: 'right' }}>{p.adpDisplay}</td>
                      <td className={`${styles.cell} ${styles.trendCol}`} style={{ padding: '8px 10px' }}>
                        <div className={styles.sparklineWrap}>
                          <AdpSparkline history={p.history} />
                        </div>
                      </td>
                    </tr>
                  );
                })}
                {virtualizer.getVirtualItems().length > 0 && (
                  <tr><td colSpan={7} style={{
                    height: virtualizer.getTotalSize() - (virtualizer.getVirtualItems().at(-1)?.end ?? 0),
                    padding: 0, border: 'none'
                  }} /></tr>
                )}
              </>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );

  return (
    <div className={styles.root}>
      {renderToolbar()}
      {renderFilters()}

      {hasActiveFilter && isMobile && (
        <div style={{ fontSize: 13, color: 'var(--text-secondary)', fontStyle: 'italic', marginBottom: 6 }}>
          {totalFilteredEntries} rosters matching filters
        </div>
      )}

      {rosterData.length === 0 && masterPlayers.length > 0 && (
        <div className={styles.infoBanner}>
          No roster uploaded — showing all ADP players. Upload your Underdog Exposure CSV for exposure data.
        </div>
      )}

      {isMobile && renderMobileSortBar()}
      {isMobile ? renderCardList() : renderTable()}
    </div>
  );
}
