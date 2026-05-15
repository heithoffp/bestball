import React, { useMemo, useState } from 'react';
import {
  PLAYOFF_WEEKS,
  aggregatePortfolioPlayoffStacks,
  aggregateByTeam,
  aggregatePerRoster,
} from '../utils/playoffStacks';
import playoffSchedule from '../data/playoff-schedule-2026.json';
import { NFL_TEAMS } from '../utils/nflTeams';
import styles from './PlayoffStacks.module.css';

const POS_COLOR_VAR = {
  QB: 'var(--pos-qb)',
  RB: 'var(--pos-rb)',
  WR: 'var(--pos-wr)',
  TE: 'var(--pos-te)',
};

const MAX_SEGMENTS = 60;

const VIEW_MODES = [
  { key: 'games', label: 'Games', hint: 'Matchups your portfolio is leveraged on' },
  { key: 'teams', label: 'Teams', hint: 'Each team’s schedule + your stack rate' },
  { key: 'rosters', label: 'Rosters', hint: 'Which lineups carry the most stacks' },
];

function shortEntry(id) {
  if (!id) return '???';
  if (id.length <= 10) return id;
  return id.slice(0, 6) + '…' + id.slice(-4);
}

function heatTint(pct) {
  // 0..100 -> 0..0.42 opacity teal tint
  if (pct <= 0) return 'transparent';
  const a = Math.min(0.42, 0.06 + (pct / 100) * 0.36);
  return `rgba(6, 182, 212, ${a.toFixed(3)})`;
}

function SortChev({ active, dir }) {
  if (!active) return <span className={styles.sortChev}>↕</span>;
  return <span className={`${styles.sortChev} ${styles.sortChevActive}`}>{dir === 'asc' ? '↑' : '↓'}</span>;
}

function SegmentBar({ totalRosters, rostersWithStack, stackedEntryIds, orderedEntryIds }) {
  if (totalRosters <= 0) return null;
  const useExact = totalRosters <= MAX_SEGMENTS;
  const segmentCount = useExact ? totalRosters : MAX_SEGMENTS;
  const filledCount = useExact
    ? rostersWithStack
    : Math.round((rostersWithStack / totalRosters) * MAX_SEGMENTS);

  const segments = [];
  for (let i = 0; i < segmentCount; i++) {
    let filled;
    if (useExact) {
      const entryId = orderedEntryIds[i];
      filled = entryId !== undefined && stackedEntryIds.has(entryId);
    } else {
      filled = i < filledCount;
    }
    segments.push(
      <div
        key={i}
        className={`${styles.segment} ${filled ? styles.segmentFilled : ''}`}
      />,
    );
  }
  return <div className={styles.segmentBar}>{segments}</div>;
}

function GameRow({ game, totalRosters, isLeader, leaderCount, onNavigateToRosters }) {
  const rosterCount = game.rosterEntryIds.size;
  const pct = totalRosters > 0 ? (rosterCount / totalRosters) * 100 : 0;
  const fillPct = leaderCount > 0 ? (rosterCount / leaderCount) * 100 : 0;

  const matchupTeams = useMemo(() => {
    const a = (NFL_TEAMS[game.teamA] || game.teamA).toUpperCase();
    const b = (NFL_TEAMS[game.teamB] || game.teamB).toUpperCase();
    return [a, b];
  }, [game.teamA, game.teamB]);

  const handleClick = () => {
    if (onNavigateToRosters) onNavigateToRosters({ teams: matchupTeams });
  };

  return (
    <button
      type="button"
      className={`${styles.gameRow} ${isLeader ? styles.gameRowLeader : ''}`}
      onClick={handleClick}
      title={onNavigateToRosters ? `View rosters stacked on ${game.teamA}–${game.teamB}` : undefined}
      disabled={!onNavigateToRosters}
    >
      <div
        className={`${styles.gameRowFill} ${isLeader ? styles.gameRowFillLeader : ''}`}
        style={{ width: `${fillPct}%` }}
      />
      <span className={styles.gameRowTeams}>
        <span className={styles.gameRowAbbr}>{game.teamA}</span>
        <span className={`${styles.gameRowVs} ${isLeader ? styles.gameRowVsLeader : ''}`}>vs</span>
        <span className={styles.gameRowAbbr}>{game.teamB}</span>
      </span>
      <span className={styles.gameRowStats}>
        <span className={`${styles.gameRowCount} ${isLeader ? styles.gameRowCountLeader : ''}`}>
          {rosterCount}
        </span>
        <span className={styles.gameRowPct}>{pct.toFixed(0)}%</span>
      </span>
    </button>
  );
}

function WeekColumn({ week, weekData, totalRosters, minCount, stackedEntryIds, orderedEntryIds, onNavigateToRosters }) {
  const count = weekData?.rostersWithAny.size ?? 0;
  const pct = totalRosters > 0 ? (count / totalRosters) * 100 : 0;

  const filteredGames = useMemo(() => {
    if (!weekData) return [];
    return [...weekData.games.values()]
      .filter(g => g.rosterEntryIds.size >= minCount)
      .sort((a, b) => {
        const cmp = b.rosterEntryIds.size - a.rosterEntryIds.size;
        if (cmp !== 0) return cmp;
        if (a.teamA !== b.teamA) return a.teamA.localeCompare(b.teamA);
        return a.teamB.localeCompare(b.teamB);
      });
  }, [weekData, minCount]);

  const leaderCount = filteredGames[0]?.rosterEntryIds.size ?? 0;

  return (
    <div className={styles.weekColumn}>
      <div className={styles.weekColumnHeader}>
        <div className={styles.weekColumnHeaderRow}>
          <span className={styles.weekColumnLabel}>Week {week}</span>
          <span className={styles.weekColumnPct}>{pct.toFixed(0)}%</span>
        </div>
        <div className={styles.weekColumnSub}>
          <span className={styles.weekColumnCount}>{count}</span>
          <span className={styles.weekColumnDenom}>/ {totalRosters} stacked</span>
        </div>
        <SegmentBar
          totalRosters={totalRosters}
          rostersWithStack={count}
          stackedEntryIds={stackedEntryIds}
          orderedEntryIds={orderedEntryIds}
        />
      </div>
      <div className={styles.weekColumnGames}>
        {filteredGames.length === 0 ? (
          <div className={styles.weekColumnEmpty}>
            {count === 0 ? 'No stacks' : 'None meet min'}
          </div>
        ) : (
          filteredGames.map((game, idx) => (
            <GameRow
              key={`${game.teamA}|${game.teamB}`}
              game={game}
              totalRosters={totalRosters}
              isLeader={idx === 0}
              leaderCount={leaderCount}
              onNavigateToRosters={onNavigateToRosters}
            />
          ))
        )}
      </div>
    </div>
  );
}

// ─── Games view ────────────────────────────────────────────────────────────

function GamesView({ aggregate, totalRosters, minCount, orderedEntryIds, onNavigateToRosters }) {
  return (
    <div className={styles.gamesGrid} data-help-id="playoff-card">
      {PLAYOFF_WEEKS.map(week => (
        <WeekColumn
          key={week}
          week={week}
          weekData={aggregate.weeks[week]}
          totalRosters={totalRosters}
          minCount={minCount}
          stackedEntryIds={aggregate.weeks[week]?.rostersWithAny ?? new Set()}
          orderedEntryIds={orderedEntryIds}
          onNavigateToRosters={onNavigateToRosters}
        />
      ))}
    </div>
  );
}

// ─── Teams view ───────────────────────────────────────────────────────────

function TeamsView({ aggregate, totalRosters, onNavigateToRosters }) {
  const [sortKey, setSortKey] = useState('total');
  const [sortDir, setSortDir] = useState('desc');

  const teamMap = useMemo(() => aggregateByTeam(aggregate, playoffSchedule), [aggregate]);

  const rows = useMemo(() => {
    return [...teamMap.values()].map(t => {
      const w15 = t.weeks[15].rosterIds.size;
      const w16 = t.weeks[16].rosterIds.size;
      const w17 = t.weeks[17].rosterIds.size;
      const total = t.anyStackRosters.size;
      const piecesCount = t.pieces.size;
      const teamFull = (NFL_TEAMS[t.team] || t.team).toUpperCase();
      return {
        team: t.team,
        teamFull,
        pieces: t.pieces,
        piecesCount,
        weeks: {
          15: { opp: t.weeks[15].opponent, count: w15, pct: totalRosters > 0 ? (w15 / totalRosters) * 100 : 0 },
          16: { opp: t.weeks[16].opponent, count: w16, pct: totalRosters > 0 ? (w16 / totalRosters) * 100 : 0 },
          17: { opp: t.weeks[17].opponent, count: w17, pct: totalRosters > 0 ? (w17 / totalRosters) * 100 : 0 },
        },
        total,
        totalPct: totalRosters > 0 ? (total / totalRosters) * 100 : 0,
      };
    });
  }, [teamMap, totalRosters]);

  const sortedRows = useMemo(() => {
    const direction = sortDir === 'asc' ? 1 : -1;
    return [...rows].sort((a, b) => {
      let av, bv;
      switch (sortKey) {
        case 'team': av = a.team; bv = b.team; break;
        case 'pieces': av = a.piecesCount; bv = b.piecesCount; break;
        case '15': av = a.weeks[15].count; bv = b.weeks[15].count; break;
        case '16': av = a.weeks[16].count; bv = b.weeks[16].count; break;
        case '17': av = a.weeks[17].count; bv = b.weeks[17].count; break;
        case 'total':
        default: av = a.total; bv = b.total; break;
      }
      if (av < bv) return -1 * direction;
      if (av > bv) return 1 * direction;
      return a.team.localeCompare(b.team);
    });
  }, [rows, sortKey, sortDir]);

  const toggleSort = (key) => {
    if (sortKey === key) {
      setSortDir(d => (d === 'asc' ? 'desc' : 'asc'));
    } else {
      setSortKey(key);
      setSortDir(key === 'team' ? 'asc' : 'desc');
    }
  };

  if (rows.length === 0) {
    return (
      <div className={styles.emptyCaption}>
        No teams in your portfolio form a meaningful playoff stack.
      </div>
    );
  }

  return (
    <div className={styles.teamsWrap}>
      <div className={styles.teamsLegend}>
        <span className={styles.legendDot} />
        <span className={styles.legendLabel}>Cell tint = your stack rate. Click any header to sort.</span>
      </div>

      <div className={styles.teamsTableScroll} data-help-id="playoff-teams">
        <table className={styles.teamsTable}>
          <thead>
            <tr>
              <th
                className={`${styles.thBase} ${styles.thTeam}`}
                onClick={() => toggleSort('team')}
              >
                <span>Team</span>
                <SortChev active={sortKey === 'team'} dir={sortDir} />
              </th>
              <th
                className={`${styles.thBase} ${styles.thPieces}`}
                onClick={() => toggleSort('pieces')}
              >
                <span>Your Pieces</span>
                <SortChev active={sortKey === 'pieces'} dir={sortDir} />
              </th>
              {PLAYOFF_WEEKS.map(w => (
                <th
                  key={w}
                  className={`${styles.thBase} ${styles.thWeek}`}
                  onClick={() => toggleSort(w)}
                >
                  <span className={styles.thWeekLabel}>W{w}</span>
                  <SortChev active={sortKey === w} dir={sortDir} />
                </th>
              ))}
              <th
                className={`${styles.thBase} ${styles.thTotal}`}
                onClick={() => toggleSort('total')}
              >
                <span>Any Wk</span>
                <SortChev active={sortKey === 'total'} dir={sortDir} />
              </th>
            </tr>
          </thead>
          <tbody>
            {sortedRows.map(r => (
              <tr key={r.team} className={styles.teamRow}>
                <td className={styles.tdTeam}>
                  <button
                    type="button"
                    className={styles.teamCell}
                    onClick={() => onNavigateToRosters && onNavigateToRosters({ teams: [r.teamFull] })}
                    title={`View rosters with ${r.teamFull} players`}
                  >
                    <span className={styles.teamAbbr}>{r.team}</span>
                    <span className={styles.teamFull}>{r.teamFull}</span>
                  </button>
                </td>
                <td className={styles.tdPieces}>
                  <TeamPieces pieces={r.pieces} />
                </td>
                {PLAYOFF_WEEKS.map(w => (
                  <td
                    key={w}
                    className={styles.tdWeek}
                    style={{ background: heatTint(r.weeks[w].pct) }}
                  >
                    <ScheduleCell
                      opp={r.weeks[w].opp}
                      count={r.weeks[w].count}
                      pct={r.weeks[w].pct}
                    />
                  </td>
                ))}
                <td className={styles.tdTotal} style={{ background: heatTint(r.totalPct) }}>
                  <div className={styles.totalCellInner}>
                    <span className={styles.totalCount}>{r.total}</span>
                    <span className={styles.totalPct}>{r.totalPct.toFixed(0)}%</span>
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function ScheduleCell({ opp, count, pct }) {
  if (!opp) {
    return <span className={styles.byeCell}>BYE</span>;
  }
  return (
    <div className={styles.scheduleCell}>
      <span className={styles.schedOpp}>vs {opp}</span>
      <div className={styles.schedStats}>
        <span className={styles.schedCount}>{count || '–'}</span>
        <span className={styles.schedPct}>{pct > 0 ? `${pct.toFixed(0)}%` : ' '}</span>
      </div>
    </div>
  );
}

function TeamPieces({ pieces }) {
  const sorted = useMemo(() => {
    const posOrder = { QB: 0, WR: 1, TE: 2, RB: 3 };
    return [...pieces.entries()]
      .map(([name, info]) => ({ name, ...info }))
      .sort((a, b) => {
        const cmp = (posOrder[a.position] ?? 9) - (posOrder[b.position] ?? 9);
        if (cmp !== 0) return cmp;
        if (b.rosterCount !== a.rosterCount) return b.rosterCount - a.rosterCount;
        return a.name.localeCompare(b.name);
      });
  }, [pieces]);
  if (sorted.length === 0) return <span className={styles.byeCell}>–</span>;
  return (
    <div className={styles.piecesRow}>
      {sorted.map(p => (
        <span key={p.name} className={styles.piece}>
          <span
            className={styles.piecePos}
            style={{ color: POS_COLOR_VAR[p.position] || 'var(--text-muted)' }}
          >
            {p.position}
          </span>
          <span className={styles.pieceName}>{p.name}</span>
          {p.rosterCount > 1 && (
            <span className={styles.pieceCount}>×{p.rosterCount}</span>
          )}
        </span>
      ))}
    </div>
  );
}

// ─── Rosters view ─────────────────────────────────────────────────────────

function RostersView({ rosters, totalRosters, onNavigateToRosters }) {
  const [sortKey, setSortKey] = useState('total');
  const [sortDir, setSortDir] = useState('desc');

  const perRoster = useMemo(() => aggregatePerRoster(rosters, playoffSchedule), [rosters]);

  const stats = useMemo(() => {
    if (perRoster.length === 0) return { maxTotal: 0, avg: 0, naked: 0, allWeeks: 0 };
    let maxTotal = 0;
    let sumTotal = 0;
    let naked = 0;
    let allWeeks = 0;
    for (const r of perRoster) {
      if (r.counts.total > maxTotal) maxTotal = r.counts.total;
      sumTotal += r.counts.total;
      if (r.counts.total === 0) naked += 1;
      if (r.counts.weeksCovered === 3) allWeeks += 1;
    }
    return {
      maxTotal,
      avg: sumTotal / perRoster.length,
      naked,
      allWeeks,
    };
  }, [perRoster]);

  const sortedRows = useMemo(() => {
    const direction = sortDir === 'asc' ? 1 : -1;
    return [...perRoster].sort((a, b) => {
      let av, bv;
      switch (sortKey) {
        case 'entry': av = a.entryId; bv = b.entryId; break;
        case '15': av = a.counts[15]; bv = b.counts[15]; break;
        case '16': av = a.counts[16]; bv = b.counts[16]; break;
        case '17': av = a.counts[17]; bv = b.counts[17]; break;
        case 'coverage': av = a.counts.weeksCovered; bv = b.counts.weeksCovered; break;
        case 'rank':
        case 'total':
        default: av = a.counts.total; bv = b.counts.total; break;
      }
      if (av < bv) return -1 * direction;
      if (av > bv) return 1 * direction;
      return a.index - b.index;
    });
  }, [perRoster, sortKey, sortDir]);

  // Rank by total stacks (independent of current sort) so the "rank gutter"
  // remains meaningful when the user sorts by another column.
  const rankByEntry = useMemo(() => {
    const sortedForRank = [...perRoster].sort((a, b) => {
      const cmp = b.counts.total - a.counts.total;
      if (cmp !== 0) return cmp;
      return a.index - b.index;
    });
    const map = new Map();
    sortedForRank.forEach((r, i) => map.set(r.entryId, i + 1));
    return map;
  }, [perRoster]);

  const toggleSort = (key) => {
    if (sortKey === key) {
      setSortDir(d => (d === 'asc' ? 'desc' : 'asc'));
    } else {
      setSortKey(key);
      setSortDir(key === 'entry' ? 'asc' : 'desc');
    }
  };

  if (perRoster.length === 0) {
    return (
      <div className={styles.emptyCaption}>
        No rosters loaded.
      </div>
    );
  }

  return (
    <div className={styles.rostersWrap}>
      <div className={styles.rosterSummary}>
        <div className={styles.summaryBlock}>
          <span className={styles.summaryNum}>{stats.maxTotal}</span>
          <span className={styles.summaryLabel}>most stacks</span>
        </div>
        <div className={styles.summaryDivider} />
        <div className={styles.summaryBlock}>
          <span className={styles.summaryNum}>{stats.avg.toFixed(1)}</span>
          <span className={styles.summaryLabel}>avg per roster</span>
        </div>
        <div className={styles.summaryDivider} />
        <div className={styles.summaryBlock}>
          <span className={styles.summaryNum}>{stats.allWeeks}</span>
          <span className={styles.summaryLabel}>iron (3/3 weeks)</span>
        </div>
        <div className={styles.summaryDivider} />
        <div className={`${styles.summaryBlock} ${styles.summaryBlockNaked}`}>
          <span className={styles.summaryNum}>{stats.naked}</span>
          <span className={styles.summaryLabel}>naked (0 stacks)</span>
        </div>
        <div className={styles.summarySpacer} />
        <div className={styles.summaryRosterCount}>{totalRosters} rosters total</div>
      </div>

      <div className={styles.rostersTableScroll} data-help-id="playoff-rosters">
        <table className={styles.rostersTable}>
          <thead>
            <tr>
              <th className={`${styles.thBase} ${styles.thRank}`} onClick={() => toggleSort('rank')}>
                <span>#</span>
                <SortChev active={sortKey === 'rank' || sortKey === 'total'} dir={sortDir} />
              </th>
              <th className={`${styles.thBase} ${styles.thEntry}`} onClick={() => toggleSort('entry')}>
                <span>Roster</span>
                <SortChev active={sortKey === 'entry'} dir={sortDir} />
              </th>
              {PLAYOFF_WEEKS.map(w => (
                <th
                  key={w}
                  className={`${styles.thBase} ${styles.thWeekRoster}`}
                  onClick={() => toggleSort(w)}
                >
                  <span>W{w}</span>
                  <SortChev active={sortKey === w} dir={sortDir} />
                </th>
              ))}
              <th className={`${styles.thBase} ${styles.thWeekRoster}`} onClick={() => toggleSort('total')}>
                <span>Total</span>
                <SortChev active={sortKey === 'total'} dir={sortDir} />
              </th>
              <th
                className={`${styles.thBase} ${styles.thCoverage}`}
                onClick={() => toggleSort('coverage')}
              >
                <span>Coverage</span>
                <SortChev active={sortKey === 'coverage'} dir={sortDir} />
              </th>
            </tr>
          </thead>
          <tbody>
            {sortedRows.map(r => {
              const rank = rankByEntry.get(r.entryId);
              const naked = r.counts.total === 0;
              const iron = r.counts.weeksCovered === 3;
              const fillPct = stats.maxTotal > 0 ? (r.counts.total / stats.maxTotal) * 100 : 0;
              return (
                <tr
                  key={r.entryId}
                  className={`${styles.rosterRow} ${naked ? styles.rosterRowNaked : ''} ${iron ? styles.rosterRowIron : ''}`}
                >
                  <td className={styles.tdRank}>
                    <span className={`${styles.rankBadge} ${rank <= 3 ? styles.rankBadgeTop : ''}`}>
                      {rank}
                    </span>
                  </td>
                  <td className={styles.tdEntry}>
                    <div className={styles.entryCell}>
                      <button
                        type="button"
                        className={styles.entryButton}
                        onClick={() => onNavigateToRosters && onNavigateToRosters({ entry_id: r.entryId })}
                        title="Jump to this roster"
                      >
                        {shortEntry(r.entryId)}
                      </button>
                      {r.slateTitle && (
                        <span className={styles.entrySlate}>{r.slateTitle}</span>
                      )}
                    </div>
                  </td>
                  {PLAYOFF_WEEKS.map(w => (
                    <td key={w} className={styles.tdCount}>
                      <CountChip value={r.counts[w]} />
                    </td>
                  ))}
                  <td className={styles.tdTotalCount}>
                    <div className={styles.totalBarWrap}>
                      <div
                        className={`${styles.totalBarFill} ${iron ? styles.totalBarFillIron : ''}`}
                        style={{ width: `${fillPct}%` }}
                      />
                      <span className={styles.totalBarValue}>{r.counts.total}</span>
                    </div>
                  </td>
                  <td className={styles.tdCoverage}>
                    <CoverageDots counts={r.counts} />
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function CountChip({ value }) {
  if (!value) return <span className={styles.countChipEmpty}>0</span>;
  return <span className={styles.countChip}>{value}</span>;
}

function CoverageDots({ counts }) {
  return (
    <span className={styles.coverageDots}>
      {PLAYOFF_WEEKS.map(w => (
        <span
          key={w}
          className={`${styles.covDot} ${counts[w] > 0 ? styles.covDotOn : ''}`}
          title={`W${w}: ${counts[w]} stack${counts[w] === 1 ? '' : 's'}`}
        />
      ))}
    </span>
  );
}

// ─── Root component ───────────────────────────────────────────────────────

export default function PlayoffStacks({
  rosters = [],
  totalRosters = 0,
  minCount = 1,
  onNavigateToRosters = null,
}) {
  const [viewMode, setViewMode] = useState('games');

  const aggregate = useMemo(
    () => aggregatePortfolioPlayoffStacks(rosters, playoffSchedule),
    [rosters],
  );

  const orderedEntryIds = useMemo(
    () => rosters.map(r => r[0]?.entry_id || 'unknown'),
    [rosters],
  );

  const portfolioStats = useMemo(() => {
    const anyWeek = new Set();
    for (const w of PLAYOFF_WEEKS) {
      for (const id of aggregate.weeks[w].rostersWithAny) anyWeek.add(id);
    }
    return {
      anyWeek: anyWeek.size,
      anyWeekPct: totalRosters > 0 ? (anyWeek.size / totalRosters) * 100 : 0,
      naked: aggregate.nakedRosters.size,
    };
  }, [aggregate, totalRosters]);

  return (
    <div className={styles.root}>
      <div className={styles.console}>
        <div className={styles.viewSwitch} data-help-id="playoff-view-switch">
          {VIEW_MODES.map(v => (
            <button
              key={v.key}
              type="button"
              className={`${styles.viewSwitchBtn} ${viewMode === v.key ? styles.viewSwitchBtnActive : ''}`}
              onClick={() => setViewMode(v.key)}
            >
              {v.label}
            </button>
          ))}
        </div>

        <div className={styles.consoleRight}>
          <div className={styles.consoleStat}>
            <span className={styles.consoleStatNum}>{portfolioStats.anyWeek}</span>
            <span className={styles.consoleStatSlash}>/</span>
            <span className={styles.consoleStatDenom}>{totalRosters}</span>
            <span className={styles.consoleStatLabel}>stacked any wk</span>
            <span className={styles.consoleStatPct}>{portfolioStats.anyWeekPct.toFixed(0)}%</span>
          </div>
          {portfolioStats.naked > 0 && (
            <div className={`${styles.consoleStat} ${styles.consoleStatNaked}`}>
              <span className={styles.consoleStatNum}>{portfolioStats.naked}</span>
              <span className={styles.consoleStatLabel}>naked</span>
            </div>
          )}
        </div>
      </div>

      {viewMode === 'games' && (
        <GamesView
          aggregate={aggregate}
          totalRosters={totalRosters}
          minCount={minCount}
          orderedEntryIds={orderedEntryIds}
          onNavigateToRosters={onNavigateToRosters}
        />
      )}

      {viewMode === 'teams' && (
        <TeamsView
          aggregate={aggregate}
          totalRosters={totalRosters}
          onNavigateToRosters={onNavigateToRosters}
        />
      )}

      {viewMode === 'rosters' && (
        <RostersView
          rosters={rosters}
          totalRosters={totalRosters}
          onNavigateToRosters={onNavigateToRosters}
        />
      )}
    </div>
  );
}
