import React, { useMemo, useState } from 'react';
import { ResponsiveContainer, BarChart, Bar, XAxis, Tooltip, Legend } from 'recharts';
import { BarChart3, Users, TrendingUp, ListOrdered, Crosshair, FolderSync } from 'lucide-react';
import EmptyState from './EmptyState';
import { analyzePortfolioTree, ARCHETYPE_METADATA } from '../utils/rosterArchetypes';
import useMediaQuery from '../hooks/useMediaQuery';
import TabLayout from './TabLayout';
import styles from './Dashboard.module.css';

const POS_COLORS = { QB: '#bf44ef', RB: '#10b981', WR: '#f59e0b', TE: '#3b82f6' };

const fmtAdp = v => {
  const n = parseFloat(v);
  return Number.isFinite(n) ? n.toFixed(1) : '-';
};


const DRILL_CARDS = [
  { key: 'exposures', label: 'Exposures', icon: BarChart3 },
  { key: 'rosters', label: 'Rosters', icon: Users },
  { key: 'timeseries', label: 'ADP Tracker', icon: TrendingUp },
  { key: 'rankings', label: 'Rankings', icon: ListOrdered },
  { key: 'draftflow', label: 'Draft Assistant', icon: Crosshair },
];

const HELP_ANNOTATIONS = [
  { id: 'metrics-row', label: 'Portfolio Summary', description: 'Roster count and unique players drafted.' },
  { id: 'top-exposures', label: 'Top Exposures', description: 'Most-drafted players per position. Bar = exposure %.' },
  { id: 'exposure-by-round', label: 'Exposure by Round', description: 'Highest/lowest exposure per ADP round. Grey = 0% blind spots.' },
  { id: 'team-stacks', label: 'Team Stacks', description: 'QB + teammate pairings across rosters.' },
  { id: 'archetype-dist', label: 'Archetypes', description: 'RB/QB/TE strategy mix. Click a segment to filter rosters.' },
  { id: 'draft-capital', label: 'Draft Capital', description: 'Position mix by round. Solid = yours, faded = market.' },
  { id: 'drill-cards', label: 'Navigation', description: 'Click to jump to a detail tab.' },
];

export default function Dashboard({ rosterData = [], masterPlayers = [], adpSnapshots = [], onNavigate, onNavigateToRosters = null, helpOpen = false, onHelpToggle }) {
  const { isMobile } = useMediaQuery();
  const [hoveredSeg, setHoveredSeg] = useState(null);

  // ── Headline Metrics ──
  const metrics = useMemo(() => {
    const entryIds = new Set(rosterData.map(p => p.entry_id));
    const totalRosters = entryIds.size;
    const uniquePlayers = masterPlayers.filter(p => p.count > 0).length;

    return { totalRosters, uniquePlayers };
  }, [rosterData, masterPlayers]);

  // ── Archetype Distributions (RB, QB, TE) ──
  const { rbDistribution, qbDistribution, teDistribution } = useMemo(() => {
    const empty = { rbDistribution: [], qbDistribution: [], teDistribution: [] };
    if (rosterData.length === 0) return empty;
    const { totalEntries, tree } = analyzePortfolioTree(rosterData);
    if (totalEntries === 0) return empty;

    const rbDist = Object.entries(tree)
      .map(([key, node]) => ({
        key, label: ARCHETYPE_METADATA[key]?.name || key,
        count: node.count, pct: (node.count / totalEntries) * 100,
        color: ARCHETYPE_METADATA[key]?.color || '#6b7280',
      }))
      .filter(d => d.count > 0);

    // Aggregate QB counts across all RB branches
    const qbCounts = {};
    Object.values(tree).forEach(rbNode => {
      Object.entries(rbNode.children).forEach(([qbKey, qbNode]) => {
        qbCounts[qbKey] = (qbCounts[qbKey] || 0) + qbNode.count;
      });
    });
    const qbDist = Object.entries(qbCounts)
      .map(([key, count]) => ({
        key, label: ARCHETYPE_METADATA[key]?.name || key,
        count, pct: (count / totalEntries) * 100,
        color: ARCHETYPE_METADATA[key]?.color || '#6b7280',
      }))
      .filter(d => d.count > 0);

    // Aggregate TE counts across all RB -> QB branches
    const teCounts = {};
    Object.values(tree).forEach(rbNode => {
      Object.values(rbNode.children).forEach(qbNode => {
        Object.entries(qbNode.children).forEach(([teKey, teNode]) => {
          teCounts[teKey] = (teCounts[teKey] || 0) + teNode.count;
        });
      });
    });
    const teDist = Object.entries(teCounts)
      .map(([key, count]) => ({
        key, label: ARCHETYPE_METADATA[key]?.name || key,
        count, pct: (count / totalEntries) * 100,
        color: ARCHETYPE_METADATA[key]?.color || '#6b7280',
      }))
      .filter(d => d.count > 0);

    return { rbDistribution: rbDist, qbDistribution: qbDist, teDistribution: teDist };
  }, [rosterData]);

  // ── Top Exposures by Position ──
  const topExposures = useMemo(() => {
    const positions = ['QB', 'RB', 'WR', 'TE'];
    const result = {};
    positions.forEach(pos => {
      result[pos] = masterPlayers
        .filter(p => p.position === pos && p.count > 0)
        .sort((a, b) => parseFloat(b.exposure) - parseFloat(a.exposure))
        .slice(0, 5)
        .map(p => ({ name: p.name, exposure: parseFloat(p.exposure) }));
    });
    return result;
  }, [masterPlayers]);

  // ── Exposure by ADP Round (highest + lowest + blind spots) ──
  const exposureByRound = useMemo(() => {
    const totalRosters = metrics.totalRosters;
    if (totalRosters === 0) return [];
    const rounds = [];
    for (let r = 1; r <= 10; r++) {
      const start = (r - 1) * 12 + 1;
      const end = r * 12;
      const inRound = masterPlayers.filter(
        p => p.adpPick != null && p.adpPick >= start && p.adpPick <= end
      );
      if (inRound.length === 0) continue;
      const sorted = [...inRound].sort((a, b) => a.count - b.count);
      const highest = sorted[sorted.length - 1];

      const blindSpots = inRound
        .filter(p => p.count === 0)
        .sort((a, b) => a.adpPick - b.adpPick)
        .slice(0, 3)
        .map(p => ({ name: p.name, position: p.position, adp: p.adpDisplay }));

      const lowestEntry = sorted[0];
      const lowest = blindSpots.length === 0
        ? { name: lowestEntry.name, position: lowestEntry.position, exposure: parseFloat(lowestEntry.exposure), adp: lowestEntry.adpDisplay }
        : null;

      rounds.push({
        round: r,
        lowest,
        blindSpots,
        highest: { name: highest.name, position: highest.position, exposure: parseFloat(highest.exposure), adp: highest.adpDisplay },
      });
    }
    return rounds;
  }, [masterPlayers, metrics.totalRosters]);

  // ── Top Team Stacks ──
  const topTeamStacks = useMemo(() => {
    if (rosterData.length === 0) return [];
    const rosterMap = new Map();
    rosterData.forEach(p => {
      const id = p.entry_id || 'unknown';
      if (!rosterMap.has(id)) rosterMap.set(id, []);
      rosterMap.get(id).push(p);
    });
    const rosters = Array.from(rosterMap.values());
    const totalRosters = rosters.length;
    const teamCount = new Map();
    rosters.forEach(roster => {
      const countedTeams = new Set();
      roster.filter(p => p.position === 'QB').forEach(qb => {
        if (countedTeams.has(qb.team)) return;
        const hasStack = roster.some(p =>
          p.team === qb.team &&
          p.name !== qb.name &&
          ['WR', 'TE', 'RB'].includes(p.position)
        );
        if (hasStack) {
          countedTeams.add(qb.team);
          teamCount.set(qb.team, (teamCount.get(qb.team) || 0) + 1);
        }
      });
    });
    return Array.from(teamCount.entries())
      .filter(([team]) => team && team !== 'N/A' && team !== 'FA')
      .map(([team, count]) => ({ team, count, pct: ((count / totalRosters) * 100).toFixed(1) }))
      .sort((a, b) => b.count - a.count)
      .slice(0, 15);
  }, [rosterData]);

  // ── Draft Capital by Round (user vs market) ──
  const draftCapitalShape = useMemo(() => {
    const roundCounts = {};
    rosterData.forEach(p => {
      const r = p.round ? Number(p.round) : Math.ceil(Number(p.pick) / 12);
      if (r >= 1 && r <= 18) {
        if (!roundCounts[r]) roundCounts[r] = { QB: 0, RB: 0, WR: 0, TE: 0 };
        if (roundCounts[r][p.position] !== undefined) roundCounts[r][p.position]++;
      }
    });

    // Market positional breakdown from ADP
    const marketCounts = {};
    masterPlayers.forEach(p => {
      if (p.adpPick != null) {
        const r = Math.ceil(p.adpPick / 12);
        if (r >= 1 && r <= 18) {
          if (!marketCounts[r]) marketCounts[r] = { QB: 0, RB: 0, WR: 0, TE: 0 };
          if (marketCounts[r][p.position] !== undefined) marketCounts[r][p.position]++;
        }
      }
    });

    // Normalize both to percentages so bars are directly comparable
    const toPct = (counts) => {
      const total = counts.QB + counts.RB + counts.WR + counts.TE;
      if (total === 0) return { QB: 0, RB: 0, WR: 0, TE: 0 };
      return {
        QB: (counts.QB / total) * 100,
        RB: (counts.RB / total) * 100,
        WR: (counts.WR / total) * 100,
        TE: (counts.TE / total) * 100,
      };
    };

    return Array.from({ length: 18 }, (_, i) => {
      const r = i + 1;
      const uc = toPct(roundCounts[r] || { QB: 0, RB: 0, WR: 0, TE: 0 });
      const mc = toPct(marketCounts[r] || { QB: 0, RB: 0, WR: 0, TE: 0 });
      return {
        round: r,
        QB: uc.QB, RB: uc.RB, WR: uc.WR, TE: uc.TE,
        mQB: mc.QB, mRB: mc.RB, mWR: mc.WR, mTE: mc.TE,
      };
    });
  }, [rosterData, masterPlayers]);

  // ── Drill-down stat lines ──
  const drillStats = useMemo(() => {
    const latestDate = adpSnapshots.length > 0
      ? adpSnapshots[adpSnapshots.length - 1]?.date || '—'
      : '—';
    return {
      exposures: `${metrics.uniquePlayers} players tracked`,
      rosters: `${metrics.totalRosters} rosters`,
      timeseries: `Latest: ${latestDate}`,
      rankings: 'Your personal board',
      draftflow: 'Strategy-aware scoring',
    };
  }, [metrics, adpSnapshots]);

  // ── Empty State ──
  if (rosterData.length === 0) {
    return (
      <EmptyState icon={FolderSync} title="No portfolio data">
        Sync your rosters from the Chrome extension or upload a CSV to get started.
      </EmptyState>
    );
  }

  return (
    <TabLayout
      helpAnnotations={HELP_ANNOTATIONS}
      helpOpen={helpOpen}
      onHelpToggle={onHelpToggle}
      flush
    >
    <div className={styles.root}>
      {/* Section 1: Headline Metrics */}
      <div className={styles.metricsRow} data-help-id="metrics-row">
        <div className={styles.metricCard}>
          <div className={styles.metricLabel}>Rosters</div>
          <div className={styles.metricValue}>{metrics.totalRosters}</div>
        </div>

        <div className={styles.metricCard}>
          <div className={styles.metricLabel}>Players Drafted</div>
          <div className={styles.metricValue}>{metrics.uniquePlayers}</div>
        </div>
      </div>

      {/* Sections 2 + 3: Top Exposures and Exposure by ADP Round — side by side */}
      <div className={styles.exposurePair}>
        {/* Section 2: Top Exposures by Position */}
        <div className={styles.exposureSection} data-help-id="top-exposures">
          <div className={styles.sectionTitle}>Top Exposures</div>
          <div className={styles.exposureGrid}>
            {['QB', 'RB', 'WR', 'TE'].map(pos => (
              <div key={pos} className={styles.exposureColumn}>
                <h4 style={{ color: POS_COLORS[pos] }}>{pos}</h4>
                {topExposures[pos].map(p => (
                  <div key={p.name} className={styles.exposureRow}>
                    {onNavigateToRosters
                      ? <button className={styles.playerLink} title="See rosters" onClick={() => onNavigateToRosters({ players: [p.name] })}>{p.name}</button>
                      : <span className={styles.exposureName}>{p.name}</span>
                    }
                    <div className={styles.exposureBarWrap}>
                      <div
                        className={styles.exposureBarFill}
                        style={{
                          width: `${Math.min(p.exposure, 100)}%`,
                          background: POS_COLORS[pos],
                          opacity: 0.7,
                        }}
                      />
                    </div>
                    <span className={styles.exposurePct}>{p.exposure.toFixed(0)}%</span>
                  </div>
                ))}
                {topExposures[pos].length === 0 && (
                  <div className={styles.exposureRow}>
                    <span className={styles.exposureName} style={{ color: 'var(--text-secondary)' }}>—</span>
                  </div>
                )}
              </div>
            ))}
          </div>
        </div>

        {/* Section 3: Exposure by Round (highest + lowest) */}
        {exposureByRound.length > 0 && (
          <div className={styles.exposureSection} data-help-id="exposure-by-round">
            <div className={styles.sectionTitle}>Exposure by ADP Round</div>
            <div className={styles.exposureByRoundGrid}>
              <div className={styles.exposureByRoundHeader}>
                <span className={styles.blindSpotRound} />
                <div className={styles.exposureByRoundColGroup}>
                  <span className={styles.exposureByRoundSectionLabel}>Highest</span>
                  <span className={styles.exposureByRoundColLabel}>ADP</span>
                  <span className={styles.exposureByRoundColLabel}>Exp</span>
                </div>
                <div className={styles.exposureByRoundColGroup}>
                  <span className={styles.exposureByRoundSectionLabel}>Lowest</span>
                  <span className={styles.exposureByRoundColLabel}>ADP</span>
                  <span className={styles.exposureByRoundColLabel}>Exp</span>
                </div>
              </div>
              {exposureByRound.map(r => (
                <div key={r.round} className={styles.exposureByRoundRow}>
                  <span className={styles.blindSpotRound}>R{r.round}</span>
                  <div className={styles.exposureByRoundPlayer}>
                    <div className={styles.blindSpotEntry}>
                      {onNavigateToRosters
                        ? <button className={styles.playerLink} title="See rosters" style={{ color: POS_COLORS[r.highest.position] || 'var(--text-primary)' }} onClick={() => onNavigateToRosters({ players: [r.highest.name] })}>{r.highest.name}</button>
                        : <span className={styles.blindSpotName} style={{ color: POS_COLORS[r.highest.position] || 'var(--text-primary)' }}>{r.highest.name}</span>
                      }
                      <span className={styles.blindSpotAdp}>{fmtAdp(r.highest.adp)}</span>
                      <span className={styles.exposurePct} style={{ textAlign: 'right' }}>{r.highest.exposure.toFixed(0)}%</span>
                    </div>
                  </div>
                  <div className={styles.exposureByRoundPlayer}>
                    {r.blindSpots.length > 0 ? (
                      r.blindSpots.map(p => (
                        <div key={p.name} className={styles.blindSpotEntry}>
                          <span className={styles.blindSpotName} style={{ color: POS_COLORS[p.position] || 'var(--text-primary)' }}>{p.name}</span>
                          <span className={styles.blindSpotAdp}>{fmtAdp(p.adp)}</span>
                          <span className={styles.exposurePct} style={{ color: '#6b7280', textAlign: 'right' }}>0%</span>
                        </div>
                      ))
                    ) : (
                      <div className={styles.blindSpotEntry}>
                        {onNavigateToRosters
                          ? <button className={styles.playerLink} title="See rosters" style={{ color: POS_COLORS[r.lowest.position] || 'var(--text-primary)' }} onClick={() => onNavigateToRosters({ players: [r.lowest.name] })}>{r.lowest.name}</button>
                          : <span className={styles.blindSpotName} style={{ color: POS_COLORS[r.lowest.position] || 'var(--text-primary)' }}>{r.lowest.name}</span>
                        }
                        <span className={styles.blindSpotAdp}>{fmtAdp(r.lowest.adp)}</span>
                        <span className={styles.exposurePct} style={{ textAlign: 'right' }}>{r.lowest.exposure.toFixed(0)}%</span>
                      </div>
                    )}
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Section 4: Top Team Stacks — narrow right column */}
        {topTeamStacks.length > 0 && (
          <div className={styles.teamStacksSection} data-help-id="team-stacks">
            <div className={styles.sectionTitle}>Top Team Stacks</div>
            {(() => {
              const maxCount = topTeamStacks[0].count;
              return (
                <div style={{ display: 'flex', flexDirection: 'column', gap: 5 }}>
                  {topTeamStacks.map(({ team, count, pct }) => (
                    <div key={team} className={styles.teamStackRow}>
                      <span className={styles.teamStackName}>{team}</span>
                      <div className={styles.exposureBarWrap}>
                        <div
                          className={styles.exposureBarFill}
                          style={{ width: `${(count / maxCount) * 100}%`, background: '#3b82f6', opacity: 0.7 }}
                        />
                      </div>
                      <span className={styles.teamStackCount}>{count}</span>
                      <span className={styles.teamStackPct}>{pct}%</span>
                    </div>
                  ))}
                </div>
              );
            })()}
          </div>
        )}
      </div>

      {/* Section 4: Shape Visualizations */}
      <div className={styles.shapeGrid}>
        {/* Archetype Distributions */}
        <div className={styles.shapeCard} data-help-id="archetype-dist">
          <div className={styles.sectionTitle}>Archetype Distribution</div>
          {[
            { title: 'RB Archetype', data: rbDistribution, type: 'rb' },
            { title: 'QB Archetype', data: qbDistribution, type: 'qb' },
            { title: 'TE Archetype', data: teDistribution, type: 'te' },
          ].map(({ title, data, type }) => {
            const totalPct = data.reduce((sum, d) => sum + d.pct, 0) || 1;
            return (
            <div key={title} className={styles.archetypeBlock}>
              <div className={styles.archetypeLabel}>{title}</div>
              <div className={styles.stackedBar}>
                {data.map(seg => {
                  const isHovered = hoveredSeg?.type === type && hoveredSeg?.key === seg.key;
                  const isDimmed = hoveredSeg?.type === type && !isHovered;
                  return (
                    <div
                      key={seg.key}
                      style={{
                        width: `${(seg.pct / totalPct) * 100}%`,
                        background: seg.color,
                        cursor: onNavigateToRosters ? 'pointer' : 'default',
                        opacity: isDimmed ? 0.35 : 1,
                        filter: isHovered ? 'brightness(1.25)' : 'none',
                        transition: 'opacity 150ms ease, filter 150ms ease',
                      }}
                      title={onNavigateToRosters ? `${seg.label}: ${seg.count} (${seg.pct.toFixed(0)}%) — See rosters` : `${seg.label}: ${seg.count} (${seg.pct.toFixed(0)}%)`}
                      onMouseEnter={() => setHoveredSeg({ type, key: seg.key })}
                      onMouseLeave={() => setHoveredSeg(null)}
                      onClick={onNavigateToRosters ? () => onNavigateToRosters({ archetype: { [type]: seg.key } }) : undefined}
                    />
                  );
                })}
              </div>
              <div className={styles.legend}>
                {data.map(seg => {
                  const isHovered = hoveredSeg?.type === type && hoveredSeg?.key === seg.key;
                  const isDimmed = hoveredSeg?.type === type && !isHovered;
                  return (
                    <div
                      key={seg.key}
                      className={styles.legendItem}
                      style={{ opacity: isDimmed ? 0.4 : 1, transition: 'opacity 150ms ease' }}
                    >
                      <div className={styles.legendDot} style={{ background: seg.color }} />
                      <span>{seg.label}:</span>
                      <span className={styles.legendCount}>{seg.count} ({seg.pct.toFixed(0)}%)</span>
                    </div>
                  );
                })}
              </div>
            </div>
          );
          })}
        </div>

        {/* Draft Capital by Round — You vs Market */}
        <div className={styles.shapeCard} data-help-id="draft-capital">
          <div className={styles.sectionTitle}>Draft Capital by Round</div>
          <ResponsiveContainer width="100%" height={isMobile ? 180 : 220}>
            <BarChart data={draftCapitalShape} margin={{ top: 4, right: 4, bottom: 0, left: 4 }}>
              <XAxis
                dataKey="round"
                tick={{ fill: 'var(--text-secondary)', fontSize: 11 }}
                axisLine={{ stroke: 'var(--border-subtle)' }}
                tickLine={false}
              />
              <Tooltip
                contentStyle={{
                  background: 'var(--surface-3)',
                  border: '1px solid var(--border-default)',
                  borderRadius: 8,
                  boxShadow: '0 4px 12px rgba(0, 0, 0, 0.3)',
                  maxWidth: 280,
                  fontSize: '0.8rem',
                }}
                labelFormatter={v => `Round ${v}`}
                formatter={(value, name) => {
                  const labels = { QB: 'QB', RB: 'RB', WR: 'WR', TE: 'TE', mQB: 'Mkt QB', mRB: 'Mkt RB', mWR: 'Mkt WR', mTE: 'Mkt TE' };
                  return [`${Math.round(value)}%`, labels[name] || name];
                }}
              />
              {/* Your portfolio */}
              <Bar dataKey="QB" stackId="user" fill={POS_COLORS.QB} radius={[0, 0, 0, 0]} />
              <Bar dataKey="RB" stackId="user" fill={POS_COLORS.RB} />
              <Bar dataKey="WR" stackId="user" fill={POS_COLORS.WR} />
              <Bar dataKey="TE" stackId="user" fill={POS_COLORS.TE} radius={[3, 3, 0, 0]} />
              {/* Market ADP */}
              <Bar dataKey="mQB" stackId="market" fill={POS_COLORS.QB} opacity={0.25} radius={[0, 0, 0, 0]} />
              <Bar dataKey="mRB" stackId="market" fill={POS_COLORS.RB} opacity={0.25} />
              <Bar dataKey="mWR" stackId="market" fill={POS_COLORS.WR} opacity={0.25} />
              <Bar dataKey="mTE" stackId="market" fill={POS_COLORS.TE} opacity={0.25} radius={[3, 3, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>
          <div className={styles.capitalLegend}>
            <div className={styles.capitalLegendItem}>
              <span className={styles.capitalLegendSwatch} style={{ opacity: 1 }} />
              <span>Yours</span>
            </div>
            <div className={styles.capitalLegendItem}>
              <span className={styles.capitalLegendSwatch} style={{ opacity: 0.25 }} />
              <span>Market</span>
            </div>
          </div>
        </div>
      </div>

      {/* Section 4: Drill-Down Cards */}
      <div className={styles.drillRow} data-help-id="drill-cards">
        {DRILL_CARDS.map(({ key, label, icon: Icon }) => (
          <div
            key={key}
            className={styles.drillCard}
            onClick={() => onNavigate(key)}
            role="button"
            tabIndex={0}
            onKeyDown={e => e.key === 'Enter' && onNavigate(key)}
          >
            <Icon size={20} className={styles.drillIcon} />
            <div className={styles.drillLabel}>{label}</div>
            <div className={styles.drillStat}>{drillStats[key]}</div>
          </div>
        ))}
      </div>
    </div>
    </TabLayout>
  );
}
