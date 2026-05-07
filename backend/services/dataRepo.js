// Универсальный data layer: PG если DATABASE_URL есть, иначе JSON-файлы (legacy).
// Сигнатуры идентичны старому dataLoader.js — drop-in замена.
//
// Все функции возвращают данные в той же структуре что и до Sprint 3,
// чтобы фронт не пришлось менять.

import { isPgEnabled, query } from '../db/pool.js';
import * as legacy from './dataLoader.js';

// === TEAMS ===
export async function loadTeams() {
  if (!isPgEnabled()) return legacy.loadTeams();
  const r = await query(`
    SELECT id, club_id AS "clubId", name, age_group AS "ageGroup", year,
           head_coach AS "headCoach", is_our_team AS "isOurTeam", active, meta
    FROM teams ORDER BY year NULLS LAST, name`);
  return { teams: r.rows };
}

// === PLAYERS ===
export async function loadPlayers() {
  if (!isPgEnabled()) return legacy.loadPlayers();
  const r = await query(`
    SELECT id, team_id AS "teamId", full_name AS "fullName",
           first_name AS "firstName", last_name AS "lastName",
           number, position, position_full AS "positionFull",
           birth_date AS "birthDate", photo_url AS "photoUrl"
    FROM players ORDER BY team_id, number NULLS LAST`);
  return { players: r.rows };
}

export async function loadPlayer(playerId) {
  if (!isPgEnabled()) {
    const all = legacy.loadPlayers();
    return (all.players || []).find((p) => p.id === playerId) || null;
  }
  const r = await query(`
    SELECT id, team_id AS "teamId", full_name AS "fullName",
           first_name AS "firstName", last_name AS "lastName",
           number, position, position_full AS "positionFull",
           birth_date AS "birthDate", photo_url AS "photoUrl"
    FROM players WHERE id = $1`, [playerId]);
  return r.rows[0] || null;
}

// === MATCHES ===
export async function loadMatchesIndex() {
  if (!isPgEnabled()) return legacy.loadMatchesIndex();
  const r = await query(`
    SELECT id, team_id AS "teamId", home_team_id AS "homeTeamId", away_team_id AS "awayTeamId",
           home_team_name AS "homeTeamName", away_team_name AS "awayTeamName",
           match_date AS date, season, tournament,
           jsonb_build_object('home', score_home, 'away', score_away) AS score
    FROM matches ORDER BY match_date DESC NULLS LAST`);
  return { matches: r.rows };
}

export async function loadMatch(matchId) {
  if (!isPgEnabled()) return legacy.loadMatch(matchId);
  const m = await query(`
    SELECT id, team_id AS "teamId", home_team_id, away_team_id,
           home_team_name, away_team_name,
           match_date AS date, season, tournament,
           score_home, score_away,
           team_summary_stats AS "teamSummaryStats",
           team_aggregates AS "teamAggregates",
           team_avg_ratings AS "teamAvgRatings",
           meta
    FROM matches WHERE id = $1`, [matchId]);
  if (m.rows.length === 0) throw new Error(`Матч ${matchId} не найден`);
  const head = m.rows[0];

  const players = await query(`
    SELECT mp.player_id AS id, mp.number, mp.position, mp.position_full AS "positionFull",
           mp.minutes, mp.ratings, mp.stats, mp.splits, mp.radar, mp.maps,
           p.full_name AS "fullName", p.first_name AS "firstName", p.last_name AS "lastName",
           p.photo_url AS "photoUrl"
    FROM match_players mp
    JOIN players p ON p.id = mp.player_id
    WHERE mp.match_id = $1
    ORDER BY mp.number NULLS LAST`, [matchId]);

  return {
    id: head.id,
    teamId: head.teamId,
    homeTeam: { id: head.home_team_id, name: head.home_team_name },
    awayTeam: { id: head.away_team_id, name: head.away_team_name },
    date: head.date,
    season: head.season,
    tournament: head.tournament,
    score: { home: head.score_home, away: head.score_away },
    teamSummaryStats: head.teamSummaryStats,
    teamAggregates: head.teamAggregates,
    teamAvgRatings: head.teamAvgRatings,
    players: players.rows,
    meta: head.meta,
  };
}

// === METRICS ===
export async function loadMetrics() {
  if (!isPgEnabled()) return legacy.loadMetrics();
  const r = await query(`SELECT data FROM metrics WHERE key = 'main' LIMIT 1`);
  if (r.rows.length === 0) return legacy.loadMetrics(); // fallback к файлу
  return r.rows[0].data;
}

// === STANDINGS ===
export async function loadStandings(ageGroup) {
  if (!isPgEnabled()) return legacy.loadStandings(ageGroup);
  const r = await query(`
    SELECT age_group AS "ageGroup", season, league_name AS title, source_url AS source,
           table_data AS "table", fetched_at AS "lastUpdated"
    FROM standings
    WHERE club_id = 'legirus' AND age_group = $1
    ORDER BY fetched_at DESC LIMIT 1`, [ageGroup]);
  return r.rows[0] || null;
}

export async function listStandings() {
  if (!isPgEnabled()) return legacy.listStandings();
  const r = await query(`SELECT DISTINCT age_group FROM standings WHERE club_id = 'legirus' ORDER BY age_group`);
  return r.rows.map((row) => row.age_group);
}

// === CUP ===
export async function loadCup(ageGroup) {
  if (!isPgEnabled()) return legacy.loadCup(ageGroup);
  const r = await query(`
    SELECT age_group AS "ageGroup", season, cup_name AS title, source_url AS source,
           rounds_data AS rounds, parse_hint AS "parseHint", fetched_at AS "lastUpdated"
    FROM cup_brackets
    WHERE club_id = 'legirus' AND age_group = $1
    ORDER BY fetched_at DESC LIMIT 1`, [ageGroup]);
  return r.rows[0] || null;
}

export async function listCup() {
  if (!isPgEnabled()) return legacy.listCup();
  const r = await query(`SELECT DISTINCT age_group FROM cup_brackets WHERE club_id = 'legirus' ORDER BY age_group`);
  return r.rows.map((row) => row.age_group);
}

// === CALENDAR ===
export async function loadCalendar(ageGroup) {
  if (!isPgEnabled()) return legacy.loadCalendar(ageGroup);
  const r = await query(`
    SELECT ext_match_id AS "matchId", match_date AS date,
           home_team AS home, away_team AS away,
           ext_home_team_id AS "homeTeamId", ext_away_team_id AS "awayTeamId",
           CASE WHEN score_home IS NOT NULL THEN jsonb_build_object('home', score_home, 'away', score_away) ELSE NULL END AS score,
           score_home IS NOT NULL AS "isPast",
           is_our_match AS "isOurMatch",
           venue, group_name AS "group", round,
           tournament,
           home_shield AS "homeShield",
           away_shield AS "awayShield"
    FROM calendar
    WHERE club_id = 'legirus' AND age_group = $1
    ORDER BY match_date NULLS LAST`, [ageGroup]);
  if (r.rows.length === 0) return null;

  const meta = await query(`
    SELECT season, title, parser_hint AS "parserHint", sources, fetched_at AS "lastUpdated"
    FROM calendar_meta WHERE club_id = 'legirus' AND age_group = $1`, [ageGroup]);
  const head = meta.rows[0] || {};

  const now = new Date();
  const matches = r.rows.map((m) => ({
    ...m,
    isUpcoming: !m.score && (!m.date || new Date(m.date) >= now),
  }));
  return {
    ageGroup,
    season: head.season || null,
    title: head.title || null,
    parserHint: head.parserHint || null,
    sources: head.sources || [],
    matches,
    lastUpdated: head.lastUpdated || null,
  };
}

export async function listCalendar() {
  if (!isPgEnabled()) return legacy.listCalendar();
  const r = await query(`SELECT DISTINCT age_group FROM calendar WHERE club_id = 'legirus' ORDER BY age_group`);
  return r.rows.map((row) => row.age_group);
}

// === MUTATIONS ===
export async function appendMatchToIndex(matchEntry) {
  if (!isPgEnabled()) return legacy.appendMatchToIndex(matchEntry);
  // В PG матчи добавляются через основной поток uploadPdf → processPdf →
  // pdfParser пишет JSON, а потом вызывает migrate-один-матч... Sprint 3 переходное решение:
  // используем legacy для записи в JSON, а отдельный hook (pdfParser → INSERT) добавим позже.
  return legacy.appendMatchToIndex(matchEntry);
}

// === HELPERS ===
export function invalidateCache(filePath) {
  // PG не имеет cache, no-op. Legacy для JSON.
  return legacy.invalidateCache(filePath);
}

export function ensureMatchesDir() {
  return legacy.ensureMatchesDir();
}

export function listMatchFiles() {
  return legacy.listMatchFiles();
}

export const PATHS = legacy.PATHS;
