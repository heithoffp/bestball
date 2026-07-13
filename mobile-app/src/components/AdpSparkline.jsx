// AdpSparkline — RN/SVG port of the web sparkline (Recharts → react-native-svg).
// Same behavior: prefer the Underdog series (mixed platforms zigzag), last 10
// points, Y reversed (lower pick = better), color by >1-pick movement.
import React, { memo } from 'react';
import Svg, { Polyline } from 'react-native-svg';

const MAX_POINTS = 10;

function AdpSparkline({ history, width = 84, height = 28 }) {
  if (!history || history.length === 0) return null;

  const allValid = history.filter(h => h.adpPick !== null);
  if (allValid.length < 2) return null;

  const underdog = allValid.filter(h => h.platform === 'underdog');
  const data = (underdog.length >= 2 ? underdog : allValid).slice(-MAX_POINTS);

  const first = data[0].adpPick;
  const last = data[data.length - 1].adpPick;
  const diff = last - first;
  const trendColor =
    diff < -1 ? '#10b981' :   // rising player (pick number shrinking)
    diff > 1 ? '#ef4444' :    // falling
    '#9ca3af';                // flat within ±1

  const min = Math.min(...data.map(d => d.adpPick)) - 1;
  const max = Math.max(...data.map(d => d.adpPick)) + 1;
  const span = max - min || 1;
  const pad = 2;
  const points = data.map((d, i) => {
    const x = pad + (i / (data.length - 1)) * (width - pad * 2);
    // Reversed Y: lower ADP (better) plots higher
    const y = pad + ((d.adpPick - min) / span) * (height - pad * 2);
    return `${x.toFixed(1)},${y.toFixed(1)}`;
  }).join(' ');

  return (
    <Svg width={width} height={height}>
      <Polyline points={points} fill="none" stroke={trendColor} strokeWidth={2} strokeLinejoin="round" strokeLinecap="round" />
    </Svg>
  );
}

export default memo(AdpSparkline);
