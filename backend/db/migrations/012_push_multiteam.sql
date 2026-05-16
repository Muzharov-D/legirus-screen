-- Multi-team push subscriptions.
-- Один endpoint может подписаться на несколько возрастных групп (родитель
-- с 2 детьми, тренер мониторит несколько команд и т.п.).
--
-- Старая колонка team_id остаётся для backward-compat (head_coach без team_id,
-- legacy инсёрты). Cron-фильтр будет OR'ить оба источника.

ALTER TABLE push_subscriptions
  ADD COLUMN IF NOT EXISTS team_ids JSONB DEFAULT '[]'::jsonb;

-- Backfill: единичный team_id переписать в массив team_ids,
-- чтобы новый код единообразно читал именно team_ids.
UPDATE push_subscriptions
SET team_ids = jsonb_build_array(team_id)
WHERE team_id IS NOT NULL
  AND (team_ids IS NULL OR team_ids = '[]'::jsonb);

-- GIN-индекс по массиву ускоряет cron-запросы типа
--   WHERE team_ids @> jsonb_build_array($1)
CREATE INDEX IF NOT EXISTS idx_push_subs_team_ids
  ON push_subscriptions USING gin (team_ids);
