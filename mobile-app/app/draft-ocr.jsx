// draft-ocr — deep-link ingestion route for pre-extracted OCR text:
//   bbexposures:///draft-ocr?t=<url-encoded text>
// Pairs with an iOS Shortcut (Take Screenshot -> Extract Text from Image ->
// Open URL) so a draft screen can be synced without Photos access. Also the
// manual test harness for the parse pipeline (docs/LIVE_SESSION_V1.md).
import { useEffect } from 'react';
import { Redirect, useLocalSearchParams } from 'expo-router';
import { ingestOcrText } from '../src/draft/sessionController';

export default function DraftOcrLink() {
  const { t } = useLocalSearchParams();

  useEffect(() => {
    const text = Array.isArray(t) ? t.join('\n') : t;
    if (text) ingestOcrText(String(text));
  }, [t]);

  return <Redirect href="/draft?view=assistant" />;
}
