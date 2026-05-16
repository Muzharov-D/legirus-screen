// Прогноз погоды на момент матча (OpenWeatherMap).
// Рендерится в модалке матча (таб «Обзор»), если у venue есть координаты
// И матч в окне 5 дней (free-tier API).
// Если прогноз недоступен или нет ключа на бэке — компонент не рендерится.

import { useEffect, useState } from 'react';
import './MatchWeather.css';

const API_BASE = (() => {
  const base = import.meta.env.VITE_API_BASE_URL || '';
  return String(base).replace(/\/+$/, '');
})();

function adviceFor(w) {
  if (!w) return null;
  if (w.tempC <= 0) return 'Холодно — тёплая форма, перчатки';
  if (w.tempC <= 8) return 'Прохладно — кофта под форму';
  if (w.tempC >= 25) return 'Жарко — больше воды';
  if (w.condition?.includes('дожд') || w.condition?.includes('ливен')) return 'Дождь — бутсы с шипами';
  if (w.condition?.includes('снег')) return 'Снег — оранжевый мяч и зимняя экипировка';
  if (w.windMs >= 10) return 'Сильный ветер — учитывай при подаче';
  return null;
}

export default function MatchWeather({ lat, lng, atIso }) {
  const [data, setData] = useState(null);
  const [loaded, setLoaded] = useState(false);

  useEffect(() => {
    if (!lat || !lng) return;
    let cancelled = false;
    const url = `${API_BASE}/api/public/weather?lat=${lat}&lng=${lng}` + (atIso ? `&at=${encodeURIComponent(atIso)}` : '');
    fetch(url)
      .then((r) => (r.ok ? r.json() : null))
      .then((d) => { if (!cancelled) { setData(d); setLoaded(true); } })
      .catch(() => { if (!cancelled) setLoaded(true); });
    return () => { cancelled = true; };
  }, [lat, lng, atIso]);

  // Не рендерим placeholder если данных нет — тихо отсутствуем.
  if (!loaded || !data) return null;

  const advice = adviceFor(data);

  return (
    <div className="match-weather">
      <div className="match-weather__main">
        {data.iconUrl && (
          <img
            src={data.iconUrl}
            alt={data.condition}
            className="match-weather__icon"
            width="56"
            height="56"
            onError={(e) => { e.currentTarget.style.display = 'none'; }}
          />
        )}
        <div className="match-weather__temp">
          <span className="match-weather__t">{data.tempC > 0 ? '+' : ''}{data.tempC}°</span>
          <span className="match-weather__feels">по ощущениям {data.feelsC > 0 ? '+' : ''}{data.feelsC}°</span>
        </div>
        <div className="match-weather__cond">
          <div className="match-weather__cond-text">{data.condition}</div>
          <div className="match-weather__sub">
            ветер {data.windMs} м/с
            {data.humidity != null ? ` · влажность ${data.humidity}%` : ''}
          </div>
        </div>
      </div>
      {advice && (
        <div className="match-weather__advice" aria-label="Совет">
          <span aria-hidden>💡</span> {advice}
        </div>
      )}
    </div>
  );
}
