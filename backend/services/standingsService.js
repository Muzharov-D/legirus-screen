// Сервис парсинга турнирных таблиц с stat.ffspb.org.
// HTML-страница содержит JSON в инлайн-скриптах вида:
//   renderComponent("...", 'TournamentTable', { group_name: "Вторая лига", users: [...] });
// Мы вытаскиваем JSON по нужной лиге, нормализуем строки таблицы, сохраняем в backend/data/standings/{age}.json.

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { invalidateCache } from './dataLoader.js';
import { isPgEnabled, query } from '../db/pool.js';
import { isFfspbConfigured, listStandings as apiListStandings } from './ffspbApi.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const STANDINGS_DIR = path.resolve(__dirname, '..', 'data', 'standings');
const CONFIG_PATH = path.join(STANDINGS_DIR, '_config.json');

function readConfig() {
  const raw = fs.readFileSync(CONFIG_PATH, 'utf-8');
  return JSON.parse(raw);
}

function stripTags(html) {
  return String(html || '')
    .replace(/<[^>]*>/g, '')
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .trim();
}

function parseDifference(diff) {
  const m = String(diff || '').match(/(-?\d+)\s*[-–:]\s*(-?\d+)/);
  if (!m) return { goalsFor: 0, goalsAgainst: 0 };
  return { goalsFor: parseInt(m[1], 10) || 0, goalsAgainst: parseInt(m[2], 10) || 0 };
}

function findTournamentTableJson(html, leagueName) {
  // Ищем все блоки renderComponent(..., 'TournamentTable', {...});
  // JSON может содержать вложенные скобки — собираем по балансу скобок.
  const marker = "'TournamentTable',";
  const blocks = [];
  let from = 0;
  while (true) {
    const idx = html.indexOf(marker, from);
    if (idx === -1) break;
    const start = html.indexOf('{', idx);
    if (start === -1) break;
    let depth = 0;
    let inStr = false;
    let strCh = '';
    let escape = false;
    let end = -1;
    for (let i = start; i < html.length; i++) {
      const ch = html[i];
      if (inStr) {
        if (escape) { escape = false; continue; }
        if (ch === '\\') { escape = true; continue; }
        if (ch === strCh) { inStr = false; continue; }
      } else {
        if (ch === '"' || ch === "'") { inStr = true; strCh = ch; continue; }
        if (ch === '{') depth++;
        else if (ch === '}') {
          depth--;
          if (depth === 0) { end = i; break; }
        }
      }
    }
    if (end === -1) break;
    const jsonStr = html.slice(start, end + 1);
    blocks.push(jsonStr);
    from = end + 1;
  }

  for (const raw of blocks) {
    let obj;
    try { obj = JSON.parse(raw); } catch { continue; }
    if (obj && obj.group_name === leagueName) return obj;
  }
  return null;
}

export async function fetchAndParse(url, leagueName, ourClubMatcher) {
  const res = await fetch(url, {
    headers: {
      'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120 Safari/537.36',
      Accept: 'text/html,application/xhtml+xml',
    },
  });
  if (!res.ok) throw new Error(`Source ${url} returned ${res.status}`);
  const html = await res.text();

  const block = findTournamentTableJson(html, leagueName);
  if (!block) throw new Error(`Не найдена группа "${leagueName}" в ${url}`);

  const users = Array.isArray(block.users) ? block.users : [];
  const table = users.map((u, i) => {
    const name = stripTags(u.name);
    const stats = u.stats || {};
    const { goalsFor, goalsAgainst } = parseDifference(stats.difference);
    const isOurClub = ourClubMatcher
      ? name.toLowerCase().includes(String(ourClubMatcher).toLowerCase())
      : false;
    return {
      pos: i + 1,
      team: name,
      city: u.city || null,
      shield: u.shield || null,
      isOurClub,
      games:        parseInt(stats.games || 0, 10) || 0,
      wins:         parseInt(stats.wins || 0, 10) || 0,
      draws:        parseInt(stats.draws || 0, 10) || 0,
      losses:       parseInt(stats.loses || 0, 10) || 0,
      goalsFor,
      goalsAgainst,
      points:       parseInt(stats.points || 0, 10) || 0,
    };
  });

  return {
    leagueName: block.group_name,
    table,
  };
}

// Извлечь tournament_id из URL вида .../tournament44333
function parseTournamentId(url) {
  if (!url) return null;
  const m = String(url).match(/tournament(\d+)/i);
  return m ? Number(m[1]) : null;
}

// Маппинг standings из API в наш JSON-формат.
// API даёт несколько групп (Вторая лига / Третья лига / Группы / Четвёртая лига) —
// выбираем ту, в которой играет наша команда.
function apiStandingsToOur(groups, ourMatcher) {
  const matcher = String(ourMatcher || 'Легирус').toLowerCase();
  let our = null;
  for (const g of groups || []) {
    const has = (g.teams || []).some((t) =>
      String(t.teamName || t.team?.name || '').toLowerCase().includes(matcher));
    if (has) { our = g; break; }
  }
  if (!our) return null;

  const table = (our.teams || []).map((t) => {
    const s = t.stats || {};
    const team = t.team || {};
    const name = t.teamName || team.name || '';
    return {
      pos: t.position,
      team: name,
      teamId: team.id != null ? String(team.id) : null,
      games: s.games || 0,
      wins: s.wins || 0,
      draws: s.draws || 0,
      losses: s.loses || 0, // API: loses, наш формат: losses
      scored: s.scored || 0,
      missed: s.missed || 0,
      difference: s.difference || 0,
      points: s.points || 0,
      shield: team.logoSrc || team.thumbnails?.square_xs || null,
      isOurClub: name.toLowerCase().includes(matcher),
    };
  });
  table.sort((a, b) => (a.pos ?? 999) - (b.pos ?? 999));
  return { groupName: our.groupName, table };
}

export async function refreshAge(ageGroup) {
  const cfg = readConfig();
  const url = cfg.sources?.[ageGroup];
  if (!url) throw new Error(`URL для возраста ${ageGroup} не настроен в _config.json`);

  let leagueName, table, source;
  if (isFfspbConfigured()) {
    const tid = parseTournamentId(url);
    if (!tid) throw new Error('tournament_id не определён в URL ' + url);
    try {
      const groups = await apiListStandings(tid);
      const mapped = apiStandingsToOur(groups, cfg.ourClubMatcher);
      if (mapped) {
        leagueName = mapped.groupName || cfg.league;
        table = mapped.table;
        source = `ffspb-api://tournaments/${tid}`;
      }
    } catch (e) {
      console.error('[standings] API failed for ' + ageGroup + ':', e.message);
    }
  }

  // Fallback: старый HTML-скрейпер
  if (!table) {
    const fb = await fetchAndParse(url, cfg.league, cfg.ourClubMatcher);
    leagueName = fb.leagueName;
    table = fb.table;
    source = url;
  }

  const out = {
    ageGroup,
    season: cfg.season,
    title: `${leagueName} · ${ageGroup} г.р.`,
    source,
    lastUpdated: new Date().toISOString(),
    table,
  };

  if (!fs.existsSync(STANDINGS_DIR)) fs.mkdirSync(STANDINGS_DIR, { recursive: true });
  const filePath = path.join(STANDINGS_DIR, `${ageGroup}.json`);
  fs.writeFileSync(filePath, JSON.stringify(out, null, 2), 'utf-8');
  invalidateCache(filePath);

  // PG dual-write — каждый refresh добавляет новую строку (история таблиц по дням).
  // dataRepo.loadStandings возвращает последнюю по fetched_at.
  if (isPgEnabled()) {
    try {
      await query(
        `INSERT INTO standings (club_id, age_group, season, league_name, source_url, table_data, fetched_at)
         VALUES ('legirus', $1, $2, $3, $4, $5, $6)`,
        [ageGroup, out.season || '', out.title || null, out.source || null,
         JSON.stringify(out.table), out.lastUpdated],
      );
    } catch (e) {
      console.error('[standings] PG persist failed for ' + ageGroup + ':', e.message);
    }
  }
  return out;
}

export async function refreshAll() {
  const cfg = readConfig();
  const ages = Object.keys(cfg.sources || {});
  const results = {};
  for (const age of ages) {
    try {
      const data = await refreshAge(age);
      results[age] = { ok: true, teams: data.table.length };
      console.log(`[standings] ${age}: обновлено ${data.table.length} команд`);
    } catch (e) {
      results[age] = { ok: false, error: e.message };
      console.error(`[standings] ${age}: ошибка — ${e.message}`);
    }
  }
  return results;
}

let timer = null;
// Flashscore-режим: таблицы обновляются за родителями каждые 30 минут.
// FFSPB пересчитывает после внесения протокола, нам важно подхватывать оперативно.
const REFRESH_INTERVAL_MS = 30 * 60 * 1000;

export function startStandingsCron() {
  if (timer) return;
  // Первый прогон с задержкой 5 секунд после старта (чтобы сервер успел подняться)
  setTimeout(() => { refreshAll().catch((e) => console.error('[standings] initial tick failed:', e.message)); }, 5000);
  // Далее каждые 30 минут
  timer = setInterval(() => { refreshAll().catch((e) => console.error('[standings] tick failed:', e.message)); }, REFRESH_INTERVAL_MS);
  console.log('[standings] cron запущен: первый прогон через 5 сек, далее каждые 30 мин');
}

export function stopStandingsCron() {
  if (timer) clearInterval(timer);
  timer = null;
}
