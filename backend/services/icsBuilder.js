// ICS (RFC 5545) генератор для подписки родителей на расписание команды.
// Используется в routes/public.js.

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const VENUES_PATH = path.resolve(__dirname, '..', 'data', 'venues.json');

export function loadVenues() {
  if (!fs.existsSync(VENUES_PATH)) return [];
  try { return JSON.parse(fs.readFileSync(VENUES_PATH, 'utf-8')).venues || []; }
  catch { return []; }
}

function nrm(s) {
  return String(s || '').toLowerCase().replace(/\s+/g, ' ').trim();
}

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

// RFC 5545: max 75 octets per line, continuation через CRLF + space.
// Continuation начинается с пробела (+1 octet), поэтому второй+ chunk = 74.
function foldLine(line) {
  const buf = Buffer.from(line, 'utf-8');
  if (buf.length <= 75) return line;
  const chunks = [];
  let i = 0;
  let first = true;
  while (i < buf.length) {
    const limit = first ? 75 : 74;
    let end = Math.min(i + limit, buf.length);
    while (end < buf.length && (buf[end] & 0xC0) === 0x80) end--;
    chunks.push(buf.slice(i, end).toString('utf-8'));
    i = end;
    first = false;
  }
  return chunks.join('\r\n ');
}

function fmtIcsDate(iso) {
  const d = new Date(iso);
  const p = (n) => String(n).padStart(2, '0');
  return d.getUTCFullYear() + p(d.getUTCMonth() + 1) + p(d.getUTCDate())
    + 'T' + p(d.getUTCHours()) + p(d.getUTCMinutes()) + p(d.getUTCSeconds()) + 'Z';
}

export function buildVEvent(match, venues, urlBase) {
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

export function buildVCalendar(events, name) {
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
