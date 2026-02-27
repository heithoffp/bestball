// src/components/RosterViewer.jsx
import React, { useState, useMemo } from 'react';
import { classifyRosterPath, ARCHETYPE_METADATA } from '../utils/rosterArchetypes';

// ── CLV helpers ───────────────────────────────────────────────────────────────

/**
 * Power-law value curve CLV
 * V(pick) = 1 / pick^α  —  CLV% = (vNow - vDraft) / vDraft * 100
 * Positive = ADP moved earlier after draft = you got a bargain.
 */
function calcCLV(pick, latestADP, alpha = 0.5) {
  if (!pick || !latestADP || isNaN(pick) || isNaN(latestADP)) return null;
  const vDraft = 1 / Math.pow(pick, alpha);
  const vNow   = 1 / Math.pow(latestADP, alpha);
  return ((vNow - vDraft) / vDraft) * 100;
}

function clvLabel(pct) {
  if (pct === null) return { text: 'N/A', color: '#d6d6d6' };
  const sign = pct >= 0 ? '+' : '';
  const color = pct > 15 ? '#00e5a0'
              : pct > 5  ? '#7dffcc'
              : pct > -5 ? '#ff9f43'
              :             '#ff4d6d';
  return { text: `${sign}${pct.toFixed(2)}%`, color };
}

// ── Uniqueness color scale (rank-normalized) ──────────────────────────────────

function lerp(a, b, t) {
  return a + (b - a) * t;
}

function lerpColor(c1, c2, t) {
  return `rgb(${Math.round(lerp(c1[0], c2[0], t))},
              ${Math.round(lerp(c1[1], c2[1], t))},
              ${Math.round(lerp(c1[2], c2[2], t))})`;
}

/**
 * t ∈ [0,1]
 * 0 = chalk (red), 0.5 = neutral (amber), 1 = unique (green)
 */
function uniquenessColor(t) {
  if (t <= 0.5) {
    return lerpColor([255, 77, 109], [255, 159, 67], t * 2);
  }
  return lerpColor([255, 159, 67], [0, 229, 160], (t - 0.5) * 2);
}

// ── RB Archetype rarity model ─────────────────────────────────────────────────

/**
 * Prevalence priors: estimated % of field in each RB archetype.
 * Source: user-provided field composition estimates.
 * Balanced/Value (~60%) is split across RB_VALUE and RB_SUBOPTIMAL.
 */
const RB_ARCHETYPE_PREVALENCE = {
  RB_VALUE:         0.6,
  RB_HERO:          0.20,
  RB_ZERO:          0.15,
  RB_HYPER_FRAGILE: 0.05,
};

/**
 * Shannon surprisal: -log2(p)
 * Rare archetypes = high surprisal = more unique.
 * Normalized to [0,1] relative to the spread across known archetypes.
 */
const _surprisalValues = Object.values(RB_ARCHETYPE_PREVALENCE).map(p => -Math.log2(p));
const _surprisalMin = Math.min(..._surprisalValues);
const _surprisalMax = Math.max(..._surprisalValues);

function archetypeRarityNorm(rbArchetype) {
  const p = RB_ARCHETYPE_PREVALENCE[rbArchetype];
  if (p == null) return 0.5; // unknown archetype → neutral
  const raw = -Math.log2(p);
  return (raw - _surprisalMin) / (_surprisalMax - _surprisalMin); // 0..1
}

/**
 * Composite Rarity = draft deviation rarity × archetype rarity multiplier
 *
 * Formula: draftRarity × (1 + archetypeBoostMax × archetypeRarityNorm)
 *
 * - Common archetype (norm ≈ 0): no boost — pure draft deviation signal
 * - Rare archetype (norm = 1): score boosted by archetypeBoostMax (default 0.5 = +50%)
 * - The signals compound: a contrarian drafter in a rare archetype scores highest
 *
 * archetypeBoostMax is tunable: 0 = archetype ignored, 1 = archetype can double the score
 */
function calculateCompositeRarity(rosterPlayers, rbArchetype, opts = {}) {
  const { alphaPhase = 1.0, betaPhase = 0.5, archetypeBoostMax = 0.5 } = opts;

  // Draft deviation component: sum of pick deviations scaled by expected σ at that ADP
  let draftRarity = 0;
  rosterPlayers.forEach(p => {
    const pick   = Number(p.pick || 0) || 0;
    const adpRaw = Number(p.latestADP || p.adp || p.latestADPValue || 0) || (pick || 1000);
    const adp    = Math.max(1, adpRaw);
    const denom  = alphaPhase * Math.sqrt(adp) + betaPhase;
    draftRarity += Math.abs(pick - adp) / denom;
  });

  // Multiplicative archetype boost — compounds with draft deviation
  const archBoost = 1 + archetypeBoostMax * archetypeRarityNorm(rbArchetype);

  return draftRarity * archBoost;
}

// ── Archetype display helpers ─────────────────────────────────────────────────

const ARCHETYPE_COLORS = {
  RB_ZERO:          '#8b5cf6',
  RB_HYPER_FRAGILE: '#f97316',
  RB_HERO:          '#4bf1db',
  RB_VALUE:         '#ef4444',
  RB_SUBOPTIMAL:    '#6b7280',
  QB_ELITE:         '#f59e0b',
  QB_CORE:          '#60a5fa',
  QB_LATE:          '#94a3b8',
  TE_ELITE:         '#a855f7',
  TE_ANCHOR:        '#34d399',
  TE_LATE:          '#94a3b8',
};

function archetypeColor(key) { return ARCHETYPE_COLORS[key] || '#6b7280'; }

function ArchetypePill({ archetypeKey }) {
  const meta = ARCHETYPE_METADATA[archetypeKey];
  const color = archetypeColor(archetypeKey);
  if (!meta) return <span style={{ color: '#f3f3f3', fontSize: 11 }}>—</span>;
  return (
    <span title={meta.desc} style={{
      fontFamily: "'Space Mono', monospace", fontSize: 10,
      background: color + '1a', color, border: `1px solid ${color}44`,
      borderRadius: 4, padding: '2px 7px', letterSpacing: 0.3,
      whiteSpace: 'nowrap', cursor: 'default',
    }}>
      {meta.name}
    </span>
  );
}

// ── Position snapshot ─────────────────────────────────────────────────────────

const POS_COLORS = {
  QB: '#f59e0b', RB: '#10b981', WR: '#3b82f6', TE: '#a855f7',
  K: '#6b7280', DEF: '#ef4444', DST: '#ef4444', default: '#eeeeee',
};
function posColor(pos) { return POS_COLORS[pos] || POS_COLORS.default; }

function PositionSnapshot({ snap }) {
  const ORDER = ['QB', 'RB', 'WR', 'TE', 'K', 'DST', 'DEF'];
  const entries = ORDER.filter(p => snap[p]).map(p => ({ pos: p, count: snap[p] }));
  Object.keys(snap).forEach(p => { if (!ORDER.includes(p)) entries.push({ pos: p, count: snap[p] }); });
  return (
    <div style={{ display: 'flex', gap: 4, flexWrap: 'wrap', justifyContent: 'center' }}>
      {entries.map(({ pos, count }) => (
        <span key={pos} style={{
          fontSize: 10, fontFamily: "'Space Mono', monospace",
          background: posColor(pos) + '22', color: posColor(pos),
          border: `1px solid ${posColor(pos)}55`, borderRadius: 3,
          padding: '1px 5px', letterSpacing: 0.5,
        }}>
          {count}{pos}
        </span>
      ))}
    </div>
  );
}

function shortEntry(id) {
  if (!id) return '???';
  if (id.length <= 10) return id;
  return id.slice(0, 6) + '…' + id.slice(-4);
}

// ── Filter options ────────────────────────────────────────────────────────────

const RB_OPTIONS = ['all', 'RB_ZERO', 'RB_HERO', 'RB_HYPER_FRAGILE', 'RB_VALUE', 'RB_SUBOPTIMAL'];
const QB_OPTIONS = ['all', 'QB_ELITE', 'QB_CORE', 'QB_LATE'];
const TE_OPTIONS = ['all', 'TE_ELITE', 'TE_ANCHOR', 'TE_LATE'];

// ── Percentile rank ───────────────────────────────────────────────────────────

function percentileRank(value, arr) {
  if (!arr || arr.length === 0) return 0;
  const sorted = [...arr].sort((a, b) => a - b);
  let count = 0;
  for (let i = 0; i < sorted.length; i++) {
    if (sorted[i] <= value) count++;
    else break;
  }
  return (count / sorted.length) * 100;
}

// ── Min-max normalizer ────────────────────────────────────────────────────────

function normalize(list, key, outKey) {
  const vals = list.map(r => r[key]).filter(v => v !== null && v !== undefined);
  const min = Math.min(...vals);
  const max = Math.max(...vals);
  return list.map(r => ({
    ...r,
    [outKey]:
      r[key] === null || r[key] === undefined || max === min
        ? 0.5
        : (r[key] - min) / (max - min),
  }));
}

// ── Main component ────────────────────────────────────────────────────────────

export default function RosterViewer({ rosterData = [] }) {
  const [expandedEntry, setExpandedEntry]   = useState(null);
  const [sortKey, setSortKey]               = useState('avgCLV');
  const [sortDir, setSortDir]               = useState('desc');
  const [alpha, setAlpha]                   = useState(0.5);
  const [clvFilter, setClvFilter]           = useState('all');
  const [rbFilter,  setRbFilter]            = useState('all');
  const [qbFilter,  setQbFilter]            = useState('all');
  const [teFilter,  setTeFilter]            = useState('all');

  // Rarity model tunables
  const [alphaPhase]       = useState(1.0);
  const [betaPhase]        = useState(0.5);
  const [archetypeBoostMax] = useState(0.5); // 0 = ignore archetype, 1 = can double score

  // Group + classify each entry
  const rosters = useMemo(() => {
    const map = {};
    rosterData.forEach(p => {
      const id = p.entry_id || 'Unknown';
      if (!map[id]) map[id] = [];
      map[id].push(p);
    });

    return Object.entries(map).map(([entry_id, players]) => {
      const clvValues = players
        .map(p => calcCLV(p.pick, p.latestADP, alpha))
        .filter(v => v !== null);
      const avgCLV = clvValues.length
        ? clvValues.reduce((a, b) => a + b, 0) / clvValues.length
        : null;

      const posSnap = players.reduce((acc, p) => {
        const pos = p.position || 'N/A';
        acc[pos] = (acc[pos] || 0) + 1;
        return acc;
      }, {});

      const path = classifyRosterPath(players);

      return { entry_id, players, avgCLV, posSnap, count: players.length, path };
    });
  }, [rosterData, alpha]);

  // Compute per-roster composite rarity, percentile-rank + normalize for color
  const rosterScores = useMemo(() => {
    if (!rosters || rosters.length === 0) return {};

    const rawRarity = [];

    const tmp = rosters.map(r => {
      const rarity = calculateCompositeRarity(r.players, r.path.rb, {
        alphaPhase,
        betaPhase,
        archetypeBoostMax,
      });
      rawRarity.push(rarity);
      return { entry_id: r.entry_id, rarity, rbArchetype: r.path.rb };
    });

    const rarityPercentiles = {};
    tmp.forEach(t => {
      rarityPercentiles[t.entry_id] = percentileRank(t.rarity, rawRarity);
    });

    let withNorm = tmp.map(t => ({ ...t, uniqLift: t.rarity }));
    withNorm = normalize(withNorm, 'uniqLift', 'uniqLiftNorm');

    const byId = {};
    withNorm.forEach(t => {
      byId[t.entry_id] = {
        rarity:           Number(t.rarity.toFixed(4)),
        rarityPercentile: Math.round(rarityPercentiles[t.entry_id]),
        uniqLiftNorm:     t.uniqLiftNorm ?? 0.5,
        // Expose archetype boost factor for tooltip
        archBoost:        Number((1 + archetypeBoostMax * archetypeRarityNorm(t.rbArchetype)).toFixed(3)),
      };
    });
    return byId;
  }, [rosters, alphaPhase, betaPhase, archetypeBoostMax]);

  // Filter + sort
  const displayed = useMemo(() => {
    let list = [...rosters];
    if (clvFilter === 'positive') list = list.filter(r => r.avgCLV !== null && r.avgCLV >= 0);
    if (clvFilter === 'negative') list = list.filter(r => r.avgCLV !== null && r.avgCLV < 0);
    if (rbFilter !== 'all') list = list.filter(r => r.path.rb === rbFilter);
    if (qbFilter !== 'all') list = list.filter(r => r.path.qb === qbFilter);
    if (teFilter !== 'all') list = list.filter(r => r.path.te === teFilter);

    list.sort((a, b) => {
      if (['path.rb', 'path.qb', 'path.te'].includes(sortKey)) {
        const seg = sortKey.split('.')[1];
        const av = a.path[seg]; const bv = b.path[seg];
        return sortDir === 'asc' ? av.localeCompare(bv) : bv.localeCompare(av);
      }
      let av = a[sortKey] ?? -Infinity;
      let bv = b[sortKey] ?? -Infinity;
      if (sortKey === 'entry_id') { av = a.entry_id; bv = b.entry_id; }
      if (sortKey === 'rarityPercentile') {
        const aid = rosterScores[a.entry_id]?.rarityPercentile ?? -Infinity;
        const bid = rosterScores[b.entry_id]?.rarityPercentile ?? -Infinity;
        return sortDir === 'asc' ? aid - bid : bid - aid;
      }
      if (typeof av === 'string') return sortDir === 'asc' ? av.localeCompare(bv) : bv.localeCompare(av);
      return sortDir === 'asc' ? av - bv : bv - av;
    });
    return list;
  }, [rosters, sortKey, sortDir, clvFilter, rbFilter, qbFilter, teFilter, rosterScores]);

  const rbCounts = useMemo(() => rosters.reduce((acc, r) => { acc[r.path.rb] = (acc[r.path.rb] || 0) + 1; return acc; }, {}), [rosters]);
  const qbCounts = useMemo(() => rosters.reduce((acc, r) => { acc[r.path.qb] = (acc[r.path.qb] || 0) + 1; return acc; }, []), [rosters]);
  const teCounts = useMemo(() => rosters.reduce((acc, r) => { acc[r.path.te] = (acc[r.path.te] || 0) + 1; return acc; }, {}), [rosters]);

  function toggleSort(key) {
    if (sortKey === key) setSortDir(d => d === 'asc' ? 'desc' : 'asc');
    else { setSortKey(key); setSortDir(key === 'avgCLV' ? 'desc' : 'asc'); }
  }

  function SortIcon({ col }) {
    if (sortKey !== col) return <span style={{ opacity: 0.25, marginLeft: 4 }}>↕</span>;
    return <span style={{ marginLeft: 4 }}>{sortDir === 'desc' ? '↓' : '↑'}</span>;
  }

  if (!rosterData.length) {
    return (
      <div style={styles.empty}>
        <span style={{ fontSize: 40 }}>📋</span>
        <p>No roster data loaded yet.</p>
      </div>
    );
  }

  return (
    <div style={styles.root}>
      <style>{`@import url('https://fonts.googleapis.com/css2?family=Space+Mono:wght@400;700&family=DM+Sans:wght@300;400;500;600&display=swap');`}</style>

      {/* ── Header ── */}
      <div style={styles.header}>
        <div>
          <h2 style={styles.title}>ROSTER VIEWER</h2>
          <p style={styles.subtitle}>{displayed.length} / {rosters.length} entries · {rosterData.length} players</p>
        </div>
        <div style={styles.alphaRow}>
          <span style={styles.alphaLabel}>CLV Curve</span>
          <div style={{ display: 'flex', gap: 4 }}>
            {[{ v: 0.35, label: 'Flat' }, { v: 0.5, label: 'Balanced' }, { v: 0.75, label: 'Steep' }, { v: 1.0, label: 'Raw' }].map(({ v, label }) => (
              <button key={v} style={{ ...styles.filterBtn, ...(alpha === v ? styles.filterBtnActive : {}) }} onClick={() => setAlpha(v)} title={`α=${v}`}>
                {label}
              </button>
            ))}
          </div>
          <span style={styles.alphaExplain}>α={alpha} · pick 6→4 = +{calcCLV(6, 4, alpha)?.toFixed(2)}%</span>
        </div>
      </div>

      {/* ── Filters ── */}
      <div style={styles.filterBar}>
        <FilterGroup label="RB" options={RB_OPTIONS} value={rbFilter} onChange={setRbFilter} counts={rbCounts} />
        <FilterGroup label="QB" options={QB_OPTIONS} value={qbFilter} onChange={setQbFilter} counts={qbCounts} />
        <FilterGroup label="TE" options={TE_OPTIONS} value={teFilter} onChange={setTeFilter} counts={teCounts} />
        <div style={styles.filterGroupWrap}>
          <span style={styles.filterGroupLabel}>CLV</span>
          <div style={{ display: 'flex', gap: 4 }}>
            {[['all', 'All'], ['positive', '▲ +CLV'], ['negative', '▼ −CLV']].map(([v, lbl]) => (
              <button key={v} style={{ ...styles.filterBtn, ...(clvFilter === v ? styles.filterBtnActive : {}) }} onClick={() => setClvFilter(v)}>
                {lbl}
              </button>
            ))}
          </div>
        </div>
      </div>

      {/* ── Table ── */}
      <div style={styles.tableWrap}>
        <table style={styles.table}>
          <thead>
            <tr style={styles.thead}>
              <th style={styles.th} onClick={() => toggleSort('entry_id')}>Entry <SortIcon col="entry_id" /></th>
              <th style={{ ...styles.th, textAlign: 'center' }}>Snapshot</th>
              <th style={{ ...styles.th, textAlign: 'center' }} onClick={() => toggleSort('count')}>Players <SortIcon col="count" /></th>
              <th style={{ ...styles.th, color: archetypeColor('RB_HERO') }} onClick={() => toggleSort('path.rb')}>RB Arch <SortIcon col="path.rb" /></th>
              <th style={{ ...styles.th, color: archetypeColor('QB_CORE') }} onClick={() => toggleSort('path.qb')}>QB Arch <SortIcon col="path.qb" /></th>
              <th style={{ ...styles.th, color: archetypeColor('TE_ANCHOR') }} onClick={() => toggleSort('path.te')}>TE Arch <SortIcon col="path.te" /></th>
              <th
                style={{ ...styles.th, textAlign: 'center', color: '#7dffcc' }}
                onClick={() => toggleSort('rarityPercentile')}
              >
                Uniq Lift <SortIcon col="rarityPercentile" />
              </th>
              <th style={{ ...styles.th, textAlign: 'center', color: '#00e5a0' }} onClick={() => toggleSort('avgCLV')}>Avg CLV% <SortIcon col="avgCLV" /></th>
              <th style={{ ...styles.th, textAlign: 'center', cursor: 'default' }}></th>
            </tr>
          </thead>
          <tbody>
            {displayed.map((roster) => {
              const clv    = clvLabel(roster.avgCLV);
              const isOpen = expandedEntry === roster.entry_id;
              const scores = rosterScores[roster.entry_id] || {};
              // Tooltip: show archetype boost contribution
              const archNorm  = archetypeRarityNorm(roster.path.rb);
              const boostPct  = Math.round(archetypeBoostMax * archNorm * 100);
              const tooltipTxt = `Draft rarity × ${scores.archBoost ?? '—'}× arch boost (+${boostPct}% from ${roster.path.rb})`;
              return (
                <React.Fragment key={roster.entry_id}>
                  <tr
                    style={{ ...styles.row, ...(isOpen ? styles.rowOpen : {}) }}
                    onClick={() => setExpandedEntry(isOpen ? null : roster.entry_id)}
                  >
                    <td style={styles.td}><span style={styles.entryId}>{shortEntry(roster.entry_id)}</span></td>
                    <td style={{ ...styles.td, textAlign: 'center' }}><PositionSnapshot snap={roster.posSnap} /></td>
                    <td style={{ ...styles.td, textAlign: 'center', fontFamily: "'Space Mono', monospace", fontSize: 12 }}>{roster.count}</td>
                    <td style={styles.td}><ArchetypePill archetypeKey={roster.path.rb} /></td>
                    <td style={styles.td}><ArchetypePill archetypeKey={roster.path.qb} /></td>
                    <td style={styles.td}><ArchetypePill archetypeKey={roster.path.te} /></td>

                    {/* Composite Uniq Lift — rank-normalized color, archetype boost shown on hover */}
                    <td style={{ ...styles.td, textAlign: 'center' }}>
                      <span
                        title={tooltipTxt}
                        style={{
                          ...styles.uniqBadge,
                          color: uniquenessColor(scores.uniqLiftNorm ?? 0.5),
                          borderColor: uniquenessColor(scores.uniqLiftNorm ?? 0.5) + '55',
                        }}
                      >
                        {scores.rarity?.toFixed(2) ?? '—'}
                        {boostPct > 0 && (
                          <span style={{ fontSize: 9, opacity: 0.6, marginLeft: 4 }}>
                            ×{scores.archBoost}
                          </span>
                        )}
                      </span>
                    </td>

                    <td style={{ ...styles.td, textAlign: 'center' }}>
                      <span style={{ ...styles.clvBadge, color: clv.color, borderColor: clv.color + '44' }}>{clv.text}</span>
                    </td>
                    <td style={{ ...styles.td, textAlign: 'center' }}>
                      <span style={styles.chevron}>{isOpen ? '▲' : '▼'}</span>
                    </td>
                  </tr>
                  {isOpen && (
                    <tr>
                      <td colSpan={9} style={{ padding: 0 }}>
                        <PlayerDetail players={roster.players} alpha={alpha} />
                      </td>
                    </tr>
                  )}
                </React.Fragment>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}

// ── Filter group sub-component ────────────────────────────────────────────────

function FilterGroup({ label, options, value, onChange, counts = {} }) {
  return (
    <div style={styles.filterGroupWrap}>
      <span style={styles.filterGroupLabel}>{label}</span>
      <div style={{ display: 'flex', gap: 4, flexWrap: 'wrap' }}>
        {options.map(opt => {
          const isActive = value === opt;
          const color = opt === 'all' ? '#00e5a0' : archetypeColor(opt);
          const name = opt === 'all' ? 'All' : (ARCHETYPE_METADATA[opt]?.name || opt);
          const count = counts[opt];
          return (
            <button
              key={opt}
              title={ARCHETYPE_METADATA[opt]?.desc}
              style={{
                ...styles.filterBtn,
                ...(isActive ? { background: color + '1a', borderColor: color, color } : {}),
              }}
              onClick={() => onChange(opt)}
            >
              {name}{count !== undefined && opt !== 'all' ? ` (${count})` : ''}
            </button>
          );
        })}
      </div>
    </div>
  );
}

// ── Expanded player detail ────────────────────────────────────────────────────

function PlayerDetail({ players, alpha = 0.5 }) {
  const [pSort, setPSort] = useState('pick');
  const [pDir,  setPDir]  = useState('asc');

  const sorted = useMemo(() => [...players].sort((a, b) => {
    let av, bv;
    if (pSort === 'clv')  { av = calcCLV(a.pick, a.latestADP, alpha) ?? -Infinity; bv = calcCLV(b.pick, b.latestADP, alpha) ?? -Infinity; }
    else if (pSort === 'pick') { av = a.pick || 0; bv = b.pick || 0; }
    else if (pSort === 'adp')  { av = a.latestADP || 9999; bv = b.latestADP || 9999; }
    else if (pSort === 'name') { return pDir === 'asc' ? a.name.localeCompare(b.name) : b.name.localeCompare(a.name); }
    else { av = a[pSort] ?? -Infinity; bv = b[pSort] ?? -Infinity; }
    return pDir === 'asc' ? av - bv : bv - av;
  }), [players, pSort, pDir, alpha]);

  function tp(key) {
    if (pSort === key) setPDir(d => d === 'asc' ? 'desc' : 'asc');
    else { setPSort(key); setPDir(key === 'clv' ? 'desc' : 'asc'); }
  }
  function PI({ col }) {
    if (pSort !== col) return <span style={{ opacity: 0.2, marginLeft: 3 }}>↕</span>;
    return <span style={{ marginLeft: 3 }}>{pDir === 'desc' ? '↓' : '↑'}</span>;
  }

  return (
    <div style={styles.detail}>
      <table style={{ ...styles.table }}>
        <thead>
          <tr style={{ ...styles.thead, background: '#080808' }}>
            <th style={styles.dth} onClick={() => tp('name')}>Player <PI col="name" /></th>
            <th style={{ ...styles.dth, textAlign: 'center' }}>Pos</th>
            <th style={{ ...styles.dth, textAlign: 'center' }}>Team</th>
            <th style={{ ...styles.dth, textAlign: 'center' }} onClick={() => tp('pick')}>Draft Pick <PI col="pick" /></th>
            <th style={{ ...styles.dth, textAlign: 'center' }}>Round</th>
            <th style={{ ...styles.dth, textAlign: 'center' }} onClick={() => tp('adp')}>Cur ADP <PI col="adp" /></th>
            <th style={{ ...styles.dth, textAlign: 'center', color: '#00e5a055' }} onClick={() => tp('clv')}>CLV% <PI col="clv" /></th>
          </tr>
        </thead>
        <tbody>
          {sorted.map((p, i) => {
            const clvPct = calcCLV(p.pick, p.latestADP, alpha);
            const clv = clvLabel(clvPct);
            return (
              <tr key={`${p.name}-${i}`} style={styles.drow}>
                <td style={styles.dtd}><span style={styles.playerName}>{p.name}</span></td>
                <td style={{ ...styles.dtd, textAlign: 'center' }}>
                  <span style={{ ...styles.posPill, background: posColor(p.position) + '22', color: posColor(p.position), borderColor: posColor(p.position) + '55' }}>
                    {p.position}
                  </span>
                </td>
                <td style={{ ...styles.dtd, textAlign: 'center', color: '#e0e0e0', fontFamily: "'Space Mono', monospace", fontSize: 11 }}>{p.team}</td>
                <td style={{ ...styles.dtd, textAlign: 'center', fontFamily: "'Space Mono', monospace", fontSize: 12 }}>{p.pick || '—'}</td>
                <td style={{ ...styles.dtd, textAlign: 'center', color: '#ececec', fontSize: 12 }}>{p.round || '—'}</td>
                <td style={{ ...styles.dtd, textAlign: 'center', fontFamily: "'Space Mono', monospace", fontSize: 12, color: '#f0f0f0' }}>{p.latestADPDisplay || '—'}</td>
                <td style={{ ...styles.dtd, textAlign: 'center' }}>
                  {clvPct !== null ? (
                    <div style={styles.clvBar}>
                      <div style={{
                        ...styles.clvFill,
                        width: `${Math.min(Math.abs(clvPct), 100)}%`,
                        background: clv.color,
                        marginLeft: clvPct >= 0 ? '50%' : `${50 - Math.min(Math.abs(clvPct), 50)}%`,
                      }} />
                      <span style={{ ...styles.clvText, color: clv.color }}>{clv.text}</span>
                    </div>
                  ) : (
                    <span style={{ color: '#e2e2e2', fontSize: 11 }}>N/A</span>
                  )}
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

// ── Styles ────────────────────────────────────────────────────────────────────

const styles = {
  root: { fontFamily: "'DM Sans', sans-serif", color: '#ffffff', padding: '0 0 32px' },
  header: {
    display: 'flex', justifyContent: 'space-between', alignItems: 'center',
    marginBottom: 16, paddingBottom: 14, borderBottom: '1px solid #1a1a1a',
  },
  title: { fontFamily: "'Space Mono', monospace", fontSize: 18, fontWeight: 700, letterSpacing: 3, color: '#e6e6e6', margin: 0 },
  subtitle: { fontSize: 11, color: '#e4e4e4', margin: '4px 0 0', fontFamily: "'Space Mono', monospace" },
  alphaRow: { display: 'flex', alignItems: 'center', gap: 8 },
  alphaLabel: { fontFamily: "'Space Mono', monospace", fontSize: 9, letterSpacing: 1.5, textTransform: 'uppercase', color: '#444' },
  alphaExplain: { fontFamily: "'Space Mono', monospace", fontSize: 10, color: '#00e5a055', marginLeft: 4 },

  filterBar: {
    display: 'flex', flexWrap: 'wrap', gap: '10px 24px',
    padding: '12px 0 14px', borderBottom: '1px solid #181818', marginBottom: 14,
    alignItems: 'center',
  },
  filterGroupWrap: { display: 'flex', alignItems: 'center', gap: 8 },
  filterGroupLabel: {
    fontFamily: "'Space Mono', monospace", fontSize: 9, letterSpacing: 1.5,
    textTransform: 'uppercase', color: '#fafafa', minWidth: 22,
  },
  filterBtn: {
    background: 'transparent', border: '1px solid #a1a3a2', color: '#fafafa',
    borderRadius: 4, padding: '4px 9px', fontSize: 10,
    fontFamily: "'Space Mono', monospace", cursor: 'pointer',
    letterSpacing: 0.3, transition: 'all 0.12s', whiteSpace: 'nowrap',
  },
  filterBtnActive: {},

  tableWrap: { overflowX: 'auto', borderRadius: 8, border: '1px solid #1a1a1a' },
  table: { width: '100%', borderCollapse: 'collapse', fontSize: 13 },
  thead: { background: '#0d0d0d' },
  th: {
    padding: '11px 14px', textAlign: 'left',
    fontFamily: "'Space Mono', monospace", fontSize: 9, fontWeight: 700,
    letterSpacing: 1.5, color: '#dadada', textTransform: 'uppercase',
    cursor: 'pointer', userSelect: 'none',
    borderBottom: '1px solid #1a1a1a', whiteSpace: 'nowrap',
  },
  row: { borderBottom: '1px solid #141414', cursor: 'pointer', transition: 'background 0.1s' },
  rowOpen: { background: '#080f0c', borderBottom: '1px solid #00e5a07a' },
  td: { padding: '11px 14px', verticalAlign: 'middle' },
  entryId: { fontFamily: "'Space Mono', monospace", fontSize: 11, color: '#bbb', letterSpacing: 0.5 },
  clvBadge: {
    fontFamily: "'Space Mono', monospace", fontSize: 11, fontWeight: 700,
    border: '1px solid', borderRadius: 4, padding: '2px 7px',
  },
  chevron: { color: '#dddddd', fontSize: 10, fontFamily: "'Space Mono', monospace" },

  detail: { background: '#060c09', borderTop: '1px solid #00e5a01a' },
  dth: {
    padding: '9px 14px', textAlign: 'left',
    fontFamily: "'Space Mono', monospace", fontSize: 9, fontWeight: 700,
    letterSpacing: 1.5, color: '#ffffff', textTransform: 'uppercase',
    cursor: 'pointer', userSelect: 'none',
    borderBottom: '1px solid #0f0f0f', whiteSpace: 'nowrap',
  },
  drow: { borderBottom: '1px solid #0d0d0d' },
  dtd: { padding: '8px 14px', verticalAlign: 'middle' },
  playerName: { fontWeight: 500, color: '#ccc', fontSize: 13 },
  posPill: { fontSize: 10, fontFamily: "'Space Mono', monospace", border: '1px solid', borderRadius: 3, padding: '1px 5px', letterSpacing: 0.5 },
  clvBar: { position: 'relative', width: '100%', height: 18, display: 'flex', alignItems: 'center', justifyContent: 'center' },
  clvFill: { position: 'absolute', height: 3, top: '50%', transform: 'translateY(-50%)', borderRadius: 2, opacity: 0.5, maxWidth: '50%' },
  clvText: { position: 'relative', fontFamily: "'Space Mono', monospace", fontSize: 11, fontWeight: 700, zIndex: 1, background: '#060c09', padding: '0 4px' },

  empty: { textAlign: 'center', padding: '60px 20px', color: '#e2e2e2', fontFamily: "'Space Mono', monospace" },

  uniqBadge: {
    fontFamily: "'Space Mono', monospace",
    fontSize: 11,
    fontWeight: 700,
    border: '1px solid',
    borderRadius: 4,
    padding: '2px 7px',
    cursor: 'help',
  },
};