// Single source of truth для всего что связано с клубом Легирус.
// Раньше было 5+ копий isLegirus/shieldFor/LEGIRUS_LOGO в разных файлах — теперь одна.

export const LEGIRUS_LOGO = '/icons/legirus.png';

// Whitelist team_id для нашего клуба — точнее чем substring "легирус" в названии
export const LEGIRUS_TEAM_IDS = new Set([
  'legirus-2010', 'legirus-2011', 'legirus-2012', 'legirus-2013',
]);

// Распознавание по имени — fallback когда нет teamId
export function isLegirus(name) {
  return /\bлегирус\b/i.test(String(name || ''));
}

// Подмена щита команды на наш локальный лого, если это Легирус
export function shieldFor(teamName, fallbackUrl) {
  return isLegirus(teamName) ? LEGIRUS_LOGO : (fallbackUrl || '');
}
