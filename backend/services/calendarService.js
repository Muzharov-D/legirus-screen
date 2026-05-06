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

function parseRows(html, ourClubMatcher, tournament) {
  const matches = [];
  const rowRe = /<tr\b[^>]*>([\s\S]*?)<\/tr>/gi;
  let m;
  while ((m = rowRe.exec(html)) !== null) {
    const rowHtml = m[1];
    if (!/\d{1,2}\.\d{1,2}\.20\d{2}/.test(rowHtml)) continue;
    const tdRe = /<td\b[^>]*>([\s\S]*?)<\/td>/gi;
    const cells = [];
    let tdM;
    while ((tdM = tdRe.exec(rowHtml)) !== null) cells.push(tdM[1]);
    if (cells.length < 4) continue;
    const teamsIdx = cells.findIndex((c) => (c.match(/\/team\/\d+/g) || []).length >= 2);
    if (teamsIdx < 0) continue;
    const dateCell = stripTags(cells[1] || '');
    const groupCell = teamsIdx > 2 ? stripTags(cells[2] || '') : '';
    const teamsHtml = cells[teamsIdx] || '';
    const scoreCell = stripTags(cells[teamsIdx + 1] || '');
    const stadiumCell = stripTags(cells[teamsIdx + 2] || '');
    const tlRe = /<a\b[^>]*href="[^"]*\/team\/(\d+)[^"]*"[^>]*>([\s\S]*?)<\/a>/gi;
    const tl = [];
    let tlm;
    while ((tlm = tlRe.exec(teamsHtml)) !== null) tl.push({ id: tlm[1], name: stripTags(tlm[2]) });
    if (tl.length < 2) continue;
    const date = parseDate(dateCell);
    const score = parseScore(scoreCell);
    const matcher = String(ourClubMatcher || '').toLowerCase();
    const isOurMatch = matcher ? (tl[0].name.toLowerCase().includes(matcher) || tl[1].name.toLowerCase().includes(matcher)) : false;
    matches.push({
      matchId: (teamsHtml.match(/class="matchLink"[^>]*mid="(\d+)"/i) || [])[1] || null,
      date, home: tl[0].name, away: tl[1].name,
      homeTeamId: tl[0].id, awayTeamId: tl[1].id,
      score, isPast: !!score,
      isUpcoming: !score && (!date || new Date(date) >= new Date()),
      isOurMatch, group: groupCell || null, venue: stadiumCell || null, round: null, tournament,
    });
  }
  return matches;
}

async function fetchHtml(url) {
  const res = await fetch(url, { headers: { 'User-Agent': 'Mozilla/5.0' } });
  if (!res.ok) throw new Error('HTTP ' + res.status);
  return res.text();
}

export async function fetchAndParseCalendar(url, ourClubMatcher, tournament) {
  const t = tournament || 'league';
  const html = await fetchHtml(url);
  const matches = parseRows(html, ourClubMatcher, t);
  return { matches, parserHint: matches.length > 0 ? 'html-table' : 'fallback-empty', sourceUrl: url };
}

function leagueUrl(age, cfg) {
  const e = cfg.calendarSources && cfg.calendarSources[age];
  if (e) return e;
  const b = cfg.sources && cfg.sources[age];
  return b ? b.replace(/\/$/, '') + '/calendar' : null;
}

function cupUrl(age, cfg) {
  const e = cfg.cupCalendarSources && cfg.cupCalendarSources[age];
  if (e) return e;
  const b = cfg.cup && cfg.cup.sources && cfg.cup.sources[age];
  return b ? b.replace(/\/$/, '') + '/calendar' : null;
}

function nrm(name) {
  return String(name || '').toLowerCase()
    .replace(/\([^)]*\)/g, '')
    .replace(/\b(гбу до|сшор|сш|фк|фшм|№)\b/g, '')
    .replace(/[^а-яa-z0-9\- ]/gi, ' ')
    .replace(/\s+/g, ' ').trim();
}

function loadShields(age) {
  const map = new Map();
  const p1 = path.resolve(__dirname, '..', 'data', 'club-shields.json');
  if (fs.existsSync(p1)) try { for (const c of (JSON.parse(fs.readFileSync(p1, 'utf-8')).clubs || [])) if (c.shield) map.set(nrm(c.name), c.shield); } catch (_) {}
  const p2 = path.join(STANDINGS_DIR, age + '.json');
  if (fs.existsSync(p2)) try { for (const r of (JSON.parse(fs.readFileSync(p2, 'utf-8')).table || [])) if (r.shield && !map.has(nrm(r.team))) map.set(nrm(r.team), r.shield); } catch (_) {}
  return map;
}

export async function refreshCalendarAge(age) {
  const cfg = readConfig();
  const sources = [];
  const lu = leagueUrl(age, cfg); if (lu) sources.push({ url: lu, tournament: 'league' });
  const cu = cupUrl(age, cfg); if (cu) sources.push({ url: cu, tournament: 'cup' });
  if (!sources.length) throw new Error('No URL for ' + age);
  const all = [];
  let hint = 'fallback-empty';
  const meta = [];
  for (const s of sources) {
    try {
      const r = await fetchAndParseCalendar(s.url, cfg.ourClubMatcher, s.tournament);
      all.push(...r.matches);
      if (r.parserHint === 'html-table') hint = 'html-table';
      meta.push({ tournament: s.tournament, url: s.url, found: r.matches.length });
    } catch (e) {
      meta.push({ tournament: s.tournament, url: s.url, error: e.message });
    }
  }
  const sh = loadShields(age);
  const enriched = sh.size === 0 ? all : all.map((m) => ({ ...m, homeShield: sh.get(nrm(m.home)) || null, awayShield: sh.get(nrm(m.away)) || null }));
  enriched.sort((a, b) => !a.date ? 1 : !b.date ? -1 : new Date(a.date) - new Date(b.date));
  const out = { ageGroup: age, season: cfg.season, sources: meta, parserHint: hint, lastUpdated: new Date().toISOString(), matches: enriched };
  if (!fs.existsSync(CALENDAR_DIR)) fs.mkdirSync(CALENDAR_DIR, { recursive: true });
  const fp = path.join(CALENDAR_DIR, age + '.json');
  fs.writeFileSync(fp, JSON.stringify(out, null, 2), 'utf-8');
  invalidateCache(fp);
  return out;
}

export async function refreshCalendarAll() {
  const cfg = readConfig();
  const expl = cfg.calendarSources && Object.keys(cfg.calendarSources).length > 0 ? cfg.calendarSources : null;
  const ages = Object.keys(expl || cfg.sources || {});
  const out = {};
  for (const age of ages) {
    try {
      const d = await refreshCalendarAge(age);
      const lc = d.matches.filter((m) => m.tournament === 'league').length;
      const cc = d.matches.filter((m) => m.tournament === 'cup').length;
      out[age] = { ok: true, total: d.matches.length, league: lc, cup: cc };
      console.log('[calendar] ' + age + ': ' + d.matches.length + ' (L' + lc + '+C' + cc + ')');
    } catch (e) {
      out[age] = { ok: false, error: e.message };
    }
  }
  return out;
}

let timer = null;
export function startCalendarCron() {
  if (timer) return;
  setTimeout(() => refreshCalendarAll().catch(() => {}), 8000);
  timer = setInterval(() => refreshCalendarAll().catch(() => {}), 24 * 60 * 60 * 1000);
  console.log('[calendar] cron started');
}
export function stopCalendarCron() { if (timer) clearInterval(timer); timer = null; }