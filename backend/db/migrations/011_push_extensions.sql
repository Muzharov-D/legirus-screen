-- Sprint 5.8: расширения push-системы.
--   1) notif_deferred — очередь отложенных пушей (тихие часы 23:00-08:00 МСК).
--   2) notif_recipient_log — лог отправок per-endpoint для rate-limit (5/24h).
--   3) push_subscriptions.prefs — JSONB с opt-out по kinds.

CREATE TABLE IF NOT EXISTS notif_deferred (
  id            BIGSERIAL PRIMARY KEY,
  scope         TEXT NOT NULL,
  scope_id      TEXT NOT NULL,
  team_id       TEXT,
  payload       JSONB NOT NULL,
  deliver_at    TIMESTAMPTZ NOT NULL,
  created_at    TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(scope, scope_id)
);
CREATE INDEX IF NOT EXISTS idx_notif_deferred_deliver ON notif_deferred(deliver_at);

-- Хранит только последние 24-48ч (записи старше можно периодически чистить).
CREATE TABLE IF NOT EXISTS notif_recipient_log (
  id            BIGSERIAL PRIMARY KEY,
  endpoint      TEXT NOT NULL,
  scope         TEXT NOT NULL,
  scope_id      TEXT NOT NULL,
  sent_at       TIMESTAMPTZ DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_notif_recipient_log ON notif_recipient_log(endpoint, sent_at DESC);

-- Per-subscription opt-out: { "match-coach-comment": false, "match-events-first": false }.
-- Дефолт: пусто = всё включено.
ALTER TABLE push_subscriptions
  ADD COLUMN IF NOT EXISTS prefs JSONB DEFAULT '{}'::jsonb;
