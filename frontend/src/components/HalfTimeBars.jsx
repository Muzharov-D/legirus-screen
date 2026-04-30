import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer, Cell,
} from 'recharts';
import './HalfTimeBars.css';

function num(v) {
  if (v === null || v === undefined) return 0;
  if (typeof v === 'object') return Number(v.value) || 0;
  return Number(v) || 0;
}

export default function HalfTimeBars({ splits, metrics, metricLabels, title = '1 тайм vs 2 тайм' }) {
  const data = metrics
    .map((m) => {
      const split = splits?.[m];
      if (!split) return null;
      const first = num(split.first);
      const second = num(split.second);
      return { metric: metricLabels?.[m] || m, first, second, delta: second - first };
    })
    .filter(Boolean);

  if (!data.length) return <div className="empty-state">Нет данных по таймовой разбивке</div>;

  return (
    <div className="halftime-bars">
      <div className="halftime-bars__title">{title}</div>
      <ResponsiveContainer width="100%" height={340}>
        <BarChart data={data} layout="vertical" margin={{ top: 6, right: 30, left: 110, bottom: 4 }}>
          <CartesianGrid stroke="rgba(255,255,255,0.06)" />
          <XAxis type="number" tick={{ fill: 'rgba(255,255,255,0.6)', fontSize: 11 }}/>
          <YAxis dataKey="metric" type="category" width={110} tick={{ fill: 'rgba(255,255,255,0.7)', fontSize: 11 }}/>
          <Tooltip
            contentStyle={{ background: '#14143c', border: '1px solid rgba(255,208,0,0.3)', borderRadius: 8, color: '#fff' }}
          />
          <Legend wrapperStyle={{ color: 'rgba(255,255,255,0.7)', fontSize: 12 }} />
          <Bar dataKey="first" name="1 тайм" fill="#42a5f5" radius={[0, 4, 4, 0]} />
          <Bar dataKey="second" name="2 тайм" fill="#ffd000" radius={[0, 4, 4, 0]} />
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}
