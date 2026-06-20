import React, { useMemo } from 'react';
import { Anchor, CalendarDays } from 'lucide-react';
import { analyzeByeRainbow } from '../utils/eliminatorModel';
import styles from './EliminatorPanel.module.css';

const POS_COLORS = { QB: '#bf44ef', RB: '#10b981', WR: '#f59e0b', TE: '#3b82f6' };

const BYE_TIER_META = {
  premium: { color: '#10b981', title: 'Premium late bye (Week 14)' },
  strong: { color: '#34d399', title: 'Strong late bye (Week 13)' },
  shared: { color: '#64748b', title: 'Bymageddon (Week 11) — the field shares it' },
  neutral: { color: '#94a3b8', title: 'Mid-season bye' },
  early: { color: '#f59e0b', title: 'Early bye (Weeks 5–8) — dangerous when stacked' },
};

// Minimal Eliminator-format panel. Renders in place of the season-long archetype cards when
// Eliminator Mode is on (ADR-010, TASK-269; refined to mirror the Chrome extension's minimal
// surface — ADR-011). Shows ONLY the bye rainbow: the bye week(s) in each position room, with
// shared-bye weeks flagged and the players revealed on hover. No roster-shape tracker, warnings,
// or playbook — describe the byes, prescribe nothing.
export default function EliminatorPanel({ picks = [] }) {
  const rainbow = useMemo(() => analyzeByeRainbow(picks), [picks]);
  const hasByes = picks.length > 0 && rainbow.summary.length > 0;

  return (
    <div className={styles.panel}>
      <div className={styles.header}>
        <Anchor size={14} color="#34d399" />
        <span className={styles.headerTitle}>Eliminator · Byes</span>
      </div>

      <div className={styles.section}>
        <div className={styles.sectionLabel}>
          <CalendarDays size={11} /> Bye Rainbow
        </div>

        {!hasByes ? (
          <div className={styles.emptyHint}>
            Stagger byes — no two players in a position room should share one.
          </div>
        ) : (
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
                        style={{
                          borderColor: clash ? '#ef4444' : meta.color,
                          color: clash ? '#fca5a5' : meta.color,
                        }}
                        title={`${w.players.join(', ')} — bye wk${w.week}`}
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
        )}
      </div>
    </div>
  );
}
