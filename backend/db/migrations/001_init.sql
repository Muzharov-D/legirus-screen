-- Sprint 3 — initial schema for АванDата.
-- Применяется один раз через `npm run db:migrate`.
-- Документация полей — в SPEC_SPRINT_3_POSTGRES.md.

CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- Клубы (в Sprint 3 — один Легирус, в Sprint 4 — N клубов)
CREATE TABLE IF NOT EXISTS clubs (
  id            TEXT PRIMARY KEY,
  name          TEXT NOT NULL,
  display_name  TEXT NOT NULL,
  ffspb_matcher TEXT,
  meta          JSONB DEFAULT '{}'::jsonb,
  created_at    TIMESTAMPTZ DEFAULT NOW()
);

-- Команды (5 возрастов клуба)
CREATE TABLE IF NOT EXISTS teams (
  id            TEXT PRIMARY KEY,
  club_id       TEXT NOT NULL REFERENCES clubs(id) ON DELETE CASCADE,
  name          TEXT NOT NULL,
  age_group     TEXT NOT NULL,
  year          INT,
  head_coach    TEXT,
  is_our_team   BOOLEAN DEFAULT TRUE,
  active        BOOLEAN DEFAULT TRUE,
  meta          JSONB DEFAULT '{}'::jsonb
);
CREATE INDEX IF NOT EXISTS idx_teams_club ON teams(club_id);

-- Игроки
CREATE TABLE IF NOT EXISTS players (
  id            TEXT PRIMARY KEY,
  team_id       TEXT NOT NULL REFERENCES teams(id) ON DELETE CASCADE,
  full_name     TEXT NOT NULL,
  first_name    TEXT,
  last_name     TEXT,
  number        INT,
  position      TEXT,
  position_full TEXT,
  birth_date    DATE,
  photo_url     TEXT,
  meta          JSONB DEFAULT '{}'::jsonb
);
CREATE INDEX IF NOT EXISTS idx_players_team ON players(team_id);

-- Пользователи (auth)
CREATE TABLE IF NOT EXISTS users (
  id            TEXT PRIMARY KEY,
  username      TEXT UNIQUE NOT NULL,
  password_hash TEXT NOT NULL,
  full_name     TEXT,
  role          TEXT NOT NULL CHECK (role IN ('head_coach','team_coach','player','super_admin')),
  team_id       TEXT REFERENCES teams(id) ON DELETE SET NULL,
  player_id     TEXT REFERENCES players(id) ON DELETE SET NULL,
  club_id       TEXT REFERENCES clubs(id) ON DELETE CASCADE,
  created_at    TIMESTAMPTZ DEFAULT NOW(),
  last_login    TIMESTAMPTZ
);
CREATE INDEX IF NOT EXISTS idx_users_team ON users(team_id);
CREATE INDEX IF NOT EXISTS idx_users_username ON users(username);

-- Матчи (заголовок)
CREATE TABLE IF NOT EXISTS matches (
  id            TEXT PRIMARY KEY,
  team_id       TEXT NOT NULL REFERENCES teams(id) ON DELETE CASCADE,
  home_team_id  TEXT,
  away_team_id  TEXT,
  home_team_name TEXT,
  away_team_name TEXT,
  match_date    TIMESTAMPTZ,
  season        TEXT,
  tournament    TEXT DEFAULT 'league',
  score_home    INT,
  score_away    INT,
  pdf_source    TEXT,
  uploaded_by   TEXT REFERENCES users(id),
  uploaded_at   TIMESTAMPTZ DEFAULT NOW(),
  team_summary_stats JSONB,
  team_aggregates    JSONB,
  team_avg_ratings   JSONB,
  meta          JSONB DEFAULT '{}'::jsonb
);
CREATE INDEX IF NOT EXISTS idx_matches_team ON matches(team_id);
CREATE INDEX IF NOT EXISTS idx_matches_date ON matches(match_date DESC);
CREATE INDEX IF NOT EXISTS idx_matches_tournament ON matches(tournament);

-- Игроки в матче
CREATE TABLE IF NOT EXISTS match_players (
  match_id      TEXT NOT NULL REFERENCES matches(id) ON DELETE CASCADE,
  player_id     TEXT NOT NULL REFERENCES players(id) ON DELETE CASCADE,
  number        INT,
  position      TEXT,
  position_full TEXT,
  minutes       INT,
  ratings       JSONB,
  stats         JSONB,
  splits        JSONB,
  radar         JSONB,
  maps          JSONB,
  PRIMARY KEY (match_id, player_id)
);
CREATE INDEX IF NOT EXISTS idx_match_players_player ON match_players(player_id);

-- Турнирная таблица (snapshot per refresh)
CREATE TABLE IF NOT EXISTS standings (
  id            BIGSERIAL PRIMARY KEY,
  club_id       TEXT NOT NULL REFERENCES clubs(id) ON DELETE CASCADE,
  age_group     TEXT NOT NULL,
  season        TEXT NOT NULL,
  league_name   TEXT,
  source_url    TEXT,
  table_data    JSONB NOT NULL,
  fetched_at    TIMESTAMPTZ DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_standings_lookup ON standings(club_id, age_group, season, fetched_at DESC);

-- Календарь
CREATE TABLE IF NOT EXISTS calendar (
  id            BIGSERIAL PRIMARY KEY,
  club_id       TEXT NOT NULL REFERENCES clubs(id) ON DELETE CASCADE,
  age_group     TEXT NOT NULL,
  season        TEXT NOT NULL,
  ext_match_id  TEXT,
  match_date    TIMESTAMPTZ,
  home_team     TEXT,
  away_team     TEXT,
  ext_home_team_id TEXT,
  ext_away_team_id TEXT,
  score_home    INT,
  score_away    INT,
  is_our_match  BOOLEAN DEFAULT FALSE,
  venue         TEXT,
  group_name    TEXT,
  round         TEXT,
  source_url    TEXT,
  fetched_at    TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(club_id, age_group, ext_match_id)
);
CREATE INDEX IF NOT EXISTS idx_calendar_lookup ON calendar(club_id, age_group, match_date);

-- Кубковая сетка (хранится JSONB-блобом, как и стандингс)
CREATE TABLE IF NOT EXISTS cup_brackets (
  id            BIGSERIAL PRIMARY KEY,
  club_id       TEXT NOT NULL REFERENCES clubs(id) ON DELETE CASCADE,
  age_group     TEXT NOT NULL,
  season        TEXT NOT NULL,
  cup_name      TEXT,
  source_url    TEXT,
  rounds_data   JSONB NOT NULL,
  parse_hint    TEXT,
  fetched_at    TIMESTAMPTZ DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_cup_lookup ON cup_brackets(club_id, age_group, season, fetched_at DESC);

-- Push-подписки
CREATE TABLE IF NOT EXISTS push_subscriptions (
  id            BIGSERIAL PRIMARY KEY,
  user_id       TEXT REFERENCES users(id) ON DELETE CASCADE,
  team_id       TEXT REFERENCES teams(id) ON DELETE CASCADE,
  role          TEXT,
  endpoint      TEXT UNIQUE NOT NULL,
  p256dh        TEXT NOT NULL,
  auth          TEXT NOT NULL,
  user_agent    TEXT,
  created_at    TIMESTAMPTZ DEFAULT NOW(),
  updated_at    TIMESTAMPTZ DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_push_user ON push_subscriptions(user_id);
CREATE INDEX IF NOT EXISTS idx_push_team ON push_subscriptions(team_id);

-- Метрики (один документ на всё)
CREATE TABLE IF NOT EXISTS metrics (
  key           TEXT PRIMARY KEY,
  data          JSONB NOT NULL,
  updated_at    TIMESTAMPTZ DEFAULT NOW()
);

-- Конфиг скрейпа на уровне клуба (понадобится в Sprint 4)
CREATE TABLE IF NOT EXISTS scrape_config (
  club_id        TEXT PRIMARY KEY REFERENCES clubs(id) ON DELETE CASCADE,
  league_name    TEXT NOT NULL,
  our_club_matcher TEXT NOT NULL,
  season         TEXT NOT NULL,
  sources        JSONB NOT NULL,
  cup_sources    JSONB DEFAULT '{}'::jsonb,
  calendar_sources JSONB DEFAULT '{}'::jsonb
);
