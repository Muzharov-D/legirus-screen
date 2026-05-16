// Тонкий клиент к OpenWeatherMap (free tier, 60 запросов/мин).
// Кешируем в памяти на 30 мин — родители смотрят прогноз на матч много раз.
//
// ENV:
//   OPENWEATHER_API_KEY — ключ с https://openweathermap.org/api (free план)
//
// Если ключ не задан — getWeather возвращает { error: 'no_api_key' }.
// Раньше возвращали null, теперь — объект с конкретным кодом ошибки,
// чтобы можно было различать «нет ключа», «ключ битый», «вне окна»,
// «rate limit» и сетевую ошибку.

const API_KEY = process.env.OPENWEATHER_API_KEY || '';
const TTL_MS = 30 * 60 * 1000; // 30 мин
const cache = new Map(); // key → { data, expiresAt }

export function isWeatherConfigured() {
  return !!API_KEY;
}

// Получить прогноз на конкретный момент времени по координатам.
// Используется 5-day/3-hour forecast (free): берём ближайший по времени слот.
//
// Возвращает либо данные прогноза, либо объект { error: '...code...' }
// для точной диагностики на фронте/в логах. Раньше возвращали null на ВСЁ
// (no key / wrong key / out of window / network) — невозможно было понять
// в чём дело.
export async function getWeather(lat, lng, atIso) {
  if (!isWeatherConfigured()) return { error: 'no_api_key' };
  if (!lat || !lng) return { error: 'bad_coords' };

  const key = `${lat.toFixed(3)},${lng.toFixed(3)},${atIso || 'current'}`;
  const cached = cache.get(key);
  if (cached && cached.expiresAt > Date.now()) return cached.data;

  try {
    const url = `https://api.openweathermap.org/data/2.5/forecast?lat=${lat}&lon=${lng}&appid=${API_KEY}&units=metric&lang=ru`;
    const res = await fetch(url);
    if (!res.ok) {
      const body = await res.text().catch(() => '');
      console.error(`[weather] OpenWeather HTTP ${res.status}:`, body.slice(0, 300));
      // 401 = ключ невалиден; 429 = превышен rate-limit; иначе network/API down
      if (res.status === 401) return { error: 'invalid_api_key' };
      if (res.status === 429) return { error: 'rate_limited' };
      return { error: `upstream_${res.status}` };
    }
    const data = await res.json();
    const list = data?.list || [];
    if (list.length === 0) return { error: 'empty_forecast' };

    // Найти ближайший по времени к atIso. Если atIso = null — текущий момент.
    const target = atIso ? new Date(atIso).getTime() : Date.now();
    let best = list[0];
    let bestDiff = Math.abs(new Date(best.dt_txt).getTime() - target);
    for (const item of list) {
      const diff = Math.abs(new Date(item.dt_txt).getTime() - target);
      if (diff < bestDiff) { best = item; bestDiff = diff; }
    }
    // Если разница >12ч — прогноз вне окна 5-day, не отдаём.
    if (bestDiff > 12 * 3600 * 1000) return { error: 'out_of_window' };

    const out = {
      tempC: Math.round(best.main?.temp ?? 0),
      feelsC: Math.round(best.main?.feels_like ?? 0),
      humidity: best.main?.humidity ?? null,
      windMs: Math.round((best.wind?.speed ?? 0) * 10) / 10,
      condition: best.weather?.[0]?.description || '',
      icon: best.weather?.[0]?.icon || '',
      iconUrl: best.weather?.[0]?.icon
        ? `https://openweathermap.org/img/wn/${best.weather[0].icon}@2x.png`
        : null,
      forecastFor: best.dt_txt,
      offsetMin: Math.round(bestDiff / 60000),
    };
    cache.set(key, { data: out, expiresAt: Date.now() + TTL_MS });
    return out;
  } catch (e) {
    console.error('[weather] fetch error:', e.message);
    return { error: 'network_error' };
  }
}
