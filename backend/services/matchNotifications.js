// Event-driven push для матчей.
//
// Каждый «kind» нотификации — отдельный scope в notif_log. UNIQUE(scope, scope_id)
// автоматически защищает от повторной отправки: даже если cron-тик возвращается
// к тому же матчу, INSERT в notif_log на этапе резервирования вернёт rowCount=0
// и мы не пойдём в pushService.
//
// Kinds:
//   match-reminder-24h     — за сутки до матча (уже есть в notifCron.js)
//   match-lineup-published — состав опубликован в FFSPB (lineups_data: null → set)
//   match-events-first     — судья начал заполнять протокол (events_data: пусто → не пусто)
//   match-final            — финальный счёт появился (score_home: null → not null)
//   match-coach-comment    — тренер написал комментарий после матча
//
// Адресация: все kinds идут на team_id = '{club_id}-{age_group}' + head_coach без team_id.
// Совпадает с логикой notifCron.getSubscribersForTeam.

import { isPgEnabled, query } from '../db/pool.js';
import { sendToSubscription, configurePush } from './pushService.js';

const URL_BASE = '/public/team/'; // + age_group

async function getSubscribersForTeam(teamId) {
  const r = await query(
    `SELECT user_id, team_id, role, endpoint, p256dh, auth
     FROM push_subscriptions
     WHERE team_id = $1 OR (team_id IS NULL AND role = 'head_coach')`,
    [teamId]);
  return r.rows.map((row) => ({
    userId: row.user_id, teamId: row.team_id, role: row.role,
    subscription: { endpoint: row.endpoint, keys: { p256dh: row.p256dh, auth: row.auth } },
  }));
}

// Атомарное «резервирование» дедуп-ключа. Если запись уже есть — возвращает false,
// и caller не должен слать push.
async function reserveOrSkip(scope, scopeId, meta = {}) {
  const r = await query(
    `INSERT INTO notif_log (scope, scope_id, meta)
     VALUES ($1, $2, $3::jsonb)
     ON CONFLICT (scope, scope_id) DO NOTHING
     RETURNING id`,
    [scope, scopeId, JSON.stringify(meta)]);
  return r.rowCount > 0;
}

async function broadcastTeam(scope, scopeId, teamId, payload) {
  if (!isPgEnabled()) return { skipped: 'no-pg' };
  const reserved = await reserveOrSkip(scope, scopeId, { teamId, ...payload._meta });
  if (!reserved) return { skipped: 'already-sent' };

  await configurePush();
  const subs = await getSubscribersForTeam(teamId);
  if (subs.length === 0) return { sent: 0, total: 0 };

  let sent = 0;
  const dead = [];
  for (const s of subs) {
    try {
      await sendToSubscription(s.subscription, payload);
      sent++;
    } catch (e) {
      if (e.statusCode === 404 || e.statusCode === 410) {
        dead.push(s.subscription.endpoint);
      } else {
        console.error(`[notify] ${scope}/${scopeId} push fail:`, e.statusCode || e.message);
      }
    }
  }
  for (const ep of dead) {
    await query(`DELETE FROM push_subscriptions WHERE endpoint = $1`, [ep]);
  }
  console.log(`[notify] ${scope}/${scopeId} (${teamId}) → ${sent}/${subs.length}` +
              (dead.length ? ` (${dead.length} expired)` : ''));
  return { sent, total: subs.length, dead: dead.length };
}

// Кто противник: тот, в названии команды которого нет «легирус».
function getOpponent(homeTeam, awayTeam) {
  const isHomeOurs = (homeTeam || '').toLowerCase().includes('легирус');
  return isHomeOurs ? (awayTeam || '—') : (homeTeam || '—');
}

function isOurMatchHomeSide(homeTeam) {
  return (homeTeam || '').toLowerCase().includes('легирус');
}

function fmtKickoff(iso) {
  if (!iso) return '';
  return new Date(iso).toLocaleString('ru-RU', {
    day: '2-digit', month: 'short',
    hour: '2-digit', minute: '2-digit',
    timeZone: 'Europe/Moscow',
  });
}

function teamIdOf(clubId, ageGroup) {
  return `${clubId}-${ageGroup}`;
}

// === Публичные триггеры ===

// Состав на матч появился — за 24 ч / в день матча.
export async function notifyLineupPublished({ clubId, ageGroup, extMatchId, homeTeam, awayTeam, matchDate }) {
  const opp = getOpponent(homeTeam, awayTeam);
  const when = fmtKickoff(matchDate);
  return broadcastTeam('match-lineup-published', extMatchId, teamIdOf(clubId, ageGroup), {
    title: `Состав на матч · ${opp}`,
    body: when ? `Опубликован состав. Начало ${when}.` : 'Опубликован состав на матч.',
    url: `${URL_BASE}${ageGroup}`,
    tag: `lineup-${extMatchId}`,
    matchId: extMatchId,
    _meta: { kind: 'lineup-published', opp, matchDate },
  });
}

// Судья начал заполнять протокол — пошли первые события (голы/карточки).
export async function notifyEventsFirst({ clubId, ageGroup, extMatchId, homeTeam, awayTeam, eventsCount }) {
  const opp = getOpponent(homeTeam, awayTeam);
  return broadcastTeam('match-events-first', extMatchId, teamIdOf(clubId, ageGroup), {
    title: `Протокол матча · ${opp}`,
    body: `Появились детали матча${eventsCount ? ` (${eventsCount} событий)` : ''}. Открой, чтобы посмотреть.`,
    url: `${URL_BASE}${ageGroup}`,
    tag: `events-${extMatchId}`,
    matchId: extMatchId,
    _meta: { kind: 'events-first', opp, eventsCount },
  });
}

// Финальный счёт зафиксирован.
export async function notifyMatchFinal({ clubId, ageGroup, extMatchId, homeTeam, awayTeam, scoreHome, scoreAway }) {
  const opp = getOpponent(homeTeam, awayTeam);
  const homeIsUs = isOurMatchHomeSide(homeTeam);
  const usScore = homeIsUs ? scoreHome : scoreAway;
  const themScore = homeIsUs ? scoreAway : scoreHome;
  let resultWord = 'Ничья';
  if (typeof usScore === 'number' && typeof themScore === 'number') {
    if (usScore > themScore) resultWord = 'Победа';
    else if (usScore < themScore) resultWord = 'Поражение';
  }
  return broadcastTeam('match-final', extMatchId, teamIdOf(clubId, ageGroup), {
    title: `${resultWord} · ${opp}`,
    body: `Итог: ${scoreHome ?? '?'}:${scoreAway ?? '?'}`,
    url: `${URL_BASE}${ageGroup}`,
    tag: `final-${extMatchId}`,
    matchId: extMatchId,
    _meta: { kind: 'final', opp, scoreHome, scoreAway, result: resultWord },
  });
}

// Тренер написал/обновил комментарий к матчу.
export async function notifyCoachComment({ clubId, ageGroup, extMatchId, homeTeam, awayTeam, excerpt }) {
  const opp = getOpponent(homeTeam, awayTeam);
  const body = (excerpt || '').trim();
  return broadcastTeam('match-coach-comment', extMatchId, teamIdOf(clubId, ageGroup), {
    title: `Комментарий тренера · ${opp}`,
    body: body ? body.slice(0, 140) + (body.length > 140 ? '…' : '') : 'Тренер написал разбор матча.',
    url: `${URL_BASE}${ageGroup}`,
    tag: `comment-${extMatchId}`,
    matchId: extMatchId,
    _meta: { kind: 'coach-comment', opp, len: body.length },
  });
}
