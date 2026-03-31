import React, { useMemo } from 'react';
import { ResponsiveContainer, BarChart, Bar, XAxis, Tooltip, Legend } from 'recharts';
import { Upload, BarChart3, Users, TrendingUp, ListOrdered, Crosshair } from 'lucide-react';
import { analyzePortfolioTree, PROTOCOL_TREE, ARCHETYPE_METADATA } from '../utils/rosterArchetypes';
import FileUploadButton from './FileUploadButton';
import useMediaQuery from '../hooks/useMediaQuery';
import styles from './Dashboard.module.css';

const POS_COLORS = { QB: '#bf44ef', RB: '#10b981', WR: '#f59e0b', TE: '#3b82f6' };

const ARCHETYPE_COLORS = {
  QB_ELITE: '#bf44ef', QB_CORE: '#f59e0b', QB_LATE: '#10b981',
  TE_ELITE: '#3b82f6', TE_ANCHOR: '#f97316', TE_LATE: '#6366f1',
};

const DRILL_CARDS = [
  { key: 'exposures', label: 'Exposures', icon: BarChart3 },
  { key: 'rosters', label: 'Rosters', icon: Users },
  { key: 'timeseries', label: 'ADP Tracker', icon: TrendingUp },
  { key: 'rankings', label: 'Rankings', icon: ListOrdered },
  { key: 'draftflow', label: 'Draft Assistant', icon: Crosshair },
];

export default function Dashboard({ rosterData = [], masterPlayers = [], adpSnapshots = [], onNavigate, onRosterUpload, uploadAuthGuard }) {
  const { isMobile } = useMediaQuery();

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
        color: PROTOCOL_TREE[key]?.color || '#6b7280',
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
        color: ARCHETYPE_COLORS[key] || '#6b7280',
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
        color: ARCHETYPE_COLORS[key] || '#6b7280',
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

  // ── Exposure by ADP Round (highest + lowest) ──
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
      const lowest = sorted[0];
      const highest = sorted[sorted.length - 1];
      rounds.push({
        round: r,
        lowest: { name: lowest.name, position: lowest.position, exposure: parseFloat(lowest.exposure), adp: lowest.adpDisplay },
        highest: { name: highest.name, position: highest.position, exposure: parseFloat(highest.exposure), adp: highest.adpDisplay },
      });
    }
    return rounds;
  }, [masterPlayers, metrics.totalRosters]);

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
      <div className={styles.emptyState}>
        <Upload size={48} className={styles.emptyIcon} />
        <div className={styles.emptyTitle}>Upload your roster CSV</div>
        <div className={styles.emptyDesc}>
          Export your rosters from Underdog, then upload the CSV here. Your portfolio analysis will appear instantly.
        </div>
        <FileUploadButton label="Upload Rosters" onUpload={onRosterUpload} onBeforeUpload={uploadAuthGuard} />
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

      {/* Sections 2 + 3: Top Exposures and Exposure by ADP Round — side by side */}
      <div className={styles.exposurePair}>
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

        {/* Section 3: Exposure by Round (highest + lowest) */}
        {exposureByRound.length > 0 && (
          <div className={styles.exposureSection}>
            <div className={styles.sectionTitle}>Exposure by ADP Round</div>
            <div className={styles.exposureByRoundGrid}>
              <div className={styles.exposureByRoundHeader}>
                <span className={styles.blindSpotRound} />
                <span className={styles.exposureByRoundLabel}>Highest</span>
                <span className={styles.exposureByRoundLabel}>Lowest</span>
              </div>
              {exposureByRound.map(r => (
                <div key={r.round} className={styles.exposureByRoundRow}>
                  <span className={styles.blindSpotRound}>R{r.round}</span>
                  <div className={styles.exposureByRoundPlayer}>
                    <span className={styles.blindSpotName} style={{ color: POS_COLORS[r.highest.position] || 'var(--text-primary)' }}>
                      {r.highest.name}
                    </span>
                    <span className={styles.blindSpotAdp}>ADP {r.highest.adp}</span>
                    <span className={styles.exposurePct}>{r.highest.exposure.toFixed(0)}%</span>
                  </div>
                  <div className={styles.exposureByRoundPlayer}>
                    <span className={styles.blindSpotName} style={{ color: POS_COLORS[r.lowest.position] || 'var(--text-primary)' }}>
                      {r.lowest.name}
                    </span>
                    <span className={styles.blindSpotAdp}>ADP {r.lowest.adp}</span>
                    <span className={styles.exposurePct}>{r.lowest.exposure.toFixed(0)}%</span>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>

      {/* Section 4: Shape Visualizations */}
      <div className={styles.shapeGrid}>
        {/* Archetype Distributions */}
        <div className={styles.shapeCard}>
          <div className={styles.sectionTitle}>Archetype Distribution</div>
          {[
            { title: 'RB Archetype', data: rbDistribution },
            { title: 'QB Archetype', data: qbDistribution },
            { title: 'TE Archetype', data: teDistribution },
          ].map(({ title, data }) => {
            const totalPct = data.reduce((sum, d) => sum + d.pct, 0) || 1;
            return (
            <div key={title} className={styles.archetypeBlock}>
              <div className={styles.archetypeLabel}>{title}</div>
              <div className={styles.stackedBar}>
                {data.map(seg => (
                  <div
                    key={seg.key}
                    style={{ width: `${(seg.pct / totalPct) * 100}%`, background: seg.color }}
                    title={`${seg.label}: ${seg.count} (${seg.pct.toFixed(0)}%)`}
                  />
                ))}
              </div>
              <div className={styles.legend}>
                {data.map(seg => (
                  <div key={seg.key} className={styles.legendItem}>
                    <div className={styles.legendDot} style={{ background: seg.color }} />
                    <span>{seg.label}:</span>
                    <span className={styles.legendCount}>{seg.count} ({seg.pct.toFixed(0)}%)</span>
                  </div>
                ))}
              </div>
            </div>
          );
          })}
        </div>

        {/* Draft Capital by Round — You vs Market */}
        <div className={styles.shapeCard}>
          <div className={styles.sectionTitle}>Draft Capital by Round</div>
          <ResponsiveContainer width="100%" height={isMobile ? 180 : 220}>
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
