// DraftAssistantView — capture-and-guide-only Draft Assistant (TASK-342,
// ADR-026). The mobile Draft Assistant records the live draft (screen broadcast
// -> on-device OCR -> DraftState, ADR-019/020/021) and explains how; it does not
// re-display or analyze the roster in app. Review your team on Underdog during
// the draft, or on BBE's other tabs once rosters sync. No session -> the
// AssistantSetup screen owns the tab; session active -> the LiveSessionPanel
// confidence hub plus the CaptureGuide diagrams take the whole screen.
import React, { useEffect, useState } from 'react';
import { ScrollView } from 'react-native';
import { subscribeSession } from '../draft/sessionController';
import { spacing } from '../theme';
import LiveSessionPanel from './LiveSessionPanel';
import AssistantSetup from './draft/AssistantSetup';
import CaptureGuide from './draft/CaptureGuide';

export default function DraftAssistantView() {
  const [session, setSession] = useState({ active: false, platform: 'underdog' });

  useEffect(() => subscribeSession(snap => setSession({
    active: !!snap?.active,
    platform: snap?.platform || 'underdog',
  })), []);

  // No session -> the setup screen owns the tab.
  if (!session.active) {
    return <AssistantSetup />;
  }

  // Active session -> the confidence hub + guidance, full screen.
  return (
    <ScrollView
      contentContainerStyle={{ paddingHorizontal: spacing.lg, paddingBottom: 40 }}
      keyboardShouldPersistTaps="handled"
    >
      <LiveSessionPanel />
      <CaptureGuide platform={session.platform} />
    </ScrollView>
  );
}
