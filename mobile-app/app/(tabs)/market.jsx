// Market tab — mirrors the web nav group: ADP Tracker | Rankings.
// Both are Pro-gated (featureAccess: timeseries, rankings).
import React, { useState, useEffect } from 'react';
import { useLocalSearchParams } from 'expo-router';
import ScreenScaffold, { HelpSection } from '../../src/components/ScreenScaffold';
import { Segmented } from '../../src/components/ui';
import LockedFeature from '../../src/components/LockedFeature';
import AdpTrackerView from '../../src/screens/AdpTrackerView';
import RankingsView from '../../src/screens/RankingsView';
import { useSubscription } from '../../src/contexts/SubscriptionContext';
import { canAccessFeature } from '../../shared/utils/featureAccess';
import { spacing } from '../../src/theme';

const VIEWS = [
  { key: 'adp', label: 'ADP Tracker' },
  { key: 'rankings', label: 'Rankings' },
];

const HELP = {
  adp: (
    <>
      <HelpSection heading="Chart Controls">Scope the page: platform (Both overlays Underdog solid vs DraftKings dashed) and the time window that clips the chart and drives Trend calculations.</HelpSection>
      <HelpSection heading="Watchlist">The players on the chart, each with current ADP and trend. Tap × to remove, or Top 5 to grab the top of the table. Up to 10 at once.</HelpSection>
      <HelpSection heading="My Pick Ranges">Overlays a quartile band on the chart showing where you actually picked each player.</HelpSection>
      <HelpSection heading="Player Table">Tap a row to add or remove that player from the chart. Trend = ADP movement over the selected window — rising means going earlier in drafts. Value = your average pick minus current ADP.</HelpSection>
    </>
  ),
  rankings: (
    <>
      <HelpSection heading="Your Board">Each platform keeps its own saved order. The board seeds from current ADP until you save your own.</HelpSection>
      <HelpSection heading="Reordering">Tap a player to open move controls — single/±5 steps or type an exact rank.</HelpSection>
      <HelpSection heading="Tier Breaks">Colored rails split the board into tiers. Add a break above any player from its move panel; tap × on a rail to remove it.</HelpSection>
      <HelpSection heading="Save & Export">Save persists to your account (the Chrome extension reads the same rankings). Export shares the CSV. CSV upload lives on the website.</HelpSection>
      <HelpSection heading="Compare">Your rank vs live ADP — biggest disagreements first. Positive Δ = the market drafts them later than you rank them.</HelpSection>
    </>
  ),
};

const TITLES = { adp: 'ADP Tracker', rankings: 'Rankings' };
const FEATURE_KEYS = { adp: 'timeseries', rankings: 'rankings' };

export default function MarketTab() {
  const params = useLocalSearchParams();
  const [view, setView] = useState('adp');
  const { tier, loading: subLoading } = useSubscription();

  useEffect(() => {
    if (params.view && VIEWS.some(v => v.key === params.view)) {
      setView(params.view);
    }
  }, [params.view, params.nav]);

  const allowed = canAccessFeature(tier, FEATURE_KEYS[view]) || subLoading;

  return (
    <ScreenScaffold title={TITLES[view]} help={HELP[view]}>
      <Segmented
        options={VIEWS}
        value={view}
        onChange={setView}
        style={{ marginHorizontal: spacing.lg, marginBottom: spacing.sm }}
      />
      {!allowed ? (
        <LockedFeature featureName={TITLES[view]} />
      ) : view === 'adp' ? (
        <AdpTrackerView />
      ) : (
        <RankingsView />
      )}
    </ScreenScaffold>
  );
}
