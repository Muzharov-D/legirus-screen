// Шаблоны метрик для pizza-chart по позициям.
// Каждая метрика — { axis, group, key }, где key — dotted-path в player.stats.
// 18 метрик в каждом шаблоне для одинаково плотного «пирога».
//
// Group: 'attack' | 'defence' | 'fitness' — цвет слайса.
// inverse: true — метрика «меньше = лучше» (фолы, потери, ЖК).
//
// Ключи — РЕАЛЬНЫЕ из player.stats (проверено по match-001.json):
//   attack1: attackTotal, goalActions, xG, xA, keyPass, assist, secondAssist, thirdAssist
//   attack2: shotAssist, shotOnTargetAssist, intoPenArea, cross, passPacking, throughPass,
//            progressivePass, passToFinalThird, progressiveRun, pass
//   attack3: passForward, passBack, passSideways, passShort, passMiddle, passLong,
//            touchesInPenArea, receivedPass, foulsSuffered, technicalMistake
//   attack4: loseOnOwnHalf, lostBall, dangerousLosesOnOwnHalf, dribble, dribblePacking,
//            dribbleAgainst, goal, shot, freeKick, freeKickShot
//   attack5: directFreeKick, freeKickWithShot, entriesInBox, offside, penalty, byHead,
//            corner, throwing, acceleration
//   defence1: defenceTotal, tackle, slidingTackles, tackleAndRecovery, interception,
//             recovery, clearance, blockedShot
//   defence2: duel, aerialDuel, pressing, counterpressing, foul, yellowCard, redCard,
//             dribbleAgainst, return, returnOnOppHalf
//   defence3: save, goalkeeperExits, shotsAgainst, shotAgainst, goalKick,
//             shortGoalKicks, longGoalKicks
//   fitness:  minutes, fitnessTotal, totalDistance, speed_4_5_5, speed_5_5_7,
//             speed_7plus, intenseRunning, sprintsCount, sprintDistance, averageSpeed

import { num } from './num';

// vsLabel единый — сравнение всегда vs всей команды.
// Дропдаун позиции — только переключатель набора метрик в pizza.
export const POSITION_OPTIONS = [
  { value: 'FWD', label: 'Нападающий' },
  { value: 'MID', label: 'Полузащитник' },
  { value: 'DEF', label: 'Защитник' },
];
export const PIZZA_VS_LABEL = 'игроков команды';

export const TEMPLATES = {
  FWD: {
    slices: [
      // ATTACK (12)
      { axis: 'xG',                         group: 'attack',  key: 'attack1.xG' },
      { axis: 'xA',                         group: 'attack',  key: 'attack1.xA' },
      { axis: 'Голы',                       group: 'attack',  key: 'attack4.goal' },
      { axis: 'Удары',                      group: 'attack',  key: 'attack4.shot' },
      { axis: 'Удары головой',              group: 'attack',  key: 'attack5.byHead' },
      { axis: 'Ассисты',                    group: 'attack',  key: 'attack1.assist' },
      { axis: 'Передачи под удар',          group: 'attack',  key: 'attack2.shotAssist' },
      { axis: 'Обводки',                    group: 'attack',  key: 'attack4.dribble' },
      { axis: 'Касания в штрафной',         group: 'attack',  key: 'attack3.touchesInPenArea' },
      { axis: 'Входы в штрафную',           group: 'attack',  key: 'attack5.entriesInBox' },
      { axis: 'Передачи в фин. треть',      group: 'attack',  key: 'attack2.passToFinalThird' },
      { axis: 'Заработанные фолы',          group: 'attack',  key: 'attack3.foulsSuffered' },
      // DEFENCE (3)
      { axis: 'Прессинг',                   group: 'defence', key: 'defence2.pressing' },
      { axis: 'Контрпрессинг',              group: 'defence', key: 'defence2.counterpressing' },
      { axis: 'Подборы',                    group: 'defence', key: 'defence1.recovery' },
      // FITNESS (3)
      { axis: 'Спринты',                    group: 'fitness', key: 'fitness.sprintsCount' },
      { axis: 'Дистанция спринтов',         group: 'fitness', key: 'fitness.sprintDistance' },
      { axis: 'Интенсивный бег',            group: 'fitness', key: 'fitness.intenseRunning' },
    ],
  },
  MID: {
    slices: [
      // ATTACK (8)
      { axis: 'xG',                         group: 'attack',  key: 'attack1.xG' },
      { axis: 'xA',                         group: 'attack',  key: 'attack1.xA' },
      { axis: 'Ключевые передачи',          group: 'attack',  key: 'attack1.keyPass' },
      { axis: 'Ассисты',                    group: 'attack',  key: 'attack1.assist' },
      { axis: 'Прогрессивные передачи',     group: 'attack',  key: 'attack2.progressivePass' },
      { axis: 'Передачи в фин. треть',      group: 'attack',  key: 'attack2.passToFinalThird' },
      { axis: 'Обводки',                    group: 'attack',  key: 'attack4.dribble' },
      { axis: 'Навесы',                     group: 'attack',  key: 'attack2.cross' },
      // DEFENCE (7) — Фолы инвертированы
      { axis: 'Отборы',                     group: 'defence', key: 'defence1.tackle' },
      { axis: 'Перехваты',                  group: 'defence', key: 'defence1.interception' },
      { axis: 'Подборы',                    group: 'defence', key: 'defence1.recovery' },
      { axis: 'Единоборства',               group: 'defence', key: 'defence2.duel' },
      { axis: 'Прессинг',                   group: 'defence', key: 'defence2.pressing' },
      { axis: 'Контрпрессинг',              group: 'defence', key: 'defence2.counterpressing' },
      { axis: 'Фолы',                       group: 'defence', key: 'defence2.foul', inverse: true },
      // FITNESS (3)
      { axis: 'Общая дистанция',            group: 'fitness', key: 'fitness.totalDistance' },
      { axis: 'Спринты',                    group: 'fitness', key: 'fitness.sprintsCount' },
      { axis: 'Интенсивный бег',            group: 'fitness', key: 'fitness.intenseRunning' },
    ],
  },
  DEF: {
    slices: [
      // ATTACK (4)
      { axis: 'Прогрессивные передачи',     group: 'attack',  key: 'attack2.progressivePass' },
      { axis: 'Длинные передачи',           group: 'attack',  key: 'attack3.passLong' },
      { axis: 'Передачи в фин. треть',      group: 'attack',  key: 'attack2.passToFinalThird' },
      { axis: 'Всего передач',              group: 'attack',  key: 'attack2.pass' },
      // DEFENCE (11) — Фолы и опасные потери инвертированы (меньше = лучше)
      { axis: 'Отборы',                     group: 'defence', key: 'defence1.tackle' },
      { axis: 'Подкаты',                    group: 'defence', key: 'defence1.slidingTackles' },
      { axis: 'Отбор с подбором',           group: 'defence', key: 'defence1.tackleAndRecovery' },
      { axis: 'Перехваты',                  group: 'defence', key: 'defence1.interception' },
      { axis: 'Подборы',                    group: 'defence', key: 'defence1.recovery' },
      { axis: 'Выносы',                     group: 'defence', key: 'defence1.clearance' },
      { axis: 'Блокированные удары',        group: 'defence', key: 'defence1.blockedShot' },
      { axis: 'Единоборства',               group: 'defence', key: 'defence2.duel' },
      { axis: 'Верховые единоборства',      group: 'defence', key: 'defence2.aerialDuel' },
      { axis: 'Фолы',                       group: 'defence', key: 'defence2.foul',                       inverse: true },
      { axis: 'Опасные потери у ворот',     group: 'defence', key: 'attack4.dangerousLosesOnOwnHalf',     inverse: true },
      // FITNESS (3)
      { axis: 'Общая дистанция',            group: 'fitness', key: 'fitness.totalDistance' },
      { axis: 'Спринты',                    group: 'fitness', key: 'fitness.sprintsCount' },
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
// player.positionFull — обычно русское ("Нападающий", "Центральный защитник");
// player.position — короткий код (CF/CM/CB/GK и т.п.)
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
