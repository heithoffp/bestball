// ArenaTape — the "tale of the tape" spine between the two contenders (ADR-013 /
// TASK-297). It is the signature of the redesign: a compact central ledger that
// compares the two teams stat-by-stat, with Total team CLV as the headline. The
// winning side of each comparable stat lights up in its corner color. Categorical
// rows (build) are shown side-by-side with no winner. Self-contained on the two
// display snapshots — no owner identity, no Elo.

import React from 'react';
import { ARCHETYPE_METADATA } from '../../utils/rosterArchetypes';
import css from '../Arena.module.css';

// A roster's headline "build" — the RB archetype carries the most signal (Hero RB /
// Zero RB / etc.); fall back to QB or TE tier if RB is absent.
function buildName(path) {
  if (!path) return '—';
  const key = path.rb || path.qb || path.te;
  return ARCHETYPE_METADATA[key]?.name || '—';
}

function clvText(v) {
  if (v == null) return '—';
  return `${v >= 0 ? '+' : ''}${v.toFixed(1)}%`;
}

function TapeStat({ label, aText, bText, aWin = false, bWin = false }) {
  return (
    <div className={css.tapeRow}>
      <span className={`${css.tapeVal} ${css.tapeValA} ${aWin ? css.tapeWinA : ''}`}>{aText}</span>
      <span className={css.tapeLabel}>{label}</span>
      <span className={`${css.tapeVal} ${css.tapeValB} ${bWin ? css.tapeWinB : ''}`}>{bText}</span>
    </div>
  );
}

export default function ArenaTape({ a, b, active = false }) {
  const aCLV = a?.avgCLV;
  const bCLV = b?.avgCLV;
  const haveCLV = aCLV != null && bCLV != null;

  return (
    <div className={css.tape}>
      <div className={`${css.vsMedallion} ${active ? css.vsActive : ''}`}>VS</div>
      <div className={css.tapeHairline} aria-hidden="true" />
      <div className={css.tapeRows}>
        <TapeStat
          label="Team CLV"
          aText={clvText(aCLV)}
          bText={clvText(bCLV)}
          aWin={haveCLV && aCLV > bCLV}
          bWin={haveCLV && bCLV > aCLV}
        />
        <TapeStat label="Build" aText={buildName(a?.path)} bText={buildName(b?.path)} />
        <TapeStat
          label="Picks"
          aText={String(a?.count ?? '—')}
          bText={String(b?.count ?? '—')}
        />
      </div>
    </div>
  );
}
