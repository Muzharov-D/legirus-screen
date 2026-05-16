// Cron-задача: напоминание о матче за 24h до старта (одно окно — базовый push).
// Тикает каждые 30 минут. Дедуп через notif_log (UNIQUE scope+scope_id).
//
// Логика:
//   1. SELECT cal.* WHERE is_our_match=TRUE
//        AND match_date BETWEEN NOW()+(W-30m) AND NOW()+(W+30m)
//        AND NOT EXISTS (SELECT 1 FROM notif_log WHERE scope=$1 AND scope_id=ext_match_id)
//   2. Для каждого матча — SELECT push_subscriptions WHERE team_id='legirus-{age}'
//        OR (team_id IS NULL AND role='head_coach')
//   3. Отправляем web push каждому подписчику, логируем в notif_log
//
// Push идёт всем подписчикам команды — включая тренера, родителей через PWA-подписки,
// игроков с авторизацией. notif_log дедуп предотвращает повторную отправку.
//
// Окна T-36h и T-6h раньше тоже стреляли — отключены по запросу: на первом шаге
// нам нужен ровно один информативный пинг — за сутки. Триггеры на lineup.published /
// coach.comment / final-score добавим отдельным шагом event-driven (см. гипотезу).

import { isPgEnabled, query } from '../db/pool.js';
import { sendToSubscription, configurePush } from './pushService.js';
import { notifyMatchKickoff, processDeferredNotifications } from './matchNotifications.js';

const WINDOWS = [
  { hours: 24, scope: 'callup-reminder-24h', label: '1 день' },
];

const TICK_MIN = 30;       // как часто запускать
const WINDOW_MIN = 30;     // ширина окна (поймать матч в [W-30m, W+30m])

function fmtMatchTitle(home, away, ourMatcher = 'Легирус') {
  const isHomeOurs = (home || '').toLowerCase().includes(ourMatcher.toLowerCase());
  const opponent = isHomeOurs ? away : home;
  return opponent || `${home} - ${away}`;
}

function fmtTime(iso) {
  if (!iso) return '';
  return new Date(iso).toLocaleString('ru-RU', {
    day: '2-digit', month: 'short',
    hour: '2-digit', minute: '2-digit',
    timeZone: 'Europe/Moscow',
  });
}

async function getSubscribersForTeam(teamId) {
  // Подписчики этой команды: legacy single team_id ИЛИ multi-team team_ids[]
  // ИЛИ head_coach без team_id (видит все команды).
  const r = await query(
    `SELECT user_id, team_id, role, endpoint, p256dh, auth
     FROM push_subscriptions
     WHERE team_id = $1
        OR team_ids @> jsonb_build_array($1::text)
        OR (team_id IS NULL AND role = 'head_coach')`,
    [teamId]);
  return r.rows.map((row) => ({
    userId: row.user_id,
    teamId: row.team_id,
    role: row.role,
    subscription: {
      endpoint: row.endpoint,
      keys: { p256dh: row.p256dh, auth: row.auth },
    },
  }));
}

async function processWindow(w) {
  // Найти upcoming наши матчи в окне
  const matches = await query(
    `SELECT cal.club_id, cal.age_group, cal.ext_match_id, cal.match_date,
            cal.home_team, cal.away_team, cal.venue, cal.tournament
     FROM calendar cal
     WHERE cal.is_our_match = TRUE
       AND cal.match_date BETWEEN NOW() + ($2::int * INTERVAL '1 hour') - ($3::int * INTERVAL '1 minute')
                              AND NOW() + ($2::int * INTERVAL '1 hour') + ($3::int * INTERVAL '1 minute')
       AND NOT EXISTS (
         SELECT 1 FROM notif_log nl
         WHERE nl.scope = $1 AND nl.scope_id = cal.ext_match_id
       )`,
    [w.scope, w.hours, WINDOW_MIN]);

  if (matches.rows.length === 0) return { matches: 0, sent: 0 };

  let totalSent = 0;
  for (const m of matches.rows) {
    const teamId = `${m.club_id}-${m.age_group}`;
    const subs = await getSubscribersForTeam(teamId);

    const opponent = fmtMatchTitle(m.home_team, m.away_team);
    const dateStr = fmtTime(m.match_date);
    const title = `Матч через ${w.label} · ${opponent}`;
    const body = `${dateStr}` + (m.venue ? `\n📍 ${m.venue}` : '');
    const url = `/public/team/${m.age_group}`;

    let sent = 0;
    let dead = [];
    for (const s of subs) {
      try {
        await sendToSubscription(s.subscription, {
          title, body, url,
          tag: `callup-${m.ext_match_id}-${w.hours}h`,
          matchId: m.ext_match_id,
        });
        sent += 1;
      } catch (e) {
        if (e.statusCode === 404 || e.statusCode === 410) {
          dead.push(s.subscription.endpoint);
        } else {
          console.error(`[notif] push fail ${w.scope} ${m.ext_match_id}:`, e.statusCode || e.message);
        }
      }
    }

    // Удаляем мёртвые подписки
    for (const ep of dead) {
      await query(`DELETE FROM push_subscriptions WHERE endpoint = $1`, [ep]);
    }

    // Лог отправки — дедуп предотвратит повторную отправку
    await query(
      `INSERT INTO notif_log (scope, scope_id, meta)
       VALUES ($1, $2, $3)
       ON CONFLICT (scope, scope_id) DO NOTHING`,
      [w.scope, m.ext_match_id,
       JSON.stringify({ teamId, sent, total: subs.length, opponent, matchDate: m.match_date })]);

    totalSent += sent;
    console.log(`[notif] ${w.scope} ${m.ext_match_id} (${opponent}) → ${sent}/${subs.length} sent` +
                (dead.length ? ` (${dead.length} expired)` : ''));
  }

  return { matches: matches.rows.length, sent: totalSent };
}

// Триггер match-kickoff: ищем наши матчи, начавшиеся за последние 30 мин.
// Дедуп выполняется внутри notifyMatchKickoff → broadcastTeam (notif_log).
async function tickKickoffs() {
  const r = await query(
    `SELECT club_id, age_group, ext_match_id, home_team, away_team
     FROM calendar
     WHERE is_our_match = TRUE
       AND match_date BETWEEN NOW() - INTERVAL '30 minutes' AND NOW()`);
  if (r.rows.length === 0) return { matches: 0 };
  let fired = 0;
  for (const m of r.rows) {
    try {
      const res = await notifyMatchKickoff({
        clubId: m.club_id, ageGroup: m.age_group, extMatchId: m.ext_match_id,
        homeTeam: m.home_team, awayTeam: m.away_team,
      });
      if (res?.sent) fired++;
    } catch (e) {
      console.error('[notif] kickoff failed:', m.ext_match_id, e.message);
    }
  }
  return { matches: r.rows.length, fired };
}

export async function tickNotifications() {
  if (!isPgEnabled()) return;
  await configurePush();
  for (const w of WINDOWS) {
    try {
      const r = await processWindow(w);
      if (r.matches > 0) console.log(`[notif] ${w.scope}: ${r.matches} matches, ${r.sent} pushes`);
    } catch (e) {
      console.error(`[notif] ${w.scope} failed:`, e.message);
    }
  }

  // Kickoffs (T-0 ± 30 мин).
  try {
    const k = await tickKickoffs();
    if (k.matches > 0) console.log(`[notif] match-kickoff: ${k.matches} matches, ${k.fired} fired`);
  } catch (e) {
    console.error('[notif] kickoff tick failed:', e.message);
  }

  // Очередь отложенных пушей (тихие часы 23:00–08:00).
  try {
    const d = await processDeferredNotifications();
    if (d.processed > 0) console.log(`[notif] deferred processed: ${d.processed}`);
  } catch (e) {
    console.error('[notif] deferred tick failed:', e.message);
  }
}

let timer = null;
export function startNotifCron() {
  if (timer) return;
  // Первый запуск — через 60 секунд после старта (чтобы PG-pool успел подняться + cron календаря отработал)
  setTimeout(() => tickNotifications().catch((e) => console.error('[notif] tick failed:', e.message)), 60_000);
  timer = setInterval(() => tickNotifications().catch((e) => console.error('[notif] tick failed:', e.message)),
                       TICK_MIN * 60_000);
  console.log(`[notif] cron started, tick every ${TICK_MIN} min`);
}
export function stopNotifCron() { if (timer) clearInterval(timer); timer = null; }
