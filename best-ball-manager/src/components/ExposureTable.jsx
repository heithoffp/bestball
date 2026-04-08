import React, { useEffect, useMemo, useRef, useState } from 'react';
import { useVirtualizer } from '@tanstack/react-virtual';
import AdpSparkline from './AdpSparkline';
import { ARCHETYPE_METADATA, classifyRosterPath } from '../utils/rosterArchetypes';
import useMediaQuery from '../hooks/useMediaQuery';
import TabLayout from './TabLayout';
import { SearchInput } from './filters';
import { NFL_TEAMS } from '../utils/nflTeams';
import { canonicalName } from '../utils/helpers';
import TournamentMultiSelect from './TournamentMultiSelect';
import styles from './ExposureTable.module.css';
import { FolderSync } from 'lucide-react';
import EmptyState from './EmptyState';

// --- Shared Utilities ---
const COLORS = {
  QB: '#bf44ef',
  RB: '#10b981',
  WR: '#f59e0b',
  TE: '#3b82f6',
  default: '#6b7280'
};

const getPosColor = (pos) => COLORS[pos] || COLORS.default;

const archetypeColor = (key) => ARCHETYPE_METADATA[key]?.color || '#6b7280';

function FilterGroup({ label, options, value, onChange, posColor }) {
  return (
    <div className={styles.filterGroupInner}>
      <span className={styles.filterGroupLabel} style={{ color: posColor }}>{label}</span>
      <div style={{ display: 'flex', gap: 5, flexWrap: 'wrap' }}>
        {options.map(opt => {
          const isActive = value === opt;
          const color = opt === 'Any' ? '#E8BF4A' : archetypeColor(opt);
          const name = opt === 'Any' ? 'All' : (ARCHETYPE_METADATA[opt]?.name || opt);
          return (
            <button
              key={opt}
              title={ARCHETYPE_METADATA[opt]?.desc}
              className={`filter-chip ${isActive ? 'filter-chip--active' : ''}`}
              style={opt === 'Any'
                ? (isActive ? { background: color + '1a', borderColor: color, color } : {})
                : {
                    background: isActive ? color + '30' : color + '12',
                    borderColor: isActive ? color : color + '44',
                    color: isActive ? color : color + 'cc',
                  }}
              onClick={() => onChange(opt)}
            >
              {name}
            </button>
          );
        })}
      </div>
    </div>
  );
}

// Archetype filter options
const RB_OPTIONS = ['Any', 'RB_ZERO', 'RB_HERO', 'RB_DOUBLE_ANCHOR', 'RB_HYPER_FRAGILE', 'RB_BALANCED'];
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

const HELP_ANNOTATIONS = [
  { id: 'search-controls', label: 'Search & Filters', anchor: 'below', description: 'Search by player name, team, or position. Filter by tournament to scope exposure to specific slates.' },
  { id: 'archetype-filters', label: 'Strategy Filters', anchor: 'below', description: 'Filter by RB/QB/TE draft strategy. Exposure % recalculates for matching rosters only.' },
  { id: 'show-undrafted', label: 'Show 0% Toggle', anchor: 'below', description: 'Include players you haven\'t drafted. Useful for spotting ADP market gaps.' },
  { id: 'column-headers', label: 'Sortable Columns', anchor: 'below', description: 'Click any column header to sort. Exposure % = how many of your rosters include this player.' },
  { id: 'adp-trend', label: 'ADP Trend', anchor: 'left', description: 'Sparkline showing 2-week ADP movement. Rising ADP = falling draft cost.' },
];

export default function ExposureTable({ masterPlayers = [], rosterData = [], onNavigateToRosters = null, helpOpen = false, onHelpToggle }) {
  const { isMobile } = useMediaQuery();

  const [search, setSearch] = useState('');
  const [sortField, setSortField] = useState(rosterData.length === 0 ? 'adp' : 'exposure');
  const [sortDir, setSortDir] = useState(rosterData.length === 0 ? 'asc' : 'desc');
  const [showUndrafted, setShowUndrafted] = useState(rosterData.length === 0);

  const [rbFilter, setRbFilter] = useState('Any');
  const [qbFilter, setQbFilter] = useState('Any');
  const [teFilter, setTeFilter] = useState('Any');
  const [selectedTournaments, setSelectedTournaments] = useState([]);

  const [expandedId, setExpandedId] = useState(null);

  // Reset expandedId when filters/sort/search change
  useEffect(() => {
    setExpandedId(null);
  }, [search, sortField, sortDir, rbFilter, qbFilter, teFilter, selectedTournaments, showUndrafted]);

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
      const rosterTournament = roster[0]?.tournamentTitle || null;
      const tournamentMatch = selectedTournaments.length === 0
        || selectedTournaments.includes(rosterTournament);

      if (rbMatch && qbMatch && teMatch && tournamentMatch) {
        filtered.push({ id, roster, path });
      }
    });

    const playerCounts = {};
    filtered.forEach(({ roster }) => {
      roster.forEach(player => {
        const key = canonicalName(player.name || '');
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
  }, [rosterData, rbFilter, qbFilter, teFilter, selectedTournaments]);

  const slateGroups = useMemo(() => {
    const map = new Map();
    rosterData.forEach(p => {
      if (!p.tournamentTitle) return;
      const slate = p.slateTitle || 'Other';
      if (!map.has(slate)) map.set(slate, new Set());
      map.get(slate).add(p.tournamentTitle);
    });
    return [...map.entries()]
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([slate, tourns]) => ({ slate, tournaments: [...tourns].sort() }));
  }, [rosterData]);


  const playersWithFilteredExposure = useMemo(() => {
    const now = new Date();
    const twoWeeksAgo = new Date(now);
    twoWeeksAgo.setDate(twoWeeksAgo.getDate() - 14);

    return masterPlayers.map(p => {
      const nameKey = canonicalName(p.name || '');
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

  const hasActiveFilter = rbFilter !== 'Any' || qbFilter !== 'Any' || teFilter !== 'Any' || selectedTournaments.length > 0;

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
        const hay = `${p.name || ''} ${p.team || ''} ${NFL_TEAMS[p.team] || ''} ${p.position || ''}`.toLowerCase();
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
  }, [playersWithFilteredExposure, search, sortField, sortDir, showUndrafted, hasActiveFilter]);

  const sortArrow = (field) => {
    if (field !== sortField) return '⇅';
    return sortDir === 'asc' ? '▲' : '▼';
  };

  const tableContainerRef = useRef(null);

  // eslint-disable-next-line react-hooks/incompatible-library
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

  const renderDesktopFilters = () => (
    <div className={styles.controlPanel}>
      {/* Row 1: Search + Tournament + Show 0% toggle chip + Result count */}
      <div className={styles.filterRow1} data-help-id="search-controls">
        <div style={{ flex: '0 1 375px', minWidth: 180 }}>
          <span className="filter-select-label">Player / Team Search</span>
          <SearchInput value={search} onChange={setSearch} placeholder="Search name, team, pos..." />
        </div>
        <TournamentMultiSelect
          slateGroups={slateGroups}
          selected={selectedTournaments}
          onChange={setSelectedTournaments}
        />
        <button
          className={`filter-chip ${showUndrafted ? 'filter-chip--active' : ''}`}
          style={showUndrafted ? { background: 'var(--accent-muted)', borderColor: 'var(--accent)', color: 'var(--accent)' } : {}}
          onClick={() => setShowUndrafted(prev => !prev)}
          data-help-id="show-undrafted"
        >
          Show 0% Exposures
        </button>
        {hasActiveFilter && (
          <span className="filter-count" style={{ marginLeft: 0 }}>
            <strong style={{ color: 'var(--positive)' }}>{totalFilteredEntries}</strong>
            {' '}roster{totalFilteredEntries !== 1 ? 's' : ''} match
          </span>
        )}
      </div>
      {/* Row 2: Archetype chips */}
      <div className={styles.filterRow2} data-help-id="archetype-filters">
        <FilterGroup label="RB" options={RB_OPTIONS} value={rbFilter} onChange={setRbFilter} posColor={getPosColor('RB')} />
        <div className={styles.filterSep} />
        <FilterGroup label="QB" options={QB_OPTIONS} value={qbFilter} onChange={setQbFilter} posColor={getPosColor('QB')} />
        <div className={styles.filterSep} />
        <FilterGroup label="TE" options={TE_OPTIONS} value={teFilter} onChange={setTeFilter} posColor={getPosColor('TE')} />
      </div>
    </div>
  );

  const renderFilters = () => {
    if (isMobile) {
      return (
        <div className="filter-chip-group filter-chip-group--scroll">
          {CHIP_GROUPS.map((group, gi) => (
            <React.Fragment key={group.pos}>
              {gi > 0 && <div className="filter-chip-group__separator" />}
              {group.options.map(opt => {
                const active = isChipActive(opt);
                const posClass = `filter-chip--pos-${group.pos.toLowerCase()}`;
                return (
                  <button
                    key={opt}
                    className={`filter-chip ${active ? `filter-chip--active ${posClass}` : ''}`}
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
    return renderDesktopFilters();
  };

  const renderMobileSortBar = () => (
    <div className={styles.sortBar}>
      <select
        className="filter-select"
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
          masterPlayers.length === 0
            ? <EmptyState icon={FolderSync} title="No exposure data">
                Sync your rosters from the Chrome extension or upload a CSV to see exposure data.
              </EmptyState>
            : <div style={{ padding: '2rem', textAlign: 'center', color: 'var(--text-secondary)' }}>
                No players match.
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
            {onNavigateToRosters && <col className={styles.colNav} />}
          </colgroup>

          <thead className={styles.thead}>
            <tr data-help-id="column-headers">
              <th className={styles.headerCell} onClick={() => onSort('name')}>Player {sortArrow('name')}</th>
              <th className={styles.headerCell} onClick={() => onSort('position')}>Pos {sortArrow('position')}</th>
              <th className={styles.headerCell} onClick={() => onSort('team')}>Team {sortArrow('team')}</th>
              <th className={styles.headerCell} onClick={() => onSort('exposure')}>Exposure % {sortArrow('exposure')}</th>
              <th className={styles.headerCell} style={{ textAlign: 'right' }} onClick={() => onSort('count')}>Count {sortArrow('count')}</th>
              <th className={styles.headerCell} style={{ textAlign: 'right' }} onClick={() => onSort('adp')}>ADP {sortArrow('adp')}</th>
              <th className={`${styles.headerCell} ${styles.trendCol}`} onClick={() => onSort('adpTrend')} data-help-id="adp-trend">ADP Trend {sortArrow('adpTrend')}</th>
              {onNavigateToRosters && <th className={styles.headerCell} />}
            </tr>
          </thead>

          <tbody>
            {filteredAndSorted.length === 0 ? (
              masterPlayers.length === 0
                ? <tr>
                    <td colSpan={onNavigateToRosters ? 8 : 7} style={{ padding: 0, border: 'none' }}>
                      <EmptyState icon={FolderSync} title="No exposure data">
                        Sync your rosters from the Chrome extension or upload a CSV to see exposure data.
                      </EmptyState>
                    </td>
                  </tr>
                : <tr>
                    <td colSpan={onNavigateToRosters ? 8 : 7} style={{ padding: '2rem', textAlign: 'center', color: 'var(--text-secondary)' }}>
                      No players match.
                    </td>
                  </tr>
            ) : (
              <>
                {virtualizer.getVirtualItems().length > 0 && (
                  <tr><td colSpan={onNavigateToRosters ? 8 : 7} style={{ height: virtualizer.getVirtualItems()[0].start, padding: 0, border: 'none' }} /></tr>
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
                      {onNavigateToRosters && (
                        <td className={styles.cell} style={{ textAlign: 'center' }}>
                          {displayCount > 0 && (
                            <button
                              className={styles.seeRostersBtn}
                              onClick={e => { e.stopPropagation(); onNavigateToRosters({ players: [p.name] }); }}
                            >
                              Rosters →
                            </button>
                          )}
                        </td>
                      )}
                    </tr>
                  );
                })}
                {virtualizer.getVirtualItems().length > 0 && (
                  <tr><td colSpan={onNavigateToRosters ? 8 : 7} style={{
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

  const toolbarControls = isMobile ? (
    <>
      <SearchInput
        value={search}
        onChange={setSearch}
        placeholder="Search name, team, pos..."
      />
      <label className="filter-checkbox">
        <input
          type="checkbox"
          checked={showUndrafted}
          onChange={e => setShowUndrafted(e.target.checked)}
        />
        Show 0%
      </label>
    </>
  ) : null;

  const showMobileSummary = hasActiveFilter && isMobile;
  const showInfoBanner = rosterData.length === 0 && masterPlayers.length > 0;
  const bannerContent = (showMobileSummary || showInfoBanner) ? (
    <>
      {showMobileSummary && (
        <div style={{ fontSize: 13, color: 'var(--text-secondary)', fontStyle: 'italic', marginBottom: 6 }}>
          {totalFilteredEntries} rosters matching filters
        </div>
      )}
      {showInfoBanner && (
        <div className={styles.infoBanner}>
          Showing all ADP players. Sync your rosters to see exposure data.
        </div>
      )}
    </>
  ) : null;

  return (
    <TabLayout
      toolbar={toolbarControls}
      banner={bannerContent}
      flush
      helpAnnotations={HELP_ANNOTATIONS}
      helpOpen={helpOpen}
      onHelpToggle={onHelpToggle}
    >
      {isMobile ? (
        <>
          <div style={{ padding: '0 10px 8px', flexShrink: 0 }}>
            {renderFilters()}
          </div>
          {renderMobileSortBar()}
          {renderCardList()}
        </>
      ) : (
        <>
          {renderDesktopFilters()}
          {renderTable()}
        </>
      )}
    </TabLayout>
  );
}
