import React, { useMemo, useState } from 'react';
import { Anchor, AlertTriangle, CalendarDays, ChevronDown, ChevronUp, ShieldCheck } from 'lucide-react';
import {
  analyzeRosterShape,
  analyzeByeRainbow,
  ROSTER_SHAPE,
  PLAYBOOK,
  ELIMINATOR_DATA,
} from '../utils/eliminatorModel';
import styles from './EliminatorPanel.module.css';

const POS_COLORS = { QB: '#bf44ef', RB: '#10b981', WR: '#f59e0b', TE: '#3b82f6' };

const SHAPE_STATUS_COLOR = {
  under: '#64748b',
  ok: '#10b981',
  ideal: '#10b981',
  over: '#ef4444',
};

const BYE_TIER_META = {
  premium: { label: 'wk14', color: '#10b981', title: 'Premium late bye (Week 14)' },
  strong: { label: 'wk13', color: '#34d399', title: 'Strong late bye (Week 13)' },
  shared: { label: 'wk11', color: '#64748b', title: 'Bymageddon (Week 11) — the field shares it' },
  neutral: { label: '', color: '#94a3b8', title: 'Mid-season bye' },
  early: { label: '', color: '#f59e0b', title: 'Early bye (Weeks 5–8) — dangerous when stacked' },
};

// Compact Eliminator-format construction panel. Renders in place of the season-long
// archetype cards when Eliminator Mode is on (ADR-010, TASK-269). Describes roster-shape
// progress and bye-rainbow state; prescribes nothing the strategy docs don't.
export default function EliminatorPanel({ picks = [] }) {
  const [playbookOpen, setPlaybookOpen] = useState(false);

  const shape = useMemo(() => analyzeRosterShape(picks), [picks]);
  const rainbow = useMemo(() => analyzeByeRainbow(picks), [picks]);

  const shapeLabel = (pos) =>
    pos.min === pos.max ? `${pos.min}` : `${pos.min}–${pos.max}`;

  return (
    <div className={styles.panel}>
      {/* Header */}
      <div className={styles.header}>
        <Anchor size={14} color="#34d399" />
        <span className={styles.headerTitle}>Eliminator Mode</span>
        <span className={styles.headerSub}>floor &amp; breadth · survive the week</span>
      </div>

      {/* Roster shape tracker */}
      <div className={styles.section}>
        <div className={styles.sectionLabel}>
          Roster Shape
          <span className={styles.sectionMeta}>
            {shape.total}/{shape.target} · {ROSTER_SHAPE.winningShapes.join(' or ')}
          </span>
        </div>
        <div className={styles.shapeGrid}>
          {shape.positions.map((pos) => {
            const color = SHAPE_STATUS_COLOR[pos.status] || '#94a3b8';
            return (
              <div key={pos.position} className={styles.shapeRow} title={pos.note}>
                <span className={styles.shapePos} style={{ background: POS_COLORS[pos.position] }}>
                  {pos.position}
                </span>
                <span className={styles.shapeCount} style={{ color }}>
                  {pos.count}
                  <span className={styles.shapeTarget}>/{shapeLabel(pos)}</span>
                </span>
                <div className={styles.shapeBarTrack}>
                  <div
                    className={styles.shapeBarFill}
                    style={{
                      width: `${Math.min(100, (pos.count / Math.max(1, pos.max)) * 100)}%`,
                      background: color,
                    }}
                  />
                </div>
                {pos.status === 'over' && (
                  <AlertTriangle size={11} color="#ef4444" title="Over target" />
                )}
              </div>
            );
          })}
        </div>
      </div>

      {/* Bye rainbow */}
      <div className={styles.section}>
        <div className={styles.sectionLabel}>
          <CalendarDays size={11} /> Bye Rainbow
          <span className={styles.sectionMeta}>
            {rainbow.lateByeCount} late (wk13/14)
          </span>
        </div>

        {picks.length === 0 ? (
          <div className={styles.emptyHint}>
            Stagger byes — no two players in a position room should share one. Late (wk13/14)
            byes carry you into the money.
          </div>
        ) : (
          <>
            {/* Per-position bye chips */}
            <div className={styles.byeSummary}>
              {rainbow.summary.map((row) => (
                <div key={row.position} className={styles.byeRow}>
                  <span className={styles.byePos} style={{ background: POS_COLORS[row.position] }}>
                    {row.position}
                  </span>
                  <div className={styles.byeChips}>
                    {row.weeks.map((w) => {
                      const meta = BYE_TIER_META[w.tier] || BYE_TIER_META.neutral;
                      const clash = w.players.length >= 2;
                      return (
                        <span
                          key={`${row.position}-${w.week}`}
                          className={`${styles.byeChip} ${clash ? styles.byeChipClash : ''}`}
                          style={{ borderColor: clash ? '#ef4444' : meta.color, color: clash ? '#fca5a5' : meta.color }}
                          title={`${clash ? 'COLLISION — ' : ''}${w.players.join(', ')} (bye wk${w.week})`}
                        >
                          wk{w.week}
                          {w.players.length > 1 && <span className={styles.byeChipCount}>×{w.players.length}</span>}
                        </span>
                      );
                    })}
                  </div>
                </div>
              ))}
            </div>

            {/* Warnings */}
            {rainbow.collisions.length > 0 && (
              <div className={styles.warn}>
                <AlertTriangle size={12} color="#ef4444" />
                <span>
                  Rainbow break:{' '}
                  {rainbow.collisions
                    .map((c) => `${c.players.length} ${c.position}s on wk${c.week}`)
                    .join('; ')}
                </span>
              </div>
            )}
            {rainbow.earlyStacks.length > 0 && (
              <div className={styles.warn}>
                <AlertTriangle size={12} color="#f59e0b" />
                <span>
                  Stacked early bye:{' '}
                  {rainbow.earlyStacks.map((s) => `wk${s.week} (${s.players.length})`).join('; ')}
                </span>
              </div>
            )}
            {rainbow.collisions.length === 0 && rainbow.earlyStacks.length === 0 && (
              <div className={styles.ok}>
                <ShieldCheck size={12} color="#34d399" />
                <span>Rainbow intact — no shared byes in a room.</span>
              </div>
            )}
            {rainbow.unknownByeCount > 0 && (
              <div className={styles.muted}>{rainbow.unknownByeCount} pick(s) without bye data (FA/unknown team).</div>
            )}
          </>
        )}
      </div>

      {/* Collapsible playbook */}
      <div className={styles.section}>
        <button className={styles.playbookToggle} onClick={() => setPlaybookOpen((v) => !v)}>
          <span>Eliminator Playbook</span>
          {playbookOpen ? <ChevronUp size={13} /> : <ChevronDown size={13} />}
        </button>
        {playbookOpen && (
          <ol className={styles.playbookList}>
            {PLAYBOOK.map((tip, i) => (
              <li key={i} className={styles.playbookItem}>{tip}</li>
            ))}
          </ol>
        )}
      </div>

      <div className={styles.footnote}>
        Bye/fade data as of {ELIMINATOR_DATA.as_of} — refresh for August roster news.
      </div>
    </div>
  );
}
