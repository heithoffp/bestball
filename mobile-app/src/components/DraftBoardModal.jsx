// DraftBoardModal — mobile port of the web DraftBoardModal (TASK-240).
// Full pod board (entryCount columns × rounds rows) with the user's column
// highlighted and per-column context: Proj, Adv %, CLV, archetypes. Uses the
// same derivePodModel engine as the Adv % column so the numbers agree.
import React, { useState, useEffect, useMemo } from 'react';
import { View, Text, Modal, Pressable, ScrollView, ActivityIndicator, StyleSheet } from 'react-native';
import { X, LayoutGrid } from 'lucide-react-native';
import { fetchDraftBoard } from '../../shared/utils/draftBoards';
import { calcCLV, clvLabel } from '../../shared/utils/clvHelpers';
import { posColor } from '../../shared/utils/positionColors';
import { advanceLabel } from '../../shared/utils/advanceModel';
import { derivePodModel } from '../../shared/utils/podAdvance';
import { colors, spacing, radii, type } from '../theme';

const CLV_ALPHA = 0.5; // matches RosterViewer's balanced CLV curve

export default function DraftBoardModal({ roster, adpByPlatform, onClose, actuals = null, boardOverride = null }) {
  const [board, setBoard] = useState(boardOverride);
  const [loading, setLoading] = useState(!boardOverride);

  useEffect(() => {
    if (boardOverride) return undefined;
    let cancelled = false;
    setLoading(true);
    fetchDraftBoard(roster.entry_id).then(b => {
      if (cancelled) return;
      setBoard(b);
      setLoading(false);
    });
    return () => { cancelled = true; };
  }, [roster.entry_id, boardOverride]);

  const derived = useMemo(() => {
    if (!board) return null;
    const {
      entryCount, rounds, slots, byRoundSlot, playersBySlot,
      structure, outlookBySlot, advBySlot, userSlot,
    } = derivePodModel(board, {
      rosterPlayers: roster.players,
      tournamentTitle: roster?.tournamentTitle,
      adpByPlatform,
      actuals,
    });

    const slotSummaries = {};
    slots.forEach((slot, i) => {
      const players = playersBySlot[slot] ?? [];
      const clvValues = players
        .map(p => calcCLV(p.pick, p.latestADP, CLV_ALPHA))
        .filter(v => v !== null);
      const avgCLV = clvValues.length
        ? clvValues.reduce((a, b) => a + b, 0) / clvValues.length
        : null;
      slotSummaries[slot] = {
        avgCLV,
        projectedPoints: outlookBySlot[slot]?.projectedPoints ?? null,
        adv: advBySlot[i],
      };
    });

    return { entryCount, rounds, slots, byRoundSlot, slotSummaries, userSlot, structure };
  }, [board, roster.players, roster.tournamentTitle, adpByPlatform, actuals]);

  const draftDateLabel = roster.draftDate
    ? roster.draftDate.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })
    : null;

  return (
    <Modal visible animationType="slide" onRequestClose={onClose}>
      <View style={styles.panel}>
        <View style={styles.header}>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: spacing.sm, flex: 1 }}>
            <LayoutGrid size={18} color={colors.accent} />
            <View style={{ flex: 1 }}>
              <Text style={type.h2}>Draft Board</Text>
              <Text style={type.muted} numberOfLines={1}>
                {roster.tournamentTitle || board?.slateTitle || ''}
                {draftDateLabel ? ` · ${draftDateLabel}` : ''}
                {derived ? ` · ${derived.entryCount} teams · ${derived.rounds} rounds` : ''}
              </Text>
            </View>
          </View>
          <Pressable onPress={onClose} hitSlop={10}>
            <X size={22} color={colors.textSecondary} />
          </Pressable>
        </View>

        {loading && (
          <View style={styles.stateMsg}>
            <ActivityIndicator color={colors.accent} />
            <Text style={[type.secondary, { marginTop: spacing.sm }]}>Loading board…</Text>
          </View>
        )}

        {!loading && !derived && (
          <View style={styles.stateMsg}>
            <Text style={[type.secondary, { textAlign: 'center' }]}>
              This board isn't available yet. Boards are added as drafts are captured — check back soon.
            </Text>
          </View>
        )}

        {!loading && derived && (
          <ScrollView horizontal bounces={false}>
            <ScrollView bounces={false}>
              <View style={{ flexDirection: 'row', padding: spacing.md }}>
                {/* Round label column */}
                <View style={{ marginRight: 4 }}>
                  <View style={[styles.colHeader, { borderColor: 'transparent', backgroundColor: 'transparent' }]} />
                  {Array.from({ length: derived.rounds }, (_, i) => i + 1).map(round => (
                    <View key={round} style={styles.roundCell}>
                      <Text style={{ color: colors.textMuted, fontSize: 10, fontWeight: '700' }}>R{round}</Text>
                      <Text style={{ color: colors.textMuted, fontSize: 9 }}>{round % 2 === 1 ? '→' : '←'}</Text>
                    </View>
                  ))}
                </View>
                {/* One column per slot */}
                {derived.slots.map(slot => {
                  const isUser = slot === derived.userSlot;
                  const s = derived.slotSummaries[slot];
                  const clv = clvLabel(s?.avgCLV ?? null);
                  const adv = advanceLabel(s?.adv ?? null, derived.structure.baseline);
                  return (
                    <View key={slot} style={{ marginRight: 4 }}>
                      <View style={[styles.colHeader, isUser && styles.userColHeader]}>
                        <View style={{ flexDirection: 'row', justifyContent: 'space-between' }}>
                          <Text style={{ color: isUser ? colors.accent : colors.textSecondary, fontSize: 11, fontWeight: '800' }}>
                            {isUser ? 'YOU' : `Team ${slot}`}
                          </Text>
                          <Text style={{ color: colors.textMuted, fontSize: 10 }}>#{slot}</Text>
                        </View>
                        <View style={{ gap: 2, marginTop: 3 }}>
                          <Text style={styles.colStat}>P <Text style={{ color: '#60a5fa' }}>{s?.projectedPoints > 0 ? s.projectedPoints.toFixed(0) : '—'}</Text></Text>
                          <Text style={styles.colStat}>Adv <Text style={{ color: adv.color }}>{adv.text}</Text></Text>
                          <Text style={styles.colStat}>CLV <Text style={{ color: clv.color }}>{clv.text}</Text></Text>
                        </View>
                      </View>
                      {Array.from({ length: derived.rounds }, (_, i) => i + 1).map(round => {
                        const pick = derived.byRoundSlot[round]?.[slot];
                        if (!pick || !pick.name) {
                          return (
                            <View key={round} style={[styles.cell, isUser && styles.userCell]}>
                              <Text style={{ color: colors.textMuted }}>—</Text>
                            </View>
                          );
                        }
                        const c = posColor(pick.position);
                        return (
                          <View
                            key={round}
                            style={[styles.cell, { backgroundColor: c + (isUser ? '20' : '0e'), borderLeftWidth: 3, borderLeftColor: isUser ? c : c + '88' }]}
                          >
                            <View style={{ flexDirection: 'row', justifyContent: 'space-between' }}>
                              <Text style={{ color: c, fontSize: 9, fontWeight: '800' }}>{pick.position || ''}</Text>
                              <Text style={{ color: colors.textMuted, fontSize: 9 }}>{pick.pick}</Text>
                            </View>
                            <Text style={{ color: colors.textPrimary, fontSize: 10.5, fontWeight: '600' }} numberOfLines={2}>{pick.name}</Text>
                            <Text style={{ color: colors.textMuted, fontSize: 9 }} numberOfLines={1}>{pick.team || ''}</Text>
                          </View>
                        );
                      })}
                    </View>
                  );
                })}
              </View>
            </ScrollView>
          </ScrollView>
        )}
      </View>
    </Modal>
  );
}

const CELL_W = 108;

const styles = StyleSheet.create({
  panel: { flex: 1, backgroundColor: colors.surface0, paddingTop: 54 },
  header: {
    flexDirection: 'row', alignItems: 'center', gap: spacing.md,
    paddingHorizontal: spacing.lg, paddingBottom: spacing.md,
    borderBottomWidth: 1, borderBottomColor: colors.borderSubtle,
  },
  stateMsg: { padding: spacing.xl, alignItems: 'center' },
  colHeader: {
    width: CELL_W, minHeight: 78, padding: 6, marginBottom: 4,
    backgroundColor: colors.surface1, borderRadius: radii.sm,
    borderWidth: 1, borderColor: colors.borderDefault,
  },
  userColHeader: { borderColor: colors.accent, backgroundColor: colors.accentMuted },
  colStat: { fontSize: 9.5, color: colors.textMuted, fontWeight: '700' },
  roundCell: {
    width: 34, height: 56, marginBottom: 4,
    alignItems: 'center', justifyContent: 'center',
  },
  cell: {
    width: CELL_W, height: 56, marginBottom: 4, padding: 5,
    backgroundColor: colors.surface1, borderRadius: radii.sm,
    justifyContent: 'center',
  },
  userCell: { borderWidth: 1, borderColor: colors.accentMuted },
});
