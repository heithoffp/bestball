// MultiLineChart — react-native-svg replacement for the ADP Tracker's Recharts
// LineChart: reversed Y (lower pick = higher), round-boundary gridlines, one
// line per series (dashed variant for DK in "Both" mode), optional quartile
// pick-range bands.
import React from 'react';
import { View, Text } from 'react-native';
import Svg, { Polyline, Line as SvgLine, Rect, Text as SvgText } from 'react-native-svg';
import { colors } from '../theme';

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
const fmtDate = d => {
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(String(d));
  return m ? `${MONTHS[+m[2] - 1]} ${+m[3]}` : d;
};

/**
 * @param {Array<{date: string, [seriesKey]: number}>} data - one row per date
 * @param {Array<{key: string, color: string, dashed?: boolean}>} series
 * @param {[number, number]} domain - [minPick, maxPick]
 * @param {number[]} [yTicks] - round-boundary tick values
 * @param {Array<{color: string, q1: number, q3: number, median: number}>} [bands]
 */
export default function MultiLineChart({ data, series, domain, yTicks, bands = [], width, height = 240, teams = 12 }) {
  const PAD_L = 40, PAD_R = 8, PAD_T = 8, PAD_B = 22;
  const w = width;
  const h = height;
  const plotW = w - PAD_L - PAD_R;
  const plotH = h - PAD_T - PAD_B;

  const [lo, hi] = domain;
  const span = (hi - lo) || 1;
  // Reversed Y: lower pick renders toward the top
  const yFor = (pick) => PAD_T + ((pick - lo) / span) * plotH;
  const xFor = (i) => PAD_L + (data.length > 1 ? (i / (data.length - 1)) * plotW : plotW / 2);

  const ticks = yTicks && yTicks.length >= 2
    ? yTicks
    : [lo, lo + span / 3, lo + (2 * span) / 3, hi].map(Math.round);

  // X labels: first, middle, last date
  const xLabelIdx = data.length <= 3
    ? data.map((_, i) => i)
    : [0, Math.floor(data.length / 2), data.length - 1];

  return (
    <View>
      <Svg width={w} height={h}>
        {/* Round gridlines + labels */}
        {ticks.map(t => (
          <React.Fragment key={t}>
            <SvgLine x1={PAD_L} y1={yFor(t)} x2={w - PAD_R} y2={yFor(t)} stroke="rgba(138,155,181,0.12)" strokeDasharray="3 4" />
            <SvgText x={PAD_L - 5} y={yFor(t) + 3} fill="#8A9BB5" fontSize={9.5} textAnchor="end">
              {t}
            </SvgText>
            <SvgText x={PAD_L - 5} y={yFor(t) + 12} fill="#5a6a80" fontSize={8} textAnchor="end">
              R{Math.floor((t - 1) / teams) + 1}
            </SvgText>
          </React.Fragment>
        ))}

        {/* Pick-range quartile bands */}
        {bands.map((b, i) => (
          <React.Fragment key={`band-${i}`}>
            <Rect
              x={PAD_L} y={Math.min(yFor(b.q1), yFor(b.q3))}
              width={plotW} height={Math.abs(yFor(b.q3) - yFor(b.q1))}
              fill={b.color} fillOpacity={0.14} stroke={b.color} strokeOpacity={0.35}
            />
            <SvgLine x1={PAD_L} y1={yFor(b.median)} x2={w - PAD_R} y2={yFor(b.median)} stroke={b.color} strokeDasharray="4 4" strokeWidth={1.5} strokeOpacity={0.7} />
          </React.Fragment>
        ))}

        {/* Series lines */}
        {series.map(s => {
          const pts = [];
          data.forEach((row, i) => {
            const v = row[s.key];
            if (v != null) pts.push(`${xFor(i).toFixed(1)},${yFor(v).toFixed(1)}`);
          });
          if (pts.length < 2) return null;
          return (
            <Polyline
              key={s.key}
              points={pts.join(' ')}
              fill="none"
              stroke={s.color}
              strokeWidth={2}
              strokeDasharray={s.dashed ? '5 4' : undefined}
              strokeLinejoin="round"
              strokeLinecap="round"
            />
          );
        })}

        {/* X labels */}
        {xLabelIdx.map(i => (
          <SvgText key={i} x={xFor(i)} y={h - 6} fill="#8A9BB5" fontSize={9.5}
            textAnchor={i === 0 ? 'start' : i === data.length - 1 ? 'end' : 'middle'}>
            {fmtDate(data[i]?.date)}
          </SvgText>
        ))}
      </Svg>
      {data.length < 2 && (
        <Text style={{ color: colors.textMuted, fontSize: 12, textAlign: 'center', marginTop: -h / 2 }}>
          Not enough snapshots in this window
        </Text>
      )}
    </View>
  );
}
