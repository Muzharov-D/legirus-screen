import express from 'express';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { loadCalendar, loadStandings } from '../services/dataRepo.js';
import { listTrainings } from '../services/trainingsRepo.js';
import { loadVenues, buildVEvent, buildVCalendar } from '../services/icsBuilder.js';
import { loadAllStandings, buildClubRanking } from '../services/clubRanking.js';

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
router.get('/trainings/:age([0-9]+)', async (req, res) => {
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

router.get('/calendar/:age([0-9]+)', async (req, res) => {
  try {
    const data = await loadCalendar(req.params.age);
    if (!data) return res.status(404).json({ error: 'not found' });
    // calendar обновляется на бэкенде раз в 30 мин → edge fresh 60 сек + SWR 5 мин
    cdnCache(res, 60, 300);
    res.json(data);
  } catch (e) { res.status(500).json({ error: e.message }); }
});

router.get('/standings/:age([0-9]+)', async (req, res) => {
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
router.get('/manifest/:age([0-9]+).json', (req, res) => {
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

export default router;
