import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { invalidateCache } from './dataLoader.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const STANDINGS_DIR = path.resolve(__dirname, '..', 'data', 'standings');
const CALENDAR_DIR = path.resolve(__dirname, '..', 'data', 'calendar');
const CONFIG_PATH = path.join(STANDINGS_DIR, '_config.json');

function readConfig() {
  return JSON.parse(fs.readFileSync(CONFIG_PATH, 'utf-8'));
}

function stripTags(html) {
  return String(html || '')
    .replace(/<[^>]*>/g, '')
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/\s+/g, ' ')
    .trim();
}

function parseDate(s) {
  if (!s) return null;
  if (/^\d{4}-\d{2}-\d{2}/.test(s)) {
    const d = new Date(s);
    return isNaN(d) ? null : d.toISOString();
  }
  const m = String(s).match(/(\d{1,2})\.(\d{1,2})\.(\d{2,4})(?:[^\d]+(\d{1,2}):(\d{2}))?/);
  if (m) {
    const [, dd, mm, yy, hh, mi] = m;
    const year = yy.length === 2 ? 2000 + Number(yy) : Number(yy);
    const d = new Date(Date.UTC(year, Number(mm) - 1, Number(dd), Number(hh || 0), Number(mi || 0)));
    return isNaN(d) ? null : d.toISOString();
  }
  return null;
}

function parseScore(s) {
  if (!s) return null;
  const m = String(s).match(/(\d+)\s*[-:]\s*(\d+)/);
  if (!m) return null;
  return { home: Number(m[1]), away: Number(m[2]) };
}

function parseCalendarRowsFromHtml(html, ourClubMatcher) {
  const matches = [];
  const rowRe = /<tr\b[^>]*>([\s\S]*?)<\/tr>/gi;
  let m;
  while ((m = rowRe.exec(html)) !== null) {
    const rowHtml = m[1];
    if (!/\d{1,2}\.\d{1,2}\.20\d{2}/.test(rowHtml)) continue;

    const tdRe = /<td\b[^>]*>([\s\S]*?)<\/td>/gi;
    const cells = [];
    let tdMatch;
    while ((tdMatch = tdRe.exec(rowHtml)) !== null) cells.push(tdMatch[1]);
    if (cells.length < 5) continue;

    const dateCell = stripTags(cells[1] || '');
    const groupCell = stripTags(cells[2] || '');
    const teamsHtml = cells[3] || '';
    const scoreCell = stripTags(cells[4] || '');
    const stadiumCell = stripTags(cells[5] || '');

    const teamLinkRe = /<a\b[^>]*href="[^"]*\/team\/(\d+)[^"]*"[^>]*>([\s\S]*?)<\/a>/gi;
    const teamLinks = [];
    let tlm;
    while ((tlm = teamLinkRe.exec(teamsHtml)) !== null) {
      teamLinks.push({ teamId: tlm[1], name: stripTags(tlm[2]) });
    }
    if (teamLinks.length < 2) continue;

    const home = teamLinks[0].name;
    const away = teamLinks[1].name;
    const matchLinkMatch = teamsHtml.match(/<a\b[^>]*class="matchLink"[^>]*mid="(\d+)"/i);
    const matchId = matchLinkMatch ? matchLinkMatch[1] : null;

    const date = parseDate(dateCell);
    const score = parseScore(scoreCell);
    const matcher = String(ourClubMatcher || '').toLowerCase();
    const isOurMatch = matcher
      ? home.toLowerCase().includes(matcher) || away.toLowerCase().includes(matcher)
      : false;

    matches.push({
      matchId, date, home, away,
      homeTeamId: teamLinks[0].teamId,
      awayTeamId: teamLinks[1].teamId,
      score,
      isPast: !!score,
      isUpcoming: !score && (!date || new Date(date) >= new Date()),
      isOurMatch,
      group: groupCell || null,
      venue: stadiumCell || null,
      round: null,
    });
  }
  return matches;
}

export async function fetchAndParseCalendar(url, ourClubMatcher) {
  const res = await fetch(url, {
    headers: {
      'User-Agent': 'Mozilla/5.0 Chrome/120 Safari/537.36',
      Accept: 'text/html,application/xhtml+xml',
    },
  });
  if (!res.ok) throw new Error(`Источник ${url} вернул ${res.status}`);
  const html = await res.text();
  const matches = parseCalendarRowsFromHtml(html, ourClubMatcher);
  return {
    matches,
    parserHint: matches.length > 0 ? 'html-table' : 'fallback-empty',
    sourceUrl: url,
  };
}

function calendarUrlFor(age, cfg) {
  const explicit = cfg.calendarSources?.[age];
  if (explicit) return explicit;
  const base = cfg.sources?.[age];
  if (!base) return null;
  return base.replace(/\/$/, '') + '/calendar';
}

function normalizeForMatch(name) {
  return String(name || '')
    .toLowerCase()
    .replace(/\([^)]*\)/g, '')
    .replace(/\b(гбу до|сшор|сш|фк|фшм|№)\b/g, '')
    .replace(/[^а-яa-z0-9\- ]/gi, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function loadShieldsForAge(age) {
  const map = new Map();
  const clubShieldsPath = path.resolve(__dirname, '..', 'data', 'club-shields.json');
  if (fs.existsSync(clubShieldsPath)) {
    try {
      const data = JSON.parse(fs.readFileSync(clubShieldsPath, 'utf-8'));
      for (const c of data.clubs || []) {
        if (c.shield) map.set(normalizeForMatch(c.name), c.shield);
      }
    } catch (_) {}
  }
  const standingsPath = path.join(STANDINGS_DIR, `${age}.json`);
  if (fs.existsSync(standingsPath)) {
    try {
      const standings = JSON.parse(fs.readFileSync(standingsPath, 'utf-8'));
      for (const row of standings.table || []) {
        const key = normalizeForMatch(row.team);
        if (row.shield && !map.has(key)) map.set(key, row.shield);
      }
    } catch (_) {}
  }
  return map;
}

function attachShields(matches, shieldMap) {
  if (shieldMap.size === 0) return matches;
  return matches.map((m) => ({
    ...m,
    homeShield: shieldMap.get(normalizeForMatch(m.home)) || null,
    awayShield: shieldMap.get(normalizeForMatch(m.away)) || null,
  }));
}

export async function refreshCalendarAge(age) {
  const cfg = readConfig();
  const url = calendarUrlFor(age, cfg);
  if (!url) throw new Error(`URL календаря для возраста ${age} не настроен`);
  const { matches, parserHint } = await fetchAndParseCalendar(url, cfg.ourClubMatcher);
  const shields = loadShieldsForAge(age);
  const enriched = attachShields(matches, shields);
  const out = {
    ageGroup: age,
    season: cfg.season,
    title: `Календарь ${cfg.league || ''} · ${age} г.р.`.trim(),
    source: url,
    parserHint,
    lastUpdated: new Date().toISOString(),
    matches: enriched,
  };
  if (!fs.existsSync(CALENDAR_DIR)) fs.mkdirSync(CALENDAR_DIR, { recursive: true });
  const filePath = path.join(CALENDAR_DIR, `${age}.json`);
  fs.writeFileSync(filePath, JSON.stringify(out, null, 2), 'utf-8');
  invalidateCache(filePath);
  return out;
}

export async function refreshCalendarAll() {
  const cfg = readConfig();
  const explicit = cfg.calendarSources && Object.keys(cfg.calendarSources).length > 0
    ? cfg.calendarSources : null;
  const ages = Object.keys(explicit || cfg.sources || {});
  const results = {};
  for (const age of ages) {
    try {
      const data = await refreshCalendarAge(age);
      results[age] = { ok: true, matches: data.matches.length, hint: data.parserHint };
      console.log(`[calendar] ${age}: ${data.matches.length} матчей (${data.parserHint})`);
    } catch (e) {
      results[age] = { ok: false, error: e.message };
      console.error(`[calendar] ${age}: ошибка — ${e.message}`);
    }
  }
  return results;
}

let timer = null;
const ONE_DAY_MS = 24 * 60 * 60 * 1000;

export function startCalendarCron() {
  if (timer) return;
  setTimeout(() => { refreshCalendarAll().catch(() => {}); }, 8000);
  timer = setInterval(() => { refreshCalendarAll().catch(() => {}); }, ONE_DAY_MS);
  console.log('[calendar] cron запущен');
}

export function stopCalendarCron() {
  if (timer) clearInterval(timer);
  timer = null;
}
