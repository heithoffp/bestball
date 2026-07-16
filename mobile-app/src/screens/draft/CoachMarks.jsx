// CoachMarks — one-time, three-step overlay that introduces the live assistant
// in place (TASK-339). Each step spotlights a real on-screen region (measured
// from a ref) with a short card; any tap advances. Shown on the first live or
// demo session, then never again (persisted flag).
import React, { useEffect, useState } from 'react';
import { View, Text, Pressable, Modal, StyleSheet, Dimensions } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { colors, spacing, radii } from '../../theme';

export const INTRO_SEEN_KEY = 'bbe.assistantIntroSeen';

export async function introSeen() {
  try { return (await AsyncStorage.getItem(INTRO_SEEN_KEY)) === '1'; } catch { return false; }
}

export function markIntroSeen() {
  AsyncStorage.setItem(INTRO_SEEN_KEY, '1').catch(() => {});
}

const CARD_ESTIMATE = 150; // rough card height for above/below placement

/**
 * steps: [{ key, title, body, anchorRef }] — anchorRef is a React ref to a
 * mounted View; when it can't be measured the card centers itself.
 */
export default function CoachMarks({ steps, onDone }) {
  const [index, setIndex] = useState(0);
  const [anchor, setAnchor] = useState(null);
  const step = steps[index];

  useEffect(() => {
    setAnchor(null);
    const node = step?.anchorRef?.current;
    if (!node?.measureInWindow) return undefined;
    // Measure after layout settles; a failed measure just centers the card.
    const t = setTimeout(() => {
      try {
        node.measureInWindow((x, y, width, height) => {
          if (Number.isFinite(y) && height > 0) setAnchor({ x, y, width, height });
        });
      } catch { /* centered fallback */ }
    }, 60);
    return () => clearTimeout(t);
  }, [index, step]);

  if (!step) return null;

  const advance = () => {
    if (index + 1 < steps.length) setIndex(index + 1);
    else onDone();
  };

  const winH = Dimensions.get('window').height;
  const below = anchor && (anchor.y + anchor.height + CARD_ESTIMATE < winH);
  const cardPos = !anchor
    ? { top: winH * 0.38 }
    : below
      ? { top: anchor.y + anchor.height + 12 }
      : { top: Math.max(spacing.lg, anchor.y - CARD_ESTIMATE - 12) };

  return (
    <Modal transparent visible animationType="fade" onRequestClose={advance}>
      <Pressable style={styles.scrim} onPress={advance}>
        {anchor && (
          <View
            pointerEvents="none"
            style={[styles.spotlight, {
              top: anchor.y - 5,
              left: Math.max(4, anchor.x - 5),
              width: Math.min(anchor.width + 10, Dimensions.get('window').width - 8),
              height: anchor.height + 10,
            }]}
          />
        )}
        <View style={[styles.card, cardPos]} pointerEvents="none">
          <Text style={styles.count}>{index + 1} / {steps.length}</Text>
          <Text style={styles.title}>{step.title}</Text>
          <Text style={styles.body}>{step.body}</Text>
          <Text style={styles.hint}>Tap anywhere to continue</Text>
        </View>
      </Pressable>
    </Modal>
  );
}

const styles = StyleSheet.create({
  scrim: { flex: 1, backgroundColor: 'rgba(0,0,0,0.72)' },
  spotlight: {
    position: 'absolute',
    borderRadius: radii.md,
    borderWidth: 2, borderColor: colors.accent,
    backgroundColor: 'rgba(255,255,255,0.06)',
  },
  card: {
    position: 'absolute', left: spacing.lg, right: spacing.lg,
    backgroundColor: colors.surface1, borderRadius: radii.lg,
    borderWidth: 1, borderColor: colors.borderDefault,
    padding: spacing.lg,
  },
  count: { fontSize: 10, fontWeight: '800', color: colors.textMuted, letterSpacing: 0.6, marginBottom: 4 },
  title: { fontSize: 15, fontWeight: '800', color: colors.textPrimary },
  body: { fontSize: 12.5, lineHeight: 18, color: colors.textSecondary, marginTop: 5 },
  hint: { fontSize: 10.5, color: colors.accent, fontWeight: '700', marginTop: spacing.sm },
});
