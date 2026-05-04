import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer,
} from 'recharts';
import './HalfTimeBars.css';

function num(v) {
  if (v === null || v === undefined) return 0;
  if (typeof v === 'object') return Number(v.value) || 0;
  return Number(v) || 0;
}

const COLOR_FIRST = '#22d3ee';   // 1 тайм — клубный жёлтый
const COLOR_SECOND = '#5b6ee3';  // 2 тайм — синий

export default function HalfTimeBars({ splits, metrics, metricLabels, title = '1 тайм vs 2 тайм' }) {
  const data = metrics
    .map((m) => {
      const split = splits?.[m];
      if (!split) return null;
      return {
        name: metricLabels?.[m] || m,
        'I тайм':  num(split.first),
        'II тайм': num(split.second),
      };
    })
    .filter(Boolean);

  if (!data.length) return <div className="empty-state">Нет данных по таймовой разбивке</div>;

  // Высота зависит от количества метрик: ~36 px на метрику + плавающий минимум для маленьких списков
  const height = Math.max(240, data.length * 36 + 80);

  return (
    <div className="halftime-bars">
      {title && <div className="halftime-bars__title">{title}</div>}
      <ResponsiveContainer width="100%" height={height}>
        <BarChart
          data={data}
          margin={{ top: 8, right: 12, left: 8, bottom: 56 }}
          barCategoryGap={12}
          barGap={4}
        >
          <CartesianGrid stroke="rgba(255,255,255,0.06)" vertical={false} />
          <XAxis
            dataKey="name"
            tick={{ fill: 'rgba(255,255,255,0.7)', fontSize: 10 }}
            angle={-30}
            textAnchor="end"
            interval={0}
            height={56}
          />
          <YAxis
            tick={{ fill: 'rgba(255,255,255,0.5)', fontSize: 10 }}
            allowDecimals={false}
            width={32}
          />
          <Tooltip
            contentStyle={{
              background: '#14143c',
              border: '1px solid rgba(34, 211, 238, 0.3)',
              borderRadius: 8,
              color: '#fff',
              fontSize: 12,
            }}
            cursor={{ fill: 'rgba(255,255,255,0.04)' }}
          />
          <Legend
            wrapperStyle={{ color: 'rgba(255,255,255,0.75)', fontSize: 11, paddingTop: 4 }}
            iconType="circle"
          />
          <Bar dataKey="I тайм"  fill={COLOR_FIRST}  radius={[4, 4, 0, 0]} maxBarSize={24} />
          <Bar dataKey="II тайм" fill={COLOR_SECOND} radius={[4, 4, 0, 0]} maxBarSize={24} />
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}
