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

export function buildClubRanking(allStandings, ourMatcher) {
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
      };
      cur.games += +row.games || 0;
      cur.wins += +row.wins || 0;
      cur.draws += +row.draws || 0;
      cur.losses += +row.losses || 0;
      cur.goalsFor += +row.scored || +row.goalsFor || 0;
      cur.goalsAgainst += +row.missed || +row.goalsAgainst || 0;
      cur.points += +row.points || 0;
      if (s.ageGroup) cur.ageGroups.push(s.ageGroup);
      if (!cur.shield && row.shield) cur.shield = row.shield;
      agg.set(key, cur);
    }
  }

  const ranked = [...agg.values()]
    .sort((a, b) => b.points - a.points || (b.goalsFor - b.goalsAgainst) - (a.goalsFor - a.goalsAgainst))
    .map((c, i) => ({ rank: i + 1, ...c }));

  const matcher = String(ourMatcher || '').toLowerCase();
  const ours = matcher ? ranked.find((c) => c.name.toLowerCase().includes(matcher)) : null;

  return {
    ranking: ranked,
    ourClubRank: ours ? ours.rank : null,
    ourClubStats: ours || null,
    totalClubs: ranked.length,
  };
}
