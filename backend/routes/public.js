// Публичные read-only эндпоинты — без auth, для родителей и болельщиков.
// Возвращают только sanitized данные команды (расписание, результаты, без личной статистики).

import express from 'express';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { loadCalendar, loadStandings } from '../services/dataLoader.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const VENUES_PATH = path.resolve(__dirname, '..', 'data', 'venues.json');

const router = express.Router();

// Справочник стадионов с координатами для маршрутов в Я.Картах.
// GET /api/public/venues
router.get('/venues', (_req, res) => {
  try {
    if (!fs.existsSync(VENUES_PATH)) return res.json({ venues: [] });
    const data = JSON.parse(fs.readFileSync(VENUES_PATH, 'utf-8'));
    res.json(data);
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// === iCal feed (subscription для iOS/Android/Google Calendar) ===
//
// GET /api/public/calendar/:age.ics — весь сезон команды как подписка.
// Юзер один раз добавляет URL в календарь и получает автообновление.
//
// GET /api/public/match/:age/:matchId.ics — single-event для одного матча.

function loadVenues() {
  if (!fs.existsSync(VENUES_PATH)) return [];
  try { return (JSON.parse(fs.readFileSync(VENUES_PATH, 'utf-8')).venues) || []; }
  catch { return []; }
}

function nrmName(s) {
  return String(s || '').toLowerCase().replace(/\s+/g, ' ').trim();
}

function findVenue(matchVenue, venues) {
  if (!matchVenue) return null;
  const key = nrmName(matchVenue);
  for (const v of venues) {
    const vn = nrmName(v.name);
    if (key === vn || key.startsWith(vn) || key.includes(vn)) return v;
  }
  return null;
}

// ICS форматирование требует CRLF и эскейпа спецсимволов.
function icsEscape(s) {
  return String(s || '')
    .replace(/\\/g, '\\\\')
    .replace(/;/g, '\\;')
    .replace(/,/g, '\\,')
    .replace(/\r?\n/g, '\\n');
}

function fmtIcsDate(iso) {
  // 2026-05-11T11:45:00.000Z → 20260511T114500Z
  const d = new Date(iso);
  const pad = (n) => String(n).padStart(2, '0');
  return d.getUTCFullYear() + pad(d.getUTCMonth() + 1) + pad(d.getUTCDate())
    + 'T' + pad(d.getUTCHours()) + pad(d.getUTCMinutes()) + pad(d.getUTCSeconds()) + 'Z';
}

function buildVEvent(match, venues, urlBase) {
  if (!match.date) return null;
  const start = new Date(match.date);
  if (isNaN(start)) return null;
  // Длительность матча — 1.5 часа (90 минут активной игры + разогрев/орг)
  const end = new Date(start.getTime() + 90 * 60 * 1000);

  const v = findVenue(match.venue, venues);
  const yandexUrl = v && v.lat
    ? 'https://yandex.ru/maps/?rtext=~' + v.lat + '%2C' + v.lng + '&rtt=auto'
    : (match.venue ? 'https://yandex.ru/maps/?text=' + encodeURIComponent(match.venue) : '');

  const tournament = match.tournament === 'cup' ? 'Кубок' : 'Лига';
  const summary = (match.home || '?') + ' — ' + (match.away || '?');
  const score = match.score ? ' (' + match.score.home + ':' + match.score.away + ')' : '';

  const descLines = [
    tournament + (match.group ? ' · ' + match.group : ''),
    score ? 'Результат:' + score : '',
    yandexUrl ? 'Маршрут: ' + yandexUrl : '',
    urlBase ? 'Подробнее: ' + urlBase : '',
  ].filter(Boolean);

  const uid = (match.matchId || (start.getTime() + '-' + (match.home || ''))) + '@avandata.legirus';

  return [
    'BEGIN:VEVENT',
    'UID:' + uid,
    'DTSTAMP:' + fmtIcsDate(new Date().toISOString()),
    'DTSTART:' + fmtIcsDate(match.date),
    'DTEND:' + fmtIcsDate(end.toISOString()),
    'SUMMARY:' + icsEscape(summary + score),
    match.venue ? 'LOCATION:' + icsEscape(match.venue) : '',
    'DESCRIPTION:' + icsEscape(descLines.join('\n')),
    yandexUrl ? 'URL:' + yandexUrl : '',
  ].filter(Boolean).join('\r\n');
}

function buildVCalendar(events, calName) {
  return [
    'BEGIN:VCALENDAR',
    'VERSION:2.0',
    'PRODID:-//AvanData//Legirus//RU',
    'CALSCALE:GREGORIAN',
    'METHOD:PUBLISH',
    'X-WR-CALNAME:' + icsEscape(calName || 'АванDата · Легирус'),
    'X-WR-TIMEZONE:Europe/Moscow',
    ...events,
    'END:VCALENDAR',
  ].join('\r\n');
}

// Весь сезон команды
router.get('/calendar/:age.ics', (req, res) => {
  try {
    const age = req.params.age;
    const data = loadCalendar(age);
    if (!data) return res.status(404).type('text/plain').send('Calendar not found');

    const venues = loadVenues();
    // Только наши матчи
    const ourMatches = (data.matches || []).filter((m) => m.isOurMatch);
    const urlBase = (req.protocol + '://' + req.get('host') + '/public/team/' + age);
    const events = ourMatches.map((m) => buildVEvent(m, venues, urlBase)).filter(Boolean);

    const ics = buildVCalendar(events, 'АванDата · Легирус ' + age);
    res
      .setHeader('Content-Type', 'text/calendar; charset=utf-8')
      .setHeader('Content-Disposition', 'inline; filename="legirus-' + age + '.ics"')
      .setHeader('Cache-Control', 'public, max-age=3600')
      .send(ics);
  } catch (e) {
    res.status(500).type('text/plain').send(e.message);
  }
});

// Один матч — для скачивания в календарь
router.get('/match/:age/:matchId.ics', (req, res) => {
  try {
    const data = loadCalendar(req.params.age);
    if (!data) return res.status(404).type('text/plain').send('Calendar not found');
    const match = (data.matches || []).find((m) => m.matchId === req.params.matchId);
    if (!match) return res.status(404).type('text/plain').send('Match not found');

    const venues = loadVenues();
    const urlBase = (req.protocol + '://' + req.get('host') + '/public/team/' + req.params.age);
    const event = buildVEvent(match, venues, urlBase);
    if (!event) return res.status(400).type('text/plain').send('No date');

    const ics = buildVCalendar([event], 'АванDата · ' + (match.home || '?'));
    res
      .setHeader('Content-Type', 'text/calendar; charset=utf-8')
      .setHeader('Content-Disposition', 'attachment; filename="match-' + req.params.matchId + '.ics"')
      .send(ics);
  } catch (e) {
    res.status(500).type('text/plain').send(e.message);
  }
});

// Публичный календарь возрастной группы.
// GET /api/public/calendar/:age
router.get('/calendar/:age', (req, res) => {
  try {
    const data = loadCalendar(req.params.age);
    if (!data) return res.status(404).json({ error: `Календарь для ${req.params.age} ещё не загружен` });
    res.json(data);
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// Публичная турнирная таблица — для отображения позиции команды.
// GET /api/public/standings/:age
router.get('/standings/:age', (req, res) => {
  try {
    const data = loadStandings(req.params.age);
    if (!data) return res.status(404).json({ error: `Таблица для ${req.params.age} не загружена` });
    res.json(data);
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

export default router;
