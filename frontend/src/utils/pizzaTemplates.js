// Шаблоны метрик для pizza-chart по позициям.
// Каждая метрика — { axis, group, key }, где key — dotted-path в player.stats.
// 18 метрик в каждом шаблоне для одинаково плотного «пирога».
//
// Group: 'attack' | 'defence' | 'fitness' — определяет цвет слайса.

import { num } from './num';

export const POSITION_OPTIONS = [
  { value: 'FWD', label: 'Нападающий', vsLabel: 'нападающих клуба' },
  { value: 'MID', label: 'Полузащитник', vsLabel: 'полузащитников клуба' },
  { value: 'DEF', label: 'Защитник', vsLabel: 'защитников клуба' },
];

// statKey может быть как путь в stats ("attack4.goal"), так и путь в splits ("split:Pass.match")
// или в radar ("radar:dribbling"). Разные источники — разный префикс.
export const TEMPLATES = {
  FWD: {
    slices: [
      // ATTACK (12)
      { axis: 'xG / 90',                    group: 'attack',  key: 'attack3.expectedGoals' },
      { axis: 'xA / 90',                    group: 'attack',  key: 'attack3.expectedAssists' },
      { axis: 'Голы / 90',                  group: 'attack',  key: 'attack4.goal' },
      { axis: 'Удары / 90',                 group: 'attack',  key: 'attack4.shot' },
      { axis: 'Удары в створ',              group: 'attack',  key: 'attack4.shotOnTarget' },
      { axis: 'Голевые передачи',           group: 'attack',  key: 'attack1.assist' },
      { axis: 'Ключевые пасы',              group: 'attack',  key: 'attack1.keyPass' },
      { axis: 'Дриблинг',                   group: 'attack',  key: 'attack1.dribble' },
      { axis: 'Касания в штрафной',         group: 'attack',  key: 'attack5.touchesInPenArea' },
      { axis: 'Входы в штрафную',           group: 'attack',  key: 'attack2.entriesInBox' },
      { axis: 'Прогрессивные пасы',         group: 'attack',  key: 'attack2.progressivePass' },
      { axis: 'Передачи в фин. треть',      group: 'attack',  key: 'attack2.passToFinalThird' },
      // DEFENCE (3)
      { axis: 'Прессинг / 90',              group: 'defence', key: 'defence2.pressing' },
      { axis: 'Контрпрессинг',              group: 'defence', key: 'defence2.contrpressing' },
      { axis: 'Восстановления',             group: 'defence', key: 'defence1.recovery' },
      // FITNESS (3)
      { axis: 'Общая дистанция',            group: 'fitness', key: 'fitness.totalDistance' },
      { axis: 'Спринты / 90',               group: 'fitness', key: 'fitness.sprintsCount' },
      { axis: 'Интенсивный бег',            group: 'fitness', key: 'fitness.intenseRunning' },
    ],
  },
  MID: {
    slices: [
      // ATTACK (8)
      { axis: 'xG / 90',                    group: 'attack',  key: 'attack3.expectedGoals' },
      { axis: 'xA / 90',                    group: 'attack',  key: 'attack3.expectedAssists' },
      { axis: 'Прогрессивные пасы',         group: 'attack',  key: 'attack2.progressivePass' },
      { axis: 'Передачи в фин. треть',      group: 'attack',  key: 'attack2.passToFinalThird' },
      { axis: 'Ключевые пасы',              group: 'attack',  key: 'attack1.keyPass' },
      { axis: 'Голевые передачи',           group: 'attack',  key: 'attack1.assist' },
      { axis: 'Дриблинг',                   group: 'attack',  key: 'attack1.dribble' },
      { axis: 'Кроссы',                     group: 'attack',  key: 'attack1.cross' },
      // DEFENCE (7) — Фолы инвертированы (меньше = лучше)
      { axis: 'Отборы / 90',                group: 'defence', key: 'defence1.tackle' },
      { axis: 'Перехваты / 90',             group: 'defence', key: 'defence1.interception' },
      { axis: 'Единоборства',               group: 'defence', key: 'defence2.duel' },
      { axis: 'Прессинг / 90',              group: 'defence', key: 'defence2.pressing' },
      { axis: 'Контрпрессинг',              group: 'defence', key: 'defence2.contrpressing' },
      { axis: 'Восстановления',             group: 'defence', key: 'defence1.recovery' },
      { axis: 'Фолы',                       group: 'defence', key: 'defence3.foul', inverse: true },
      // FITNESS (3)
      { axis: 'Общая дистанция',            group: 'fitness', key: 'fitness.totalDistance' },
      { axis: 'Спринты / 90',               group: 'fitness', key: 'fitness.sprintsCount' },
      { axis: 'Интенсивный бег',            group: 'fitness', key: 'fitness.intenseRunning' },
    ],
  },
  DEF: {
    slices: [
      // ATTACK (4)
      { axis: 'Прогрессивные пасы',         group: 'attack',  key: 'attack2.progressivePass' },
      { axis: 'Передачи в фин. треть',      group: 'attack',  key: 'attack2.passToFinalThird' },
      { axis: 'Длинные пасы',               group: 'attack',  key: 'attack1.passLong' },
      { axis: 'Точные пасы',                group: 'attack',  key: 'attack1.pass' },
      // DEFENCE (11) — Фолы / ЖК / Опасные потери / Технические ошибки инвертированы
      { axis: 'Отборы / 90',                group: 'defence', key: 'defence1.tackle' },
      { axis: 'Перехваты / 90',             group: 'defence', key: 'defence1.interception' },
      { axis: 'Единоборства',               group: 'defence', key: 'defence2.duel' },
      { axis: 'Воздушные дуэли',            group: 'defence', key: 'defence2.arielDuel' },
      { axis: 'Блок-удары',                 group: 'defence', key: 'defence3.blockedShot' },
      { axis: 'Очистки',                    group: 'defence', key: 'defence3.clearance' },
      { axis: 'Прессинг / 90',              group: 'defence', key: 'defence2.pressing' },
      { axis: 'Восстановления',             group: 'defence', key: 'defence1.recovery' },
      { axis: 'Фолы',                       group: 'defence', key: 'defence3.foul',        inverse: true },
      { axis: 'Жёлтые карточки',            group: 'defence', key: 'defence3.yellowCard',  inverse: true },
      { axis: 'Опасные потери',             group: 'defence', key: 'attack5.dangerousLosesOnOwnHalf', inverse: true },
      // FITNESS (3)
      { axis: 'Общая дистанция',            group: 'fitness', key: 'fitness.totalDistance' },
      { axis: 'Спринты / 90',               group: 'fitness', key: 'fitness.sprintsCount' },
      { axis: 'Интенсивный бег',            group: 'fitness', key: 'fitness.intenseRunning' },
    ],
  },
};

// Достаём value по dotted-key из player.stats
export function getStatValue(player, key) {
  if (!player?.stats || !key) return null;
  const parts = key.split('.');
  let cur = player.stats;
  for (const p of parts) {
    if (cur == null) return null;
    cur = cur[p];
  }
  return num(cur);
}

// Группировка позиции игрока в FWD/MID/DEF.
// player.positionFull — обычно русское ("Нападающий"); player.position — короткий код (CF/CM/CB/GK и т.п.)
export function positionGroup(player) {
  const full = (player?.positionFull || '').toLowerCase();
  if (full.includes('напад')) return 'FWD';
  if (full.includes('полуз')) return 'MID';
  if (full.includes('защит')) return 'DEF';
  if (full.includes('вратар')) return null; // GK — отдельный шаблон когда добавим

  const code = (player?.position || '').toUpperCase();
  if (/^(ST|CF|SS|LW|RW)$/.test(code)) return 'FWD';
  if (/^(CM|CDM|CAM|DM|AM|LM|RM)$/.test(code)) return 'MID';
  if (/^(CB|LB|RB|LWB|RWB|SW)$/.test(code)) return 'DEF';
  if (code === 'GK') return null;

  return 'MID'; // дефолт — наименее искажающий
}
