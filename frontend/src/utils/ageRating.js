// Маппинг год-рождения → турнирная категория U-XX и UI-метаданные.

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

export function leaguePosClass(pos) {
  if (pos === 1) return 'rank-medal--gold';
  if (pos === 2) return 'rank-medal--silver';
  if (pos === 3) return 'rank-medal--bronze';
  return 'rank-medal--base';
}

export function clubPosClass(pos) {
  if (pos === 1) return 'rank-medal--gold';
  if (pos === 2) return 'rank-medal--silver';
  return 'rank-medal--base';
}
