-- Sprint 5.B: переделать match_callups для работы с calendar (ffspb-матчи).
-- Старая схема ссылалась на matches.id (только PDF-загруженные сыгранные матчи).
-- Callup'ы нужны на БУДУЩИЕ матчи из calendar (ext_match_id), которых в matches нет.
--
-- Таблица пустая — просто drop + recreate.

DROP TABLE IF EXISTS match_callups;

CREATE TABLE match_callups (
  id            BIGSERIAL PRIMARY KEY,
  club_id       TEXT NOT NULL REFERENCES clubs(id) ON DELETE CASCADE,
  age_group     TEXT NOT NULL,
  ext_match_id  TEXT NOT NULL,                  -- ffspb match id (calendar.ext_match_id)
  player_id     TEXT NOT NULL REFERENCES players(id) ON DELETE CASCADE,
  status        TEXT NOT NULL DEFAULT 'pending'
                  CHECK (status IN ('pending','called','confirmed','declined','excused')),
  note          TEXT,
  called_at     TIMESTAMPTZ DEFAULT NOW(),      -- когда тренер добавил в призыв
  responded_at  TIMESTAMPTZ,                    -- когда игрок/родитель ответил
  by_user_id    TEXT REFERENCES users(id) ON DELETE SET NULL,
  UNIQUE(club_id, age_group, ext_match_id, player_id)
);
CREATE INDEX IF NOT EXISTS idx_callups_match ON match_callups(club_id, age_group, ext_match_id);
CREATE INDEX IF NOT EXISTS idx_callups_player ON match_callups(player_id);
CREATE INDEX IF NOT EXISTS idx_callups_status ON match_callups(status) WHERE status IN ('pending','called');
