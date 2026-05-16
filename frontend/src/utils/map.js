// Единая утилита построения URL для Я.Карт.
//
// ВАЖНО: venues.json хранит координаты ПЛОСКО: { lat, lng } — НЕ { coords: { lat, lng } }.
// Если координат нет — возвращаем null и UI не показывает кнопку
// (НЕ делаем text-fallback вида ?text=Локомотив — таких стадионов в России 7,
// маршрут уедет не туда).

function hasCoords(venue) {
  return !!(venue && Number.isFinite(venue.lat) && Number.isFinite(venue.lng));
}

// URL для построения МАРШРУТА «отсюда» к точке. Открывается у пользователя
// сразу с прокладкой пути от текущей геолокации.
export function buildRouteUrl(venue) {
  if (!hasCoords(venue)) return null;
  return `https://yandex.ru/maps/?rtext=~${venue.lat}%2C${venue.lng}&rtt=auto`;
}

// URL для ПРОСМОТРА точки на карте (центр + маркер). Используется для
// клика по мини-карте — не сразу строим маршрут, а показываем где это.
export function buildMapViewUrl(venue) {
  if (!hasCoords(venue)) return null;
  return `https://yandex.ru/maps/?ll=${venue.lng},${venue.lat}&z=16&pt=${venue.lng},${venue.lat},pm2rdm`;
}

// URL static-карты для embed-снапшота 600×260 (используется в модалке).
export function buildStaticMapUrl(venue, { w = 600, h = 260, z = 15 } = {}) {
  if (!hasCoords(venue)) return null;
  return `https://static-maps.yandex.ru/1.x/?ll=${venue.lng},${venue.lat}&z=${z}&size=${w},${h}&l=map&pt=${venue.lng},${venue.lat},pm2rdm`;
}

export { hasCoords };
