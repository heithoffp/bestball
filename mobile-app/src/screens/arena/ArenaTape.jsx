// ArenaTape — RN port of the web "tale of the tape" spine (best-ball-manager/src/
// components/arena/ArenaTape.jsx). A compact central ledger comparing the two
// contenders stat-by-stat; Total team CLV is the headline. The winning side of each
// comparable stat lights up in its corner color; categorical rows (build, stacks,
// drafted) show side-by-side with no winner. Self-contained on the two display
// snapshots — no owner identity, no Elo.
import React, { useMemo } from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { ARCHETYPE_METADATA } from '../../../shared/utils/rosterArchetypes';
import { analyzeRosterStacks } from '../../../shared/utils/stackAnalysis';
import { nflTeamColor } from '../../../shared/utils/nflTeamColors';
import { teamAbbrev } from '../../../shared/utils/nflTeams';
import { colors, corner as cornerColors } from '../../theme';

// A roster's headline "build" — RB archetype carries the most signal; fall back to
// QB or TE tier when RB is absent.
function buildName(path) {
  if (!path) return '—';
  const key = path.rb || path.qb || path.te;
  return ARCHETYPE_METADATA[key]?.name || '—';
}

function clvText(v) {
  if (v == null) return '—';
  return `${v >= 0 ? '+' : ''}${v.toFixed(1)}%`;
}
function projText(v) { return v == null ? '—' : String(Math.round(v)); }
function dateText(iso) {
  if (!iso) return '—';
  const d = new Date(`${iso}T00:00:00`);
  return isNaN(d) ? '—' : d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
}

// The roster's biggest stack as "PHI ×3" in franchise color; "—" when none.
function stackSummary(snapshot) {
  const players = (snapshot?.players || []).map((p) => (p.team ? { ...p, team: teamAbbrev(p.team) } : p));
  const stacks = players.length ? analyzeRosterStacks(players) : [];
  if (!stacks.length) return { text: '—', color: null };
  const best = stacks.reduce((a, b) => (b.members.length > a.members.length ? b : a));
  return { text: `${best.team} ×${best.members.length}`, color: nflTeamColor(best.team) };
}

function TapeStat({ label, aText, bText, aWin = false, bWin = false, aColor, bColor }) {
  return (
    <View style={styles.row}>
      <Text style={[styles.val, styles.valA, aWin && { color: cornerColors.red, fontWeight: '800' }, aColor && { color: aColor }]} numberOfLines={1}>
        {aText}{aWin ? ' ◂' : ''}
      </Text>
      <Text style={styles.label} numberOfLines={1}>{label}</Text>
      <Text style={[styles.val, styles.valB, bWin && { color: cornerColors.blue, fontWeight: '800' }, bColor && { color: bColor }]} numberOfLines={1}>
        {bWin ? '▸ ' : ''}{bText}
      </Text>
    </View>
  );
}

function ArenaTape({ a, b, active = false, comboLookup = null }) {
  const aCLV = a?.avgCLV;
  const bCLV = b?.avgCLV;
  const haveCLV = aCLV != null && bCLV != null;
  const aProj = a?.projTotal;
  const bProj = b?.projTotal;
  const haveProj = aProj != null && bProj != null;
  const aStack = useMemo(() => stackSummary(a), [a]);
  const bStack = useMemo(() => stackSummary(b), [b]);
  const haveDate = a?.draftedAt || b?.draftedAt;

  const aCombo = useMemo(() => (comboLookup ? comboLookup(a) : null), [comboLookup, a]);
  const bCombo = useMemo(() => (comboLookup ? comboLookup(b) : null), [comboLookup, b]);
  const haveCombo = aCombo != null && bCombo != null;
  const aRatio = haveCombo ? aCombo.count / (aCombo.totalRosters || 1) : null;
  const bRatio = haveCombo ? bCombo.count / (bCombo.totalRosters || 1) : null;

  return (
    <View style={styles.tape}>
      <View style={[styles.vs, active && styles.vsActive]}>
        <Text style={[styles.vsText, active && { color: colors.accent }]}>VS</Text>
      </View>
      <View style={styles.rows}>
        <TapeStat label="Team CLV" aText={clvText(aCLV)} bText={clvText(bCLV)} aWin={haveCLV && aCLV > bCLV} bWin={haveCLV && bCLV > aCLV} />
        <TapeStat label="Proj Pts" aText={projText(aProj)} bText={projText(bProj)} aWin={haveProj && aProj > bProj} bWin={haveProj && bProj > aProj} />
        {(aCombo || bCombo) && (
          <TapeStat label="Uniqueness" aText={aCombo?.pctText ?? '—'} bText={bCombo?.pctText ?? '—'} aWin={haveCombo && aRatio < bRatio} bWin={haveCombo && bRatio < aRatio} />
        )}
        <TapeStat label="Build" aText={buildName(a?.path)} bText={buildName(b?.path)} />
        <TapeStat label="Top Stack" aText={aStack.text} bText={bStack.text} aColor={aStack.color} bColor={bStack.color} />
        <TapeStat label="Picks" aText={String(a?.count ?? '—')} bText={String(b?.count ?? '—')} />
        {haveDate && <TapeStat label="Drafted" aText={dateText(a?.draftedAt)} bText={dateText(b?.draftedAt)} />}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  tape: {
    backgroundColor: colors.surface1,
    borderWidth: 1, borderColor: colors.borderSubtle, borderRadius: 12,
    paddingTop: 18, paddingBottom: 10, paddingHorizontal: 10, marginBottom: 8,
  },
  vs: {
    position: 'absolute', top: -13, alignSelf: 'center',
    width: 40, height: 26, borderRadius: 13,
    backgroundColor: colors.surface0, borderWidth: 1, borderColor: colors.borderStrong,
    alignItems: 'center', justifyContent: 'center', zIndex: 2,
  },
  vsActive: { borderColor: colors.accent },
  vsText: { color: colors.textSecondary, fontWeight: '900', fontSize: 12, letterSpacing: 1 },
  rows: { gap: 4 },
  row: { flexDirection: 'row', alignItems: 'center' },
  val: { flex: 1, fontSize: 13, fontWeight: '700', color: colors.textPrimary, fontVariant: ['tabular-nums'] },
  valA: { textAlign: 'right' },
  valB: { textAlign: 'left' },
  label: {
    width: 92, textAlign: 'center', fontSize: 10, fontWeight: '700',
    letterSpacing: 0.6, textTransform: 'uppercase', color: colors.textMuted,
  },
});

// Memoized: with parent snapshots referentially stable, deck-scroll and session-stat
// re-renders skip the tape entirely.
export default React.memo(ArenaTape);
