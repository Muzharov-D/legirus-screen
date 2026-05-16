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

// Русская плюрализация: plural(1, ['день','дня','дней']) → 'день'
function plural(n, forms) {
  const abs = Math.abs(n) % 100;
  const n1 = abs % 10;
  if (abs > 10 && abs < 20) return forms[2];
  if (n1 > 1 && n1 < 5) return forms[1];
  if (n1 === 1) return forms[0];
  return forms[2];
}

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

// OpenWeatherMap free plan: forecast до 5 суток вперёд. Дальше — нет данных.
const MAX_FORECAST_DAYS = 5;

export default function MatchWeather({ lat, lng, atIso }) {
  const [data, setData] = useState(null);
  const [loaded, setLoaded] = useState(false);

  // Сколько дней до матча — определяет, есть ли смысл ходить за прогнозом.
  const daysUntil = atIso ? (new Date(atIso).getTime() - Date.now()) / 86400000 : 0;
  const tooFar = daysUntil > MAX_FORECAST_DAYS;

  useEffect(() => {
    if (!lat || !lng) return;
    if (tooFar) { setLoaded(true); return; } // не дёргаем API если матч за пределами окна

    let cancelled = false;
    const url = `${API_BASE}/api/public/weather?lat=${lat}&lng=${lng}` + (atIso ? `&at=${encodeURIComponent(atIso)}` : '');
    fetch(url)
      .then((r) => (r.ok ? r.json() : null))
      .then((d) => { if (!cancelled) { setData(d); setLoaded(true); } })
      .catch(() => { if (!cancelled) setLoaded(true); });
    return () => { cancelled = true; };
  }, [lat, lng, atIso, tooFar]);

  // Матч за пределами 5-дневного окна — показываем placeholder с объяснением,
  // чтобы юзер не думал «почему на этом матче погоды нет, а на том есть».
  if (tooFar) {
    const showAt = Math.ceil(daysUntil - MAX_FORECAST_DAYS);
    return (
      <div className="match-weather match-weather--soon">
        <span className="match-weather__soon-icon" aria-hidden>🌦</span>
        <span className="match-weather__soon-text">
          Прогноз погоды появится {showAt === 1 ? 'через сутки' : `через ${showAt} ${plural(showAt, ['день', 'дня', 'дней'])}`}
          {' '}— за 5 дней до матча.
        </span>
      </div>
    );
  }

  // Не рендерим ничего если данных нет (ключ не настроен / API упал) —
  // тихо отсутствуем, не путаем пустым блоком.
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
