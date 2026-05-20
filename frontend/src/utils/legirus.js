// Single source of truth для всего что связано с клубом Легирус.
// Раньше было 5+ копий isLegirus/shieldFor/LEGIRUS_LOGO в разных файлах — теперь одна.

export const LEGIRUS_LOGO = '/icons/legirus.png';

// Whitelist team_id для нашего клуба — точнее чем substring "легирус" в названии
export const LEGIRUS_TEAM_IDS = new Set([
  'legirus-2010', 'legirus-2011', 'legirus-2012', 'legirus-2013',
]);

// Распознавание по имени — простой case-insensitive substring.
// (Не используем \b word-boundary — в JS regex он работает только с ASCII,
// для кириллицы \bлегирус\b НИКОГДА не матчит. Подстрока надёжнее.)
export function isLegirus(name) {
  return String(name || '').toLowerCase().includes('легирус');
}

// Подмена щита команды на наш локальный лого, если это Легирус
export function shieldFor(teamName, fallbackUrl) {
  return isLegirus(teamName) ? LEGIRUS_LOGO : (fallbackUrl || '');
}

// Нормализация имени команды для СРАВНЕНИЯ (не для отображения).
// FFSPB непоследователен: одна и та же команда в разных местах называется
// «Легирус (ЦФКСиЗ ВО)» / «ФК Легирус (ЦФКСиЗ ВО)», «СШОР Кировского
// района» / «ГБУ ДО СШОР Кировского района». Срезаем ТОЛЬКО юр-формы
// (ФК, ГБУ ДО, ГБОУ…) — НЕ трогаем СШОР/СШ, это содержательная часть
// названия. lowercase + схлопываем пробелы — для матчинга
// calendar ↔ standings.
export function normalizeTeamName(name) {
  return String(name || '')
    .toLowerCase()
    .replace(/^(фк|гбу\s+до|гбоу|мбоу|маоу|гку|мку|гкоу|ано|оо|роо)\s+/i, '')
    .replace(/\s+/g, ' ')
    .trim();
}
