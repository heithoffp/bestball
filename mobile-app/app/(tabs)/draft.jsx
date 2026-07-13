// Draft Day tab — mirrors the web nav group: Draft Assistant | Arena.
// The Assistant is Pro-gated; the Arena is public but visibility tracks
// arena_config.beta_mode exactly like the web (TASK-310) — allowlisted
// accounts during a private beta, everyone once the flag flips false.
import React, { useState, useEffect } from 'react';
import { useLocalSearchParams } from 'expo-router';
import ScreenScaffold, { HelpSection } from '../../src/components/ScreenScaffold';
import { Segmented } from '../../src/components/ui';
import LockedFeature from '../../src/components/LockedFeature';
import DraftAssistantView from '../../src/screens/DraftAssistantView';
import ArenaView from '../../src/screens/ArenaView';
import { useSubscription } from '../../src/contexts/SubscriptionContext';
import { useAuth } from '../../src/contexts/AuthContext';
import { canAccessFeature } from '../../shared/utils/featureAccess';
import { isArenaBetaUser } from '../../shared/utils/arenaBeta';
import { getArenaBetaMode } from '../../shared/utils/arenaClient';
import { spacing } from '../../src/theme';

const HELP = {
  assistant: (
    <>
      <HelpSection heading="Draft Slot">Set your draft position (1–12) to align the player window with your snake pick.</HelpSection>
      <HelpSection heading="Draft Board">Your picks so far. Undo or clear to explore different draft paths.</HelpSection>
      <HelpSection heading="Player Columns">ADP = consensus draft position. Avg = your historical pick. Corr = co-occurrence with your picks. Global = portfolio-wide ownership %.</HelpSection>
      <HelpSection heading="Strategy Cards">Which RB/QB/TE construction paths remain viable given your picks. A locked badge means only one path is left.</HelpSection>
      <HelpSection heading="Eliminator Mode">Swaps strategy cards for the bye rainbow — no two players in a position room should share a bye.</HelpSection>
    </>
  ),
  arena: (
    <>
      <HelpSection heading="Vote">Two real Best Ball Mania VII teams, shown blind (no owners). Pick the one you'd rather have — your vote nudges each team's hidden Elo rating.</HelpSection>
      <HelpSection heading="Blind & fair">Owner identity is never shown while voting, and you'll never be shown your own teams.</HelpSection>
      <HelpSection heading="Free to play">Anyone can vote. Your synced teams enter the Arena automatically; you can leave (and rejoin) any time from My Teams.</HelpSection>
    </>
  ),
};

export default function DraftTab() {
  const params = useLocalSearchParams();
  const [view, setView] = useState('assistant');
  const { tier, loading: subLoading } = useSubscription();
  const { user } = useAuth();

  // Arena visibility tracks arena_config.beta_mode — fails closed until known.
  const [arenaBetaMode, setArenaBetaMode] = useState(true);
  useEffect(() => {
    let cancelled = false;
    getArenaBetaMode()
      .then((m) => { if (!cancelled) setArenaBetaMode(m); })
      .catch(() => {});
    return () => { cancelled = true; };
  }, []);
  const arenaVisible = !arenaBetaMode || isArenaBetaUser(user?.email);

  useEffect(() => {
    if (params.view === 'assistant' || (params.view === 'arena' && arenaVisible)) {
      setView(params.view);
    }
  }, [params.view, params.nav, arenaVisible]);

  const options = [
    { key: 'assistant', label: 'Draft Assistant' },
    ...(arenaVisible ? [{ key: 'arena', label: 'Arena' }] : []),
  ];
  const activeView = view === 'arena' && !arenaVisible ? 'assistant' : view;
  const assistantAllowed = canAccessFeature(tier, 'draftflow') || subLoading;

  return (
    <ScreenScaffold title={activeView === 'arena' ? 'Arena' : 'Draft Assistant'} help={HELP[activeView === 'arena' ? 'arena' : 'assistant']}>
      {options.length > 1 && (
        <Segmented
          options={options}
          value={activeView}
          onChange={setView}
          style={{ marginHorizontal: spacing.lg, marginBottom: spacing.sm }}
        />
      )}
      {activeView === 'arena' ? (
        <ArenaView />
      ) : !assistantAllowed ? (
        <LockedFeature featureName="Draft Assistant" />
      ) : (
        <DraftAssistantView />
      )}
    </ScreenScaffold>
  );
}
