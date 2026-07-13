// PlayoffStacksView — mobile port of PlayoffStacks.jsx. Three lenses on the
// W15–17 game-stack data: Games (matchup cards), Teams (rotation + stack rate),
// Rosters (leaderboard with per-week coverage dots). Analytics come from
// shared/utils/playoffStacks (same functions the web component uses).
import React, { useMemo, useState } from 'react';
import { View, Text, Pressable, StyleSheet } from 'react-native';
import {
  aggregatePortfolioPlayoffStacks, aggregateByTeam, aggregatePerRoster, PLAYOFF_WEEKS,
} from '../../shared/utils/playoffStacks';
import playoffSchedule from '../../shared/data/playoff-schedule-2026.json';
import { posColor } from '../../shared/utils/positionColors';
import { Segmented, Bar, Card } from '../components/ui';
import { colors, spacing, radii, type } from '../theme';

const LENSES = [
  { key: 'games', label: 'Games' },
  { key: 'teams', label: 'Teams' },
  { key: 'rosters', label: 'Rosters' },
];

function shortEntry(id) {
  if (!id) return '???';
  return id.length <= 10 ? id : id.slice(0, 6) + '…' + id.slice(-4);
}

export default function PlayoffStacksView({ rosters, totalRosters, minCount = 1, onNavigateToRosters }) {
  const [lens, setLens] = useState('games');
  const [rosterSort, setRosterSort] = useState('total');

  const agg = useMemo(
    () => aggregatePortfolioPlayoffStacks(rosters, playoffSchedule),
    [rosters]
  );

  const weekCoverage = useMemo(() => PLAYOFF_WEEKS.map(w => ({
    week: w,
    count: agg.weeks[w].rostersWithAny.size,
    pct: totalRosters > 0 ? (agg.weeks[w].rostersWithAny.size / totalRosters) * 100 : 0,
  })), [agg, totalRosters]);

  const gamesByWeek = useMemo(() => PLAYOFF_WEEKS.map(w => {
    const games = [...agg.weeks[w].games.values()]
      .filter(g => g.rosterEntryIds.size >= minCount)
      .sort((a, b) => b.rosterEntryIds.size - a.rosterEntryIds.size);
    return { week: w, games };
  }), [agg, minCount]);

  const teamRows = useMemo(() => {
    const byTeam = aggregateByTeam(agg, playoffSchedule);
    return [...byTeam.values()]
      .map(t => ({
        team: t.team,
        weeks: t.weeks,
        anyPct: totalRosters > 0 ? (t.anyStackRosters.size / totalRosters) * 100 : 0,
        anyCount: t.anyStackRosters.size,
      }))
      .sort((a, b) => b.anyCount - a.anyCount);
  }, [agg, totalRosters]);

  const rosterRows = useMemo(() => {
    const rows = aggregatePerRoster(rosters, playoffSchedule);
    const key = rosterSort === 'total' ? null : rosterSort;
    return [...rows].sort((a, b) => key
      ? b.counts[key] - a.counts[key] || b.counts.total - a.counts.total
      : b.counts.total - a.counts.total);
  }, [rosters, rosterSort]);

  const naked = agg.nakedRosters.size;

  return (
    <View style={{ paddingHorizontal: spacing.lg }}>
      {/* Week KPI row */}
      <View style={{ flexDirection: 'row', gap: spacing.sm, marginBottom: spacing.md }}>
        {weekCoverage.map(w => (
          <View key={w.week} style={styles.kpi}>
            <Text style={styles.kpiLabel}>Week {w.week}</Text>
            <Text style={styles.kpiValue}>{w.pct.toFixed(0)}%</Text>
            <Bar pct={w.pct} color={colors.accent} height={5} style={{ marginTop: 4 }} />
            <Text style={[type.muted, { marginTop: 3 }]}>{w.count} of {totalRosters}</Text>
          </View>
        ))}
      </View>
      <Text style={[type.muted, { marginBottom: spacing.md }]}>
        {naked} roster{naked === 1 ? '' : 's'} with no W15–17 game stack. Meaningful stacks = cross-team QB/WR/TE pairings (RB and TE↔TE excluded).
      </Text>

      <Segmented options={LENSES} value={lens} onChange={setLens} style={{ marginBottom: spacing.md }} />

      {lens === 'games' && gamesByWeek.map(({ week, games }) => (
        <View key={week} style={{ marginBottom: spacing.md }}>
          <Text style={[type.h3, { color: colors.accent, marginBottom: spacing.sm }]}>Week {week}</Text>
          {games.length === 0 && <Text style={type.muted}>No stacked games this week.</Text>}
          {games.map((g, i) => {
            const pieces = [];
            for (const team of [g.teamA, g.teamB]) {
              for (const [name, info] of g.piecesByTeam[team] || []) {
                pieces.push({ name, team, ...info });
              }
            }
            pieces.sort((a, b) => b.rosterCount - a.rosterCount);
            return (
              <Card key={`${g.teamA}|${g.teamB}`} style={i === 0 ? { borderColor: colors.accent } : null}>
                <View style={{ flexDirection: 'row', alignItems: 'center' }}>
                  <Text style={[type.h3, { flex: 1 }]}>{g.teamA} vs {g.teamB}</Text>
                  <Text style={[type.h3, { fontVariant: ['tabular-nums'] }, i === 0 && { color: colors.accent }]}>
                    {g.rosterEntryIds.size}
                  </Text>
                  <Text style={[type.muted, { marginLeft: 4 }]}>
                    ({totalRosters > 0 ? ((g.rosterEntryIds.size / totalRosters) * 100).toFixed(0) : 0}%)
                  </Text>
                </View>
                <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 5, marginTop: 6 }}>
                  {pieces.slice(0, 8).map(p => (
                    <View key={`${p.team}-${p.name}`} style={[styles.pieceChip, { borderColor: posColor(p.position) + '55' }]}>
                      <Text style={{ color: posColor(p.position), fontSize: 10, fontWeight: '800' }}>{p.position}</Text>
                      <Text style={{ color: colors.textPrimary, fontSize: 11 }}>{p.name}</Text>
                      <Text style={{ color: colors.textMuted, fontSize: 10 }}>×{p.rosterCount}</Text>
                    </View>
                  ))}
                  {pieces.length > 8 && <Text style={type.muted}>+{pieces.length - 8} more</Text>}
                </View>
              </Card>
            );
          })}
        </View>
      ))}

      {lens === 'teams' && (
        <View>
          <View style={styles.teamHeaderRow}>
            <Text style={[styles.teamCellTeam, type.muted]}>Team</Text>
            {PLAYOFF_WEEKS.map(w => <Text key={w} style={[styles.teamCell, type.muted]}>W{w}</Text>)}
            <Text style={[styles.teamCell, type.muted]}>Any</Text>
          </View>
          {teamRows.map(t => (
            <View key={t.team} style={styles.teamRow}>
              <Text style={[styles.teamCellTeam, { color: colors.textPrimary, fontWeight: '700' }]}>{t.team}</Text>
              {PLAYOFF_WEEKS.map(w => {
                const wk = t.weeks[w];
                const pct = totalRosters > 0 && wk ? (wk.rosterIds.size / totalRosters) * 100 : 0;
                return (
                  <View key={w} style={styles.teamCell}>
                    <Text style={[type.muted, { fontSize: 10 }]} numberOfLines={1}>{wk?.opponent || '—'}</Text>
                    <Text style={{ color: pct > 0 ? colors.accent : colors.textMuted, fontSize: 11.5, fontWeight: '700', fontVariant: ['tabular-nums'] }}>
                      {pct.toFixed(0)}%
                    </Text>
                  </View>
                );
              })}
              <Text style={[styles.teamCell, { color: colors.textSecondary, fontWeight: '700', fontVariant: ['tabular-nums'] }]}>
                {t.anyPct.toFixed(0)}%
              </Text>
            </View>
          ))}
        </View>
      )}

      {lens === 'rosters' && (
        <View>
          <View style={{ flexDirection: 'row', gap: 6, marginBottom: spacing.sm }}>
            {[['total', 'Total'], ['15', 'W15'], ['16', 'W16'], ['17', 'W17']].map(([k, lbl]) => (
              <Pressable key={k} onPress={() => setRosterSort(k)}
                style={[styles.chip, rosterSort === k && { borderColor: colors.accent, backgroundColor: colors.accentMuted }]}>
                <Text style={{ fontSize: 12, fontWeight: '600', color: rosterSort === k ? colors.accent : colors.textSecondary }}>{lbl}</Text>
              </Pressable>
            ))}
          </View>
          {rosterRows.map(r => (
            <Pressable
              key={r.entryId}
              style={styles.rosterRow}
              onPress={() => onNavigateToRosters && onNavigateToRosters(null, r.entryId)}
            >
              <Text style={{ color: colors.textPrimary, fontWeight: '700', fontSize: 12.5, flex: 1 }} numberOfLines={1}>
                {shortEntry(r.entryId)}
              </Text>
              <View style={{ flexDirection: 'row', gap: 5, marginRight: spacing.md }}>
                {PLAYOFF_WEEKS.map(w => (
                  <View key={w} style={[
                    styles.dot,
                    { backgroundColor: r.counts[w] > 0 ? colors.accent : colors.surface3 },
                  ]} />
                ))}
              </View>
              <Text style={{ color: colors.textSecondary, fontWeight: '700', fontVariant: ['tabular-nums'], width: 30, textAlign: 'right' }}>
                {r.counts.total}
              </Text>
            </Pressable>
          ))}
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  kpi: {
    flex: 1, backgroundColor: colors.surface1, borderRadius: radii.md,
    borderWidth: 1, borderColor: colors.borderSubtle, padding: spacing.md,
  },
  kpiLabel: { fontSize: 10.5, fontWeight: '700', color: colors.textMuted, textTransform: 'uppercase' },
  kpiValue: { fontSize: 19, fontWeight: '800', color: colors.textPrimary, marginTop: 2, fontVariant: ['tabular-nums'] },
  pieceChip: {
    flexDirection: 'row', alignItems: 'center', gap: 4,
    borderWidth: 1, borderRadius: 4,
    paddingHorizontal: 5, paddingVertical: 2,
    backgroundColor: colors.surface2,
  },
  teamHeaderRow: { flexDirection: 'row', paddingVertical: 5, borderBottomWidth: 1, borderBottomColor: colors.borderDefault },
  teamRow: {
    flexDirection: 'row', alignItems: 'center', paddingVertical: 7,
    borderBottomWidth: 1, borderBottomColor: colors.borderSubtle,
  },
  teamCellTeam: { width: 48, fontSize: 12 },
  teamCell: { flex: 1, alignItems: 'center', textAlign: 'center', fontSize: 11 },
  chip: {
    paddingHorizontal: 11, paddingVertical: 6, borderRadius: radii.pill,
    borderWidth: 1, borderColor: colors.borderDefault, backgroundColor: colors.surface1,
  },
  rosterRow: {
    flexDirection: 'row', alignItems: 'center',
    backgroundColor: colors.surface1, borderRadius: radii.sm,
    borderWidth: 1, borderColor: colors.borderSubtle,
    paddingHorizontal: spacing.md, paddingVertical: 9, marginBottom: 5,
  },
  dot: { width: 9, height: 9, borderRadius: 5 },
});
