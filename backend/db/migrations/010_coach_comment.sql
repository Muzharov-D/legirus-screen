-- Sprint 5.7: пост-матчевый комментарий тренера к матчу.
-- Тренер пишет краткий разбор, который видят родители в публичной модалке.

ALTER TABLE calendar
  ADD COLUMN IF NOT EXISTS coach_comment TEXT;
