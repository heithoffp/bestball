import {
  LineChart,
  Line,
  ResponsiveContainer,
  YAxis
} from 'recharts';

const MAX_POINTS = 10;

function AdpSparkline({ history }) {
  if (!history || history.length === 0) return null;

  const data = history
    .filter(h => h.adpPick !== null)
    .slice(-MAX_POINTS);

  if (data.length < 2) return null;

  const first = data[0].adpPick;
  const last = data[data.length - 1].adpPick;
  
  // Calculate the raw difference
  const diff = last - first;

  // Only change color if the movement is GREATER than 1 ADP
  // Note: 'last < first - 1' means the pick number got smaller (player rising)
  const trendColor =
    diff < -1 ? '#10b981' :  // Rising (e.g., went from 50 to 48.5)
    diff > 1  ? '#ef4444' :  // Falling (e.g., went from 50 to 51.2)
    '#9ca3af';               // Neutral/Flat (within +/- 1.0)

  return (
    <div style={{ width: '100%', height: 28 }}>
      <ResponsiveContainer>
        <LineChart data={data}>
          <YAxis
            dataKey="adpPick"
            reversed
            domain={['dataMin - 1', 'dataMax + 1']} // Added padding for better visibility
            hide
          />
          <Line
            type="monotone"
            dataKey="adpPick"
            stroke={trendColor}
            strokeWidth={2}
            dot={false}
            animationDuration={300}
          />
        </LineChart>
      </ResponsiveContainer>
    </div>
  );
}

export default AdpSparkline;