// Тонкий клиент к OpenWeatherMap (free tier, 60 запросов/мин).
// Кешируем в памяти на 30 мин — родители смотрят прогноз на матч много раз.
//
// ENV:
//   OPENWEATHER_API_KEY — ключ с https://openweathermap.org/api (free план)
//
// Если ключ не задан — getWeather возвращает null. Фронт это норм обрабатывает
// (просто не показывает погодную карточку).

const API_KEY = process.env.OPENWEATHER_API_KEY || '';
const TTL_MS = 30 * 60 * 1000; // 30 мин
const cache = new Map(); // key → { data, expiresAt }

export function isWeatherConfigured() {
  return !!API_KEY;
}

// Получить прогноз на конкретный момент времени по координатам.
// Используется 5-day/3-hour forecast (free): берём ближайший по времени слот.
// Если матч < сейчас+5 дней — есть прогноз; иначе — null (выдадим заглушку).
export async function getWeather(lat, lng, atIso) {
  if (!isWeatherConfigured()) return null;
  if (!lat || !lng) return null;

  const key = `${lat.toFixed(3)},${lng.toFixed(3)},${atIso || 'current'}`;
  const cached = cache.get(key);
  if (cached && cached.expiresAt > Date.now()) return cached.data;

  try {
    const url = `https://api.openweathermap.org/data/2.5/forecast?lat=${lat}&lon=${lng}&appid=${API_KEY}&units=metric&lang=ru`;
    const res = await fetch(url);
    if (!res.ok) return null;
    const data = await res.json();
    const list = data?.list || [];
    if (list.length === 0) return null;

    // Найти ближайший по времени к atIso. Если atIso = null — текущий момент.
    const target = atIso ? new Date(atIso).getTime() : Date.now();
    let best = list[0];
    let bestDiff = Math.abs(new Date(best.dt_txt).getTime() - target);
    for (const item of list) {
      const diff = Math.abs(new Date(item.dt_txt).getTime() - target);
      if (diff < bestDiff) { best = item; bestDiff = diff; }
    }
    // Если разница >12ч — прогноз вне окна 5-day, не отдаём.
    if (bestDiff > 12 * 3600 * 1000) return null;

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
    console.error('[weather] error:', e.message);
    return null;
  }
}
