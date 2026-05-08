// Маппинг год-рождения → турнирная категория U-XX и UI-метаданные.
// 2010 → U17 (16-17 лет), 2011 → U16, 2012 → U15, 2013 → U14.
// Сезон 2025/26: возраст U-X равен X лет на 1 января сезона.

export const AGE_GROUPS = ['2010', '2011', '2012', '2013'];

export const AGE_TO_TIER = {
  '2010': 'U17',
  '2011': 'U16',
  '2012': 'U15',
  '2013': 'U14',
};

export function tierForAge(age) {
  return AGE_TO_TIER[String(age)] || `U${17 - (Number(age) - 2010 || 0)}`;
}

// Метка позиции в лиге: 1=золото, 2=серебро, 3=бронза, прочее=base
export function leaguePosClass(pos) {
  if (pos === 1) return 'rank-medal--gold';
  if (pos === 2) return 'rank-medal--silver';
  if (pos === 3) return 'rank-medal--bronze';
  return 'rank-medal--base';
}

// Клубный зачёт: только 1 (золото) и 2 (серебро) — поднимаются 2 клуба
export function clubPosClass(pos) {
  if (pos === 1) return 'rank-medal--gold';
  if (pos === 2) return 'rank-medal--silver';
  return 'rank-medal--base';
}
