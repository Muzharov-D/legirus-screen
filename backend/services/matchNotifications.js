// Event-driven push для матчей.
//
// Каждый «kind» нотификации — отдельный scope в notif_log. UNIQUE(scope, scope_id)
// автоматически защищает от повторной отправки.
//
// Kinds:
//   match-reminder-24h     — за сутки до матча (notifCron.js)
//   match-lineup-published — состав опубликован в FFSPB
//   match-events-first     — судья начал заполнять протокол
//   match-final            — финальный счёт появился
//   match-coach-comment    — тренер написал комментарий после матча
//   match-kickoff          — матч стартовал (T-0)
//
// Адресация: team_id = '{club_id}-{age_group}' + head_coach без team_id.
//
// Тихие часы (23:00–08:00 МСК): если попадаем в окно — кладём в notif_deferred
// и cron в notifCron.js разошлёт после 08:00.
//
// Rate-limit: max 5 пушей на endpoint за последние 24ч. Превышено → endpoint
// пропускается (без падения отправки другим).
//
// User opt-out: push_subscriptions.prefs JSONB, ключ = kind, значение false → пропуск.

import { isPgEnabled, query } from '../db/pool.js';
import { sendToSubscription, configurePush } from './pushService.js';

const URL_BASE = '/public/team/';
const QUIET_START_HOUR_MSK = 23; // 23:00 МСК — старт тишины
const QUIET_END_HOUR_MSK = 8;    // 08:00 МСК — конец тишины
const RATE_LIMIT_PER_24H = 5;

// === Time helpers (Europe/Moscow) ===

function mskHourNow() {
  // toLocaleString с timeZone — кросс-OS способ узнать час МСК без зависимостей.
  return Number(new Date().toLocaleString('en-US', { timeZone: 'Europe/Moscow', hour: '2-digit', hour12: false }).split(',').pop().trim().slice(0, 2));
}

function isQuietHours() {
  const h = mskHourNow();
  // 23 <= h || h < 8 → ночь
  return h >= QUIET_START_HOUR_MSK || h < QUIET_END_HOUR_MSK;
}

// Ближайшие 08:00 МСК. Если сейчас 02:00 → сегодня в 08:00. Если 23:30 → завтра в 08:00.
function nextDeliverableTime() {
  const nowMsk = new Date(new Date().toLocaleString('en-US', { timeZone: 'Europe/Moscow' }));
  const target = new Date(nowMsk);
  target.setHours(QUIET_END_HOUR_MSK, 0, 0, 0);
  if (nowMsk.getHours() >= QUIET_END_HOUR_MSK) {
    target.setDate(target.getDate() + 1);
  }
  // Возвращаем как ISO в UTC — PG приведёт к TIMESTAMPTZ
  const offsetMs = target.getTime() - nowMsk.getTime();
  return new Date(Date.now() + offsetMs);
}

// === DB helpers ===

async function getSubscribersForTeam(teamId) {
  const r = await query(
    `SELECT user_id, team_id, role, endpoint, p256dh, auth, prefs
     FROM push_subscriptions
     WHERE team_id = $1 OR (team_id IS NULL AND role = 'head_coach')`,
    [teamId]);
  return r.rows.map((row) => ({
    userId: row.user_id, teamId: row.team_id, role: row.role,
    prefs: row.prefs || {},
    subscription: { endpoint: row.endpoint, keys: { p256dh: row.p256dh, auth: row.auth } },
  }));
}

async function reserveOrSkip(scope, scopeId, meta = {}) {
  const r = await query(
    `INSERT INTO notif_log (scope, scope_id, meta)
     VALUES ($1, $2, $3::jsonb)
     ON CONFLICT (scope, scope_id) DO NOTHING
     RETURNING id`,
    [scope, scopeId, JSON.stringify(meta)]);
  return r.rowCount > 0;
}

async function deferNotification(scope, scopeId, teamId, payload) {
  const deliverAt = nextDeliverableTime();
  await query(
    `INSERT INTO notif_deferred (scope, scope_id, team_id, payload, deliver_at)
     VALUES ($1, $2, $3, $4::jsonb, $5)
     ON CONFLICT (scope, scope_id) DO UPDATE SET
       team_id    = EXCLUDED.team_id,
       payload    = EXCLUDED.payload,
       deliver_at = EXCLUDED.deliver_at`,
    [scope, scopeId, teamId, JSON.stringify(payload), deliverAt]);
  return { skipped: 'deferred-quiet-hours', deliverAt: deliverAt.toISOString() };
}

async function isRateLimited(endpoint) {
  const r = await query(
    `SELECT COUNT(*)::int AS cnt FROM notif_recipient_log
     WHERE endpoint = $1 AND sent_at > NOW() - INTERVAL '24 hours'`,
    [endpoint]);
  return (r.rows[0]?.cnt || 0) >= RATE_LIMIT_PER_24H;
}

async function logRecipientSent(endpoint, scope, scopeId) {
  await query(
    `INSERT INTO notif_recipient_log (endpoint, scope, scope_id) VALUES ($1, $2, $3)`,
    [endpoint, scope, scopeId]);
}

function isPrefOptedOut(prefs, kind) {
  // Дефолт — true (присылать). Только явный false выключает.
  return prefs && prefs[kind] === false;
}

// === Core broadcast ===
//
// kind  — короткий идентификатор kind (для prefs-фильтра, обычно совпадает со scope без префикса).
// scope — '{kind}' (используем как ключ дедупа в notif_log).
// scopeId — обычно extMatchId.

export async function broadcastTeam(scope, scopeId, teamId, payload, { kind = scope } = {}) {
  if (!isPgEnabled()) return { skipped: 'no-pg' };

  // 1) Уже отправляли?
  const checkLog = await query(`SELECT 1 FROM notif_log WHERE scope=$1 AND scope_id=$2`, [scope, scopeId]);
  if (checkLog.rowCount > 0) return { skipped: 'already-sent' };

  // 2) Тихие часы — кладём в очередь.
  if (isQuietHours()) {
    return deferNotification(scope, scopeId, teamId, { ...payload, _kind: kind });
  }

  // 3) Резервируем дедуп-запись (атомарно). Если кто-то параллельно успел — выходим.
  const reserved = await reserveOrSkip(scope, scopeId, { teamId, kind });
  if (!reserved) return { skipped: 'already-sent' };

  await configurePush();
  const subs = await getSubscribersForTeam(teamId);
  if (subs.length === 0) return { sent: 0, total: 0 };

  let sent = 0, optedOut = 0, rateLimited = 0;
  const dead = [];

  for (const s of subs) {
    if (isPrefOptedOut(s.prefs, kind)) { optedOut++; continue; }
    if (await isRateLimited(s.subscription.endpoint)) { rateLimited++; continue; }
    try {
      await sendToSubscription(s.subscription, payload);
      await logRecipientSent(s.subscription.endpoint, scope, scopeId);
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
              (optedOut ? ` (opt-out:${optedOut})` : '') +
              (rateLimited ? ` (rate-limit:${rateLimited})` : '') +
              (dead.length ? ` (expired:${dead.length})` : ''));
  return { sent, total: subs.length, optedOut, rateLimited, dead: dead.length };
}

// === Утилиты для имён ===

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

export async function notifyLineupPublished({ clubId, ageGroup, extMatchId, homeTeam, awayTeam, matchDate }) {
  const opp = getOpponent(homeTeam, awayTeam);
  const when = fmtKickoff(matchDate);
  return broadcastTeam('match-lineup-published', extMatchId, teamIdOf(clubId, ageGroup), {
    title: `Состав на матч · ${opp}`,
    body: when ? `Опубликован состав. Начало ${when}.` : 'Опубликован состав на матч.',
    url: `${URL_BASE}${ageGroup}`,
    tag: `lineup-${extMatchId}`,
    matchId: extMatchId,
  }, { kind: 'match-lineup-published' });
}

export async function notifyEventsFirst({ clubId, ageGroup, extMatchId, homeTeam, awayTeam, eventsCount }) {
  const opp = getOpponent(homeTeam, awayTeam);
  return broadcastTeam('match-events-first', extMatchId, teamIdOf(clubId, ageGroup), {
    title: `Протокол матча · ${opp}`,
    body: `Появились детали матча${eventsCount ? ` (${eventsCount} событий)` : ''}. Открой, чтобы посмотреть.`,
    url: `${URL_BASE}${ageGroup}`,
    tag: `events-${extMatchId}`,
    matchId: extMatchId,
  }, { kind: 'match-events-first' });
}

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
  }, { kind: 'match-final' });
}

export async function notifyCoachComment({ clubId, ageGroup, extMatchId, homeTeam, awayTeam, excerpt }) {
  const opp = getOpponent(homeTeam, awayTeam);
  const body = (excerpt || '').trim();
  return broadcastTeam('match-coach-comment', extMatchId, teamIdOf(clubId, ageGroup), {
    title: `Комментарий тренера · ${opp}`,
    body: body ? body.slice(0, 140) + (body.length > 140 ? '…' : '') : 'Тренер написал разбор матча.',
    url: `${URL_BASE}${ageGroup}`,
    tag: `comment-${extMatchId}`,
    matchId: extMatchId,
  }, { kind: 'match-coach-comment' });
}

export async function notifyMatchKickoff({ clubId, ageGroup, extMatchId, homeTeam, awayTeam }) {
  const opp = getOpponent(homeTeam, awayTeam);
  return broadcastTeam('match-kickoff', extMatchId, teamIdOf(clubId, ageGroup), {
    title: `Начало матча · ${opp}`,
    body: 'Стартовал. Следим за протоколом.',
    url: `${URL_BASE}${ageGroup}`,
    tag: `kickoff-${extMatchId}`,
    matchId: extMatchId,
  }, { kind: 'match-kickoff' });
}

// === Обработка отложенной очереди (вызывается из notifCron.js) ===
//
// Идём по notif_deferred где deliver_at <= NOW(); для каждой записи:
//   - Резервируем notif_log (если кто-то параллельно успел — пропускаем).
//   - Шлём с применением opt-out + rate-limit per recipient.
//   - Удаляем запись из notif_deferred.
export async function processDeferredNotifications() {
  if (!isPgEnabled()) return { processed: 0 };
  // Если сейчас всё ещё тихие часы — не шлём.
  if (isQuietHours()) return { processed: 0, skipped: 'still-quiet' };

  const r = await query(
    `SELECT scope, scope_id, team_id, payload
     FROM notif_deferred
     WHERE deliver_at <= NOW()
     ORDER BY deliver_at ASC
     LIMIT 50`);
  if (r.rows.length === 0) return { processed: 0 };

  let processed = 0;
  for (const d of r.rows) {
    const { scope, scope_id: scopeId, team_id: teamId, payload } = d;
    const kind = payload?._kind || scope;
    delete payload._kind;

    try {
      const reserved = await reserveOrSkip(scope, scopeId, { teamId, kind, deferred: true });
      if (reserved) {
        await configurePush();
        const subs = await getSubscribersForTeam(teamId);
        for (const s of subs) {
          if (isPrefOptedOut(s.prefs, kind)) continue;
          if (await isRateLimited(s.subscription.endpoint)) continue;
          try {
            await sendToSubscription(s.subscription, payload);
            await logRecipientSent(s.subscription.endpoint, scope, scopeId);
          } catch (e) {
            if (e.statusCode === 404 || e.statusCode === 410) {
              await query(`DELETE FROM push_subscriptions WHERE endpoint = $1`, [s.subscription.endpoint]);
            }
          }
        }
        console.log(`[notify-deferred] ${scope}/${scopeId} delivered to ${teamId}`);
      }
    } finally {
      await query(`DELETE FROM notif_deferred WHERE scope = $1 AND scope_id = $2`, [scope, scopeId]);
      processed++;
    }
  }
  return { processed };
}
