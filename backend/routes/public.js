import express from 'express';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { loadCalendar, loadStandings } from '../services/dataLoader.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const VENUES_PATH = path.resolve(__dirname, '..', 'data', 'venues.json');
const FRONTEND_URL = process.env.FRONTEND_URL || 'https://legirus.sportdata.tech';

const router = express.Router();

router.get('/venues', (_req, res) => {
  try {
    if (!fs.existsSync(VENUES_PATH)) return res.json({ venues: [] });
    res.json(JSON.parse(fs.readFileSync(VENUES_PATH, 'utf-8')));
  } catch (e) { res.status(500).json({ error: e.message }); }
});

router.get('/calendar/:age', (req, res) => {
  try {
    const data = loadCalendar(req.params.age);
    if (!data) return res.status(404).json({ error: 'not found' });
    res.json(data);
  } catch (e) { res.status(500).json({ error: e.message }); }
});

router.get('/standings/:age', (req, res) => {
  try {
    const data = loadStandings(req.params.age);
    if (!data) return res.status(404).json({ error: 'not found' });
    res.json(data);
  } catch (e) { res.status(500).json({ error: e.message }); }
});

function loadVenues() {
  if (!fs.existsSync(VENUES_PATH)) return [];
  try { return JSON.parse(fs.readFileSync(VENUES_PATH, 'utf-8')).venues || []; }
  catch { return []; }
}

function nrm(s) { return String(s || '').toLowerCase().replace(/\s+/g, ' ').trim(); }

function findVenue(matchVenue, venues) {
  if (!matchVenue) return null;
  const k = nrm(matchVenue);
  for (const v of venues) {
    const vn = nrm(v.name);
    if (k === vn || k.startsWith(vn) || k.includes(vn)) return v;
  }
  return null;
}

function icsEscape(s) {
  return String(s || '')
    .replace(/\\/g, '\\\\').replace(/;/g, '\\;')
    .replace(/,/g, '\\,').replace(/\r?\n/g, '\\n');
}

// RFC 5545 line folding — max 75 octets, продолжение через CRLF + space
function foldLine(line) {
  const buf = Buffer.from(line, 'utf-8');
  if (buf.length <= 75) return line;
  const chunks = [];
  let i = 0;
  while (i < buf.length) {
    let end = Math.min(i + 75, buf.length);
    while (end < buf.length && (buf[end] & 0xC0) === 0x80) end--;
    chunks.push(buf.slice(i, end).toString('utf-8'));
    i = end;
  }
  return chunks.join('\r\n ');
}

function fmtIcsDate(iso) {
  const d = new Date(iso);
  const p = (n) => String(n).padStart(2, '0');
  return d.getUTCFullYear() + p(d.getUTCMonth() + 1) + p(d.getUTCDate())
    + 'T' + p(d.getUTCHours()) + p(d.getUTCMinutes()) + p(d.getUTCSeconds()) + 'Z';
}

function buildVEvent(match, venues, urlBase) {
  if (!match.date) return null;
  const start = new Date(match.date);
  if (isNaN(start)) return null;
  const end = new Date(start.getTime() + 90 * 60 * 1000);

  const v = findVenue(match.venue, venues);
  const yaUrl = v && v.lat
    ? 'https://yandex.ru/maps/?rtext=~' + v.lat + '%2C' + v.lng + '&rtt=auto'
    : (match.venue ? 'https://yandex.ru/maps/?text=' + encodeURIComponent(match.venue) : '');

  const tour = match.tournament === 'cup' ? 'Кубок' : 'Лига';
  const summary = (match.home || '?') + ' — ' + (match.away || '?');
  const score = match.score ? ' (' + match.score.home + ':' + match.score.away + ')' : '';

  const desc = [
    tour + (match.group ? ' · ' + match.group : ''),
    score ? 'Результат:' + score : '',
    yaUrl ? 'Маршрут: ' + yaUrl : '',
    urlBase ? 'Подробнее: ' + urlBase : '',
  ].filter(Boolean).join('\n');

  const uid = (match.matchId || (start.getTime() + '-' + (match.home || ''))) + '@avandata.legirus';

  return [
    'BEGIN:VEVENT',
    foldLine('UID:' + uid),
    'DTSTAMP:' + fmtIcsDate(new Date().toISOString()),
    'DTSTART:' + fmtIcsDate(match.date),
    'DTEND:' + fmtIcsDate(end.toISOString()),
    foldLine('SUMMARY:' + icsEscape(summary + score)),
    match.venue ? foldLine('LOCATION:' + icsEscape(match.venue)) : '',
    foldLine('DESCRIPTION:' + icsEscape(desc)),
    yaUrl ? foldLine('URL:' + yaUrl) : '',
    'END:VEVENT',
  ].filter(Boolean).join('\r\n');
}

function buildVCalendar(events, name) {
  return [
    'BEGIN:VCALENDAR',
    'VERSION:2.0',
    'PRODID:-//AvanData//Legirus//RU',
    'CALSCALE:GREGORIAN',
    'METHOD:PUBLISH',
    foldLine('X-WR-CALNAME:' + icsEscape(name || 'АванDата')),
    'X-WR-TIMEZONE:Europe/Moscow',
    ...events,
    'END:VCALENDAR',
  ].join('\r\n');
}

router.get('/calendar/:age.ics', (req, res) => {
  try {
    const age = req.params.age;
    const data = loadCalendar(age);
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

router.get('/match/:age/:matchId.ics', (req, res) => {
  try {
    const data = loadCalendar(req.params.age);
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