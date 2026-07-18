// Portfolio tab — mirrors the web nav group: Exposures | Rosters | Combos.
// Combo Analysis is Pro-gated (featureAccess), matching the web tabs.
import React, { useState, useEffect } from 'react';
import { useLocalSearchParams } from 'expo-router';
import ScreenScaffold, { HelpSection } from '../../src/components/ScreenScaffold';
import { Segmented } from '../../src/components/ui';
import LockedFeature from '../../src/components/LockedFeature';
import ExposuresView from '../../src/screens/ExposuresView';
import RostersView from '../../src/screens/RostersView';
import ComboView from '../../src/screens/ComboView';
import { useSubscription } from '../../src/contexts/SubscriptionContext';
import { canAccessFeature } from '../../shared/utils/featureAccess';
import { spacing } from '../../src/theme';

const VIEWS = [
  { key: 'exposures', label: 'Exposures' },
  { key: 'rosters', label: 'Rosters' },
  { key: 'combos', label: 'Combos' },
];

const HELP = {
  exposures: (
    <>
      <HelpSection heading="Search & Filters">Search by player name, team, or position. Filter by tournament to scope exposure to specific slates.</HelpSection>
      <HelpSection heading="Strategy Filters">Filter by RB/QB/TE draft strategy. Exposure % recalculates for matching rosters only.</HelpSection>
      <HelpSection heading="Show 0% Toggle">Include players you haven't drafted. Useful for spotting ADP market gaps.</HelpSection>
      <HelpSection heading="ADP Trend">Tap a player card to expand its 2-week ADP sparkline. Rising ADP = falling draft cost.</HelpSection>
    </>
  ),
  rosters: (
    <>
      <HelpSection heading="Search">Search by player or team name to filter to rosters containing that pick.</HelpSection>
      <HelpSection heading="Archetypes">Each roster's RB, QB, and TE draft strategy, classified by pick position and capital.</HelpSection>
      <HelpSection heading="Proj Pts">Expected best-ball points over the 14-week regular season, scoring your optimal weekly lineup against the real bye schedule.</HelpSection>
      <HelpSection heading="Adv %">Estimated chance this roster advances from its 12-team pod, measured against the actual teams on its captured draft board. Rosters without a captured board show a dash.</HelpSection>
      <HelpSection heading="Early Combo %">How often other drafts we track open with this roster's combo of early picks. 0% means truly unique.</HelpSection>
      <HelpSection heading="Avg CLV%">Average Closing Line Value across all picks. Positive means the player's ADP rose after your draft.</HelpSection>
    </>
  ),
  combos: (
    <>
      <HelpSection heading="Stacks">Every QB you drafted and the same-team pass-catchers paired with them. Each colored segment is a unique stack combo.</HelpSection>
      <HelpSection heading="QB Pairs">Every QB pairing rostered together, ranked by frequency.</HelpSection>
      <HelpSection heading="Similarity">Most overlapping roster pairs. High overlap means concentrated risk.</HelpSection>
      <HelpSection heading="Playoffs">Which W15–17 matchups you're leveraged on, every team's playoff schedule with your stack rate, and per-roster coverage.</HelpSection>
      <HelpSection heading="Explorer">Players arranged by ADP. Shading shows how often each player was drafted next across real tracked drafts. Pick 4 to see how common your opening is.</HelpSection>
    </>
  ),
};

const TITLES = { exposures: 'Exposures', rosters: 'Rosters', combos: 'Combos' };

export default function PortfolioTab() {
  const params = useLocalSearchParams();
  const [view, setView] = useState('exposures');
  const { tier, loading: subLoading } = useSubscription();

  // Drill-down navigation from Dashboard / cross-tab hand-offs.
  useEffect(() => {
    if (params.view && VIEWS.some(v => v.key === params.view)) {
      setView(params.view);
    }
  }, [params.view, params.nav]);

  const featureKey = view === 'combos' ? 'combo' : view;
  const allowed = canAccessFeature(tier, featureKey) || subLoading;

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
      ) : view === 'exposures' ? (
        <ExposuresView />
      ) : view === 'rosters' ? (
        <RostersView />
      ) : (
        <ComboView />
      )}
    </ScreenScaffold>
  );
}
