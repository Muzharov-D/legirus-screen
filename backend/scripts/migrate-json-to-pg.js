// Однократный скрипт переноса JSON-файлов backend/data/* в PostgreSQL.
// Идемпотентный: ON CONFLICT DO UPDATE / DO NOTHING.
//
// Запуск:
//   npm run db:import:dry   — показать что будет вставлено, без реальной записи
//   npm run db:import       — реально записать в БД
//
// Перед запуском: должен быть применён 001_init.sql (npm run db:migrate).

import 'dotenv/config';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { getPool, tx, shutdown } from '../db/pool.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const DATA_DIR = path.resolve(__dirname, '..', 'data');

const DRY = process.argv.includes('--dry-run');
const COMMIT = process.argv.includes('--commit');
if (!DRY && !COMMIT) {
  console.error('Usage: node scripts/migrate-json-to-pg.js --dry-run | --commit');
  process.exit(1);
}

const stats = {};
function bump(key, n = 1) { stats[key] = (stats[key] || 0) + n; }

function loadJson(rel) {
  const p = path.join(DATA_DIR, rel);
  if (!fs.existsSync(p)) return null;
  return JSON.parse(fs.readFileSync(p, 'utf-8'));
}

function listFiles(rel) {
  const dir = path.join(DATA_DIR, rel);
  if (!fs.existsSync(dir)) return [];
  return fs.readdirSync(dir).filter((f) => f.endsWith('.json') && !f.startsWith('_'));
}

async function importClubsAndTeams(client) {
  // Один клуб «Легирус» в Sprint 3. Sprint 4 — расширение.
  const club = {
    id: 'legirus',
    name: 'Легирус',
    display_name: 'ФК Легирус',
    ffspb_matcher: 'Легирус',
  };
  if (DRY) {
    console.log('[clubs] would insert:', club);
    bump('clubs.insert');
  } else {
    await client.query(
      `INSERT INTO clubs (id, name, display_name, ffspb_matcher)
       VALUES ($1, $2, $3, $4)
       ON CONFLICT (id) DO UPDATE SET name = EXCLUDED.name, display_name = EXCLUDED.display_name`,
      [club.id, club.name, club.display_name, club.ffspb_matcher],
    );
    bump('clubs.upsert');
  }

  const teamsData = loadJson('teams.json');
  if (!teamsData) { console.warn('[teams] teams.json не найден'); return; }
  for (const t of teamsData.teams || []) {
    if (!t.isOurTeam) continue; // соперников в teams не пишем
    const row = {
      id: t.id,
      club_id: 'legirus',
      name: t.name,
      age_group: String(t.year || t.ageGroup || ''),
      year: Number(t.year) || null,
      head_coach: t.headCoach || null,
      is_our_team: !!t.isOurTeam,
      active: t.active !== false,
    };
    if (DRY) {
      bump('teams.insert');
      continue;
    }
    await client.query(
      `INSERT INTO teams (id, club_id, name, age_group, year, head_coach, is_our_team, active)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
       ON CONFLICT (id) DO UPDATE SET
         name = EXCLUDED.name, age_group = EXCLUDED.age_group, year = EXCLUDED.year,
         head_coach = EXCLUDED.head_coach, active = EXCLUDED.active`,
      [row.id, row.club_id, row.name, row.age_group, row.year, row.head_coach, row.is_our_team, row.active],
    );
    bump('teams.upsert');
  }
}

async function importPlayers(client) {
  const data = loadJson('players.json');
  if (!data) { console.warn('[players] players.json не найден'); return; }
  for (const p of data.players || []) {
    const row = {
      id: p.id,
      team_id: p.teamId,
      full_name: p.fullName || `${p.firstName || ''} ${p.lastName || ''}`.trim(),
      first_name: p.firstName || null,
      last_name: p.lastName || null,
      number: Number(p.number) || null,
      position: p.position || null,
      position_full: p.positionFull || null,
      birth_date: p.birthDate || null,
      photo_url: p.photoUrl || null,
    };
    if (DRY) { bump('players.insert'); continue; }
    await client.query(
      `INSERT INTO players (id, team_id, full_name, first_name, last_name, number, position, position_full, birth_date, photo_url)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10)
       ON CONFLICT (id) DO UPDATE SET
         full_name = EXCLUDED.full_name, number = EXCLUDED.number,
         position = EXCLUDED.position, position_full = EXCLUDED.position_full,
         photo_url = COALESCE(EXCLUDED.photo_url, players.photo_url)`,
      [row.id, row.team_id, row.full_name, row.first_name, row.last_name,
       row.number, row.position, row.position_full, row.birth_date, row.photo_url],
    );
    bump('players.upsert');
  }
}

async function importUsers(client) {
  const data = loadJson('users.json');
  if (!data) { console.warn('[users] users.json не найден'); return; }
  for (const u of data.users || []) {
    if (DRY) { bump('users.insert'); continue; }
    await client.query(
      `INSERT INTO users (id, username, password_hash, full_name, role, team_id, player_id, club_id, created_at)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8, COALESCE($9::timestamptz, NOW()))
       ON CONFLICT (id) DO UPDATE SET
         password_hash = EXCLUDED.password_hash, full_name = EXCLUDED.full_name,
         role = EXCLUDED.role, team_id = EXCLUDED.team_id, player_id = EXCLUDED.player_id`,
      [u.id, u.username, u.passwordHash, u.fullName, u.role,
       u.teamId || null, u.playerId || null, 'legirus', u.createdAt || null],
    );
    bump('users.upsert');
  }
}

async function importMatchesIndex(client) {
  const data = loadJson('matches.json');
  if (!data) { console.warn('[matches] matches.json не найден'); return; }
  for (const m of data.matches || []) {
    const detail = loadJson(path.join('matches', `${m.id}.json`));
    const row = {
      id: m.id,
      team_id: m.teamId,
      home_team_id: detail?.homeTeam?.id || null,
      away_team_id: detail?.awayTeam?.id || null,
      home_team_name: m.homeTeamName || detail?.homeTeam?.name || null,
      away_team_name: m.awayTeamName || detail?.awayTeam?.name || null,
      match_date: m.date || detail?.date || null,
      season: detail?.season || null,
      tournament: m.tournament || detail?.tournament || 'league',
      score_home: m.score?.home ?? detail?.score?.home ?? null,
      score_away: m.score?.away ?? detail?.score?.away ?? null,
      team_summary_stats: detail?.teamSummaryStats || null,
      team_aggregates: detail?.teamAggregates || null,
      team_avg_ratings: detail?.teamAvgRatings || null,
    };
    if (DRY) { bump('matches.insert'); }
    else {
      await client.query(
        `INSERT INTO matches (id, team_id, home_team_id, away_team_id, home_team_name, away_team_name,
                              match_date, season, tournament, score_home, score_away,
                              team_summary_stats, team_aggregates, team_avg_ratings)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14)
         ON CONFLICT (id) DO UPDATE SET
           home_team_name = EXCLUDED.home_team_name, away_team_name = EXCLUDED.away_team_name,
           score_home = EXCLUDED.score_home, score_away = EXCLUDED.score_away,
           team_summary_stats = EXCLUDED.team_summary_stats,
           team_aggregates = EXCLUDED.team_aggregates,
           team_avg_ratings = EXCLUDED.team_avg_ratings`,
        [row.id, row.team_id, row.home_team_id, row.away_team_id, row.home_team_name, row.away_team_name,
         row.match_date, row.season, row.tournament, row.score_home, row.score_away,
         row.team_summary_stats, row.team_aggregates, row.team_avg_ratings],
      );
      bump('matches.upsert');
    }

    // Players в матче
    if (detail?.players && Array.isArray(detail.players)) {
      for (const p of detail.players) {
        if (DRY) { bump('match_players.insert'); continue; }
        await client.query(
          `INSERT INTO match_players (match_id, player_id, number, position, position_full, minutes, ratings, stats, splits, radar, maps)
           VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11)
           ON CONFLICT (match_id, player_id) DO UPDATE SET
             minutes = EXCLUDED.minutes, ratings = EXCLUDED.ratings,
             stats = EXCLUDED.stats, splits = EXCLUDED.splits, radar = EXCLUDED.radar, maps = EXCLUDED.maps`,
          [m.id, p.id, p.number, p.position, p.positionFull, p.minutes,
           p.ratings || null, p.stats || null, p.splits || null, p.radar || null, p.maps || null],
        );
        bump('match_players.upsert');
      }
    }
  }
}

async function importStandings(client) {
  for (const file of listFiles('standings')) {
    const age = file.replace('.json', '');
    const data = loadJson(path.join('standings', file));
    if (!data || !Array.isArray(data.table)) continue;
    if (DRY) { bump('standings.insert'); continue; }
    await client.query(
      `INSERT INTO standings (club_id, age_group, season, league_name, source_url, table_data, fetched_at)
       VALUES ('legirus', $1, $2, $3, $4, $5, $6)`,
      [age, data.season || '', data.title || null, data.source || null,
       JSON.stringify(data.table), data.lastUpdated || new Date().toISOString()],
    );
    bump('standings.insert');
  }
}

async function importCalendar(client) {
  for (const file of listFiles('calendar')) {
    const age = file.replace('.json', '');
    const data = loadJson(path.join('calendar', file));
    if (!data || !Array.isArray(data.matches)) continue;
    for (const m of data.matches) {
      if (DRY) { bump('calendar.insert'); continue; }
      await client.query(
        `INSERT INTO calendar (club_id, age_group, season, ext_match_id, match_date, home_team, away_team,
                               ext_home_team_id, ext_away_team_id, score_home, score_away, is_our_match,
                               venue, group_name, round, source_url, fetched_at)
         VALUES ('legirus', $1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16)
         ON CONFLICT (club_id, age_group, ext_match_id) DO UPDATE SET
           match_date = EXCLUDED.match_date, score_home = EXCLUDED.score_home,
           score_away = EXCLUDED.score_away, venue = EXCLUDED.venue,
           is_our_match = EXCLUDED.is_our_match`,
        [age, data.season || '', m.matchId, m.date,
         m.home, m.away, m.homeTeamId, m.awayTeamId,
         m.score?.home ?? null, m.score?.away ?? null,
         !!m.isOurMatch, m.venue, m.group, m.round, data.source || null,
         data.lastUpdated || new Date().toISOString()],
      );
      bump('calendar.upsert');
    }
  }
}

async function importCup(client) {
  for (const file of listFiles('cup')) {
    const age = file.replace('.json', '');
    const data = loadJson(path.join('cup', file));
    if (!data) continue;
    if (DRY) { bump('cup.insert'); continue; }
    await client.query(
      `INSERT INTO cup_brackets (club_id, age_group, season, cup_name, source_url, rounds_data, parse_hint, fetched_at)
       VALUES ('legirus', $1, $2, $3, $4, $5, $6, $7)`,
      [age, data.season || '', data.cupName || data.title || null,
       data.source || null, JSON.stringify(data.rounds || []),
       data.parseHint || null, data.lastUpdated || new Date().toISOString()],
    );
    bump('cup.insert');
  }
}

async function importMetrics(client) {
  const data = loadJson('metrics.json');
  if (!data) { console.warn('[metrics] metrics.json не найден'); return; }
  if (DRY) { bump('metrics.insert'); return; }
  await client.query(
    `INSERT INTO metrics (key, data, updated_at)
     VALUES ('main', $1, NOW())
     ON CONFLICT (key) DO UPDATE SET data = EXCLUDED.data, updated_at = NOW()`,
    [data],
  );
  bump('metrics.upsert');
}

async function importPushSubscriptions(client) {
  const data = loadJson('push-subscriptions.json');
  if (!data || !Array.isArray(data.subscriptions)) return;
  for (const s of data.subscriptions) {
    if (DRY) { bump('push.insert'); continue; }
    const sub = s.subscription || {};
    await client.query(
      `INSERT INTO push_subscriptions (user_id, team_id, role, endpoint, p256dh, auth, created_at, updated_at)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
       ON CONFLICT (endpoint) DO UPDATE SET
         user_id = EXCLUDED.user_id, team_id = EXCLUDED.team_id,
         role = EXCLUDED.role, updated_at = NOW()`,
      [s.userId, s.teamId, s.role, sub.endpoint,
       sub.keys?.p256dh, sub.keys?.auth,
       s.createdAt || new Date().toISOString(),
       s.updatedAt || new Date().toISOString()],
    );
    bump('push.upsert');
  }
}

async function importScrapeConfig(client) {
  const cfg = loadJson(path.join('standings', '_config.json'));
  if (!cfg) return;
  if (DRY) { bump('scrape_config.insert'); return; }
  await client.query(
    `INSERT INTO scrape_config (club_id, league_name, our_club_matcher, season, sources, cup_sources, calendar_sources)
     VALUES ('legirus', $1, $2, $3, $4, $5, $6)
     ON CONFLICT (club_id) DO UPDATE SET
       league_name = EXCLUDED.league_name, season = EXCLUDED.season,
       sources = EXCLUDED.sources, cup_sources = EXCLUDED.cup_sources,
       calendar_sources = EXCLUDED.calendar_sources`,
    [cfg.league, cfg.ourClubMatcher, cfg.season,
     JSON.stringify(cfg.sources || {}),
     JSON.stringify(cfg.cup?.sources || {}),
     JSON.stringify(cfg.calendarSources || {})],
  );
  bump('scrape_config.upsert');
}

async function run() {
  if (DRY) console.log('=== DRY-RUN — изменения не будут применены ===\n');
  if (!getPool()) {
    console.error('DATABASE_URL не задан в .env');
    process.exit(1);
  }
  try {
    await tx(async (client) => {
      console.log('--- 1/9 clubs + teams ---');     await importClubsAndTeams(client);
      console.log('--- 2/9 players ---');           await importPlayers(client);
      console.log('--- 3/9 users ---');             await importUsers(client);
      console.log('--- 4/9 matches + match_players ---'); await importMatchesIndex(client);
      console.log('--- 5/9 standings ---');         await importStandings(client);
      console.log('--- 6/9 calendar ---');          await importCalendar(client);
      console.log('--- 7/9 cup brackets ---');      await importCup(client);
      console.log('--- 8/9 metrics ---');           await importMetrics(client);
      console.log('--- 9/9 push subscriptions + scrape_config ---');
      await importPushSubscriptions(client);
      await importScrapeConfig(client);
    });
    console.log('\n=== STATS ===');
    for (const [k, v] of Object.entries(stats).sort()) {
      console.log(`  ${k}: ${v}`);
    }
    console.log(DRY ? '\nDRY-RUN OK. Запусти `npm run db:import` чтобы применить.' : '\n✅ COMMIT OK.');
  } finally {
    await shutdown();
  }
}

run().catch((e) => {
  console.error('FATAL:', e.message);
  process.exit(1);
});
