import {
  LineChart,
  Line,
  ResponsiveContainer,
  YAxis
} from 'recharts';

const MAX_POINTS = 10;

function AdpSparkline({ history }) {
  if (!history || history.length === 0) return null;

  // take last N snapshots
  const data = history
    .filter(h => h.adpPick !== null)
    .slice(-MAX_POINTS);

  if (data.length < 2) return null;

  const first = data[0].adpPick;
  const last = data[data.length - 1].adpPick;

  const trendColor =
    last < first ? '#10b981' :   // rising (earlier pick)
    last > first ? '#ef4444' :   // falling
    '#9ca3af';                   // flat

  return (
    <div style={{ width: '100%', height: 28 }}>
      <ResponsiveContainer>
        <LineChart data={data}>
          <YAxis
            dataKey="adpPick"
            reversed
            domain={['dataMin', 'dataMax']}
            hide
          />
          <Line
            type="monotone"
            dataKey="adpPick"
            stroke={trendColor}
            strokeWidth={2}
            dot={false}
            connectNulls={false}
          />
        </LineChart>
      </ResponsiveContainer>
    </div>
  );
}

export default AdpSparkline;