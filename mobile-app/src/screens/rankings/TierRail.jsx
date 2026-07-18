// TierRail.jsx — tier divider rail + "+ Tier" insert pill for the drag board.
// Mobile analogue of the web's tier rails (PlayerRankings tierBar / TierInsertZone):
// colored left ridge, tap-to-edit label, ✕ to remove the break.
import React, { useState } from 'react';
import { View, Text, TextInput, Pressable, StyleSheet } from 'react-native';
import { X } from 'lucide-react-native';
import { colors, spacing, radii } from '../../theme';

export const TIER_RAIL_HEIGHT = 34;
export const INSERT_PILL_HEIGHT = 22;

/**
 * Tier divider rail. `ownerKey` is the break-owning player id, or '__tier1__'
 * for the header rail above rank 1 (which cannot be deleted).
 */
export function TierRail({ tierColor, label, ownerKey, editable, onLabelChange, onDelete }) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState('');

  const commit = () => {
    setEditing(false);
    const next = draft.trim();
    if (next && next !== label) onLabelChange?.(ownerKey, next);
  };

  return (
    <View style={[styles.rail, { borderColor: tierColor.border, backgroundColor: tierColor.bg }]}>
      {editing ? (
        <TextInput
          autoFocus
          value={draft}
          onChangeText={setDraft}
          onBlur={commit}
          onSubmitEditing={commit}
          returnKeyType="done"
          style={[styles.labelInput, { color: tierColor.text }]}
          placeholder={label}
          placeholderTextColor={colors.textMuted}
        />
      ) : (
        <Pressable
          onPress={editable ? () => { setDraft(label || ''); setEditing(true); } : undefined}
          hitSlop={6}
          style={{ flexShrink: 1 }}
        >
          <Text style={[styles.labelText, { color: tierColor.text }]} numberOfLines={1}>
            {label}
          </Text>
        </Pressable>
      )}
      <View style={[styles.rule, { backgroundColor: `${tierColor.border}55` }]} />
      {editable && !editing && ownerKey !== '__tier1__' && (
        <Pressable onPress={() => onDelete?.(ownerKey)} hitSlop={8}>
          <X size={13} color={tierColor.text} />
        </Pressable>
      )}
    </View>
  );
}

/** "+ Tier" affordance between two same-tier players. */
export function InsertPill({ ownerId, onInsert }) {
  return (
    <Pressable style={styles.insertZone} onPress={() => onInsert?.(ownerId)} hitSlop={4}>
      <View style={styles.insertLine} />
      <Text style={styles.insertText}>+ Tier</Text>
      <View style={styles.insertLine} />
    </Pressable>
  );
}

const styles = StyleSheet.create({
  rail: {
    height: TIER_RAIL_HEIGHT - 6,
    marginVertical: 3,
    flexDirection: 'row', alignItems: 'center', gap: spacing.sm,
    borderLeftWidth: 3, borderWidth: 1, borderRadius: radii.sm,
    paddingHorizontal: spacing.md,
  },
  labelText: { fontSize: 11, fontWeight: '800', letterSpacing: 0.4 },
  labelInput: {
    flex: 1, fontSize: 11, fontWeight: '800', padding: 0, margin: 0,
  },
  rule: { flex: 1, height: StyleSheet.hairlineWidth },
  insertZone: {
    height: INSERT_PILL_HEIGHT,
    flexDirection: 'row', alignItems: 'center', gap: spacing.sm,
    paddingHorizontal: spacing.md, opacity: 0.55,
  },
  insertLine: { flex: 1, height: StyleSheet.hairlineWidth, backgroundColor: colors.borderStrong },
  insertText: { fontSize: 10, fontWeight: '700', color: colors.textMuted },
});
