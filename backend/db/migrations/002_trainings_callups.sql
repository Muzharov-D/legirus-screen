-- Sprint 5: тренировки, явка, вызов состава на игру.
-- Зависит от 001_init.sql (clubs, teams, players, users, matches).

CREATE TABLE IF NOT EXISTS trainings (
  id            UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  team_id       TEXT NOT NULL REFERENCES teams(id) ON DELETE CASCADE,
  starts_at     TIMESTAMPTZ NOT NULL,
  duration_min  INT NOT NULL DEFAULT 90,
  venue_id      TEXT,                       -- из venues.json (id вида 'ffspb-79669')
  venue_text    TEXT,                       -- если venue свой/произвольный
  type          TEXT NOT NULL DEFAULT 'training' CHECK (type IN ('training','extra','warmup','recovery','meet')),
  notes         TEXT,
  created_by    TEXT REFERENCES users(id) ON DELETE SET NULL,
  created_at    TIMESTAMPTZ DEFAULT NOW(),
  updated_at    TIMESTAMPTZ DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_trainings_team_date ON trainings(team_id, starts_at);

-- Явка игроков на тренировку.
-- status NULL = не ответил (дефолт). 'going' / 'not_going' = ответил.
CREATE TABLE IF NOT EXISTS training_attendance (
  training_id   UUID NOT NULL REFERENCES trainings(id) ON DELETE CASCADE,
  player_id     TEXT NOT NULL REFERENCES players(id) ON DELETE CASCADE,
  status        TEXT CHECK (status IN ('going','not_going')),
  responded_at  TIMESTAMPTZ DEFAULT NOW(),
  set_by_coach  BOOLEAN DEFAULT FALSE,      -- тренер проставил вручную (не сам игрок)
  PRIMARY KEY (training_id, player_id)
);
CREATE INDEX IF NOT EXISTS idx_attendance_player ON training_attendance(player_id);

-- Вызов на матч. Тренер собирает список → шлёт уведомления.
CREATE TABLE IF NOT EXISTS match_callups (
  match_id      TEXT NOT NULL REFERENCES matches(id) ON DELETE CASCADE,
  player_id     TEXT NOT NULL REFERENCES players(id) ON DELETE CASCADE,
  status        TEXT NOT NULL DEFAULT 'called' CHECK (status IN ('called','confirmed','declined')),
  called_at     TIMESTAMPTZ DEFAULT NOW(),
  responded_at  TIMESTAMPTZ,
  by_user_id    TEXT REFERENCES users(id) ON DELETE SET NULL,
  PRIMARY KEY (match_id, player_id)
);
CREATE INDEX IF NOT EXISTS idx_callups_match ON match_callups(match_id);

-- Дедуп лог для пушей (cron шлёт за 36/24/6 часов — каждый шлём один раз).
CREATE TABLE IF NOT EXISTS notif_log (
  id            BIGSERIAL PRIMARY KEY,
  scope         TEXT NOT NULL,              -- 'callup-reminder-36h', 'callup-reminder-24h', 'callup-reminder-6h', 'training-created', 'callup-broadcast'
  scope_id      TEXT NOT NULL,              -- match_id / training_id / etc
  sent_at       TIMESTAMPTZ DEFAULT NOW(),
  meta          JSONB DEFAULT '{}'::jsonb,
  UNIQUE(scope, scope_id)
);
CREATE INDEX IF NOT EXISTS idx_notif_log_lookup ON notif_log(scope, scope_id);

-- Шаблоны для recurring тренировок (Q5: тренер заполняет шаблон → "создать на месяц").
-- Это просто "preset" для UI, генерация tranings — на стороне приложения.
CREATE TABLE IF NOT EXISTS training_templates (
  id            UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  team_id       TEXT NOT NULL REFERENCES teams(id) ON DELETE CASCADE,
  name          TEXT,                       -- 'Будни 18:00'
  weekdays      INT[] NOT NULL,             -- [1,3,5] для пн/ср/пт (ISO: 1=Mon..7=Sun)
  start_time    TIME NOT NULL,              -- 18:00
  duration_min  INT NOT NULL DEFAULT 90,
  venue_id      TEXT,
  venue_text    TEXT,
  notes         TEXT,
  created_by    TEXT REFERENCES users(id) ON DELETE SET NULL,
  created_at    TIMESTAMPTZ DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_tpl_team ON training_templates(team_id);
