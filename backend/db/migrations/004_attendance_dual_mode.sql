-- Sprint 5.1 → PG: расширяем training_attendance для двух режимов:
--   1) RSVP до тренировки (response_status: going|not_going) — игрок отмечает сам
--   2) Отметка постфактум (presence_status: present|late|excused|absent) — тренер
-- Старая схема имела одно поле `status` с CHECK ('going','not_going') — заменяем на два.

-- 1. Добавляем новые колонки
ALTER TABLE training_attendance
  ADD COLUMN IF NOT EXISTS response_status TEXT CHECK (response_status IN ('going','not_going')),
  ADD COLUMN IF NOT EXISTS response_at     TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS presence_status TEXT CHECK (presence_status IN ('present','late','excused','absent')),
  ADD COLUMN IF NOT EXISTS presence_at     TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS marked_by       TEXT REFERENCES users(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS note            TEXT;

-- 2. Если в старой схеме что-то осталось в `status` — мигрируем в response_status (RSVP).
UPDATE training_attendance
   SET response_status = status,
       response_at = COALESCE(response_at, responded_at)
 WHERE response_status IS NULL AND status IN ('going','not_going');

-- 3. Удаляем старые поля (status / responded_at / set_by_coach).
-- IF EXISTS чтобы повторный запуск не упал.
ALTER TABLE training_attendance
  DROP COLUMN IF EXISTS status,
  DROP COLUMN IF EXISTS responded_at,
  DROP COLUMN IF EXISTS set_by_coach;
