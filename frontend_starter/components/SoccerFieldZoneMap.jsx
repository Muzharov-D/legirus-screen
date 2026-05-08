/**
 * SoccerFieldZoneMap.jsx — стартовый шаблон для перерисовки карт.
 *
 * Назначение: SVG-поле с зональной разметкой и оверлеем.
 * Использование:
 *   <SoccerFieldZoneMap
 *     orientation="vertical"          // vertical (атакуем вверх) или horizontal
 *     zones={[                         // зональная сетка (как Sportvisor "Карта ударов")
 *       { row: 0, col: 0, value: 0 }, { row: 0, col: 1, value: 7 }, { row: 0, col: 2, value: 1 },
 *       { row: 1, col: 0, value: 0 }, { row: 1, col: 1, value: 0 }, { row: 1, col: 2, value: 2 },
 *       ...
 *     ]}
 *     events={[                        // события (точки) — для scatter-карт типа Positioning
 *       { x: 0.45, y: 0.12, type: 'foul' },
 *       { x: 0.51, y: 0.08, type: 'shot-against' },
 *       { x: 0.50, y: 0.65, type: 'interception' },
 *     ]}
 *     heatmap={null}                   // 2D-массив [[0,0,1,0], [0,2,5,1], ...] для тепловой карты (опционально)
 *   />
 *
 * Sportvisor PDF не отдаёт зональные числа как текст — их нужно либо хранить
 * вручную в JSON (когда тренер ввёл руками), либо парсить через OCR на бэке.
 * Для отображения извлечённых из PDF готовых PNG-карт см. компонент <SoccerFieldImageMap>.
 */
import React from 'react';

const FIELD_W = 100;     // относительные единицы поля
const FIELD_H = 156;     // соотношение сторон ~1:1.56 (как в Sportvisor)
const COL_COUNT = 5;
const ROW_COUNT = 6;

const EVENT_STYLES = {
  'shot':            { fill: '#d32f2f', shape: 'circle',  size: 2.4 },
  'shot-on-target':  { fill: '#2e7d32', shape: 'circle',  size: 2.4 },
  'shot-against':    { fill: '#fff', stroke: '#d32f2f', shape: 'circle', size: 3.0 },
  'foul':            { fill: '#d32f2f', shape: 'circle',  size: 1.6 },
  'interception':    { fill: '#1976d2', shape: 'pentagon', size: 1.8 },
  'clearance':       { fill: '#1976d2', shape: 'triangle', size: 1.8 },
  'recovery':        { fill: '#43a047', shape: 'circle', size: 1.6 },
  'lost-pass':       { fill: '#43a047', shape: 'cross', size: 2.0 },
};

function zoneCellColor(value, max) {
  if (!value || value === 0) return '#f5f5f5';
  const ratio = Math.min(value / max, 1);
  // light → dark blue gradient
  const alpha = 0.15 + 0.65 * ratio;
  return `rgba(26, 75, 160, ${alpha.toFixed(2)})`;
}

function FieldOutline() {
  return (
    <g stroke="#9aa3b2" fill="none" strokeWidth="0.4">
      {/* outer */}
      <rect x="2" y="2" width={FIELD_W - 4} height={FIELD_H - 4} rx="1.5" />
      {/* halfway */}
      <line x1="2" y1={FIELD_H / 2} x2={FIELD_W - 2} y2={FIELD_H / 2} />
      {/* center circle */}
      <circle cx={FIELD_W / 2} cy={FIELD_H / 2} r="9" />
      <circle cx={FIELD_W / 2} cy={FIELD_H / 2} r="0.6" fill="#9aa3b2" />
      {/* top penalty box (attacking) */}
      <rect x={FIELD_W / 2 - 18} y="2" width="36" height="20" />
      <rect x={FIELD_W / 2 - 8} y="2" width="16" height="7" />
      <circle cx={FIELD_W / 2} cy="14" r="0.6" fill="#9aa3b2" />
      <path d={`M ${FIELD_W / 2 - 8},22 A 9,9 0 0,0 ${FIELD_W / 2 + 8},22`} />
      {/* bottom penalty box (own) */}
      <rect x={FIELD_W / 2 - 18} y={FIELD_H - 22} width="36" height="20" />
      <rect x={FIELD_W / 2 - 8} y={FIELD_H - 9} width="16" height="7" />
      <circle cx={FIELD_W / 2} cy={FIELD_H - 14} r="0.6" fill="#9aa3b2" />
      <path d={`M ${FIELD_W / 2 - 8},${FIELD_H - 22} A 9,9 0 0,1 ${FIELD_W / 2 + 8},${FIELD_H - 22}`} />
    </g>
  );
}

function ZoneGrid({ zones, max }) {
  if (!zones?.length) return null;
  const cellW = (FIELD_W - 4) / COL_COUNT;
  const cellH = (FIELD_H - 4) / ROW_COUNT;
  return (
    <g>
      {zones.map(({ row, col, value }) => {
        const x = 2 + col * cellW;
        const y = 2 + row * cellH;
        return (
          <g key={`${row}-${col}`}>
            <rect x={x} y={y} width={cellW} height={cellH}
                  fill={zoneCellColor(value, max)} stroke="none" opacity="0.95" />
            <text x={x + cellW / 2} y={y + cellH / 2 + 1.5}
                  textAnchor="middle" fontSize="3.5" fontWeight="600"
                  fill={value > max * 0.5 ? '#fff' : '#1a4ba0'}>
              {value || 0}
            </text>
          </g>
        );
      })}
    </g>
  );
}

function EventPoint({ x, y, type }) {
  const style = EVENT_STYLES[type] || EVENT_STYLES['recovery'];
  const cx = 2 + x * (FIELD_W - 4);
  const cy = 2 + y * (FIELD_H - 4);
  if (style.shape === 'circle') {
    return <circle cx={cx} cy={cy} r={style.size}
                   fill={style.fill} stroke={style.stroke || 'none'} strokeWidth="0.4" />;
  }
  if (style.shape === 'cross') {
    const s = style.size;
    return (
      <g stroke={style.fill} strokeWidth="0.6" strokeLinecap="round">
        <line x1={cx - s} y1={cy - s} x2={cx + s} y2={cy + s} />
        <line x1={cx + s} y1={cy - s} x2={cx - s} y2={cy + s} />
      </g>
    );
  }
  if (style.shape === 'pentagon') {
    const s = style.size;
    const pts = Array.from({ length: 5 }, (_, i) => {
      const a = (Math.PI * 2 * i) / 5 - Math.PI / 2;
      return `${(cx + s * Math.cos(a)).toFixed(2)},${(cy + s * Math.sin(a)).toFixed(2)}`;
    }).join(' ');
    return <polygon points={pts} fill={style.fill} />;
  }
  if (style.shape === 'triangle') {
    const s = style.size;
    return <polygon
      points={`${cx},${cy - s} ${cx - s},${cy + s} ${cx + s},${cy + s}`}
      fill={style.fill} />;
  }
  return null;
}

export default function SoccerFieldZoneMap({
  orientation = 'vertical',
  zones = [],
  events = [],
  title,
  width = 320,
}) {
  const max = Math.max(1, ...zones.map(z => z.value || 0));
  const aspectStyle = orientation === 'vertical'
    ? { width, height: width * (FIELD_H / FIELD_W) }
    : { width: width * (FIELD_H / FIELD_W), height: width };
  const transform = orientation === 'horizontal' ? 'rotate(-90)' : '';

  return (
    <div style={{ display: 'inline-block' }}>
      {title && <h4 style={{ margin: '0 0 8px', fontSize: 14, fontWeight: 600 }}>{title}</h4>}
      <svg viewBox={`0 0 ${FIELD_W} ${FIELD_H}`}
           style={{ ...aspectStyle, transform, background: '#fafafa', borderRadius: 6 }}>
        <FieldOutline />
        <ZoneGrid zones={zones} max={max} />
        {events.map((e, i) => <EventPoint key={i} {...e} />)}
      </svg>
    </div>
  );
}
