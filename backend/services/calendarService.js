import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { invalidateCache } from './dataLoader.js';
import { isPgEnabled, query } from '../db/pool.js';
import { isFfspbConfigured, listMatches as apiListMatches } from './ffspbApi.js';

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
    // ffspb отдаёт время в МСК (UTC+3). Строим ISO с явным offset, чтобы
    // toLocaleString на фронте корректно показывал локальное время для любого TZ.
    const pad = (n) => String(n).padStart(2, '0');
    const iso = year + '-' + pad(Number(mm)) + '-' + pad(Number(dd)) +
      'T' + pad(Number(hh || 0)) + ':' + pad(Number(mi || 0)) + ':00+03:00';
    const d = new Date(iso);
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

// Извлекаем tournament_id из URL вида .../tournament44333/...
function parseTournamentId(url) {
  if (!url) return null;
  const m = String(url).match(/tournament(\d+)/i);
  return m ? Number(m[1]) : null;
}
function tournamentIds(age, cfg) {
  return {
    league: parseTournamentId(leagueUrl(age, cfg)),
    cup: parseTournamentId(cupUrl(age, cfg)),
  };
}

// Маппинг матча из API Platform → наш JSON-формат.
function apiMatchToOurs(m, tournament, ourMatcher = 'Легирус') {
  const matcher = String(ourMatcher || '').toLowerCase();
  const homeName = m.host?.name || m.host?.shortName || null;
  const awayName = m.guest?.name || m.guest?.shortName || null;
  const isOurMatch = !!matcher && (
    (homeName || '').toLowerCase().includes(matcher) ||
    (awayName || '').toLowerCase().includes(matcher)
  );
  const score = (m.resultHost != null && m.resultGuest != null && m.done >= 4)
    ? { home: m.resultHost, away: m.resultGuest }
    : null;
  const date = m.publicDate || null;
  const teamId = (iri) => iri ? String(iri).split('/').pop() : null;
  return {
    matchId: String(m.id),
    date,
    home: homeName,
    away: awayName,
    homeTeamId: teamId(m.host?.['@id']),
    awayTeamId: teamId(m.guest?.['@id']),
    score,
    isPast: !!score,
    isUpcoming: !score && (!date || new Date(date) >= new Date()),
    isOurMatch,
    group: null,
    venue: m.stadium?.name || m.location?.name || null,
    round: m.tourId ? `Тур ${m.tourId}` : null,
    tournament,
    homeShield: m.host?.logoSrc || null,
    awayShield: m.guest?.logoSrc || null,
  };
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

// Старая HTML-логика — теперь запасной путь для случая когда FFSPB_API_KEY отсутствует.
async function refreshCalendarAgeViaHtml(age, cfg) {
  const sources = [];
  const lu = leagueUrl(age, cfg); if (lu) sources.push({ url: lu, tournament: 'league' });
  const cu = cupUrl(age, cfg); if (cu) sources.push({ url: cu, tournament: 'cup' });
  if (!sources.length) return { matches: [], hint: 'fallback-empty', meta: [] };
  const matches = [];
  const meta = [];
  let hint = 'fallback-empty';
  for (const s of sources) {
    try {
      const r = await fetchAndParseCalendar(s.url, cfg.ourClubMatcher, s.tournament);
      matches.push(...r.matches);
      if (r.parserHint === 'html-table') hint = 'html-table';
      meta.push({ tournament: s.tournament, url: s.url, found: r.matches.length });
    } catch (e) {
      meta.push({ tournament: s.tournament, url: s.url, error: e.message });
    }
  }
  return { matches, hint, meta };
}

// Главная точка входа: обновить календарь для возраста.
// Если FFSPB_API_KEY задан — тянем через официальный API Platform.
// Иначе fallback на старый HTML-скрейпер.
export async function refreshCalendarAge(age) {
  const cfg = readConfig();
  const ourMatcher = cfg.ourClubMatcher || 'Легирус';

  let all = [];
  let hint = 'fallback-empty';
  const meta = [];

  if (isFfspbConfigured()) {
    // === API-вариант ===
    const tids = tournamentIds(age, cfg);
    for (const [tournament, tid] of [['league', tids.league], ['cup', tids.cup]]) {
      if (!tid) continue;
      try {
        const apiMatches = await apiListMatches(tid);
        const mapped = apiMatches.map((m) => apiMatchToOurs(m, tournament, ourMatcher));
        all.push(...mapped);
        meta.push({ tournament, tournamentId: tid, found: mapped.length });
        if (mapped.length > 0) hint = 'ffspb-api';
      } catch (e) {
        meta.push({ tournament, tournamentId: tid, error: e.message });
        console.error('[calendar] API failed for ' + age + '/' + tournament + ':', e.message);
      }
    }
    if (all.length === 0) {
      // Если API ничего не дал — fallback к HTML-скрейперу как safety net
      console.warn('[calendar] API returned 0 matches для ' + age + ', fallback на HTML');
      const fb = await refreshCalendarAgeViaHtml(age, cfg);
      all = fb.matches;
      meta.push(...fb.meta);
      if (fb.hint !== 'fallback-empty') hint = fb.hint;
    }
  } else {
    // === HTML fallback (legacy) ===
    const fb = await refreshCalendarAgeViaHtml(age, cfg);
    all = fb.matches;
    meta.push(...fb.meta);
    hint = fb.hint;
  }

  // Дополняем shield'ы из локального club-shields.json для команд,
  // у которых API не вернул logoSrc (бывает для редко обновляемых команд)
  const sh = loadShields(age);
  const enriched = all.map((m) => ({
    ...m,
    homeShield: m.homeShield || sh.get(nrm(m.home)) || null,
    awayShield: m.awayShield || sh.get(nrm(m.away)) || null,
  }));
  enriched.sort((a, b) => !a.date ? 1 : !b.date ? -1 : new Date(a.date) - new Date(b.date));
  const out = { ageGroup: age, season: cfg.season, sources: meta, parserHint: hint, lastUpdated: new Date().toISOString(), matches: enriched };
  if (!fs.existsSync(CALENDAR_DIR)) fs.mkdirSync(CALENDAR_DIR, { recursive: true });
  const fp = path.join(CALENDAR_DIR, age + '.json');
  fs.writeFileSync(fp, JSON.stringify(out, null, 2), 'utf-8');
  invalidateCache(fp);

  // Dual-write в PG: если поднят — UPSERT, иначе тихо пропускаем
  if (isPgEnabled()) {
    try { await persistCalendarToPg(age, out); }
    catch (e) { console.error('[calendar] PG persist failed for ' + age + ':', e.message); }

    // Note: автоматическое создание pending callup'ов отключено по продуктовому решению —
    // тренер сам выбирает состав на матч из CallupRoster (Model C). Функция
    // autoCreatePendingCallups оставлена в callupsRepo для возможного использования
    // через UI ("заполнить всеми" / "повторить состав предыдущего матча").
  }

  return out;
}

// UPSERT снапшота calendar_meta + всех матчей в calendar.
// Старые матчи возраста, которых нет в новом фиде — НЕ удаляем (история сохраняется),
// только обновляем счёт и venue если поменялись.
async function persistCalendarToPg(age, out) {
  await query(
    `INSERT INTO calendar_meta (club_id, age_group, season, title, parser_hint, sources, fetched_at)
     VALUES ('legirus', $1, $2, $3, $4, $5, $6)
     ON CONFLICT (club_id, age_group) DO UPDATE SET
       season=EXCLUDED.season, title=EXCLUDED.title,
       parser_hint=EXCLUDED.parser_hint, sources=EXCLUDED.sources, fetched_at=EXCLUDED.fetched_at`,
    [age, out.season || '', out.title || null, out.parserHint || null,
     JSON.stringify(out.sources || []),
     out.lastUpdated || new Date().toISOString()],
  );
  for (const m of out.matches || []) {
    if (!m.matchId) continue;
    await query(
      `INSERT INTO calendar (club_id, age_group, season, ext_match_id, match_date, home_team, away_team,
                             ext_home_team_id, ext_away_team_id, score_home, score_away, is_our_match,
                             venue, group_name, round, tournament, home_shield, away_shield,
                             source_url, fetched_at)
       VALUES ('legirus', $1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17, $18, $19)
       ON CONFLICT (club_id, age_group, ext_match_id) DO UPDATE SET
         match_date=EXCLUDED.match_date, score_home=EXCLUDED.score_home,
         score_away=EXCLUDED.score_away, venue=EXCLUDED.venue,
         is_our_match=EXCLUDED.is_our_match,
         tournament=EXCLUDED.tournament,
         home_shield=COALESCE(EXCLUDED.home_shield, calendar.home_shield),
         away_shield=COALESCE(EXCLUDED.away_shield, calendar.away_shield),
         fetched_at=EXCLUDED.fetched_at`,
      [age, out.season || '', m.matchId, m.date, m.home, m.away,
       m.homeTeamId, m.awayTeamId,
       m.score?.home ?? null, m.score?.away ?? null,
       !!m.isOurMatch, m.venue, m.group, m.round,
       m.tournament || 'league', m.homeShield || null, m.awayShield || null,
       null, // source_url на match-уровне не храним (есть в meta.sources)
       out.lastUpdated || new Date().toISOString()],
    );
  }
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
const CALENDAR_CRON_HOURS = 6; // ffspb обновляется не чаще раза в день после игр; 6h хватает с запасом
export function startCalendarCron() {
  if (timer) return;
  setTimeout(() => refreshCalendarAll().catch(() => {}), 8000);
  timer = setInterval(() => refreshCalendarAll().catch(() => {}), CALENDAR_CRON_HOURS * 60 * 60 * 1000);
  console.log('[calendar] cron started, refresh every ' + CALENDAR_CRON_HOURS + 'h');
}
export function stopCalendarCron() { if (timer) clearInterval(timer); timer = null; }