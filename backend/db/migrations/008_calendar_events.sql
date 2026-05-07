-- Sprint 5.5+: события матча из FFSPB API (голы, карточки, замены).
-- Хранятся в calendar.events_data как JSONB blob, плюс events_fetched_at для дедупа cron.
-- Обогащают страницу матча для родителей и тренера ДО загрузки SportVisor PDF.
--
-- Структура events_data:
-- [
--   { type: 'goal', minute: 24, playerId: '/api/players/...', playerName: 'Октябрев А.', team: 'host'|'guest', assistName?: ... },
--   { type: 'yellow_card', minute: 33, playerName: '...', team: 'guest' },
--   { type: 'substitution_in', minute: 60, playerName: '...', team: 'host' },
--   ...
-- ]

ALTER TABLE calendar
  ADD COLUMN IF NOT EXISTS events_data JSONB,
  ADD COLUMN IF NOT EXISTS events_fetched_at TIMESTAMPTZ;
