import React, { useMemo } from 'react';
import { ResponsiveContainer, BarChart, Bar, XAxis, Tooltip } from 'recharts';
import { Upload, BarChart3, Users, TrendingUp, ListOrdered, Crosshair } from 'lucide-react';
import { analyzePortfolioTree, PROTOCOL_TREE, ARCHETYPE_METADATA } from '../utils/rosterArchetypes';
import FileUploadButton from './FileUploadButton';
import useMediaQuery from '../hooks/useMediaQuery';
import styles from './Dashboard.module.css';

const POS_COLORS = { QB: '#bf44ef', RB: '#10b981', WR: '#f59e0b', TE: '#3b82f6' };

const DRILL_CARDS = [
  { key: 'exposures', label: 'Exposures', icon: BarChart3 },
  { key: 'rosters', label: 'Rosters', icon: Users },
  { key: 'timeseries', label: 'ADP Tracker', icon: TrendingUp },
  { key: 'rankings', label: 'Rankings', icon: ListOrdered },
  { key: 'draftflow', label: 'Draft Assistant', icon: Crosshair },
];

export default function Dashboard({ rosterData = [], masterPlayers = [], adpSnapshots = [], onNavigate, onRosterUpload }) {
  const { isMobile } = useMediaQuery();

  // ── Headline Metrics ──
  const metrics = useMemo(() => {
    const entryIds = new Set(rosterData.map(p => p.entry_id));
    const totalRosters = entryIds.size;
    const uniquePlayers = masterPlayers.filter(p => p.count > 0).length;

    return { totalRosters, uniquePlayers };
  }, [rosterData, masterPlayers]);

  // ── Archetype Distribution ──
  const archetypeDistribution = useMemo(() => {
    if (rosterData.length === 0) return [];
    const { totalEntries, tree } = analyzePortfolioTree(rosterData);
    if (totalEntries === 0) return [];
    return Object.entries(tree)
      .map(([key, node]) => ({
        key,
        label: ARCHETYPE_METADATA[key]?.name || key,
        count: node.count,
        pct: (node.count / totalEntries) * 100,
        color: PROTOCOL_TREE[key]?.color || '#6b7280',
      }))
      .filter(d => d.count > 0);
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

  // ── Least Exposure by ADP Round ──
  const leastExposureByRound = useMemo(() => {
    const totalRosters = metrics.totalRosters;
    if (totalRosters === 0) return [];
    const rounds = [];
    for (let r = 1; r <= 10; r++) {
      const start = (r - 1) * 12 + 1;
      const end = r * 12;
      // Players whose ADP falls in this round
      const inRound = masterPlayers.filter(
        p => p.adpPick != null && p.adpPick >= start && p.adpPick <= end
      );
      if (inRound.length === 0) continue;
      // Sort by exposure ascending, pick the lowest
      const sorted = [...inRound].sort((a, b) => a.count - b.count);
      const lowest = sorted[0];
      rounds.push({
        round: r,
        name: lowest.name,
        position: lowest.position,
        exposure: parseFloat(lowest.exposure),
        adp: lowest.adpDisplay,
      });
    }
    return rounds;
  }, [masterPlayers, metrics.totalRosters]);

  // ── Draft Capital by Round ──
  const draftCapitalShape = useMemo(() => {
    const roundCounts = {};
    rosterData.forEach(p => {
      const r = p.round ? Number(p.round) : Math.ceil(Number(p.pick) / 12);
      if (r >= 1 && r <= 18) {
        if (!roundCounts[r]) roundCounts[r] = { QB: 0, RB: 0, WR: 0, TE: 0 };
        if (roundCounts[r][p.position] !== undefined) roundCounts[r][p.position]++;
      }
    });
    return Array.from({ length: 18 }, (_, i) => ({
      round: i + 1,
      ...(roundCounts[i + 1] || { QB: 0, RB: 0, WR: 0, TE: 0 }),
    }));
  }, [rosterData]);

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
      <div className={styles.emptyState}>
        <Upload size={48} className={styles.emptyIcon} />
        <div className={styles.emptyTitle}>Upload your roster CSV</div>
        <div className={styles.emptyDesc}>
          Export your rosters from Underdog, then upload the CSV here. Your portfolio analysis will appear instantly.
        </div>
        <FileUploadButton label="Upload Rosters" onUpload={onRosterUpload} />
      </div>
    );
  }

  return (
    <div className={styles.root}>
      {/* Section 1: Headline Metrics */}
      <div className={styles.metricsRow}>
        <div className={styles.metricCard}>
          <div className={styles.metricLabel}>Rosters</div>
          <div className={styles.metricValue}>{metrics.totalRosters}</div>
        </div>

        <div className={styles.metricCard}>
          <div className={styles.metricLabel}>Players Drafted</div>
          <div className={styles.metricValue}>{metrics.uniquePlayers}</div>
        </div>
      </div>

      {/* Section 2: Top Exposures by Position */}
      <div className={styles.exposureSection}>
        <div className={styles.sectionTitle}>Top Exposures</div>
        <div className={styles.exposureGrid}>
          {['QB', 'RB', 'WR', 'TE'].map(pos => (
            <div key={pos} className={styles.exposureColumn}>
              <h4 style={{ color: POS_COLORS[pos] }}>{pos}</h4>
              {topExposures[pos].map(p => (
                <div key={p.name} className={styles.exposureRow}>
                  <span className={styles.exposureName}>{p.name}</span>
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

      {/* Section 3: Least Exposure by Round */}
      {leastExposureByRound.length > 0 && (
        <div className={styles.exposureSection}>
          <div className={styles.sectionTitle}>Least Exposure by ADP Round</div>
          <div className={styles.blindSpotGrid}>
            {leastExposureByRound.map(p => (
              <div key={p.round} className={styles.blindSpotRow}>
                <span className={styles.blindSpotRound}>R{p.round}</span>
                <span className={styles.blindSpotName} style={{ color: POS_COLORS[p.position] || 'var(--text-primary)' }}>
                  {p.name}
                </span>
                <span className={styles.blindSpotAdp}>ADP {p.adp}</span>
                <span className={styles.exposurePct}>{p.exposure.toFixed(0)}%</span>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Section 4: Shape Visualizations */}
      <div className={styles.shapeGrid}>
        {/* Archetype Distribution */}
        <div className={styles.shapeCard}>
          <div className={styles.sectionTitle}>RB Archetype Distribution</div>
          <div className={styles.stackedBar}>
            {archetypeDistribution.map(seg => (
              <div
                key={seg.key}
                style={{ width: `${seg.pct}%`, background: seg.color }}
                title={`${seg.label}: ${seg.count} (${seg.pct.toFixed(0)}%)`}
              />
            ))}
          </div>
          <div className={styles.legend}>
            {archetypeDistribution.map(seg => (
              <div key={seg.key} className={styles.legendItem}>
                <div className={styles.legendDot} style={{ background: seg.color }} />
                <span>{seg.label}:</span>
                <span className={styles.legendCount}>{seg.count} ({seg.pct.toFixed(0)}%)</span>
              </div>
            ))}
          </div>
        </div>

        {/* Draft Capital by Round */}
        <div className={styles.shapeCard}>
          <div className={styles.sectionTitle}>Draft Capital by Round</div>
          <ResponsiveContainer width="100%" height={isMobile ? 160 : 200}>
            <BarChart data={draftCapitalShape} margin={{ top: 4, right: 4, bottom: 0, left: 4 }}>
              <XAxis
                dataKey="round"
                tick={{ fill: 'var(--text-secondary)', fontSize: 11 }}
                axisLine={{ stroke: 'var(--border)' }}
                tickLine={false}
              />
              <Tooltip
                contentStyle={{
                  background: 'var(--bg-card)',
                  border: '1px solid var(--border)',
                  borderRadius: 8,
                  fontSize: '0.8rem',
                }}
                labelFormatter={v => `Round ${v}`}
              />
              <Bar dataKey="QB" stackId="a" fill={POS_COLORS.QB} radius={[0, 0, 0, 0]} />
              <Bar dataKey="RB" stackId="a" fill={POS_COLORS.RB} />
              <Bar dataKey="WR" stackId="a" fill={POS_COLORS.WR} />
              <Bar dataKey="TE" stackId="a" fill={POS_COLORS.TE} radius={[3, 3, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </div>
      </div>

      {/* Section 4: Drill-Down Cards */}
      <div className={styles.drillRow}>
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
  );
}
