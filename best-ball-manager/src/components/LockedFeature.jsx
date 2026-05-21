import React from 'react';
import { Lock, Sparkles, Check } from 'lucide-react';
import { useAuth } from '../contexts/AuthContext';
import { useSubscription } from '../contexts/SubscriptionContext';
import styles from './LockedFeature.module.css';

const FEATURE_TEASERS = {
  'Combo Analysis': {
    bullets: [
      'QB stack rates across your entire portfolio',
      'Playoff stacking analysis for Weeks 15–17 correlation',
      'Dual-QB pair heatmap with leverage scores',
    ],
    preview: <ComboTeaser />,
  },
  'Draft Assistant': {
    bullets: [
      'Live pick-by-pick recommendations during drafts',
      'Stack-aware value board tuned to your roster',
      'ADP edge highlights as players come off the board',
    ],
    preview: <DraftFlowTeaser />,
  },
  'Roster Viewer': {
    bullets: [
      'Per-roster construction grade and archetype label',
      'Stack diagnostics and bye-week conflicts',
      'Side-by-side comparison across your draft pool',
    ],
    preview: <RosterTeaser />,
  },
  'Player Rankings': {
    bullets: [
      'Drag-and-drop custom board synced to your account',
      'ADP delta vs. consensus shown inline',
      'Tier breaks and positional run alerts',
    ],
    preview: <RankingsTeaser />,
  },
  'ADP Tracker': {
    bullets: [
      'Historical ADP timelines per platform',
      'Risers and fallers over any custom window',
      'Side-by-side Underdog vs. DraftKings divergence',
    ],
    preview: <AdpTeaser />,
  },
};

export default function LockedFeature({ featureName, onSignUp }) {
  const { user } = useAuth();
  const { openPlanPicker } = useSubscription();
  const teaser = FEATURE_TEASERS[featureName] || FEATURE_TEASERS['Combo Analysis'];

  function handleUpgrade() {
    if (user) {
      openPlanPicker();
    } else if (onSignUp) {
      onSignUp();
    }
  }

  return (
    <div className={styles.frame}>
      <div className={styles.previewLayer} aria-hidden="true">
        {teaser.preview}
      </div>
      <div className={styles.scrim} aria-hidden="true" />
      <div className={styles.grain} aria-hidden="true" />

      <div className={styles.card}>
        <div className={styles.lockBadge}>
          <Lock size={22} strokeWidth={2.25} />
          <span className={styles.shine} />
        </div>

        <span className={styles.kicker}>
          <Sparkles size={12} /> Pro feature
        </span>

        <h2 className={styles.title}>{featureName}</h2>
        <p className={styles.description}>
          Unlock the full module and every advanced analytic across Best Ball Exposures.
        </p>

        <ul className={styles.bullets}>
          {teaser.bullets.map((b) => (
            <li key={b}>
              <Check size={14} strokeWidth={2.5} />
              <span>{b}</span>
            </li>
          ))}
        </ul>

        <button className={styles.upgradeBtn} onClick={handleUpgrade}>
          {user ? 'Upgrade to Pro' : 'Sign up to unlock'}
        </button>
        <span className={styles.fineprint}>Cancel anytime · Instant access</span>
      </div>
    </div>
  );
}

function ComboTeaser() {
  const stacks = [
    { qb: 'J. Allen', pct: 88, partners: ['Cook', 'Shakir', 'Kincaid'] },
    { qb: 'L. Jackson', pct: 71, partners: ['Flowers', 'Andrews'] },
    { qb: 'J. Hurts', pct: 64, partners: ['Brown', 'Smith', 'Goedert'] },
    { qb: 'J. Burrow', pct: 52, partners: ['Chase', 'Higgins'] },
    { qb: 'B. Mayfield', pct: 41, partners: ['Evans', 'Godwin'] },
    { qb: 'C. Stroud', pct: 33, partners: ['Collins', 'Dell'] },
  ];
  return (
    <div className={styles.teaserCombo}>
      <div className={styles.teaserHeader}>
        <span>QB Stack Exposure</span>
        <span className={styles.teaserBadge}>14 unique QBs</span>
      </div>
      {stacks.map((s) => (
        <div key={s.qb} className={styles.stackRow}>
          <span className={styles.stackQb}>{s.qb}</span>
          <div className={styles.stackBar}>
            <div className={styles.stackFill} style={{ width: `${s.pct}%` }} />
          </div>
          <span className={styles.stackPct}>{s.pct}%</span>
          <div className={styles.stackPartners}>
            {s.partners.map((p) => (
              <span key={p} className={styles.chip}>{p}</span>
            ))}
          </div>
        </div>
      ))}
    </div>
  );
}

function DraftFlowTeaser() {
  const picks = [
    { name: 'CeeDee Lamb', pos: 'WR', adp: 4.2, edge: '+1.1' },
    { name: 'Bijan Robinson', pos: 'RB', adp: 6.5, edge: '+0.7' },
    { name: 'A.J. Brown', pos: 'WR', adp: 12.1, edge: '+2.3' },
    { name: 'Sam LaPorta', pos: 'TE', adp: 28.4, edge: '+4.1' },
  ];
  return (
    <div className={styles.teaserDraft}>
      <div className={styles.teaserHeader}>
        <span>Round 3 · On the clock</span>
        <span className={styles.teaserBadge}>Stack +EV</span>
      </div>
      {picks.map((p, i) => (
        <div key={p.name} className={styles.draftRow} style={{ '--i': i }}>
          <span className={`${styles.posTag} ${styles[`pos${p.pos}`]}`}>{p.pos}</span>
          <span className={styles.draftName}>{p.name}</span>
          <span className={styles.draftAdp}>ADP {p.adp}</span>
          <span className={styles.draftEdge}>{p.edge}</span>
        </div>
      ))}
    </div>
  );
}

function RosterTeaser() {
  const slots = ['QB', 'RB', 'RB', 'WR', 'WR', 'WR', 'TE'];
  return (
    <div className={styles.teaserRoster}>
      <div className={styles.teaserHeader}>
        <span>Roster · Hero RB · A−</span>
        <span className={styles.teaserBadge}>Stack: J. Allen + Shakir</span>
      </div>
      <div className={styles.rosterGrid}>
        {slots.map((slot, i) => (
          <div key={i} className={styles.rosterCard}>
            <span className={styles.rosterPos}>{slot}</span>
            <span className={styles.rosterShimmer} />
          </div>
        ))}
      </div>
    </div>
  );
}

function RankingsTeaser() {
  const players = [
    { name: 'Justin Jefferson', delta: '▲ 2' },
    { name: 'CeeDee Lamb', delta: '▲ 1' },
    { name: 'Ja\'Marr Chase', delta: '▼ 1' },
    { name: 'Tyreek Hill', delta: '▲ 3' },
    { name: 'A.J. Brown', delta: '▼ 2' },
    { name: 'Bijan Robinson', delta: '▲ 4' },
    { name: 'Breece Hall', delta: '▼ 1' },
    { name: 'Saquon Barkley', delta: '▲ 1' },
  ];
  return (
    <div className={styles.teaserRankings}>
      <div className={styles.teaserHeader}>
        <span>Your Board · WR</span>
        <span className={styles.teaserBadge}>Tier 1</span>
      </div>
      {players.map((p, i) => (
        <div key={p.name} className={styles.rankRow}>
          <span className={styles.rankNum}>{i + 1}</span>
          <span className={styles.rankName}>{p.name}</span>
          <span className={styles.rankDelta}>{p.delta}</span>
        </div>
      ))}
    </div>
  );
}

function AdpTeaser() {
  const points = [70, 62, 58, 54, 49, 45, 38, 36, 34, 30, 27, 22];
  const max = Math.max(...points);
  const path = points
    .map((p, i) => `${(i / (points.length - 1)) * 100},${100 - (p / max) * 100}`)
    .join(' ');
  return (
    <div className={styles.teaserAdp}>
      <div className={styles.teaserHeader}>
        <span>ADP Trend · CeeDee Lamb</span>
        <span className={styles.teaserBadge}>↑ 48 spots</span>
      </div>
      <svg viewBox="0 0 100 100" preserveAspectRatio="none" className={styles.adpChart}>
        <defs>
          <linearGradient id="adpFill" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="rgba(232,191,74,0.45)" />
            <stop offset="100%" stopColor="rgba(232,191,74,0)" />
          </linearGradient>
        </defs>
        <polygon points={`0,100 ${path} 100,100`} fill="url(#adpFill)" />
        <polyline points={path} fill="none" stroke="#E8BF4A" strokeWidth="1.2" vectorEffect="non-scaling-stroke" />
      </svg>
    </div>
  );
}
