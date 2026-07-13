// ui.jsx — shared UI primitives for all screens (mobile analogues of the web
// app's cards / pills / filter chips / stat tiles).
import React, { useState } from 'react';
import { View, Text, TextInput, Pressable, ActivityIndicator, Image, StyleSheet, ScrollView } from 'react-native';
import { Search, X } from 'lucide-react-native';
import { colors, spacing, radii, type, posBg } from '../theme';
import { posColor } from '../../shared/utils/positionColors';
import { headshotUrl, teamLogoUrl } from '../../shared/utils/headshots';

export function Card({ children, style, onPress }) {
  const body = (
    <View style={[styles.card, style]}>
      {children}
    </View>
  );
  if (!onPress) return body;
  return (
    <Pressable onPress={onPress} style={({ pressed }) => pressed && { opacity: 0.85 }}>
      {body}
    </Pressable>
  );
}

export function SectionTitle({ children, right, style }) {
  return (
    <View style={[styles.sectionTitleRow, style]}>
      <Text style={styles.sectionTitle}>{children}</Text>
      {right}
    </View>
  );
}

/** Segmented control — mirrors the web's tab pills. options: [{key, label}] */
export function Segmented({ options, value, onChange, style }) {
  return (
    <View style={[styles.segmented, style]}>
      {options.map(opt => {
        const active = opt.key === value;
        return (
          <Pressable
            key={opt.key}
            onPress={() => onChange(opt.key)}
            style={[styles.segment, active && styles.segmentActive]}
          >
            <Text style={[styles.segmentText, active && styles.segmentTextActive]} numberOfLines={1}>
              {opt.label}
            </Text>
          </Pressable>
        );
      })}
    </View>
  );
}

/** Horizontally scrollable filter chips. options: [{key, label}] or strings. */
export function ChipRow({ options, value, onChange, style }) {
  return (
    <ScrollView horizontal showsHorizontalScrollIndicator={false} style={style} contentContainerStyle={styles.chipRow}>
      {options.map(raw => {
        const opt = typeof raw === 'string' ? { key: raw, label: raw } : raw;
        const active = opt.key === value;
        return (
          <Pressable
            key={opt.key}
            onPress={() => onChange(opt.key)}
            style={[styles.chip, active && styles.chipActive]}
          >
            <Text style={[styles.chipText, active && styles.chipTextActive]}>{opt.label}</Text>
          </Pressable>
        );
      })}
    </ScrollView>
  );
}

export function SearchBar({ value, onChange, placeholder = 'Search players...', style }) {
  return (
    <View style={[styles.searchBar, style]}>
      <Search size={16} color={colors.textMuted} />
      <TextInput
        style={styles.searchInput}
        value={value}
        onChangeText={onChange}
        placeholder={placeholder}
        placeholderTextColor={colors.textMuted}
        autoCorrect={false}
        autoCapitalize="none"
        clearButtonMode="never"
      />
      {value ? (
        <Pressable onPress={() => onChange('')} hitSlop={8}>
          <X size={16} color={colors.textMuted} />
        </Pressable>
      ) : null}
    </View>
  );
}

export function PosBadge({ pos, size = 'md' }) {
  const p = String(pos || '').toUpperCase();
  const c = posColor(p);
  const bg = posBg[p] || 'rgba(255,255,255,0.08)';
  return (
    <View style={[styles.posBadge, { backgroundColor: bg }, size === 'sm' && styles.posBadgeSm]}>
      <Text style={[styles.posBadgeText, { color: c }, size === 'sm' && { fontSize: 10 }]}>{p}</Text>
    </View>
  );
}

export function StatTile({ label, value, sub, accent, style }) {
  return (
    <View style={[styles.statTile, style]}>
      <Text style={styles.statLabel} numberOfLines={1}>{label}</Text>
      <Text style={[styles.statValue, accent && { color: colors.accent }]} numberOfLines={1} adjustsFontSizeToFit>
        {value}
      </Text>
      {sub != null && <Text style={styles.statSub} numberOfLines={2}>{sub}</Text>}
    </View>
  );
}

/** Player headshot with position-colored monogram fallback. */
export function PlayerAvatar({ name, position, team, size = 34 }) {
  const [failed, setFailed] = useState(false);
  const isDef = /^(DEF|DST)$/i.test(String(position || ''));
  const url = isDef ? teamLogoUrl(team) : headshotUrl(name, position);
  const initials = String(name || '?').split(' ').map(w => w[0]).filter(Boolean).slice(0, 2).join('').toUpperCase();
  const c = posColor(String(position || '').toUpperCase());
  return (
    <View style={{
      width: size, height: size, borderRadius: size / 2, overflow: 'hidden',
      backgroundColor: colors.surface3, alignItems: 'center', justifyContent: 'center',
      borderWidth: 1.5, borderColor: c,
    }}>
      <Text style={{ color: c, fontWeight: '700', fontSize: size * 0.36, position: 'absolute' }}>{initials}</Text>
      {url && !failed && (
        <Image
          source={{ uri: url }}
          style={{ width: size, height: size }}
          onError={() => setFailed(true)}
        />
      )}
    </View>
  );
}

/** Horizontal proportion bar (exposure %, distribution). */
export function Bar({ pct, color = colors.accent, height = 6, style, trackColor = colors.surface3 }) {
  const clamped = Math.max(0, Math.min(100, Number(pct) || 0));
  return (
    <View style={[{ height, borderRadius: height / 2, backgroundColor: trackColor, overflow: 'hidden' }, style]}>
      <View style={{ width: `${clamped}%`, height: '100%', borderRadius: height / 2, backgroundColor: color }} />
    </View>
  );
}

export function LoadingView({ msg = 'Loading...' }) {
  return (
    <View style={styles.centerFill}>
      <ActivityIndicator size="large" color={colors.accent} />
      <Text style={[type.secondary, { marginTop: spacing.md }]}>{msg}</Text>
    </View>
  );
}

export function EmptyView({ icon, title, body, cta }) {
  return (
    <View style={styles.centerFill}>
      {icon}
      <Text style={[type.h2, { marginTop: spacing.md, textAlign: 'center' }]}>{title}</Text>
      {body ? <Text style={[type.secondary, { marginTop: spacing.sm, textAlign: 'center', maxWidth: 300, lineHeight: 19 }]}>{body}</Text> : null}
      {cta ? <View style={{ marginTop: spacing.lg }}>{cta}</View> : null}
    </View>
  );
}

export function Button({ title, onPress, variant = 'primary', style, disabled, icon }) {
  return (
    <Pressable
      onPress={onPress}
      disabled={disabled}
      style={({ pressed }) => [
        styles.btn,
        variant === 'primary' && styles.btnPrimary,
        variant === 'ghost' && styles.btnGhost,
        variant === 'danger' && styles.btnDanger,
        disabled && { opacity: 0.5 },
        pressed && { opacity: 0.8 },
        style,
      ]}
    >
      {icon}
      <Text style={[
        styles.btnText,
        variant === 'primary' && { color: colors.textInverse },
        variant === 'danger' && { color: '#fff' },
      ]}>
        {title}
      </Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  card: {
    backgroundColor: colors.surface1,
    borderRadius: radii.lg,
    borderWidth: 1,
    borderColor: colors.borderSubtle,
    padding: spacing.lg,
    marginBottom: spacing.md,
  },
  sectionTitleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: spacing.sm,
    marginTop: spacing.sm,
  },
  sectionTitle: { ...type.h2 },
  segmented: {
    flexDirection: 'row',
    backgroundColor: colors.surface1,
    borderRadius: radii.md,
    borderWidth: 1,
    borderColor: colors.borderSubtle,
    padding: 3,
  },
  segment: {
    flex: 1,
    paddingVertical: 7,
    paddingHorizontal: 6,
    borderRadius: radii.sm + 1,
    alignItems: 'center',
  },
  segmentActive: { backgroundColor: colors.surface3 },
  segmentText: { fontSize: 13, fontWeight: '600', color: colors.textSecondary },
  segmentTextActive: { color: colors.accent },
  chipRow: { gap: spacing.sm, paddingVertical: 2 },
  chip: {
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: radii.pill,
    backgroundColor: colors.surface1,
    borderWidth: 1,
    borderColor: colors.borderDefault,
  },
  chipActive: { backgroundColor: colors.accentMuted, borderColor: colors.accent },
  chipText: { fontSize: 12.5, fontWeight: '600', color: colors.textSecondary },
  chipTextActive: { color: colors.accent },
  searchBar: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    backgroundColor: colors.surface1,
    borderWidth: 1,
    borderColor: colors.borderDefault,
    borderRadius: radii.md,
    paddingHorizontal: spacing.md,
    height: 40,
  },
  searchInput: { flex: 1, color: colors.textPrimary, fontSize: 14, paddingVertical: 0 },
  posBadge: {
    borderRadius: radii.sm,
    paddingHorizontal: 7,
    paddingVertical: 2,
    alignItems: 'center',
    justifyContent: 'center',
    minWidth: 32,
  },
  posBadgeSm: { minWidth: 26, paddingHorizontal: 5 },
  posBadgeText: { fontSize: 11, fontWeight: '700' },
  statTile: {
    flex: 1,
    backgroundColor: colors.surface2,
    borderRadius: radii.md,
    borderWidth: 1,
    borderColor: colors.borderSubtle,
    padding: spacing.md,
    minWidth: 0,
  },
  statLabel: { fontSize: 11, fontWeight: '600', color: colors.textMuted, textTransform: 'uppercase', letterSpacing: 0.4 },
  statValue: { fontSize: 20, fontWeight: '700', color: colors.textPrimary, marginTop: 2, fontVariant: ['tabular-nums'] },
  statSub: { fontSize: 11, color: colors.textSecondary, marginTop: 2 },
  centerFill: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: spacing.xl, minHeight: 260 },
  btn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing.sm,
    borderRadius: radii.md,
    paddingVertical: 11,
    paddingHorizontal: 18,
  },
  btnPrimary: { backgroundColor: colors.accent },
  btnGhost: { backgroundColor: 'transparent', borderWidth: 1, borderColor: colors.borderStrong },
  btnDanger: { backgroundColor: colors.negative },
  btnText: { fontSize: 14, fontWeight: '700', color: colors.textPrimary },
});
