-- Sprint 5.6: pre-match составы из FFSPB API.
-- Структура lineups_data:
-- { home: [{playerId, name, number, bench, photo}, ...],
--   away: [{playerId, name, number, bench, photo}, ...] }
-- bench=false — стартовый состав, bench=true — запасные.

ALTER TABLE calendar
  ADD COLUMN IF NOT EXISTS lineups_data JSONB,
  ADD COLUMN IF NOT EXISTS lineups_fetched_at TIMESTAMPTZ;
