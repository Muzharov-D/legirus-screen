// История турнирной таблицы: помогает считать «дельту» позиции команды
// за неделю (как изменилось место в лиге и клубный зачёт с прошлого понедельника
// 23:00 МСК до текущего момента).
//
// Источник истории — PG-таблица `standings`, в неё каждый refresh (раз в 30 мин)
// добавляет новую строку с table_data JSONB. Берём ближайший snapshot ≤ baseline.

import { isPgEnabled, query } from '../db/pool.js';
import { buildClubRanking } from './clubRanking.js';
import { loadStandings } from './dataRepo.js';

// Возвращает Date объекта понедельника 23:00 МСК прошлой недели — baseline для
// расчёта дельты позиции. Если сейчас понедельник до 23:00 — берём прошлый
// понедельник, после 23:00 — текущий понедельник.
// МСК = UTC+3 (без DST), 23:00 МСК = 20:00 UTC.
export function lastMondayMsk23(now = new Date()) {
  const MSK_OFFSET_MS = 3 * 3600 * 1000;
  // «Сейчас» в МСК: представляем как UTC-дату со сдвигом
  const nowMsk = new Date(now.getTime() + MSK_OFFSET_MS);
  const dow = nowMsk.getUTCDay();      // 0=вс, 1=пн, 2=вт ... 6=сб
  const hour = nowMsk.getUTCHours();

  let daysBack;
  if (dow === 1) {
    daysBack = hour < 23 ? 7 : 0;      // понедельник: до 23ч → прошлый, после → текущий
  } else if (dow === 0) {
    daysBack = 6;                       // воскресенье → 6 дней назад
  } else {
    daysBack = dow - 1;                 // вт=1, ср=2, ... сб=5
  }

  // Понедельник 23:00 МСК = понедельник 20:00 UTC
  return new Date(Date.UTC(
    nowMsk.getUTCFullYear(),
    nowMsk.getUTCMonth(),
    nowMsk.getUTCDate() - daysBack,
    20, 0, 0, 0,
  ));
}

// Загрузить snapshot standings для одного age на момент atIso (или ближайший до).
// Если PG отключён или нет snapshot — null.
export async function getStandingsSnapshotAt(ageGroup, atDate) {
  if (!isPgEnabled()) return null;
  try {
    const r = await query(
      `SELECT age_group AS "ageGroup", season, league_name AS title,
              table_data AS "table", fetched_at AS "fetchedAt"
       FROM standings
       WHERE club_id = 'legirus' AND age_group = $1 AND fetched_at <= $2
       ORDER BY fetched_at DESC LIMIT 1`,
      [ageGroup, atDate],
    );
    return r.rows[0] || null;
  } catch (e) {
    console.error('[standingsHistory] snapshot err:', e.message);
    return null;
  }
}

// Загрузить snapshots для ВСЕХ ages на момент atIso (нужно для клубного зачёта).
export async function getAllStandingsSnapshotsAt(atDate) {
  if (!isPgEnabled()) return [];
  try {
    // Для каждой age берём последний snapshot ≤ atDate
    const r = await query(
      `SELECT DISTINCT ON (age_group) age_group AS "ageGroup", season,
              league_name AS title, table_data AS "table", fetched_at AS "fetchedAt"
       FROM standings
       WHERE club_id = 'legirus' AND fetched_at <= $1
       ORDER BY age_group, fetched_at DESC`,
      [atDate],
    );
    return r.rows;
  } catch (e) {
    console.error('[standingsHistory] all-snapshots err:', e.message);
    return [];
  }
}

// Найти позицию нашего клуба в таблице (по isOurClub флагу).
function ourPosInTable(table) {
  if (!Array.isArray(table)) return null;
  const row = table.find((r) => r && r.isOurClub === true);
  return row?.pos != null ? Number(row.pos) : null;
}

// Главная функция: дельта позиций для конкретной age.
// Возвращает { leagueDelta, leaguePos, leaguePosBaseline, leagueBaselineAt,
//              clubDelta, clubPos, clubPosBaseline }
// или { leagueDelta: null, ... } если данных не хватает.
//
// Знак дельты: отрицательная = поднялись в таблице (стало меньше — лучше),
// положительная = опустились. UI рисует зелёную ↑ при <0, красную ↓ при >0.
export async function getTeamRankDelta(ageGroup, ourMatcher = 'Легирус', countedAgesSet = null) {
  const baselineDate = lastMondayMsk23();

  // 1. Текущее место в лиге — из обычного loadStandings (latest snapshot)
  const cur = await loadStandings(ageGroup);
  const leaguePos = cur ? ourPosInTable(cur.table) : null;

  // 2. Место в лиге на baseline — snapshot ≤ baselineDate
  const baselineSnap = await getStandingsSnapshotAt(ageGroup, baselineDate);
  const leaguePosBaseline = baselineSnap ? ourPosInTable(baselineSnap.table) : null;

  const leagueDelta = (leaguePos != null && leaguePosBaseline != null)
    ? (leaguePos - leaguePosBaseline) // +N = опустились, -N = поднялись
    : null;

  // 3. Клубный зачёт — пересчитываем для baseline и current. Нужны standings
  // ВСЕХ возрастов на каждый момент времени.
  const allBaseline = await getAllStandingsSnapshotsAt(baselineDate);
  // Фильтр: только засчитываемые в клубный зачёт возрасты
  const filterCounted = (arr) => countedAgesSet
    ? arr.filter((s) => countedAgesSet.has(String(s.ageGroup)))
    : arr;

  let clubPosBaseline = null;
  if (allBaseline.length > 0) {
    const ranking = buildClubRanking(filterCounted(allBaseline), ourMatcher);
    clubPosBaseline = ranking?.ourClubRank || null;
  }

  // Текущий клубный зачёт — из публичного эндпоинта, но проще пересчитать здесь же
  // через loadAllStandings (но это лениво — endpoint /club-rank сделает это).
  // Чтобы не делать двойной запрос, оставляем null здесь и заполняем на уровне route
  // (route уже считает club-rank). Передаём currentClubPos в endpoint снаружи.

  return {
    leaguePos, leaguePosBaseline, leagueDelta,
    clubPosBaseline,
    baselineAt: baselineDate.toISOString(),
  };
}
