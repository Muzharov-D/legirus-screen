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

function nrm(s) { return String(s || '').toLowerCase().replace(/\s+/g, ' ').trim(); }

function findVenue(mv, venues) {
  if (!mv) return null;
  const k = nrm(mv);
  for (const v of venues) {
    const vn = nrm(v.name);
    if (k === vn || k.startsWith(vn) || k.includes(vn)) return v;
  }
  return null;
}

function esc(s) {
  return String(s || '').replace(/\\/g, '\\\\').replace(/;/g, '\\;').replace(/,/g, '\\,').replace(/\r?\n/g, '\\n');
}

function fold(line) {
  const buf = Buffer.from(line, 'utf-8');
  if (buf.length <= 75) return line;
  const chunks = [];
  let i = 0, first = true;
  while (i < buf.length) {
    const lim = first ? 75 : 74;
    let end = Math.min(i + lim, buf.length);
    while (end < buf.length && (buf[end] & 0xC0) === 0x80) end--;
    chunks.push(buf.slice(i, end).toString('utf-8'));
    i = end; first = false;
  }
  return chunks.join('\r\n ');
}

function fmtDt(iso) {
  const d = new Date(iso);
  const p = (n) => String(n).padStart(2, '0');
  return d.getUTCFullYear() + p(d.getUTCMonth()+1) + p(d.getUTCDate()) + 'T' + p(d.getUTCHours()) + p(d.getUTCMinutes()) + p(d.getUTCSeconds()) + 'Z';
}

function alarms(m) {
  if (m.score) return [];
  const opp = (m.isOurMatch && m.home && m.home.toLowerCase().includes('легирус')) ? (m.away || 'соперник') : (m.home || 'соперник');
  return [
    'BEGIN:VALARM','ACTION:DISPLAY','TRIGGER:-P1D',
    fold('DESCRIPTION:' + esc('Завтра матч с ' + opp)),
    'END:VALARM',
    'BEGIN:VALARM','ACTION:DISPLAY','TRIGGER:-PT3H',
    fold('DESCRIPTION:' + esc('Через 3 часа матч · ' + (m.venue || ''))),
    'END:VALARM',
  ];
}

export function buildVEvent(m, venues, urlBase) {
  if (!m.date) return null;
  const start = new Date(m.date);
  if (isNaN(start)) return null;
  const end = new Date(start.getTime() + 5400000);
  const v = findVenue(m.venue, venues);
  const ya = v && v.lat
    ? 'https://yandex.ru/maps/?rtext=~' + v.lat + '%2C' + v.lng + '&rtt=auto'
    : (m.venue ? 'https://yandex.ru/maps/?text=' + encodeURIComponent(m.venue) : '');
  const tour = m.tournament === 'cup' ? 'Кубок' : 'Лига';
  const sum = (m.home || '?') + ' — ' + (m.away || '?');
  const sc = m.score ? ' (' + m.score.home + ':' + m.score.away + ')' : '';
  const desc = [tour + (m.group ? ' · ' + m.group : ''), sc ? 'Результат:' + sc : '', ya ? 'Маршрут: ' + ya : '', urlBase ? 'Подробнее: ' + urlBase : ''].filter(Boolean).join('\n');
  const uid = (m.matchId || (start.getTime() + '-' + (m.home || ''))) + '@avandata.legirus';
  return [
    'BEGIN:VEVENT',
    fold('UID:' + uid),
    'DTSTAMP:' + fmtDt(new Date().toISOString()),
    'DTSTART:' + fmtDt(m.date),
    'DTEND:' + fmtDt(end.toISOString()),
    fold('SUMMARY:' + esc(sum + sc)),
    m.venue ? fold('LOCATION:' + esc(m.venue)) : '',
    fold('DESCRIPTION:' + esc(desc)),
    ya ? fold('URL:' + ya) : '',
    ...alarms(m),
    'END:VEVENT',
  ].filter(Boolean).join('\r\n');
}

export function buildVCalendar(events, name) {
  return [
    'BEGIN:VCALENDAR','VERSION:2.0','PRODID:-//AvanData//Legirus//RU','CALSCALE:GREGORIAN','METHOD:PUBLISH',
    fold('X-WR-CALNAME:' + esc(name || 'АванDата')),
    'X-WR-TIMEZONE:Europe/Moscow',
    ...events,
    'END:VCALENDAR',
  ].join('\r\n');
}
