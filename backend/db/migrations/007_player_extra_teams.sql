-- Sprint 5.5: поддержка игроков, играющих в нескольких возрастных группах одновременно.
-- Кейс: Дютиль (Легирус 2011 заявка) играет за Легирус 2010 как «играющий на год старше».
--
-- Решение: TEXT[] массив team_id, в которых игрок ТАКЖЕ может быть вызван.
-- Primary team из ffspb остаётся в players.team_id, extra — добавляется тренером
-- через UI (или вручную). При повторных синках players_sync extra_teams не сбрасывается.
--
-- Запросы players по команде должны учитывать оба поля:
--   WHERE team_id = $1 OR $1 = ANY(extra_teams)

ALTER TABLE players
  ADD COLUMN IF NOT EXISTS extra_teams TEXT[] DEFAULT ARRAY[]::TEXT[];
