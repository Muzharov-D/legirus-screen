// PG-репо для match_callups (Sprint 5.B). Только PG — без JSON-фолбэка.
// Если PG недоступен, эндпоинты вернут 503.
//
// Ключи: (club_id, age_group, ext_match_id, player_id) — calendar+player.
//
// Статусы:
//   pending   — авто-добавлен (новый матч в календаре, тренер ещё не отправил callup)
//   called    — тренер отправил callup в команду
//   confirmed — игрок/родитель ответил «иду»
//   declined  — игрок/родитель ответил «не иду»
//   excused   — уважительная причина (родитель указал)

import { isPgEnabled, query } from '../db/pool.js';

const VALID_STATUS = ['pending', 'called', 'confirmed', 'declined', 'excused'];
const RESPONSE_STATUS = ['confirmed', 'declined', 'excused']; // что может проставить игрок

function ensurePg() {
  if (!isPgEnabled()) throw new Error('PG не настроен (Sprint 5 callups требуют DATABASE_URL)');
}

function rowToCallup(r) {
  return {
    id: r.id,
    clubId: r.club_id,
    ageGroup: r.age_group,
    extMatchId: r.ext_match_id,
    playerId: r.player_id,
    status: r.status,
    note: r.note,
    calledAt: r.called_at instanceof Date ? r.called_at.toISOString() : r.called_at,
    respondedAt: r.responded_at instanceof Date ? r.responded_at?.toISOString() : r.responded_at,
    byUserId: r.by_user_id,
  };
}

// === LIST по матчу (тренер видит весь призыв) ===
export async function listCallupsByMatch(clubId, ageGroup, extMatchId) {
  ensurePg();
  const r = await query(
    `SELECT c.*, p.full_name AS player_name, p.number AS player_number
     FROM match_callups c
     JOIN players p ON p.id = c.player_id
     WHERE c.club_id = $1 AND c.age_group = $2 AND c.ext_match_id = $3
     ORDER BY p.number NULLS LAST, p.full_name`,
    [clubId, ageGroup, extMatchId]);
  return r.rows.map((row) => ({
    ...rowToCallup(row),
    playerName: row.player_name,
    playerNumber: row.player_number,
  }));
}

// === LIST по игроку (player/parent видит свои предстоящие callup'ы) ===
// Возвращает только upcoming матчи (по calendar.match_date).
export async function listUpcomingCallupsForPlayer(playerId) {
  ensurePg();
  const r = await query(
    `SELECT c.*, cal.match_date, cal.home_team, cal.away_team, cal.venue, cal.tournament,
            cal.is_our_match, cal.home_shield, cal.away_shield
     FROM match_callups c
     JOIN calendar cal
       ON cal.club_id = c.club_id AND cal.age_group = c.age_group AND cal.ext_match_id = c.ext_match_id
     WHERE c.player_id = $1 AND cal.match_date >= NOW()
     ORDER BY cal.match_date ASC`,
    [playerId]);
  return r.rows.map((row) => ({
    ...rowToCallup(row),
    match: {
      date: row.match_date instanceof Date ? row.match_date.toISOString() : row.match_date,
      home: row.home_team, away: row.away_team,
      venue: row.venue, tournament: row.tournament,
      isOurMatch: row.is_our_match,
      homeShield: row.home_shield, awayShield: row.away_shield,
    },
  }));
}

// === GET один (для проверки прав/существования) ===
export async function getCallup(clubId, ageGroup, extMatchId, playerId) {
  ensurePg();
  const r = await query(
    `SELECT * FROM match_callups
     WHERE club_id = $1 AND age_group = $2 AND ext_match_id = $3 AND player_id = $4`,
    [clubId, ageGroup, extMatchId, playerId]);
  return r.rows[0] ? rowToCallup(r.rows[0]) : null;
}

// === UPSERT добавления игроков в призыв (тренер) ===
// playerIds: массив. Для каждого UPSERT строки со статусом 'called' (если уже есть pending — повышаем до called).
export async function callPlayers(clubId, ageGroup, extMatchId, playerIds, byUser) {
  ensurePg();
  if (!Array.isArray(playerIds) || playerIds.length === 0) return [];
  const rows = [];
  for (const pid of playerIds) {
    const r = await query(
      `INSERT INTO match_callups (club_id, age_group, ext_match_id, player_id, status, called_at, by_user_id)
       VALUES ($1, $2, $3, $4, 'called', NOW(), $5)
       ON CONFLICT (club_id, age_group, ext_match_id, player_id) DO UPDATE SET
         status = CASE WHEN match_callups.status = 'pending' THEN 'called' ELSE match_callups.status END,
         called_at = COALESCE(match_callups.called_at, NOW()),
         by_user_id = COALESCE(match_callups.by_user_id, EXCLUDED.by_user_id)
       RETURNING *`,
      [clubId, ageGroup, extMatchId, pid, byUser?.id || null]);
    rows.push(rowToCallup(r.rows[0]));
  }
  return rows;
}

// === Авто-создание pending для всех будущих наших матчей возраста ===
// Вызывается после refresh календаря: для каждого upcoming isOurMatch без callup'ов
// добавляем по строке pending для каждого игрока команды.
// teamId передаётся snapshot'ом teams (legirus-2010 → 2010).
// Returns { matches_seen, callups_created }.
export async function autoCreatePendingCallups(clubId, ageGroup) {
  ensurePg();

  // 1. Найти upcoming наши матчи без callup'ов
  const matchesR = await query(
    `SELECT cal.ext_match_id
     FROM calendar cal
     WHERE cal.club_id = $1 AND cal.age_group = $2
       AND cal.is_our_match = TRUE
       AND cal.match_date >= NOW()
       AND NOT EXISTS (
         SELECT 1 FROM match_callups c
         WHERE c.club_id = cal.club_id AND c.age_group = cal.age_group
           AND c.ext_match_id = cal.ext_match_id
       )`,
    [clubId, ageGroup]);

  if (matchesR.rows.length === 0) {
    return { matches_seen: 0, callups_created: 0 };
  }

  // 2. Список игроков команды (legirus-{ageGroup})
  const teamId = `${clubId}-${ageGroup}`;
  const playersR = await query(
    `SELECT id FROM players WHERE team_id = $1`, [teamId]);
  if (playersR.rows.length === 0) {
    return { matches_seen: matchesR.rows.length, callups_created: 0 };
  }

  // 3. INSERT всех (match × player) → pending
  let inserted = 0;
  for (const m of matchesR.rows) {
    for (const p of playersR.rows) {
      const r = await query(
        `INSERT INTO match_callups (club_id, age_group, ext_match_id, player_id, status)
         VALUES ($1, $2, $3, $4, 'pending')
         ON CONFLICT (club_id, age_group, ext_match_id, player_id) DO NOTHING`,
        [clubId, ageGroup, m.ext_match_id, p.id]);
      inserted += r.rowCount || 0;
    }
  }
  return { matches_seen: matchesR.rows.length, callups_created: inserted };
}

// === Ответ игрока (RSVP) ===
export async function respondCallup(clubId, ageGroup, extMatchId, playerId, status, note, byUser) {
  ensurePg();
  if (!RESPONSE_STATUS.includes(status)) throw new Error('status must be confirmed|declined|excused');
  const r = await query(
    `INSERT INTO match_callups (club_id, age_group, ext_match_id, player_id, status, responded_at, note, by_user_id)
     VALUES ($1, $2, $3, $4, $5, NOW(), $6, $7)
     ON CONFLICT (club_id, age_group, ext_match_id, player_id) DO UPDATE SET
       status = EXCLUDED.status,
       responded_at = NOW(),
       note = COALESCE(EXCLUDED.note, match_callups.note),
       by_user_id = COALESCE(EXCLUDED.by_user_id, match_callups.by_user_id)
     RETURNING *`,
    [clubId, ageGroup, extMatchId, playerId, status, note || null, byUser?.id || null]);
  return rowToCallup(r.rows[0]);
}

// === Удаление игрока из призыва (тренер) ===
export async function removeFromCallup(clubId, ageGroup, extMatchId, playerId) {
  ensurePg();
  const r = await query(
    `DELETE FROM match_callups
     WHERE club_id = $1 AND age_group = $2 AND ext_match_id = $3 AND player_id = $4`,
    [clubId, ageGroup, extMatchId, playerId]);
  if (r.rowCount === 0) throw new Error('not found');
  return true;
}

// === Bulk-call: тренер «вызвать всю команду» ===
// Все 'pending' для матча → 'called'.
export async function callAllPending(clubId, ageGroup, extMatchId, byUser) {
  ensurePg();
  const r = await query(
    `UPDATE match_callups SET status = 'called', called_at = NOW(), by_user_id = COALESCE(by_user_id, $5)
     WHERE club_id = $1 AND age_group = $2 AND ext_match_id = $3 AND status = 'pending'
     RETURNING *`,
    [clubId, ageGroup, extMatchId, null, byUser?.id || null]);
  return r.rows.map(rowToCallup);
}

// === Получить детали матча из calendar (для текста push'а) ===
export async function getMatchInfo(clubId, ageGroup, extMatchId) {
  ensurePg();
  const r = await query(
    `SELECT ext_match_id, match_date, home_team, away_team, venue, tournament, is_our_match
     FROM calendar
     WHERE club_id = $1 AND age_group = $2 AND ext_match_id = $3`,
    [clubId, ageGroup, extMatchId]);
  return r.rows[0] || null;
}

// === Список user_id игроков, у которых есть привязка в users (т.е. тех, у кого есть login) ===
export async function getUserIdsForPlayers(playerIds) {
  ensurePg();
  if (!Array.isArray(playerIds) || playerIds.length === 0) return [];
  const r = await query(
    `SELECT id, player_id FROM users WHERE player_id = ANY($1)`,
    [playerIds]);
  return r.rows.map((row) => row.id);
}

// === Сводка для матча ===
export async function callupSummary(clubId, ageGroup, extMatchId) {
  ensurePg();
  const r = await query(
    `SELECT
       COUNT(*)::int                                              AS total,
       COUNT(*) FILTER (WHERE status = 'pending')::int            AS pending,
       COUNT(*) FILTER (WHERE status = 'called')::int             AS called,
       COUNT(*) FILTER (WHERE status = 'confirmed')::int          AS confirmed,
       COUNT(*) FILTER (WHERE status = 'declined')::int           AS declined,
       COUNT(*) FILTER (WHERE status = 'excused')::int            AS excused
     FROM match_callups
     WHERE club_id = $1 AND age_group = $2 AND ext_match_id = $3`,
    [clubId, ageGroup, extMatchId]);
  return r.rows[0] || { total: 0, pending: 0, called: 0, confirmed: 0, declined: 0, excused: 0 };
}
