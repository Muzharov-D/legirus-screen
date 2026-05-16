import express from 'express';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { loadCalendar, loadStandings } from '../services/dataRepo.js';
import { listTrainings } from '../services/trainingsRepo.js';
import { loadVenues, buildVEvent, buildVCalendar } from '../services/icsBuilder.js';
import { loadAllStandings, buildClubRanking } from '../services/clubRanking.js';
import { getPublicKey, saveSubscription, removeSubscription, sendToSubscription } from '../services/pushService.js';
import { isPgEnabled, query } from '../db/pool.js';
import { getWeather, getWeatherDebugInfo } from '../services/weatherService.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const VENUES_PATH = path.resolve(__dirname, '..', 'data', 'venues.json');
const STANDINGS_CONFIG = path.resolve(__dirname, '..', 'data', 'standings', '_config.json');
const FRONTEND_URL = process.env.FRONTEND_URL || 'https://legirus.sportdata.tech';

const router = express.Router();

// Cache helper — Vercel edge кеширует ответ, браузеру всегда отдаём свежее.
// s-maxage = TTL свежего кеша; stale-while-revalidate = окно мгновенной отдачи stale
// с фоновой ревалидацией (пользователь не ждёт MISS).
//
// Flashscore-режим:
//   * cron на бэке обновляет данные раз в 30 минут
//   * edge-кеш живёт 60 секунд → данные долетают до родителя максимум через 31 минуту
//   * SWR=300 → даже если Render лагнул, отдаём последнее закешированное мгновенно
function cdnCache(res, ttlSec = 60, swrSec = 300) {
  res.setHeader('Cache-Control', `public, max-age=0, s-maxage=${ttlSec}, stale-while-revalidate=${swrSec}`);
}

router.get('/venues', (_req, res) => {
  try {
    if (!fs.existsSync(VENUES_PATH)) return res.json({ venues: [] });
    cdnCache(res, 3600, 600); // площадки меняются редко
    res.json(JSON.parse(fs.readFileSync(VENUES_PATH, 'utf-8')));
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// Публичные тренировки команды (родителям) — без личной посещаемости.
// Только future, sanitized: id, startsAt, durationMin, type, venueText, notes.
router.get('/trainings/:age([0-9-]+)', async (req, res) => {
  try {
    const teamId = `legirus-${req.params.age}`;
    const list = await listTrainings(teamId, { scope: 'upcoming', limit: 100 });
    const sanitized = list.map((t) => ({
      id: t.id,
      startsAt: t.startsAt,
      durationMin: t.durationMin,
      type: t.type,
      venueText: t.venueText,
      notes: t.notes,
    }));
    cdnCache(res, 60, 60); // тренер может править оперативно — короткий TTL
    res.json({ trainings: sanitized });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

router.get('/calendar/:age([0-9-]+)', async (req, res) => {
  try {
    const data = await loadCalendar(req.params.age);
    if (!data) return res.status(404).json({ error: 'not found' });
    // calendar обновляется на бэкенде раз в 30 мин → edge fresh 60 сек + SWR 5 мин
    cdnCache(res, 60, 300);
    res.json(data);
  } catch (e) { res.status(500).json({ error: e.message }); }
});

router.get('/standings/:age([0-9-]+)', async (req, res) => {
  try {
    const data = await loadStandings(req.params.age);
    if (!data) return res.status(404).json({ error: 'not found' });
    cdnCache(res, 60, 300);
    res.json(data);
  } catch (e) { res.status(500).json({ error: e.message }); }
});

router.get('/club-rank', async (_req, res) => {
  try {
    // Читаем конфиг клуба: matcher имени + список возрастов, идущих в клубный зачёт.
    // По требованию заказчика — новые младшие/старшие команды (2014-2016, 2008-09)
    // НЕ суммируются в общий клубный зачёт (строго).
    let matcher = 'Легирус';
    let counted = null; // null = считать ВСЕ возрасты (legacy default)
    if (fs.existsSync(STANDINGS_CONFIG)) {
      try {
        const cfg = JSON.parse(fs.readFileSync(STANDINGS_CONFIG, 'utf-8'));
        matcher = cfg.ourClubMatcher || matcher;
        if (Array.isArray(cfg.clubRankCounted) && cfg.clubRankCounted.length > 0) {
          counted = new Set(cfg.clubRankCounted.map(String));
        }
      } catch (_) {}
    }
    const all = await loadAllStandings();
    const filtered = counted
      ? all.filter((s) => counted.has(String(s.ageGroup)))
      : all;
    cdnCache(res, 60, 300);
    res.json(buildClubRanking(filtered, matcher));
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// PWA-манифест для публичной страницы команды.
// Открывается как standalone-app с start_url прямо на расписание.
router.get('/manifest/:age([0-9-]+).json', (req, res) => {
  const age = req.params.age;
  const manifest = {
    name: 'ФК Легирус ' + age + ' · Расписание',
    short_name: 'Легирус ' + age,
    description: 'Расписание матчей команды ' + age + ' г.р.',
    start_url: '/public/team/' + age,
    scope: '/public/',
    display: 'standalone',
    orientation: 'portrait',
    background_color: '#1a0606',
    theme_color: '#ef4444',
    icons: [
      { src: '/icons/icon-192.png', sizes: '192x192', type: 'image/png', purpose: 'any' },
      { src: '/icons/icon-512.png', sizes: '512x512', type: 'image/png', purpose: 'any' },
      { src: '/icons/icon-192-maskable.png', sizes: '192x192', type: 'image/png', purpose: 'maskable' },
      { src: '/icons/icon-512-maskable.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' },
      { src: '/icons/apple-touch-icon.png', sizes: '180x180', type: 'image/png' },
    ],
    lang: 'ru-RU',
  };
  res.setHeader('Content-Type', 'application/manifest+json; charset=utf-8');
  res.setHeader('Cache-Control', 'public, max-age=3600');
  res.json(manifest);
});

router.get('/calendar/:age.ics', async (req, res) => {
  try {
    const age = req.params.age;
    const data = await loadCalendar(age);
    if (!data) return res.status(404).type('text/plain').send('not found');
    const venues = loadVenues();
    const ours = (data.matches || []).filter((m) => m.isOurMatch);
    const urlBase = FRONTEND_URL.replace(/\/+$/, '') + '/public/team/' + age;
    const events = ours.map((m) => buildVEvent(m, venues, urlBase)).filter(Boolean);
    const ics = buildVCalendar(events, 'АванDата · Легирус ' + age);
    res.setHeader('Content-Type', 'text/calendar; charset=utf-8');
    res.setHeader('Content-Disposition', 'inline; filename="legirus-' + age + '.ics"');
    res.setHeader('Cache-Control', 'public, max-age=3600');
    res.send(ics);
  } catch (e) { res.status(500).type('text/plain').send(e.message); }
});

router.get('/match/:age/:matchId.ics', async (req, res) => {
  try {
    const data = await loadCalendar(req.params.age);
    if (!data) return res.status(404).type('text/plain').send('not found');
    const match = (data.matches || []).find((m) => m.matchId === req.params.matchId);
    if (!match) return res.status(404).type('text/plain').send('match not found');
    const venues = loadVenues();
    const urlBase = FRONTEND_URL.replace(/\/+$/, '') + '/public/team/' + req.params.age;
    const event = buildVEvent(match, venues, urlBase);
    if (!event) return res.status(400).type('text/plain').send('no date');
    const ics = buildVCalendar([event], 'АванDата · ' + (match.home || '?'));
    res.setHeader('Content-Type', 'text/calendar; charset=utf-8');
    res.setHeader('Content-Disposition', 'attachment; filename="match-' + req.params.matchId + '.ics"');
    res.send(ics);
  } catch (e) { res.status(500).type('text/plain').send(e.message); }
});

// Погода на момент матча через OpenWeatherMap (5-day forecast, 3h slots).
// Frontend дёргает: /api/public/weather?lat=59.93&lng=30.31&at=2026-05-20T11:00:00Z
// Кеш 30 мин на бэке (in-memory). Если ключа нет в env — 503.
// Диагностика: загружен ли ключ OpenWeatherMap. Только мета-инфа, без значения.
router.get('/weather-debug', (_req, res) => {
  res.json(getWeatherDebugInfo());
});

router.get('/weather', async (req, res) => {
  try {
    const lat = parseFloat(req.query.lat);
    const lng = parseFloat(req.query.lng);
    const at = req.query.at || null;
    if (!Number.isFinite(lat) || !Number.isFinite(lng)) {
      return res.status(400).json({ error: 'lat и lng обязательны (число)' });
    }
    const data = await getWeather(lat, lng, at);
    // getWeather теперь всегда возвращает объект — либо данные, либо { error: '...' }
    if (data && data.error) {
      // 200, чтобы фронт мог разобрать тип ошибки и показать осмысленный плейсхолдер.
      // Кешируем коротко чтобы при починке ключа быстро подхватилось.
      cdnCache(res, 60, 60);
      return res.status(200).json(data);
    }
    cdnCache(res, 1800, 3600); // 30 мин edge cache, ещё час SWR
    res.json(data);
  } catch (e) {
    console.error('[weather route]', e);
    res.status(200).json({ error: 'internal_error' });
  }
});

// ============================================================================
// PUSH (анонимный, без auth — для родителей на mobile.legirus)
// ============================================================================
//
// Зеркалит /api/push/* (которые под auth) с тем отличием, что:
// - подписка сохраняется с user_id=null, role=null;
// - в body POST /subscribe приходит ageGroup, и team_id = 'legirus-{age}'.
//   Это позволяет cron'у адресовать пуши родителям конкретной команды.
//
// Один endpoint = одна подписка (т.к. push_subscriptions UNIQUE по endpoint).
// Если родитель повторно жмёт «подписаться» на другой команде — последний
// клик меняет team_id. Для подписки на несколько команд нужна отдельная фича
// (отдельная колонка JSONB team_ids) — пока не реализовано.

const TOGGLEABLE_KINDS_PUBLIC = [
  'match-reminder-24h',
  'match-lineup-published',
  'match-events-first',
  'match-final',
  'match-coach-comment',
  'match-kickoff',
];

router.get('/push/public-key', (_req, res) => {
  const key = getPublicKey();
  if (!key) return res.status(503).json({ error: 'Push не настроен на сервере' });
  res.json({ publicKey: key });
});

router.post('/push/subscribe', async (req, res) => {
  try {
    if (!isPgEnabled()) return res.status(503).json({ error: 'Сервис временно недоступен' });
    const { ageGroup, ...subscription } = req.body || {};
    if (!subscription?.endpoint) return res.status(400).json({ error: 'subscription.endpoint обязателен' });
    const teamId = ageGroup ? `legirus-${ageGroup}` : null;

    // saveSubscription пишет/апдейтит row по endpoint. После этого ДОБАВИМ
    // teamId в массив team_ids (если ещё нет).
    const entry = await saveSubscription({
      userId: null,
      teamId, // legacy single team — last clicked wins (нужно для head_coach логики cron'а)
      role: null,
      subscription,
    });

    let teamIds = [];
    if (teamId) {
      const r = await query(
        `UPDATE push_subscriptions
            SET team_ids = CASE
              WHEN team_ids @> jsonb_build_array($1::text) THEN team_ids
              ELSE COALESCE(team_ids, '[]'::jsonb) || jsonb_build_array($1::text)
            END,
            updated_at = NOW()
          WHERE endpoint = $2
          RETURNING team_ids`,
        [teamId, subscription.endpoint]);
      teamIds = r.rows[0]?.team_ids || [];
    }

    res.json({ ok: true, endpoint: entry.subscription.endpoint, teamId, teamIds });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

router.post('/push/unsubscribe', async (req, res) => {
  try {
    const endpoint = req.body?.endpoint;
    const ageGroup = req.body?.ageGroup;
    if (!endpoint) return res.status(400).json({ error: 'endpoint обязателен' });
    if (!isPgEnabled()) return res.status(503).json({ error: 'Сервис временно недоступен' });

    // Полный unsubscribe (нет ageGroup) — удаляем весь row.
    if (!ageGroup) {
      const removed = await removeSubscription(endpoint);
      return res.json({ ok: removed, fullyUnsubscribed: removed });
    }

    // Частичный — убираем один teamId из team_ids. Если массив пустой и legacy
    // team_id тоже совпадает с удаляемым — DELETE целиком (нет смысла держать
    // пустой row).
    const teamId = `legirus-${ageGroup}`;
    const r = await query(
      `UPDATE push_subscriptions
          SET team_ids = COALESCE(team_ids, '[]'::jsonb) - $1::text,
              updated_at = NOW()
        WHERE endpoint = $2
        RETURNING team_ids, team_id`,
      [teamId, endpoint]);
    if (r.rowCount === 0) return res.status(404).json({ error: 'Подписка не найдена' });

    const remaining = r.rows[0].team_ids || [];
    const legacy = r.rows[0].team_id;
    if (remaining.length === 0 && (!legacy || legacy === teamId)) {
      const removed = await removeSubscription(endpoint);
      return res.json({ ok: true, fullyUnsubscribed: removed, teamIds: [] });
    }
    res.json({ ok: true, fullyUnsubscribed: false, teamIds: remaining });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

router.get('/push/preferences', async (req, res) => {
  try {
    const endpoint = req.query?.endpoint;
    if (!endpoint) return res.status(400).json({ error: 'endpoint обязателен' });
    if (!isPgEnabled()) return res.status(503).json({ error: 'Сервис временно недоступен' });
    const r = await query(
      `SELECT prefs, team_id, team_ids FROM push_subscriptions WHERE endpoint = $1`,
      [endpoint]);
    if (r.rowCount === 0) return res.status(404).json({ error: 'Подписка не найдена' });
    const stored = r.rows[0].prefs || {};
    const prefs = {};
    for (const k of TOGGLEABLE_KINDS_PUBLIC) prefs[k] = stored[k] !== false;
    res.json({
      kinds: TOGGLEABLE_KINDS_PUBLIC,
      prefs,
      teamId: r.rows[0].team_id,
      teamIds: r.rows[0].team_ids || [],
    });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// Тестовый push — пользователь жмёт «прислать тестовое уведомление», чтобы
// убедиться что подписка живая (SW активен, permission выдан, FCM/APNs работают).
// Anti-abuse: лимит 5/час на endpoint через простой in-memory счётчик не делаем —
// rate-limit per endpoint уже есть на уровне notif_recipient_log.
router.post('/push/test', async (req, res) => {
  try {
    const endpoint = req.body?.endpoint;
    if (!endpoint) return res.status(400).json({ error: 'endpoint обязателен' });
    if (!isPgEnabled()) return res.status(503).json({ error: 'Сервис временно недоступен' });
    const r = await query(
      `SELECT endpoint, p256dh, auth FROM push_subscriptions WHERE endpoint = $1`,
      [endpoint]);
    if (r.rowCount === 0) return res.status(404).json({ error: 'Подписка не найдена' });
    const sub = {
      endpoint: r.rows[0].endpoint,
      keys: { p256dh: r.rows[0].p256dh, auth: r.rows[0].auth },
    };
    try {
      await sendToSubscription(sub, {
        title: 'ФК Легирус · тест',
        body: 'Это тестовое уведомление. Подписка работает.',
        url: '/',
        tag: 'test-push',
      });
      return res.json({ ok: true, sent: 1 });
    } catch (e) {
      // 404/410 — endpoint протух, чистим
      if (e.statusCode === 404 || e.statusCode === 410) {
        await query(`DELETE FROM push_subscriptions WHERE endpoint = $1`, [endpoint]);
        return res.status(410).json({ error: 'Подписка протухла — пересоздайте' });
      }
      throw e;
    }
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

router.patch('/push/preferences', async (req, res) => {
  try {
    const endpoint = req.body?.endpoint;
    if (!endpoint) return res.status(400).json({ error: 'endpoint обязателен' });
    if (!isPgEnabled()) return res.status(503).json({ error: 'Сервис временно недоступен' });

    const r = await query(
      `SELECT prefs FROM push_subscriptions WHERE endpoint = $1`,
      [endpoint]);
    if (r.rowCount === 0) return res.status(404).json({ error: 'Подписка не найдена' });

    const cur = r.rows[0].prefs || {};
    let updated = { ...cur };
    if (req.body?.kind != null) {
      if (!TOGGLEABLE_KINDS_PUBLIC.includes(req.body.kind)) {
        return res.status(400).json({ error: `Неизвестный kind: ${req.body.kind}` });
      }
      updated[req.body.kind] = !!req.body.enabled;
    } else if (req.body?.prefs && typeof req.body.prefs === 'object') {
      for (const [k, v] of Object.entries(req.body.prefs)) {
        if (TOGGLEABLE_KINDS_PUBLIC.includes(k)) updated[k] = !!v;
      }
    } else {
      return res.status(400).json({ error: 'Нужно передать kind+enabled или prefs объект' });
    }

    await query(
      `UPDATE push_subscriptions SET prefs = $1::jsonb, updated_at = NOW() WHERE endpoint = $2`,
      [JSON.stringify(updated), endpoint]);
    const out = {};
    for (const k of TOGGLEABLE_KINDS_PUBLIC) out[k] = updated[k] !== false;
    res.json({ ok: true, prefs: out });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});


export default router;
