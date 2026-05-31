// Лидеры лиги (бомбардиры подгруппы).
//
// FFSPB не отдаёт готовый топ-бомбардиров (исследование 2026-05-26: /tournament_top_players
// принимает только top_by=assists). Поэтому агрегируем у себя из events_data, который
// и так синкается matchEventsService — но только для НАШИХ матчей. Этот сервис расширяет
// sync на все past league-матчи подгруппы (10 команд из standings.table) и считает голы
// SQL-агрегацией поверх existing JSONB колонки calendar.events_data.
//
// Cron 6h: парный с match-events. Для чужих матчей push не шлём (skipNotify=true).

import { isPgEnabled, query } from '../db/pool.js';
import { isFfspbConfigured } from './ffspbApi.js';
import { fetchAndStoreEvents } from './matchEventsService.js';
import { loadStandings } from './dataRepo.js';

// Нормализация — те же правила что во frontend/src/utils/legirus.js
// (срез юр-префиксов + lower + дефис=пробел).
function normalizeTeamName(s) {
  if (!s) return '';
  return String(s)
    .toLowerCase()
    .replace(/^(фк|гбу до|гбоу|мбоу|маоу|гку|мку|гкоу|ано|оо|роо)\s+/i, '')
    .replace(/-/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

// Алиасы — FFSPB пишет имена непоследовательно (см. контракты в project memory §1).
const TEAM_ALIASES = {
  'пороховчанин': 'пороховчанин тосно',
  'сшор экран': 'сш экран',
  'сш выборжанин': 'выборжанин',
};
function applyAlias(name) {
  const n = normalizeTeamName(name);
  return TEAM_ALIASES[n] || n;
}

async function getSubgroupTeamNames(ageGroup) {
  const s = await loadStandings(ageGroup);
  if (!s || !Array.isArray(s.table)) return null;
  const names = s.table.map((r) => applyAlias(r.team)).filter(Boolean);
  return new Set(names);
}

// === Sync: тянет events для чужих league-матчей подгруппы ===
//
// Те же правила что matchEventsService.syncRecentEvents, только:
//   - is_our_match = FALSE (наши уже синкаются)
//   - окно шире (120 дней — забираем весь сезон)
//   - retry-окно для пустых events_data — 6ч (не 2ч), чтобы не дёргать FFSPB
//     по тем матчам где судья просто не заполнил протокол
//   - skipNotify=true (родители не подписаны на чужие команды)
//   - фильтр подгруппы в JS после загрузки кандидатов (нормализация имён сложна для SQL)
export async function syncRecentLeagueEvents() {
  if (!isPgEnabled() || !isFfspbConfigured()) return { skipped: true };

  const agesRes = await query(
    `SELECT DISTINCT age_group FROM standings WHERE club_id = 'legirus' ORDER BY age_group`);
  const ages = agesRes.rows.map((r) => r.age_group);

  const totals = { fetched: 0, failed: 0, notInSubgroup: 0, skippedNoStandings: 0 };
  for (const age of ages) {
    const subgroup = await getSubgroupTeamNames(age);
    if (!subgroup || subgroup.size === 0) { totals.skippedNoStandings++; continue; }

    const candidates = await query(`
      SELECT ext_match_id, age_group, home_team, away_team
      FROM calendar
      WHERE club_id = 'legirus' AND age_group = $1
        AND tournament = 'league'
        AND is_our_match = FALSE
        AND score_home IS NOT NULL
        AND match_date >= NOW() - INTERVAL '120 days'
        AND match_date < NOW()
        AND (
          events_data IS NULL
          OR (
            jsonb_typeof(events_data) = 'array'
            AND jsonb_array_length(events_data) = 0
            AND (events_fetched_at IS NULL OR events_fetched_at < NOW() - INTERVAL '1 hour')
          )
        )
      ORDER BY match_date DESC
      LIMIT 40`, [age]);

    for (const m of candidates.rows) {
      const hOk = subgroup.has(applyAlias(m.home_team));
      const aOk = subgroup.has(applyAlias(m.away_team));
      if (!hOk || !aOk) { totals.notInSubgroup++; continue; }
      try {
        const r = await fetchAndStoreEvents(m.ext_match_id, age, 'legirus', { skipNotify: true });
        console.log(`[league-events] ${age}/${m.ext_match_id}: ${r.events} events`);
        totals.fetched++;
      } catch (e) {
        console.error(`[league-events] ${age}/${m.ext_match_id} failed:`, e.message);
        totals.failed++;
      }
    }
  }
  return totals;
}

// === Топ-бомбардиры age_group ===
//
// Считаем по событиям kind ∈ ('goal','penalty'). Автоголы (own_goal) НЕ считаем
// в актив бомбардира (они идут в счёт противнику, а не в счёт игрока).
// Player и команда определяются из event.playerId/playerName + event.team (host|guest).
//
// Возвращает массив топ-N: { rank, playerId, playerName, teamName, teamShield, goals }.
export async function getTopScorers(ageGroup, limit = 20) {
  if (!isPgEnabled()) return [];
  const subgroup = await getSubgroupTeamNames(ageGroup);
  if (!subgroup || subgroup.size === 0) return [];

  const r = await query(`
    SELECT
      e->>'playerId'   AS player_id,
      e->>'playerName' AS player_name,
      CASE WHEN e->>'team' = 'host' THEN cal.home_team   ELSE cal.away_team   END AS team_name,
      CASE WHEN e->>'team' = 'host' THEN cal.home_shield ELSE cal.away_shield END AS team_shield
    FROM calendar cal,
         jsonb_array_elements(cal.events_data) AS e
    WHERE cal.club_id = 'legirus'
      AND cal.age_group = $1
      AND cal.tournament = 'league'
      AND cal.score_home IS NOT NULL
      AND cal.match_date < NOW()
      AND jsonb_typeof(cal.events_data) = 'array'
      AND (e->>'kind' = 'goal' OR e->>'kind' = 'penalty')`, [ageGroup]);

  // Группируем по player_id+team в JS (нужна JS-нормализация имени команды для фильтра подгруппы).
  const map = new Map();
  for (const row of r.rows) {
    const teamNorm = applyAlias(row.team_name);
    if (!subgroup.has(teamNorm)) continue;
    // Ключ: player_id если есть (стабильнее), иначе имя+команда. У одного игрока в чужих
    // матчах может не быть player_id, если FFSPB не вернул его — fallback на имя.
    const key = row.player_id ? `id:${row.player_id}` : `name:${row.player_name}|${teamNorm}`;
    const cur = map.get(key) || {
      playerId: row.player_id || null,
      playerName: row.player_name || '—',
      teamName: row.team_name,
      teamShield: row.team_shield || null,
      goals: 0,
    };
    cur.goals += 1;
    if (!cur.teamShield && row.team_shield) cur.teamShield = row.team_shield;
    map.set(key, cur);
  }
  const list = [...map.values()].sort(
    (a, b) => b.goals - a.goals
      || a.playerName.localeCompare(b.playerName, 'ru'));
  return list.slice(0, limit).map((p, i) => ({ rank: i + 1, ...p }));
}

// === Cron ===
// Раньше было 6 часов — родитель открывал бомбардиров после субботнего тура и
// видел старые цифры до вечера воскресенья. Сейчас 20 мин: SQL-фильтр сам
// пропускает уже синканные матчи, лишней нагрузки на FFSPB нет (5-10 запросов
// на tick в горячий день, в обычный — 0).
const TICK_MIN = 20;
let timer = null;
export function startLeagueLeadersCron() {
  if (timer) return;
  // Первый запуск через 90 сек после старта — даём подняться standings/calendar/matchEvents.
  setTimeout(
    () => syncRecentLeagueEvents().catch((e) => console.error('[league-events] initial tick failed:', e.message)),
    90_000);
  timer = setInterval(
    () => syncRecentLeagueEvents().catch((e) => console.error('[league-events] tick failed:', e.message)),
    TICK_MIN * 60 * 1000);
  console.log(`[league-events] cron started, tick every ${TICK_MIN} min`);
}
export function stopLeagueLeadersCron() { if (timer) clearInterval(timer); timer = null; }
