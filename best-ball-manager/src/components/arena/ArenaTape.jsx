// ArenaTape — the "tale of the tape" spine between the two contenders (ADR-013 /
// TASK-297). It is the signature of the redesign: a compact central ledger that
// compares the two teams stat-by-stat, with Total team CLV as the headline. The
// winning side of each comparable stat lights up in its corner color; categorical
// rows (build, stacks, drafted) are shown side-by-side with no winner — the voter
// weighs those. Self-contained on the two display snapshots — no owner identity,
// no Elo.

import React, { useMemo } from 'react';
import { ARCHETYPE_METADATA } from '../../utils/rosterArchetypes';
import { analyzeRosterStacks } from '../../utils/stackAnalysis';
import { nflTeamColor } from '../../utils/nflTeamColors';
import { teamAbbrev } from '../../utils/nflTeams';
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

function projText(v) {
  return v == null ? '—' : String(Math.round(v));
}

// "2026-06-12" -> "Jun 12" (tape cells are narrow; year is dropped).
function dateText(iso) {
  if (!iso) return '—';
  const d = new Date(`${iso}T00:00:00`);
  return isNaN(d) ? '—' : d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
}

// The roster's biggest stack as "PHI ×3" in franchise color; "—" when it has
// none. Kept to one token — the tape's cells are too narrow for a stack list
// (the card's chips carry the full picture).
function stackSummary(snapshot) {
  // Frozen snapshots can carry full team names ("Denver Broncos") — collapse to
  // abbreviations so the token stays narrow and the color lookup resolves,
  // matching the roster card's normalization.
  const players = (snapshot?.players || []).map((p) =>
    (p.team ? { ...p, team: teamAbbrev(p.team) } : p));
  const stacks = players.length ? analyzeRosterStacks(players) : [];
  if (!stacks.length) return { text: '—', color: null };
  const best = stacks.reduce((a, b) =>
    (b.members.length > a.members.length ? b : a));
  return {
    text: `${best.team} ×${best.members.length}`,
    color: nflTeamColor(best.team),
  };
}

function TapeStat({ label, aText, bText, aWin = false, bWin = false, aStyle, bStyle, wrap = false }) {
  const wrapCls = wrap ? ` ${css.tapeValWrap}` : '';
  return (
    <div className={css.tapeRow}>
      <span className={`${css.tapeVal} ${css.tapeValA}${wrapCls} ${aWin ? css.tapeWinA : ''}`} style={aStyle}>{aText}</span>
      <span className={css.tapeLabel}>{label}</span>
      <span className={`${css.tapeVal} ${css.tapeValB}${wrapCls} ${bWin ? css.tapeWinB : ''}`} style={bStyle}>{bText}</span>
    </div>
  );
}

function ArenaTape({ a, b, active = false, comboLookup = null }) {
  const aCLV = a?.avgCLV;
  const bCLV = b?.avgCLV;
  const haveCLV = aCLV != null && bCLV != null;
  const aProj = a?.projTotal;
  const bProj = b?.projTotal;
  const haveProj = aProj != null && bProj != null;
  // Memoized per snapshot — the reveal flips `active`, and re-running stack
  // analysis for both rosters at that moment competes with the reveal animations.
  const aStack = useMemo(() => stackSummary(a), [a]);
  const bStack = useMemo(() => stackSummary(b), [b]);
  const haveDate = a?.draftedAt || b?.draftedAt;

  // Early Combo rarity (share of tracked real drafts starting with the team's
  // first-3 picks). Unlike CLV/Proj, the LOWER share wins — rarer is better.
  // Ratios are compared (not raw counts) in case the two teams score against
  // different pre/post denominators.
  const aCombo = useMemo(() => (comboLookup ? comboLookup(a) : null), [comboLookup, a]);
  const bCombo = useMemo(() => (comboLookup ? comboLookup(b) : null), [comboLookup, b]);
  const haveCombo = aCombo != null && bCombo != null;
  const aRatio = haveCombo ? aCombo.count / (aCombo.totalRosters || 1) : null;
  const bRatio = haveCombo ? bCombo.count / (bCombo.totalRosters || 1) : null;

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
        <TapeStat
          label="Proj Pts"
          aText={projText(aProj)}
          bText={projText(bProj)}
          aWin={haveProj && aProj > bProj}
          bWin={haveProj && bProj > aProj}
        />
        {(aCombo || bCombo) && (
          <TapeStat
            label="Uniqueness"
            aText={aCombo?.pctText ?? '—'}
            bText={bCombo?.pctText ?? '—'}
            aWin={haveCombo && aRatio < bRatio}
            bWin={haveCombo && bRatio < aRatio}
          />
        )}
        <TapeStat label="Build" aText={buildName(a?.path)} bText={buildName(b?.path)} wrap />
        <TapeStat
          label="Top Stack"
          aText={aStack.text}
          bText={bStack.text}
          aStyle={aStack.color ? { color: aStack.color } : undefined}
          bStyle={bStack.color ? { color: bStack.color } : undefined}
        />
        <TapeStat
          label="Picks"
          aText={String(a?.count ?? '—')}
          bText={String(b?.count ?? '—')}
        />
        {haveDate && (
          <TapeStat label="Drafted" aText={dateText(a?.draftedAt)} bText={dateText(b?.draftedAt)} />
        )}
      </div>
    </div>
  );
}

// Memoized: with the parent's snapshots referentially stable, deck-scroll and
// session-stat re-renders skip the tape entirely.
export default React.memo(ArenaTape);
