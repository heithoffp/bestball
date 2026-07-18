// ArenaRosterCard — RN port of the web contender card (best-ball-manager/src/
// components/arena/ArenaRosterCard.jsx). One anonymized team in the blind matchup,
// styled as a fighter's corner. No owner identity is ever shown. red/blue is purely
// POSITIONAL (the server randomizes left/right), so it carries no owner signal.
//
// Puts a whole roster on screen: dense single-line rows with headshots (via the
// shared PlayerAvatar), NFL-team-colored stack rails, a switchable stat lens
// (CLV or projected points), and the draft date when the snapshot carries one.
import React, { useEffect, useMemo, useRef, useState } from 'react';
import { View, Text, Pressable, StyleSheet, AccessibilityInfo } from 'react-native';
import { CalendarDays } from 'lucide-react-native';
import { posColor } from '../../../shared/utils/positionColors';
import { nflTeamColor } from '../../../shared/utils/nflTeamColors';
import { teamAbbrev } from '../../../shared/utils/nflTeams';
import { analyzeRosterStacks } from '../../../shared/utils/stackAnalysis';
import { colors, spacing, radii, type, corner as cornerColors, withAlpha } from '../../theme';
import { PlayerAvatar, Bar } from '../../components/ui';

const POS_ORDER = ['QB', 'RB', 'WR', 'TE', 'K', 'DST', 'DEF'];

// "2026-06-12" -> "Jun 12" (year appended only when it isn't the current year).
function draftDateLabel(iso) {
  const d = new Date(`${iso}T00:00:00`);
  if (isNaN(d)) return null;
  const opts = { month: 'short', day: 'numeric' };
  if (d.getFullYear() !== new Date().getFullYear()) opts.year = 'numeric';
  return d.toLocaleDateString('en-US', opts);
}

// CLV -> text + sign + bar magnitude (0..1). ±15% reads as a full half-bar.
function clvView(clv) {
  if (clv == null) return { text: '—', color: colors.textMuted, mag: 0, pos: true };
  const pos = clv >= 0;
  return {
    text: `${pos ? '+' : ''}${clv.toFixed(1)}%`,
    color: pos ? colors.positive : colors.negative,
    mag: Math.min(1, Math.abs(clv) / 15),
    pos,
  };
}

// Reveal ticker: holds the pre-vote Elo briefly, then rolls to the post-vote value.
// Ported from the web's rAF count-up (RN supports requestAnimationFrame); writes to
// component state rather than DOM textContent. Honors reduce-motion.
const TICK_HOLD_MS = 420;
const TICK_ROLL_MS = 850;

function RatingTicker({ before, after, style }) {
  const [val, setVal] = useState(Math.round(before));
  useEffect(() => {
    const from = Math.round(before);
    const to = Math.round(after);
    let raf;
    let hold;
    let cancelled = false;
    let start;
    const roll = (now) => {
      if (start === undefined) start = now;
      const t = Math.min(1, (now - start) / TICK_ROLL_MS);
      const eased = 1 - (1 - t) ** 3;
      setVal(Math.round(from + (to - from) * eased));
      if (t < 1) raf = requestAnimationFrame(roll);
    };
    AccessibilityInfo.isReduceMotionEnabled().then((reduced) => {
      if (cancelled) return;
      if (reduced || from === to) { setVal(to); return; }
      setVal(from);
      hold = setTimeout(() => { raf = requestAnimationFrame(roll); }, TICK_HOLD_MS);
    });
    return () => { cancelled = true; clearTimeout(hold); if (raf) cancelAnimationFrame(raf); };
  }, [before, after]);
  return <Text style={style}>{val}</Text>;
}

// Position-count + stack chips above the roster list.
function PosSnapshot({ posSnap, stacks, showStacks }) {
  const keys = [
    ...POS_ORDER.filter((p) => posSnap[p]),
    ...Object.keys(posSnap).filter((p) => !POS_ORDER.includes(p)),
  ];
  return (
    <View style={styles.posSnap}>
      {keys.map((pos) => {
        const c = posColor(pos);
        return (
          <View key={pos} style={[styles.posChip, { borderColor: withAlpha(c, 0.33), backgroundColor: withAlpha(c, 0.12) }]}>
            <Text style={[styles.posChipText, { color: c }]}>{posSnap[pos]}{pos}</Text>
          </View>
        );
      })}
      {showStacks && stacks.map((s) => {
        const c = nflTeamColor(s.team);
        const qbAnchored = s.members.some((m) => m.position === 'QB');
        return (
          <View
            key={s.team}
            style={[styles.stackChip, { borderColor: withAlpha(c, 0.6), backgroundColor: withAlpha(c, qbAnchored ? 0.24 : 0.14) }]}
          >
            <Text style={[styles.stackChipText, { color: c }]}>{s.team} ×{s.members.length}</Text>
          </View>
        );
      })}
    </View>
  );
}

/**
 * @param {object} props.snapshot   display-enriched display_snapshot payload
 * @param {'red'|'blue'|'neutral'} props.corner positional corner (random per matchup)
 * @param {string} props.cornerLabel e.g. "Red Corner"
 * @param {'win'|'loss'|null} props.outcome reveal state
 * @param {number|null} props.delta Elo delta fallback when no full rating payload
 * @param {{before,after,delta}|null} props.rating full Elo reveal payload
 * @param {string|null} props.stamp "Winner" / "Upset Win"
 * @param {'clv'|'proj'} props.lens which stat rides each row
 * @param {boolean} props.showStacks paint NFL-team stack rails + chips
 * @param {number|null} props.maxProj proj-bar scale ceiling (max across the matchup)
 * @param {function|null} props.comboLookup (snapshot) => {count,totalRosters,pctText}
 * @param {boolean} props.pickable the card itself is the vote target
 * @param {boolean} props.picked post-reveal: this was the voter's pick
 * @param {function|null} props.onPick vote handler when pickable
 */
export default function ArenaRosterCard({
  snapshot, corner = 'red', cornerLabel, outcome = null, delta = null, rating = null,
  stamp = null, lens = 'clv', showStacks = true, maxProj = null, comboLookup = null,
  pickable = false, picked = false, onPick = null,
}) {
  const { players: rawPlayers = [], posSnap = {}, count, draftedAt } = snapshot || {};

  // Normalize teams to abbreviations so stack detection, rail colors, and rendered
  // team text are all driven off the same canonical value.
  const players = useMemo(
    () => rawPlayers.map((p) => (p.team ? { ...p, team: teamAbbrev(p.team) } : p)),
    [rawPlayers],
  );
  const stacks = useMemo(() => (players.length ? analyzeRosterStacks(players) : []), [players]);
  const stackTeams = useMemo(() => {
    const map = new Map();
    stacks.forEach((s) => map.set(s.team, nflTeamColor(s.team)));
    return map;
  }, [stacks]);

  const projCeiling = Math.max(1, maxProj ?? players.reduce((m, p) => Math.max(m, p.proj || 0), 0));
  const combo = useMemo(() => (comboLookup ? comboLookup(snapshot) : null), [comboLookup, snapshot]);

  if (!snapshot) return null;

  const cornerColor = corner === 'blue' ? cornerColors.blue : corner === 'red' ? cornerColors.red : colors.borderDefault;
  const dateLabel = draftedAt ? draftDateLabel(draftedAt) : null;
  const clickable = pickable && typeof onPick === 'function';

  const cardStyle = [
    styles.card,
    { borderLeftColor: cornerColor },
    outcome === 'win' && { borderColor: colors.accent },
    outcome === 'loss' && { opacity: 0.45 },
  ];

  const d = rating ? Math.round(rating.delta) : (delta != null ? Math.round(delta) : null);

  const body = (
    <>
      {outcome && (rating || delta != null) && (
        <View style={styles.ribbonWrap} pointerEvents="none">
          <View style={[styles.deltaRibbon, d > 0 ? styles.deltaUp : d < 0 ? styles.deltaDown : styles.deltaFlat]}>
            {rating ? (
              <>
                <RatingTicker before={rating.before} after={rating.after} style={styles.ribbonNum} />
                <Text style={styles.ribbonUnit}>Elo</Text>
                <Text style={[styles.ribbonDelta, d > 0 ? { color: colors.positive } : d < 0 ? { color: colors.negative } : { color: colors.textMuted }]}>
                  {d === 0 ? '±0' : `${d > 0 ? '▲ +' : '▼ −'}${Math.abs(d)}`}
                </Text>
              </>
            ) : (
              <Text style={styles.ribbonNum}>{d === 0 ? '±0' : `${d > 0 ? '+' : '−'}${Math.abs(d)}`} Elo</Text>
            )}
          </View>
        </View>
      )}
      {stamp && (
        <View style={styles.stamp} pointerEvents="none">
          <Text style={styles.stampText}>{stamp}</Text>
        </View>
      )}

      <View style={styles.cardHead}>
        <View style={[styles.cornerDot, { backgroundColor: cornerColor }]} />
        <Text style={[styles.sideLabel, { color: cornerColor }]}>{cornerLabel}</Text>
        {picked && (
          <View style={styles.pickedTag}><Text style={styles.pickedTagText}>Your pick ✓</Text></View>
        )}
        <View style={styles.headMeta}>
          {dateLabel && (
            <View style={styles.draftDate}>
              <CalendarDays size={11} color={colors.textMuted} />
              <Text style={styles.draftDateText}>{dateLabel}</Text>
            </View>
          )}
          {combo?.pctText && <Text style={styles.pickCount}>{combo.pctText} combo</Text>}
          <Text style={styles.pickCount}>{count} picks</Text>
        </View>
      </View>

      <PosSnapshot posSnap={posSnap} stacks={stacks} showStacks={showStacks} />

      <View style={styles.playerList}>
        {players.map((p, i) => {
          const c = posColor(p.position);
          const railColor = showStacks ? stackTeams.get(p.team) : null;
          const clv = clvView(p.clv);
          return (
            <View
              key={`${p.name}-${i}`}
              style={[
                styles.playerRow,
                { borderLeftColor: railColor || 'transparent' },
                railColor && { backgroundColor: withAlpha(railColor, 0.16) },
              ]}
            >
              <PlayerAvatar name={p.name} position={p.position} team={p.team} size={28} />
              <Text style={styles.playerName} numberOfLines={1}>{p.name}</Text>
              <Text style={styles.playerMeta} numberOfLines={1}>
                <Text style={{ color: c }}>{p.position}</Text>
                {p.team && p.team !== 'N/A' ? (
                  <Text style={railColor ? { color: railColor, fontWeight: '700' } : undefined}>{` · ${p.team}`}</Text>
                ) : null}
                {p.pick ? ` · ${p.pick}` : ''}
              </Text>
              {lens === 'proj' ? (
                <View style={styles.lensCell}>
                  <Text style={[styles.lensVal, { color: colors.textPrimary }]}>{p.proj != null ? Math.round(p.proj) : '—'}</Text>
                  <Bar pct={p.proj != null ? Math.min(100, (p.proj / projCeiling) * 100) : 0} color={c} height={4} style={{ width: '100%' }} />
                </View>
              ) : (
                <View style={styles.lensCell}>
                  <Text style={[styles.lensVal, { color: clv.color }]}>{clv.text}</Text>
                  <View style={styles.clvBar}>
                    <View style={styles.clvDivider} />
                    {clv.mag > 0 && (
                      <View
                        style={[
                          styles.clvFill,
                          { backgroundColor: clv.color },
                          clv.pos
                            ? { left: '50%', width: `${clv.mag * 50}%` }
                            : { right: '50%', width: `${clv.mag * 50}%` },
                        ]}
                      />
                    )}
                  </View>
                </View>
              )}
            </View>
          );
        })}
      </View>
    </>
  );

  if (clickable) {
    return (
      <Pressable
        onPress={onPick}
        accessibilityRole="button"
        accessibilityLabel={`Pick ${cornerLabel}`}
        style={({ pressed }) => [...cardStyle, pressed && { borderColor: cornerColor }]}
      >
        {body}
      </Pressable>
    );
  }
  return <View style={cardStyle}>{body}</View>;
}

const styles = StyleSheet.create({
  card: {
    position: 'relative',
    backgroundColor: colors.surface1,
    borderWidth: 1,
    borderColor: colors.borderDefault,
    borderLeftWidth: 3,
    borderRadius: radii.lg,
    padding: 10,
    gap: 7,
  },
  ribbonWrap: { position: 'absolute', top: -14, left: 0, right: 0, alignItems: 'center', zIndex: 3 },
  deltaRibbon: {
    flexDirection: 'row', alignItems: 'baseline', gap: 7,
    paddingHorizontal: 14, paddingVertical: 5, borderRadius: 999,
    backgroundColor: colors.surface0, borderWidth: 1,
  },
  deltaUp: { borderColor: 'rgba(46,204,113,0.7)' },
  deltaDown: { borderColor: 'rgba(231,76,60,0.7)' },
  deltaFlat: { borderColor: colors.borderStrong },
  ribbonNum: { color: colors.textPrimary, fontSize: 17, fontWeight: '900', fontVariant: ['tabular-nums'], minWidth: 44, textAlign: 'right' },
  ribbonUnit: { fontSize: 9, fontWeight: '700', letterSpacing: 1, color: colors.textMuted },
  ribbonDelta: { fontSize: 12, fontWeight: '800' },

  stamp: {
    position: 'absolute', top: 10, right: 8, zIndex: 2,
    borderWidth: 1.5, borderColor: colors.accent, borderRadius: 4,
    paddingHorizontal: 8, paddingVertical: 2, transform: [{ rotate: '-8deg' }],
    backgroundColor: withAlpha('#E8BF4A', 0.12),
  },
  stampText: { color: colors.accent, fontWeight: '900', fontSize: 12, letterSpacing: 1, textTransform: 'uppercase' },

  cardHead: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  cornerDot: { width: 9, height: 9, borderRadius: 5 },
  sideLabel: { fontSize: 11, fontWeight: '700', letterSpacing: 1, textTransform: 'uppercase', fontVariant: ['tabular-nums'] },
  headMeta: { marginLeft: 'auto', flexDirection: 'row', alignItems: 'center', gap: 10 },
  draftDate: { flexDirection: 'row', alignItems: 'center', gap: 3 },
  draftDateText: { fontSize: 11, color: colors.textSecondary, fontVariant: ['tabular-nums'] },
  pickCount: { fontSize: 11, color: colors.textMuted, fontVariant: ['tabular-nums'] },
  pickedTag: { borderWidth: 1, borderColor: colors.accent, borderRadius: 999, paddingHorizontal: 8, paddingVertical: 1 },
  pickedTagText: { color: colors.accent, fontSize: 10, fontWeight: '800', letterSpacing: 0.6, textTransform: 'uppercase' },

  posSnap: { flexDirection: 'row', flexWrap: 'wrap', gap: 5, alignItems: 'center' },
  posChip: { borderWidth: 1, borderRadius: 3, paddingHorizontal: 7, paddingVertical: 2 },
  posChipText: { fontSize: 12, fontVariant: ['tabular-nums'], letterSpacing: 0.4 },
  stackChip: { borderWidth: 1, borderRadius: 999, paddingHorizontal: 8, paddingVertical: 2 },
  stackChipText: { fontSize: 11, fontWeight: '700', letterSpacing: 0.4 },

  playerList: { borderTopWidth: 1, borderTopColor: colors.borderSubtle },
  playerRow: {
    flexDirection: 'row', alignItems: 'center', gap: 8,
    paddingVertical: 3, paddingRight: 3, paddingLeft: 6,
    borderBottomWidth: 1, borderBottomColor: colors.borderSubtle,
    borderLeftWidth: 4, borderLeftColor: 'transparent',
    minHeight: 34,
  },
  playerName: { color: colors.textPrimary, fontWeight: '600', fontSize: 14, flex: 1, minWidth: 0 },
  playerMeta: { fontSize: 11, color: colors.textMuted, fontVariant: ['tabular-nums'], flexShrink: 0 },
  lensCell: { width: 64, alignItems: 'flex-end', gap: 3, flexShrink: 0 },
  lensVal: { fontSize: 12, fontWeight: '800', fontVariant: ['tabular-nums'] },
  clvBar: { position: 'relative', width: '100%', height: 4, borderRadius: 2, backgroundColor: colors.surface3, overflow: 'hidden' },
  clvDivider: { position: 'absolute', left: '50%', top: 0, bottom: 0, width: 1, backgroundColor: colors.borderStrong },
  clvFill: { position: 'absolute', top: 0, bottom: 0, borderRadius: 2 },
});
