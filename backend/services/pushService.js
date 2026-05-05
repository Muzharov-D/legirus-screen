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

// Подписка пользователя.
// userId — id пользователя (из JWT), teamId — для адресации, role — head_coach/team_coach/player
// subscription — PushSubscription JSON от browser (endpoint, keys.p256dh, keys.auth)
export function saveSubscription({ userId, teamId, role, subscription }) {
  if (!subscription?.endpoint) throw new Error('subscription.endpoint обязателен');
  const data = readSubs();
  const existing = data.subscriptions.findIndex((s) => s.subscription?.endpoint === subscription.endpoint);
  const entry = {
    userId: userId || null,
    teamId: teamId || null,
    role: role || null,
    subscription,
    createdAt: existing === -1 ? new Date().toISOString() : data.subscriptions[existing].createdAt,
    updatedAt: new Date().toISOString(),
  };
  if (existing === -1) data.subscriptions.push(entry);
  else data.subscriptions[existing] = entry;
  writeSubs(data);
  return entry;
}

export function removeSubscription(endpoint) {
  if (!endpoint) return false;
  const data = readSubs();
  const before = data.subscriptions.length;
  data.subscriptions = data.subscriptions.filter((s) => s.subscription?.endpoint !== endpoint);
  if (data.subscriptions.length !== before) {
    writeSubs(data);
    return true;
  }
  return false;
}

export function listSubscriptions(filter = {}) {
  const data = readSubs();
  return data.subscriptions.filter((s) => {
    if (filter.teamId && s.teamId !== filter.teamId) return false;
    if (filter.role && s.role !== filter.role) return false;
    return true;
  });
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

  const subs = listSubscriptions(filter);
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

  for (const ep of dead) removeSubscription(ep);

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
