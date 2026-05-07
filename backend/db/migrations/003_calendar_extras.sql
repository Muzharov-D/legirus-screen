-- Sprint 3 follow-up: добавить поля, которых не было в 001_init.
-- Эти данные возвращает скрейпер ffspb и они нужны фронту:
--   - tournament: 'league' | 'cup' (для бейджа на карточке)
--   - home_shield / away_shield: URL логотипов клубов с nagradion.ru
--   - title: название турнира (для public-страницы и ICS)
--   - sources: список (tournament + URL + found) — отображается в UI календаря тренеров
-- Все колонки nullable — старые строки не ломаются.

ALTER TABLE calendar
  ADD COLUMN IF NOT EXISTS tournament  TEXT DEFAULT 'league',
  ADD COLUMN IF NOT EXISTS home_shield TEXT,
  ADD COLUMN IF NOT EXISTS away_shield TEXT;

-- Snapshot верхнего уровня календаря на возраст: title, sources, parserHint, lastUpdated.
-- Хранится один rolling-snapshot на пару (club_id, age_group). UPSERT через ON CONFLICT.
CREATE TABLE IF NOT EXISTS calendar_meta (
  club_id      TEXT NOT NULL REFERENCES clubs(id) ON DELETE CASCADE,
  age_group    TEXT NOT NULL,
  season       TEXT,
  title        TEXT,
  parser_hint  TEXT,
  sources      JSONB DEFAULT '[]'::jsonb,
  fetched_at   TIMESTAMPTZ DEFAULT NOW(),
  PRIMARY KEY (club_id, age_group)
);
