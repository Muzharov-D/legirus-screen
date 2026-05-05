// Сервис парсинга кубковой сетки с stat.ffspb.org.
// Источники — backend/data/standings/_config.json → cup.sources
//
// Структура сохранённого JSON (по возрасту):
//   {
//     ageGroup, season, title, source, lastUpdated,
//     rounds: [
//       { name: "1/8 финала", matches: [
//         { home, away, homeShield, awayShield, score, date, status, isOurClubMatch }
//       ] },
//       { name: "Четвертьфинал", matches: [...] },
//       ...
//     ]
//   }
//
// На текущий момент парсер реализован как «pass-through» — он fetch'ит HTML
// и пытается найти нужный JSON-блок renderComponent('TournamentBracket'/'TournamentMatches'/...).
// Если не нашёл — пишет пустую сетку с маркером source.parseError.
// Реальные селекторы будут уточнены когда восстановится доступ к bash для
// reverse-engineering HTML страницы.

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { invalidateCache } from './dataLoader.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const STANDINGS_DIR = path.resolve(__dirname, '..', 'data', 'standings');
const CUP_DIR = path.resolve(__dirname, '..', 'data', 'cup');
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
    .trim();
}

function findJsonBlocks(html, componentNames) {
  // Ищем `renderComponent("...", 'X', { ... });` для каждого имени из componentNames.
  // Возвращает массив распарсенных JSON-объектов.
  const out = [];
  for (const name of componentNames) {
    const marker = `'${name}',`;
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
      const raw = html.slice(start, end + 1);
      try {
        out.push({ component: name, data: JSON.parse(raw) });
      } catch { /* skip malformed */ }
      from = end + 1;
    }
  }
  return out;
}

function isOurClubName(name, matcher) {
  if (!name || !matcher) return false;
  return String(name).toLowerCase().includes(String(matcher).toLowerCase());
}

// Sportvisor хранит сетку как РЕКУРСИВНОЕ БИНАРНОЕ ДЕРЕВО в компоненте 'PlayOff':
//   final = { lTeam, rTeam, lMatch?, rMatch?, games: [{hostGoals, guestGoals, hostPens, guestPens, url}] }
//   lMatch/rMatch — поддеревья предыдущих раундов
// Превращаем в плоский список раундов от самого ранне (1/8 финала) до самого позднего (Финал).

// bracketLevel — расстояние узла от листа: 0 = первый раунд (нет под-матчей),
// k = есть под-матчи и max(child level) = k-1. Это надёжнее чем глубина от корня
// потому что дерево бывает асимметричным (одна ветка глубже из-за seeded команд).
function bracketLevel(node) {
  if (!node) return -1;
  const l = bracketLevel(node.lMatch);
  const r = bracketLevel(node.rMatch);
  if (l < 0 && r < 0) return 0;
  return Math.max(l, r) + 1;
}

function roundNameByOffsetFromFinal(off) {
  // off = 0 → Финал, 1 → Полуфинал, 2 → Четвертьфинал, 3 → 1/8, …
  switch (off) {
    case 0: return 'Финал';
    case 1: return 'Полуфинал';
    case 2: return 'Четвертьфинал';
    case 3: return '1/8 финала';
    case 4: return '1/16 финала';
    case 5: return '1/32 финала';
    default: return `Раунд ${off + 1}`;
  }
}

function formatScore(games) {
  if (!Array.isArray(games) || !games.length) return null;
  // Серия двух-матчевая или один матч
  let hostTotal = 0, guestTotal = 0, played = 0;
  let pens = null;
  for (const g of games) {
    if (g.hostGoals != null && g.guestGoals != null) {
      hostTotal  += Number(g.hostGoals)  || 0;
      guestTotal += Number(g.guestGoals) || 0;
      played++;
    }
    if (g.hostPens != null && g.guestPens != null) {
      pens = `${g.hostPens}:${g.guestPens}`;
    }
  }
  if (!played) return null;
  const main = `${hostTotal}:${guestTotal}`;
  return pens ? `${main} (пен. ${pens})` : main;
}

// Группируем матчи по bracketLevel. Один проход по дереву, кэшируем уровни через Map.
function walkPlayOff(finalNode, ourClubMatcher) {
  if (!finalNode) return [];
  const levelCache = new Map();
  function lvl(n) {
    if (!n) return -1;
    if (levelCache.has(n)) return levelCache.get(n);
    const l = lvl(n.lMatch), r = lvl(n.rMatch);
    const v = (l < 0 && r < 0) ? 0 : Math.max(l, r) + 1;
    levelCache.set(n, v);
    return v;
  }
  const total = lvl(finalNode) + 1; // 1-based
  const rounds = Array.from({ length: total }, () => []);

  function visit(node) {
    if (!node) return;
    const home = stripTags(node.lTeam?.name);
    const away = stripTags(node.rTeam?.name);
    rounds[lvl(node)].push({
      home,
      away,
      homeShield: node.lTeam?.shield || null,
      awayShield: node.rTeam?.shield || null,
      score: formatScore(node.games),
      url: node.games?.[0]?.url || null,
      isOurClubMatch:
        isOurClubName(home, ourClubMatcher) ||
        isOurClubName(away, ourClubMatcher),
    });
    visit(node.lMatch);
    visit(node.rMatch);
  }
  visit(finalNode);

  // rounds[0] = первый раунд (листья), rounds[total-1] = Финал.
  // offsetFromFinal = total-1-i.
  return rounds.map((matches, i) => ({
    name: roundNameByOffsetFromFinal(total - 1 - i),
    matches,
  }));
}

function normalizeToRounds(blocks, ourClubMatcher) {
  const parseHint = blocks.length === 0
    ? 'no renderComponent blocks found'
    : `components found: ${blocks.map((b) => b.component).join(', ')}`;

  // Главный путь: Sportvisor 'PlayOff' с рекурсивным деревом
  for (const b of blocks) {
    if (b.component === 'PlayOff' && b.data?.final) {
      const rounds = walkPlayOff(b.data.final, ourClubMatcher);
      // Отфильтровываем «пустые» раунды (когда команды ещё не определены)
      const nonEmpty = rounds.filter((r) => r.matches.some((m) => m.home || m.away));
      return { rounds: nonEmpty, parseHint: `PlayOff parsed: ${rounds.length} раундов` };
    }
  }
  return { rounds: [], parseHint };
}

export async function fetchAndParseCup(url, ourClubMatcher) {
  const res = await fetch(url, {
    headers: {
      'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 Safari/537.36',
      Accept: 'text/html,application/xhtml+xml',
    },
  });
  if (!res.ok) throw new Error(`Source ${url} returned ${res.status}`);
  const html = await res.text();

  const blocks = findJsonBlocks(html, [
    'PlayOff',  // основной компонент Sportvisor для кубковой сетки
    // Запасные варианты на случай других форматов:
    'TournamentMatches',
    'TournamentSchedule',
    'TournamentBracket',
  ]);

  const { rounds, parseHint } = normalizeToRounds(blocks, ourClubMatcher);
  return { rounds, parseHint };
}

export async function refreshCupAge(ageGroup) {
  const cfg = readConfig();
  const url = cfg.cup?.sources?.[ageGroup];
  if (!url) throw new Error(`Cup URL для возраста ${ageGroup} не настроен`);

  const { rounds, parseHint } = await fetchAndParseCup(url, cfg.ourClubMatcher);
  const out = {
    ageGroup,
    season: cfg.season,
    title: `${cfg.cup?.name || 'Кубок'} · ${ageGroup} г.р.`,
    source: url,
    lastUpdated: new Date().toISOString(),
    parseHint,            // отладочная подсказка (для нас, не для UI)
    rounds,
  };
  if (!fs.existsSync(CUP_DIR)) fs.mkdirSync(CUP_DIR, { recursive: true });
  const filePath = path.join(CUP_DIR, `${ageGroup}.json`);
  fs.writeFileSync(filePath, JSON.stringify(out, null, 2), 'utf-8');
  invalidateCache(filePath);
  return out;
}

export async function refreshCupAll() {
  const cfg = readConfig();
  const ages = Object.keys(cfg.cup?.sources || {});
  const results = {};
  for (const age of ages) {
    try {
      const data = await refreshCupAge(age);
      results[age] = { ok: true, rounds: data.rounds.length, parseHint: data.parseHint };
      console.log(`[cup] ${age}: ${data.rounds.length} раундов (${data.parseHint})`);
    } catch (e) {
      results[age] = { ok: false, error: e.message };
      console.error(`[cup] ${age}: ${e.message}`);
    }
  }
  return results;
}

let timer = null;
const ONE_DAY_MS = 24 * 60 * 60 * 1000;

export function startCupCron() {
  if (timer) return;
  setTimeout(() => { refreshCupAll().catch(() => {}); }, 7000); // через 7 сек после старта (после standings)
  timer = setInterval(() => { refreshCupAll().catch(() => {}); }, ONE_DAY_MS);
  console.log('[cup] cron запущен: первый прогон через 7 сек, далее каждые 24 ч');
}

export function stopCupCron() {
  if (timer) clearInterval(timer);
  timer = null;
}
