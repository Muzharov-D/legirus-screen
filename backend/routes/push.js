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

const router = express.Router();

// Публичный VAPID ключ для frontend подписки.
// Не секретный — используется как applicationServerKey в PushManager.subscribe().
router.get('/public-key', (_req, res) => {
  const key = getPublicKey();
  if (!key) return res.status(503).json({ error: 'Push не настроен на сервере' });
  res.json({ publicKey: key });
});

// Сохранение подписки браузера. Тело запроса:
//   { endpoint, keys: { p256dh, auth } }  — сам PushSubscription
router.post('/subscribe', (req, res) => {
  try {
    const subscription = req.body;
    if (!subscription?.endpoint) return res.status(400).json({ error: 'subscription.endpoint обязателен' });
    const entry = saveSubscription({
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
router.post('/unsubscribe', (req, res) => {
  try {
    const endpoint = req.body?.endpoint;
    const removed = removeSubscription(endpoint);
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

// Список подписок (head_coach only)
router.get('/subscriptions', (req, res) => {
  if (req.user?.role !== 'head_coach') return res.status(403).json({ error: 'Только главный тренер' });
  const subs = listSubscriptions();
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
