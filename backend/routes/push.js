// PWA push endpoints.
// Все маршруты требуют JWT auth (mount под authenticate в server.js).

import express from 'express';
import {
  saveSubscription,
  removeSubscription,
  sendNotification,
  getPublicKey,
  listSubscriptions,
} from '../services/pushService.js';
import { isPgEnabled, query } from '../db/pool.js';

const router = express.Router();

// Доступные kinds, которыми пользователь может управлять. Ключи должны совпадать
// со scope'ами в matchNotifications.js. Эти kinds — для родительских/тренерских
// нотификаций; критические (callup-invited) НЕ выводим в UI, они always-on.
const TOGGLEABLE_KINDS = [
  'match-reminder-24h',
  'match-lineup-published',
  'match-events-first',
  'match-final',
  'match-coach-comment',
  'match-kickoff',
];

// Публичный VAPID ключ для frontend подписки.
// Не секретный — используется как applicationServerKey в PushManager.subscribe().
router.get('/public-key', (_req, res) => {
  const key = getPublicKey();
  if (!key) return res.status(503).json({ error: 'Push не настроен на сервере' });
  res.json({ publicKey: key });
});

// Сохранение подписки браузера. Тело запроса:
//   { endpoint, keys: { p256dh, auth } }  — сам PushSubscription
router.post('/subscribe', async (req, res) => {
  try {
    const subscription = req.body;
    if (!subscription?.endpoint) return res.status(400).json({ error: 'subscription.endpoint обязателен' });
    const entry = await saveSubscription({
      userId: req.user?.id || req.user?.userId || req.user?.username || null,
      teamId: req.user?.teamId || null,
      role: req.user?.role || null,
      subscription,
    });
    res.json({ ok: true, endpoint: entry.subscription.endpoint });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// Удаление подписки (когда пользователь отключил уведомления / разлогинился)
router.post('/unsubscribe', async (req, res) => {
  try {
    const endpoint = req.body?.endpoint;
    const removed = await removeSubscription(endpoint);
    res.json({ ok: removed });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// Тестовый push (только тренеры) — отправить себе или своей команде
router.post('/test', async (req, res) => {
  try {
    if (!['head_coach', 'team_coach'].includes(req.user?.role)) {
      return res.status(403).json({ error: 'Только тренеры' });
    }
    const teamId = req.body?.teamId || req.user?.teamId;
    const result = await sendNotification(
      {
        title: req.body?.title || 'АванDата · тест',
        body: req.body?.body || 'Это тестовое push-уведомление',
        url: req.body?.url || '/club',
        tag: 'test',
      },
      teamId ? { teamId } : {},
    );
    res.json({ ok: true, ...result });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// Получить prefs текущей подписки. Параметр — endpoint (browser PushSubscription).
// Возвращаем { kinds: [...], prefs: { kind: enabled, ... } }.
router.get('/preferences', async (req, res) => {
  try {
    const endpoint = req.query?.endpoint;
    if (!endpoint) return res.status(400).json({ error: 'endpoint обязателен' });
    if (!isPgEnabled()) return res.status(503).json({ error: 'Сервис временно недоступен' });
    const r = await query(
      `SELECT prefs, user_id FROM push_subscriptions WHERE endpoint = $1`,
      [endpoint]);
    if (r.rowCount === 0) return res.status(404).json({ error: 'Подписка не найдена' });
    // Проверка владения: если у подписки есть user_id, он должен совпадать с auth-user.
    const ownerId = r.rows[0].user_id;
    const authedId = req.user?.id || req.user?.userId || req.user?.username || null;
    if (ownerId && authedId && ownerId !== authedId) {
      return res.status(403).json({ error: 'Чужая подписка' });
    }
    const stored = r.rows[0].prefs || {};
    // Возвращаем дефолты (true) для kinds, которых нет в prefs.
    const prefs = {};
    for (const k of TOGGLEABLE_KINDS) prefs[k] = stored[k] !== false;
    res.json({ kinds: TOGGLEABLE_KINDS, prefs });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// Обновить prefs. Тело: { endpoint, kind, enabled } или { endpoint, prefs: { kind: bool, ... } }.
router.patch('/preferences', async (req, res) => {
  try {
    const endpoint = req.body?.endpoint;
    if (!endpoint) return res.status(400).json({ error: 'endpoint обязателен' });
    if (!isPgEnabled()) return res.status(503).json({ error: 'Сервис временно недоступен' });

    const r = await query(
      `SELECT prefs, user_id FROM push_subscriptions WHERE endpoint = $1`,
      [endpoint]);
    if (r.rowCount === 0) return res.status(404).json({ error: 'Подписка не найдена' });
    const ownerId = r.rows[0].user_id;
    const authedId = req.user?.id || req.user?.userId || req.user?.username || null;
    if (ownerId && authedId && ownerId !== authedId) {
      return res.status(403).json({ error: 'Чужая подписка' });
    }

    const cur = r.rows[0].prefs || {};
    let updated = { ...cur };
    if (req.body?.kind != null) {
      if (!TOGGLEABLE_KINDS.includes(req.body.kind)) {
        return res.status(400).json({ error: `Неизвестный kind: ${req.body.kind}` });
      }
      updated[req.body.kind] = !!req.body.enabled;
    } else if (req.body?.prefs && typeof req.body.prefs === 'object') {
      for (const [k, v] of Object.entries(req.body.prefs)) {
        if (TOGGLEABLE_KINDS.includes(k)) updated[k] = !!v;
      }
    } else {
      return res.status(400).json({ error: 'Нужно передать kind+enabled или prefs объект' });
    }

    await query(
      `UPDATE push_subscriptions SET prefs = $1::jsonb, updated_at = NOW() WHERE endpoint = $2`,
      [JSON.stringify(updated), endpoint]);
    const out = {};
    for (const k of TOGGLEABLE_KINDS) out[k] = updated[k] !== false;
    res.json({ ok: true, prefs: out });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// Список подписок (head_coach only)
router.get('/subscriptions', async (req, res) => {
  if (req.user?.role !== 'head_coach') return res.status(403).json({ error: 'Только главный тренер' });
  const subs = await listSubscriptions();
  res.json({
    count: subs.length,
    subscriptions: subs.map((s) => ({
      userId: s.userId,
      teamId: s.teamId,
      role: s.role,
      endpoint: s.subscription?.endpoint?.slice(0, 60) + '...',
      createdAt: s.createdAt,
    })),
  });
});

export default router;
