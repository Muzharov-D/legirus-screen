// Web Push сервис для PWA уведомлений.
// Хранилище подписок — backend/data/push-subscriptions.json
// Зависимость: web-push (требует `npm install web-push` в backend/)
//
// VAPID-ключи в env:
//   VAPID_PUBLIC_KEY  — отдаём frontend через /api/push/public-key
//   VAPID_PRIVATE_KEY — приватный, только бэк
//   VAPID_SUBJECT     — mailto:owner@domain или https://domain
//
// Если ключей нет, сервис работает в no-op режиме (логирует и не падает),
// чтобы dev/демо без Web Push не валились.

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { isPgEnabled, query } from '../db/pool.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const DATA_DIR = path.resolve(__dirname, '..', 'data');
const SUBS_PATH = path.join(DATA_DIR, 'push-subscriptions.json');

let webpush = null;
let configured = false;

async function getWebpush() {
  if (webpush) return webpush;
  try {
    const mod = await import('web-push');
    webpush = mod.default || mod;
    return webpush;
  } catch (e) {
    console.warn('[push] web-push не установлен — push отключён. Установите: npm install web-push');
    return null;
  }
}

export async function configurePush() {
  if (configured) return;
  const pub = process.env.VAPID_PUBLIC_KEY;
  const priv = process.env.VAPID_PRIVATE_KEY;
  const subj = process.env.VAPID_SUBJECT || 'mailto:admin@avandata.local';

  if (!pub || !priv) {
    console.warn('[push] VAPID_PUBLIC_KEY/VAPID_PRIVATE_KEY не заданы — push в no-op режиме');
    return;
  }
  const wp = await getWebpush();
  if (!wp) return;
  try {
    wp.setVapidDetails(subj, pub, priv);
    configured = true;
    console.log('[push] VAPID настроен, подписки активны');
  } catch (e) {
    console.error('[push] Ошибка настройки VAPID:', e.message);
  }
}

export function getPublicKey() {
  return process.env.VAPID_PUBLIC_KEY || null;
}

function readSubs() {
  if (!fs.existsSync(SUBS_PATH)) return { subscriptions: [] };
  try {
    return JSON.parse(fs.readFileSync(SUBS_PATH, 'utf-8'));
  } catch {
    return { subscriptions: [] };
  }
}

function writeSubs(data) {
  if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR, { recursive: true });
  fs.writeFileSync(SUBS_PATH, JSON.stringify(data, null, 2), 'utf-8');
}

// === Подписки. PG-aware: если есть DATABASE_URL — пишем/читаем в push_subscriptions,
// иначе fallback на JSON-файл backend/data/push-subscriptions.json. ===

function rowToEntry(r) {
  return {
    userId: r.user_id, teamId: r.team_id, role: r.role,
    subscription: { endpoint: r.endpoint, keys: { p256dh: r.p256dh, auth: r.auth } },
    createdAt: r.created_at instanceof Date ? r.created_at.toISOString() : r.created_at,
    updatedAt: r.updated_at instanceof Date ? r.updated_at.toISOString() : r.updated_at,
  };
}

// userId / teamId / role / subscription{endpoint, keys.p256dh, keys.auth}
export async function saveSubscription({ userId, teamId, role, subscription }) {
  if (!subscription?.endpoint) throw new Error('subscription.endpoint обязателен');

  if (isPgEnabled()) {
    const r = await query(
      `INSERT INTO push_subscriptions (user_id, team_id, role, endpoint, p256dh, auth, created_at, updated_at)
       VALUES ($1,$2,$3,$4,$5,$6,NOW(),NOW())
       ON CONFLICT (endpoint) DO UPDATE SET
         user_id = EXCLUDED.user_id, team_id = EXCLUDED.team_id, role = EXCLUDED.role,
         p256dh = EXCLUDED.p256dh, auth = EXCLUDED.auth, updated_at = NOW()
       RETURNING *`,
      [userId || null, teamId || null, role || null,
       subscription.endpoint, subscription.keys?.p256dh || null, subscription.keys?.auth || null]);
    return rowToEntry(r.rows[0]);
  }

  // JSON fallback
  const data = readSubs();
  const existing = data.subscriptions.findIndex((s) => s.subscription?.endpoint === subscription.endpoint);
  const entry = {
    userId: userId || null, teamId: teamId || null, role: role || null, subscription,
    createdAt: existing === -1 ? new Date().toISOString() : data.subscriptions[existing].createdAt,
    updatedAt: new Date().toISOString(),
  };
  if (existing === -1) data.subscriptions.push(entry);
  else data.subscriptions[existing] = entry;
  writeSubs(data);
  return entry;
}

export async function removeSubscription(endpoint) {
  if (!endpoint) return false;
  if (isPgEnabled()) {
    const r = await query(`DELETE FROM push_subscriptions WHERE endpoint = $1`, [endpoint]);
    return (r.rowCount || 0) > 0;
  }
  const data = readSubs();
  const before = data.subscriptions.length;
  data.subscriptions = data.subscriptions.filter((s) => s.subscription?.endpoint !== endpoint);
  if (data.subscriptions.length !== before) {
    writeSubs(data);
    return true;
  }
  return false;
}

// filter: { teamId, role, userIds: [user_id1, ...] }
export async function listSubscriptions(filter = {}) {
  if (isPgEnabled()) {
    const params = [];
    const conds = [];
    if (filter.teamId) {
      params.push(filter.teamId);
      // teamId или null + role='head_coach' (главтренер видит все команды)
      conds.push(`(team_id = $${params.length} OR (team_id IS NULL AND role = 'head_coach'))`);
    }
    if (filter.role) {
      params.push(filter.role);
      conds.push(`role = $${params.length}`);
    }
    if (Array.isArray(filter.userIds) && filter.userIds.length > 0) {
      params.push(filter.userIds);
      conds.push(`user_id = ANY($${params.length})`);
    }
    const where = conds.length ? `WHERE ${conds.join(' AND ')}` : '';
    const r = await query(
      `SELECT user_id, team_id, role, endpoint, p256dh, auth, created_at, updated_at
       FROM push_subscriptions ${where}`,
      params);
    return r.rows.map(rowToEntry);
  }
  // JSON fallback
  const data = readSubs();
  return data.subscriptions.filter((s) => {
    if (filter.teamId && s.teamId !== filter.teamId) return false;
    if (filter.role && s.role !== filter.role) return false;
    if (Array.isArray(filter.userIds) && filter.userIds.length > 0
        && !filter.userIds.includes(s.userId)) return false;
    return true;
  });
}

// Низкоуровневая отправка одному subscription'у. Не выкидывает мёртвые — caller сам решает.
// Используется notifCron.js, где подписки берутся из PG, а мёртвые удаляются прямо там.
// Бросает исключение с statusCode (для 404/410 caller'ы делают cleanup).
export async function sendToSubscription(subscription, payload) {
  await configurePush();
  if (!configured) {
    console.log('[push] no-op send to subscription:', payload.title);
    return { sent: 0, skipped: 'not-configured' };
  }
  const wp = await getWebpush();
  if (!wp) return { sent: 0, skipped: 'no-webpush' };

  const body = JSON.stringify({
    title: payload.title || 'АванDата',
    body: payload.body || '',
    url: payload.url || '/',
    icon: payload.icon || '/icons/icon-192.png',
    badge: '/icons/icon-192.png',
    tag: payload.tag || 'avandata',
    data: { matchId: payload.matchId || null, url: payload.url || '/' },
  });
  await wp.sendNotification(subscription, body);
  return { sent: 1 };
}

// Отправка нотификации.
// payload: { title, body, url?, icon?, tag?, matchId? }
// filter:  { teamId?, role? }
export async function sendNotification(payload, filter = {}) {
  await configurePush();
  if (!configured) {
    console.log('[push] no-op send:', payload.title, '->', filter);
    return { sent: 0, failed: 0, skipped: 'not-configured' };
  }
  const wp = await getWebpush();
  if (!wp) return { sent: 0, failed: 0, skipped: 'no-webpush' };

  const subs = await listSubscriptions(filter);
  if (subs.length === 0) return { sent: 0, failed: 0 };

  const body = JSON.stringify({
    title: payload.title || 'АванDата',
    body: payload.body || '',
    url: payload.url || '/',
    icon: payload.icon || '/icons/icon-192.png',
    badge: '/icons/icon-192.png',
    tag: payload.tag || 'avandata',
    data: { matchId: payload.matchId || null, url: payload.url || '/' },
  });

  let sent = 0;
  let failed = 0;
  const dead = [];

  await Promise.all(subs.map(async (s) => {
    try {
      await wp.sendNotification(s.subscription, body);
      sent++;
    } catch (e) {
      failed++;
      // 410 / 404 — подписка протухла, выкидываем
      if (e.statusCode === 404 || e.statusCode === 410) {
        dead.push(s.subscription.endpoint);
      } else {
        console.error('[push] ошибка отправки:', e.statusCode, e.body || e.message);
      }
    }
  }));

  for (const ep of dead) await removeSubscription(ep);

  return { sent, failed, expired: dead.length };
}

// Хелпер для уведомления о новом разобранном матче.
// match — entry из matches.json (id, date, teamId, homeTeamName, awayTeamName, score)
export async function notifyMatchProcessed(match) {
  if (!match) return;
  const opponent = match.awayTeamName || match.homeTeamName || 'соперник';
  const dateStr = match.date
    ? new Date(match.date).toLocaleDateString('ru-RU', { day: '2-digit', month: '2-digit' })
    : '';
  const title = 'Новый разбор матча';
  const body = dateStr ? `Разобран матч ${dateStr} vs ${opponent}` : `Разобран матч vs ${opponent}`;
  const url = `/matches/${match.id}`;

  // Шлём всем подписанным игрокам/тренерам этой команды
  return sendNotification(
    { title, body, url, matchId: match.id, tag: `match-${match.id}` },
    { teamId: match.teamId },
  );
}
