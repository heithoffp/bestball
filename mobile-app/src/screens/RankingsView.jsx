// RankingsView — shell for the Rankings tab (TASK-351 overhaul).
// Platform switcher + Board/Compare toggle; the board itself (drag-and-drop
// reordering, tier rails) lives in screens/rankings/BoardView.jsx and the
// UD-vs-DK diff in screens/rankings/CompareView.jsx (arena shell convention).
import React, { useState, useEffect, useMemo } from 'react';
import { View, Text, Pressable, StyleSheet } from 'react-native';
import { ListOrdered } from 'lucide-react-native';
import * as WebBrowser from 'expo-web-browser';
import { Segmented, EmptyView, Button } from '../components/ui';
import { colors, spacing, radii } from '../theme';
import { usePortfolio } from '../contexts/PortfolioContext';
import { WEB_APP_URL } from '../../shared/config';
import BoardView from './rankings/BoardView';
import CompareView from './rankings/CompareView';

export default function RankingsView() {
  const { rankingsByPlatform, adpByPlatform } = usePortfolio();

  const availablePlatforms = useMemo(
    () => ['underdog', 'draftkings'].filter(p =>
      (rankingsByPlatform[p]?.length ?? 0) > 0 || (adpByPlatform[p]?.latestRows?.length ?? 0) > 0),
    [rankingsByPlatform, adpByPlatform]
  );

  const [selectedPlatform, setSelectedPlatform] = useState(null);
  const [compareMode, setCompareMode] = useState(false);

  useEffect(() => {
    if (!selectedPlatform && availablePlatforms.length > 0) {
      setSelectedPlatform(availablePlatforms[0]);
    }
  }, [availablePlatforms, selectedPlatform]);

  if (availablePlatforms.length === 0) {
    return (
      <EmptyView
        icon={<ListOrdered size={38} color={colors.accent} />}
        title="No rankings loaded"
        body="Rankings seed from each platform's current ADP once data loads. You can also upload a rankings CSV on the website."
        cta={<Button title="Open the website" variant="ghost" onPress={() => WebBrowser.openBrowserAsync(WEB_APP_URL)} />}
      />
    );
  }

  const platform = selectedPlatform ?? availablePlatforms[0];

  return (
    <View style={{ flex: 1 }}>
      <View style={styles.headerRow}>
        {availablePlatforms.length > 1 ? (
          <Segmented
            style={{ flex: 1 }}
            options={availablePlatforms.map(p => ({ key: p, label: p === 'underdog' ? 'Underdog' : 'DraftKings' }))}
            value={platform}
            onChange={setSelectedPlatform}
          />
        ) : (
          <View style={{ flex: 1 }} />
        )}
        <Pressable
          onPress={() => setCompareMode(v => !v)}
          style={[styles.chip, compareMode && { borderColor: colors.accent, backgroundColor: colors.accentMuted }]}
        >
          <Text style={{ fontSize: 12, fontWeight: '600', color: compareMode ? colors.accent : colors.textSecondary }}>
            Compare
          </Text>
        </Pressable>
      </View>

      {compareMode
        ? <CompareView />
        : <BoardView key={platform} platform={platform} />}
    </View>
  );
}

const styles = StyleSheet.create({
  headerRow: {
    flexDirection: 'row', gap: spacing.sm,
    paddingHorizontal: spacing.lg, marginBottom: spacing.sm,
  },
  chip: {
    paddingHorizontal: 12, paddingVertical: 8, borderRadius: radii.md,
    borderWidth: 1, borderColor: colors.borderDefault, backgroundColor: colors.surface1,
    alignItems: 'center', justifyContent: 'center',
  },
});
