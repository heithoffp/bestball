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
      <HelpSection heading="How it works">Enter your Underdog username, start a session, tap record, then just draft in Underdog. BBE reads the draft board on your device and follows along. Your picks, the room, and your slot are detected automatically.</HelpSection>
      <HelpSection heading="Your Lock Screen">While you draft, the Live Activity shows the current pick and round, how many picks until you're up, your roster's position counts, and the top available players, with stack and playoff-week markers plus your portfolio exposure.</HelpSection>
      <HelpSection heading="Fast drafts">Nothing to manage. Keep the broadcast running and every pick lands within seconds of being made.</HelpSection>
      <HelpSection heading="Slow drafts">Tap your username in the draft room's top banner whenever you come back. BBE refills your roster from the board and locks in your slot, even days into a draft. Drafting several slow rooms back to back? Use Reset between rooms so each board starts clean.</HelpSection>
      <HelpSection heading="Where's my team?">On Underdog while the draft runs. The assistant tracks, it doesn't re-display. Once your rosters sync, the Dashboard, Exposures, and Rosters tabs pick them up.</HelpSection>
      <HelpSection heading="Privacy">Every frame is processed on your device and instantly discarded. Only draft data (picks and your slot) is ever produced; screenshots never leave your phone.</HelpSection>
    </>
  ),
  arena: (
    <>
      <HelpSection heading="Vote">Two real Best Ball Mania VII teams, shown blind (no owners). Pick the one you'd rather have. Your vote nudges each team's hidden Elo rating.</HelpSection>
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
