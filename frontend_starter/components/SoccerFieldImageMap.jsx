/**
 * SoccerFieldImageMap.jsx — отображение готовой PNG-карты, извлечённой из PDF.
 *
 * Так Sportvisor PDF рендерит карты векторно (paths) — числа в зонах не текст,
 * поэтому MVP использует уже обрезанные PNG из /assets/maps/.
 *
 * Использование:
 *   <SoccerFieldImageMap src="/assets/maps/match-001-team-shooting-map.png"
 *                        title="Карта ударов"
 *                        height={420} />
 */
import React from 'react';

export default function SoccerFieldImageMap({ src, title, height = 400, alt = '' }) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-start' }}>
      {title && (
        <h4 style={{ margin: '0 0 8px', fontSize: 14, fontWeight: 600 }}>
          {title}
        </h4>
      )}
      <div style={{
        background: '#fafafa',
        borderRadius: 8,
        padding: 8,
        boxShadow: '0 1px 3px rgba(0,0,0,0.06)',
      }}>
        <img
          src={src}
          alt={alt || title || 'Soccer map'}
          style={{ height, width: 'auto', display: 'block' }}
          onError={(e) => { e.target.style.opacity = '0.3'; }}
        />
      </div>
    </div>
  );
}
