// TournamentFilter — mobile port of TournamentMultiSelect. A trigger row that
// opens a bottom-sheet of tournaments grouped by slate; multi-select with
// select-all per slate. Empty selection = all tournaments.
import React, { useState } from 'react';
import { View, Text, Pressable, Modal, SectionList, StyleSheet } from 'react-native';
import { ChevronDown, Check, X } from 'lucide-react-native';
import { colors, spacing, radii, type } from '../theme';
import { compactTournamentName } from '../../shared/utils/helpers';
import { Button } from './ui';

export default function TournamentFilter({ slateGroups, selected, onChange }) {
  const [open, setOpen] = useState(false);
  if (!slateGroups?.length) return null;

  const total = slateGroups.reduce((n, g) => n + g.tournaments.length, 0);
  const label = selected.length === 0
    ? `All tournaments (${total})`
    : selected.length === 1
      ? compactTournamentName(selected[0])
      : `${selected.length} tournaments`;

  const toggle = (t) => {
    onChange(selected.includes(t) ? selected.filter(x => x !== t) : [...selected, t]);
  };

  const toggleSlate = (g) => {
    const allIn = g.tournaments.every(t => selected.includes(t));
    if (allIn) onChange(selected.filter(t => !g.tournaments.includes(t)));
    else onChange([...new Set([...selected, ...g.tournaments])]);
  };

  const sections = slateGroups.map(g => ({ title: g.slate, group: g, data: g.tournaments }));

  return (
    <>
      <Pressable style={styles.trigger} onPress={() => setOpen(true)}>
        <Text style={styles.triggerLabel}>Tournaments</Text>
        <Text style={styles.triggerValue} numberOfLines={1}>{label}</Text>
        <ChevronDown size={16} color={colors.textSecondary} />
      </Pressable>

      <Modal visible={open} transparent animationType="slide" onRequestClose={() => setOpen(false)}>
        <View style={styles.backdrop}>
          <View style={styles.sheet}>
            <View style={styles.sheetHeader}>
              <Text style={type.h2}>Tournament Filter</Text>
              <Pressable onPress={() => setOpen(false)} hitSlop={10}>
                <X size={20} color={colors.textSecondary} />
              </Pressable>
            </View>
            <SectionList
              sections={sections}
              keyExtractor={(item) => item}
              stickySectionHeadersEnabled={false}
              renderSectionHeader={({ section }) => {
                const allIn = section.group.tournaments.every(t => selected.includes(t));
                return (
                  <Pressable style={styles.slateHeader} onPress={() => toggleSlate(section.group)}>
                    <Text style={styles.slateTitle}>{section.title}</Text>
                    <Text style={styles.slateAction}>{allIn ? 'Clear slate' : 'Select slate'}</Text>
                  </Pressable>
                );
              }}
              renderItem={({ item }) => {
                const on = selected.includes(item);
                return (
                  <Pressable style={styles.row} onPress={() => toggle(item)}>
                    <View style={[styles.checkbox, on && styles.checkboxOn]}>
                      {on && <Check size={12} color={colors.textInverse} strokeWidth={3.5} />}
                    </View>
                    <Text style={[type.body, { flex: 1 }]} numberOfLines={1}>{compactTournamentName(item)}</Text>
                  </Pressable>
                );
              }}
              style={{ maxHeight: 420 }}
            />
            <View style={styles.footer}>
              <Button title="Clear" variant="ghost" style={{ flex: 1 }} onPress={() => onChange([])} />
              <Button title="Done" style={{ flex: 2 }} onPress={() => setOpen(false)} />
            </View>
          </View>
        </View>
      </Modal>
    </>
  );
}

const styles = StyleSheet.create({
  trigger: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    backgroundColor: colors.surface1,
    borderWidth: 1,
    borderColor: colors.borderDefault,
    borderRadius: radii.md,
    paddingHorizontal: spacing.md,
    paddingVertical: 9,
    marginBottom: spacing.md,
  },
  triggerLabel: { fontSize: 11, fontWeight: '700', color: colors.textMuted, textTransform: 'uppercase', letterSpacing: 0.4 },
  triggerValue: { flex: 1, fontSize: 13, fontWeight: '600', color: colors.textPrimary, textAlign: 'right' },
  backdrop: { flex: 1, backgroundColor: 'rgba(0,0,0,0.55)', justifyContent: 'flex-end' },
  sheet: {
    backgroundColor: colors.surface1,
    borderTopLeftRadius: 18,
    borderTopRightRadius: 18,
    padding: spacing.lg,
    borderWidth: 1,
    borderColor: colors.borderDefault,
  },
  sheetHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: spacing.sm },
  slateHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: spacing.sm,
    marginTop: spacing.sm,
    borderBottomWidth: 1,
    borderBottomColor: colors.borderSubtle,
  },
  slateTitle: { fontSize: 12, fontWeight: '800', color: colors.accent, textTransform: 'uppercase', letterSpacing: 0.5 },
  slateAction: { fontSize: 12, color: colors.textSecondary },
  row: { flexDirection: 'row', alignItems: 'center', gap: spacing.md, paddingVertical: 9 },
  checkbox: {
    width: 20, height: 20, borderRadius: 5,
    borderWidth: 1.5, borderColor: colors.borderStrong,
    alignItems: 'center', justifyContent: 'center',
  },
  checkboxOn: { backgroundColor: colors.accent, borderColor: colors.accent },
  footer: { flexDirection: 'row', gap: spacing.md, marginTop: spacing.md },
});
