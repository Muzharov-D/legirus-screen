// Агрегат всех возрастных standings клуба → общий клубный зачёт.
// PG-aware: если есть DATABASE_URL — тянет последний snapshot из standings table,
// иначе fallback на JSON-файлы.

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { isPgEnabled, query } from '../db/pool.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const STANDINGS_DIR = path.resolve(__dirname, '..', 'data', 'standings');

// Циклически снимаем organizational-prefix'ы. «ГБУ ДО СШОР Кировского района»
// → «СШОР Кировского района» → «Кировского района» (тот же ключ что у «СШОР Кировского района»).
const PREFIX_RE = /^\s*(ГБУ\s+ДО|МОУ|ГБОУ|СШОР|СШ|ФК|ФШМ)\s+/i;
function normalizeClubName(name) {
  let s = String(name || '').replace(/\s*\([^)]*\)\s*/g, ' ');
  for (let i = 0; i < 5; i++) {
    const next = s.replace(PREFIX_RE, '');
    if (next === s) break;
    s = next;
  }
  return s.replace(/[№#]\d+/g, '').replace(/\s+/g, ' ').trim().toLowerCase();
}

function displayClubName(name) {
  return String(name || '').replace(/\s*\((ЦФКСиЗ\s+ВО|ГБУ\s+ДО)[^)]*\)\s*/i, '').trim();
}

// PG-aware: загрузка standings (последняя строка на каждый age_group).
export async function loadAllStandings() {
  if (isPgEnabled()) {
    const r = await query(`
      SELECT DISTINCT ON (age_group)
        age_group AS "ageGroup", season, league_name AS title, source_url AS source,
        table_data AS "table", fetched_at AS "lastUpdated"
      FROM standings WHERE club_id = 'legirus'
      ORDER BY age_group, fetched_at DESC`);
    return r.rows;
  }
  // JSON fallback
  if (!fs.existsSync(STANDINGS_DIR)) return [];
  const files = fs.readdirSync(STANDINGS_DIR).filter((f) => f.endsWith('.json') && !f.startsWith('_'));
  const out = [];
  for (const f of files) {
    try {
      out.push(JSON.parse(fs.readFileSync(path.join(STANDINGS_DIR, f), 'utf-8')));
    } catch (_) {}
  }
  return out;
}

// Клубный зачёт по системе «сумма мест» (place-sum, многоборная):
// для каждого возраста берём место клуба в лиге, суммируем по всем возрастам.
// У кого сумма меньше — тот выше. Если клуб не участвует в каком-то возрасте,
// получает штрафное место = размер лиги + 1 (как будто финишировал последним +1).
//
// Пример Легируса:
//   2010 → 2 место, 2011 → 3, 2012 → 5, 2013 → 5  →  posSum = 15
// Если у соперника 2010=1, 2011=2, 2012=4, 2013=6 → posSum = 13 → он выше.
//
// Для отображения дополнительно даём:
//   - breakdown: { '2010': { pos: 2, total: 14 }, ... }
//   - participated: количество возрастов где клуб реально играл
//   - avgPos: среднее место по участвовавшим возрастам (для UI)
//   - games/wins/draws/losses/goalsFor/goalsAgainst: суммарная статистика (info)
//   - points поле сохранено для обратной совместимости с UI (= сумма очков по командам)
export function buildClubRanking(allStandings, ourMatcher) {
  // Список возрастов, который реально участвует в зачёте (с этими ageGroup пришли standings)
  const allAges = [...new Set(allStandings.map((s) => s.ageGroup).filter(Boolean))];

  // Для каждого возраста — размер лиги (для расчёта штрафа за отсутствие)
  const leagueSize = new Map();
  for (const s of allStandings) {
    if (s.ageGroup) leagueSize.set(s.ageGroup, (s.table || []).length);
  }

  const agg = new Map();
  for (const s of allStandings) {
    for (const row of (s.table || [])) {
      const key = normalizeClubName(row.team);
      if (!key) continue;
      const cur = agg.get(key) || {
        name: displayClubName(row.team),
        shield: row.shield || null,
        games: 0, wins: 0, draws: 0, losses: 0,
        goalsFor: 0, goalsAgainst: 0, points: 0,
        ageGroups: [],
        breakdown: {}, // { '2010': { pos, total }, ... }
      };
      cur.games += +row.games || 0;
      cur.wins += +row.wins || 0;
      cur.draws += +row.draws || 0;
      cur.losses += +row.losses || 0;
      cur.goalsFor += +row.scored || +row.goalsFor || 0;
      cur.goalsAgainst += +row.missed || +row.goalsAgainst || 0;
      cur.points += +row.points || 0;
      if (s.ageGroup) {
        cur.ageGroups.push(s.ageGroup);
        const pos = +row.pos || 0;
        cur.breakdown[s.ageGroup] = {
          pos: pos > 0 ? pos : null,
          total: leagueSize.get(s.ageGroup) || 0,
        };
      }
      if (!cur.shield && row.shield) cur.shield = row.shield;
      agg.set(key, cur);
    }
  }

  // Считаем posSum для каждого клуба со штрафом за отсутствие в возрастной группе.
  const clubs = [...agg.values()].map((c) => {
    let posSum = 0;
    let participated = 0;
    for (const age of allAges) {
      const item = c.breakdown[age];
      if (item && item.pos) {
        posSum += item.pos;
        participated++;
      } else {
        // Штраф: размер той лиги + 1 (как будто финишировал последним и ещё ниже)
        const penalty = (leagueSize.get(age) || 10) + 1;
        posSum += penalty;
      }
    }
    const avgPos = participated > 0 ? +(posSum / allAges.length).toFixed(1) : null;
    return { ...c, posSum, participated, avgPos };
  });

  // Сортировка: меньше posSum = выше; при равенстве — больше реально участвовавших возрастов;
  // дальше — лучше goal difference (как tie-breaker, как в обычной таблице).
  const ranked = clubs
    .sort((a, b) => {
      if (a.posSum !== b.posSum) return a.posSum - b.posSum;
      if (a.participated !== b.participated) return b.participated - a.participated;
      return (b.goalsFor - b.goalsAgainst) - (a.goalsFor - a.goalsAgainst);
    })
    .map((c, i) => ({ rank: i + 1, ...c }));

  const matcher = String(ourMatcher || '').toLowerCase();
  const ours = matcher ? ranked.find((c) => c.name.toLowerCase().includes(matcher)) : null;

  return {
    ranking: ranked,
    ourClubRank: ours ? ours.rank : null,
    ourClubStats: ours || null,
    totalClubs: ranked.length,
    // Возвращаем формулу для UI чтобы фронт мог показать пояснение
    formula: 'place-sum',
    // Порядок: от младших к старшим (как табы в шапке: U14 → U17).
    // 2013 → 2012 → 2011 → 2010 (год рождения убывает = возраст растёт).
    countedAgeGroups: allAges.sort().reverse(),
  };
}
