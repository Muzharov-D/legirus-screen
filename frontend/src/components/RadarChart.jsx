import {
  Radar, RadarChart, PolarGrid, PolarAngleAxis, PolarRadiusAxis, ResponsiveContainer, Tooltip, Legend,
} from 'recharts';

const COLORS = ['#22d3ee', '#7cb342', '#42a5f5', '#ef5350', '#ab47bc', '#26a69a'];

export default function RadarChartCard({ axes, series, max = 10, height = 360 }) {
  // axes: [{ key, label }]
  // series: [{ name, color?, values: { [axisKey]: number } }]
  const data = axes.map((ax) => {
    const row = { axis: ax.label };
    series.forEach((s, i) => {
      row[s.name] = Number(s.values?.[ax.key]) || 0;
    });
    return row;
  });

  return (
    <div style={{ width: '100%', height }}>
      <ResponsiveContainer>
        <RadarChart data={data} cx="50%" cy="50%" outerRadius="78%">
          <PolarGrid stroke="rgba(255,255,255,0.1)" />
          <PolarAngleAxis dataKey="axis" tick={{ fill: 'rgba(255,255,255,0.7)', fontSize: 11 }} />
          <PolarRadiusAxis angle={30} domain={[0, max]} tick={{ fill: 'rgba(255,255,255,0.4)', fontSize: 10 }} />
          {series.map((s, i) => (
            <Radar
              key={s.name}
              name={s.name}
              dataKey={s.name}
              stroke={s.color || COLORS[i % COLORS.length]}
              fill={s.color || COLORS[i % COLORS.length]}
              fillOpacity={s.fillOpacity ?? 0.25}
              strokeWidth={2}
            />
          ))}
          <Tooltip
            contentStyle={{ background: '#14143c', border: '1px solid rgba(34, 211, 238, 0.3)', borderRadius: 8 }}
            labelStyle={{ color: '#22d3ee', fontWeight: 700 }}
          />
          {series.length > 1 && (
            <Legend wrapperStyle={{ color: 'rgba(255,255,255,0.7)', fontSize: 12 }} />
          )}
        </RadarChart>
      </ResponsiveContainer>
    </div>
  );
}
