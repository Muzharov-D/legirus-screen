# Sprint 3 ТЗ — Миграция JSON → PostgreSQL

**Срок:** ~2 недели
**Цель:** заменить файловое JSON-хранилище на PostgreSQL без визуального изменения UI.
**Зачем:** транзакции (race condition при параллельной загрузке PDF), индексы (поиск по матчам/игрокам), миграции схемы, надёжные бэкапы, фундамент под Sprint 4 (multi-club) и Sprint 5+ (LLM-агент с retrieval).

---

## 1. Стек и зависимости

```
backend:
  pg                     ^8.11      — нативный драйвер
  pg-pool                bundled    — connection pool
  postgres-migrations    ^5.3       — applied-files миграции (опц. knex/drizzle)
  pg-format              ^1.0       — безопасный bulk-insert
```

**ENV** (Render → Postgres add-on или внешний Neon/Supabase):
```
DATABASE_URL=postgres://user:pass@host:5432/avandata?sslmode=require
DATABASE_POOL_MAX=10
DATABASE_SSL=true
```

`backend/db/pool.js` — singleton Pool, экспорт `query(sql, params)` и `tx(async fn)`.

---

## 2. Schema (DDL)

```sql
-- 001_init.sql
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- Клубы (захардкожен один «Легирус» в Sprint 3, multi-club — в Sprint 4)
CREATE TABLE clubs (
  id            TEXT PRIMARY KEY,                 -- 'legirus'
  name          TEXT NOT NULL,
  display_name  TEXT NOT NULL,
  ffspb_matcher TEXT,                              -- 'Легирус'
  meta          JSONB DEFAULT '{}'::jsonb,
  created_at    TIMESTAMPTZ DEFAULT NOW()
);

-- Команды (5 возрастов)
CREATE TABLE teams (
  id            TEXT PRIMARY KEY,                 -- 'legirus-2010'
  club_id       TEXT NOT NULL REFERENCES clubs(id) ON DELETE CASCADE,
  name          TEXT NOT NULL,
  age_group     TEXT NOT NULL,                    -- '2010'
  year          INT,
  head_coach    TEXT,
  is_our_team   BOOLEAN DEFAULT TRUE,
  active        BOOLEAN DEFAULT TRUE,
  meta          JSONB DEFAULT '{}'::jsonb
);
CREATE INDEX idx_teams_club ON teams(club_id);

-- Игроки
CREATE TABLE players (
  id            TEXT PRIMARY KEY,                 -- 'p-2010-007'
  team_id       TEXT NOT NULL REFERENCES teams(id) ON DELETE CASCADE,
  full_name     TEXT NOT NULL,
  first_name    TEXT,
  last_name     TEXT,
  number        INT,
  position      TEXT,
  position_full TEXT,
  birth_date    DATE,
  photo_url     TEXT,
  meta          JSONB DEFAULT '{}'::jsonb
);
CREATE INDEX idx_players_team ON players(team_id);

-- Пользователи (auth)
CREATE TABLE users (
  id            UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  username      TEXT UNIQUE NOT NULL,
  password_hash TEXT NOT NULL,
  full_name     TEXT,
  role          TEXT NOT NULL CHECK (role IN ('head_coach','team_coach','player','super_admin')),
  team_id       TEXT REFERENCES teams(id) ON DELETE SET NULL,
  player_id     TEXT REFERENCES players(id) ON DELETE SET NULL,
  club_id       TEXT REFERENCES clubs(id) ON DELETE CASCADE,
  created_at    TIMESTAMPTZ DEFAULT NOW(),
  last_login    TIMESTAMPTZ
);
CREATE INDEX idx_users_team ON users(team_id);

-- Матчи (заголовок)
CREATE TABLE matches (
  id            TEXT PRIMARY KEY,                 -- 'match-001'
  team_id       TEXT NOT NULL REFERENCES teams(id) ON DELETE CASCADE,
  home_team_id  TEXT,                              -- nullable, может быть внешняя команда
  away_team_id  TEXT,
  home_team_name TEXT,
  away_team_name TEXT,
  match_date    TIMESTAMPTZ,
  season        TEXT,
  tournament    TEXT DEFAULT 'league',            -- league|cup
  score_home    INT,
  score_away    INT,
  pdf_source    TEXT,                              -- путь к загруженному PDF
  uploaded_by   UUID REFERENCES users(id),
  uploaded_at   TIMESTAMPTZ DEFAULT NOW(),
  team_summary_stats JSONB,                        -- хранит home/away stats как JSONB
  team_aggregates    JSONB,                        -- 9 секций
  team_avg_ratings   JSONB,                        -- 4 рейтинга
  meta          JSONB DEFAULT '{}'::jsonb
);
CREATE INDEX idx_matches_team ON matches(team_id);
CREATE INDEX idx_matches_date ON matches(match_date DESC);
CREATE INDEX idx_matches_tournament ON matches(tournament);

-- Игроки в матче (плоская строка на участие)
CREATE TABLE match_players (
  match_id      TEXT NOT NULL REFERENCES matches(id) ON DELETE CASCADE,
  player_id     TEXT NOT NULL REFERENCES players(id) ON DELETE CASCADE,
  number        INT,
  position      TEXT,
  position_full TEXT,
  minutes       INT,
  ratings       JSONB,                              -- {overall, fitness, attack, defence}
  stats         JSONB,                              -- {attack1..4, defence1..3, fitness}
  splits        JSONB,                              -- {[metricKey]: {first, second, match}}
  radar         JSONB,                              -- {[axisKey]: value}
  maps          JSONB,                              -- {attackMap, fitnessHeatmap}
  PRIMARY KEY (match_id, player_id)
);
CREATE INDEX idx_match_players_player ON match_players(player_id);

-- Турнирная таблица (snapshot per refresh)
CREATE TABLE standings (
  id            BIGSERIAL PRIMARY KEY,
  club_id       TEXT NOT NULL REFERENCES clubs(id) ON DELETE CASCADE,
  age_group     TEXT NOT NULL,
  season        TEXT NOT NULL,
  league_name   TEXT,
  source_url    TEXT,
  table_data    JSONB NOT NULL,                    -- весь массив команд как JSONB
  fetched_at    TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(club_id, age_group, season, fetched_at)
);
CREATE INDEX idx_standings_lookup ON standings(club_id, age_group, season, fetched_at DESC);

-- Календарь (календарные матчи лиги, не обязательно нашего клуба)
CREATE TABLE calendar (
  id            BIGSERIAL PRIMARY KEY,
  club_id       TEXT NOT NULL REFERENCES clubs(id) ON DELETE CASCADE,
  age_group     TEXT NOT NULL,
  season        TEXT NOT NULL,
  match_date    TIMESTAMPTZ,
  home_team     TEXT,
  away_team     TEXT,
  score_home    INT,
  score_away    INT,
  is_our_match  BOOLEAN DEFAULT FALSE,
  venue         TEXT,
  round         TEXT,
  source_url    TEXT,
  fetched_at    TIMESTAMPTZ DEFAULT NOW()
);
CREATE INDEX idx_calendar_lookup ON calendar(club_id, age_group, match_date);

-- Push-подписки
CREATE TABLE push_subscriptions (
  id            BIGSERIAL PRIMARY KEY,
  user_id       UUID REFERENCES users(id) ON DELETE CASCADE,
  team_id       TEXT REFERENCES teams(id) ON DELETE CASCADE,
  endpoint      TEXT UNIQUE NOT NULL,
  p256dh        TEXT NOT NULL,
  auth          TEXT NOT NULL,
  user_agent    TEXT,
  created_at    TIMESTAMPTZ DEFAULT NOW(),
  updated_at    TIMESTAMPTZ DEFAULT NOW()
);
CREATE INDEX idx_push_user ON push_subscriptions(user_id);
CREATE INDEX idx_push_team ON push_subscriptions(team_id);

-- Метрики (справочник, единый на всех)
CREATE TABLE metrics (
  key           TEXT PRIMARY KEY,
  data          JSONB NOT NULL                     -- весь metrics.json как JSONB
);
```

**Решения:**
- `match_players.stats/splits/radar/maps` остаются JSONB — структура переменчива, не имеет смысла нормализовать дальше. Для фильтра/поиска в будущем — GIN-индексы по этим колонкам.
- `team_aggregates` — JSONB с 9 секциями (shooting/setPieces/passes/...). Без денормализации, читаем целиком.
- `standings` хранит **snapshot** на каждый refresh, last-write-wins нет. Запросы — по `MAX(fetched_at)`.
- `players.id` — текстовый (исторически `p-2010-007`), не меняем чтобы не править PNG-карты.

---

## 3. Migration tooling

**Подход:** numbered SQL files + library `postgres-migrations`.

```
backend/db/migrations/
  001_init.sql                  -- схема выше
  002_seed_legirus_club.sql     -- INSERT клуба + 4 команд
  003_indexes_perf.sql          -- доп. GIN-индексы по необходимости
```

`backend/db/migrate.js`:
```js
import { migrate } from 'postgres-migrations';
import { pool } from './pool.js';
await migrate({ client: await pool.connect() }, './db/migrations');
```

Запуск перед `app.listen()` в `server.js` если `NODE_ENV=production` или явный `--migrate`.

---

## 4. Скрипт переноса JSON → PG

`backend/scripts/migrate-json-to-pg.js` — однократный, idempotent:

```js
// 1. Прочитать teams.json, INSERT clubs+teams
// 2. Прочитать players.json, INSERT players
// 3. Прочитать users.json, INSERT users (с уже-захешированными bcrypt хешами)
// 4. Прочитать matches.json, для каждого matches/match-NNN.json:
//    - INSERT matches (header + JSONB фрагменты)
//    - INSERT match_players (по строке на p ∈ players[])
// 5. Прочитать standings/{age}.json → INSERT standings (по одной snapshot записи)
// 6. Прочитать calendar/{age}.json → INSERT calendar
// 7. Прочитать metrics.json → INSERT metrics
```

ON CONFLICT DO NOTHING на UNIQUE-ключах. Прогон в одной транзакции (`pool.tx`).

Параметры запуска:
```
node backend/scripts/migrate-json-to-pg.js --dry-run  # печать SQL без exec
node backend/scripts/migrate-json-to-pg.js --commit
```

---

## 5. Рефакторинг рутов и сервисов

`backend/services/dataLoader.js` → `backend/services/dataRepo.js` с теми же сигнатурами:

```
loadTeams()             → SELECT clubs+teams JOIN
loadPlayers()           → SELECT players
loadMatchesIndex()      → SELECT matches ORDER BY match_date DESC
loadMatch(matchId)      → SELECT matches+match_players JOIN, склеить как раньше
loadStandings(age)      → SELECT * FROM standings WHERE age_group=$1 ORDER BY fetched_at DESC LIMIT 1
listStandings()         → SELECT DISTINCT age_group
loadCalendar(age)       → SELECT * FROM calendar WHERE age_group=$1 ORDER BY match_date
listCalendar()          → SELECT DISTINCT age_group
loadCup(age)            → SELECT cup snapshot (analog standings)
loadMetrics()           → SELECT * FROM metrics LIMIT 1
appendMatchToIndex(m)   → INSERT matches + match_players (TRANSACTION)
```

Все API-роуты в `routes/data.js`, `routes/upload.js`, `routes/auth.js` НЕ меняются — только репо за ними.

`pushService.js` → переписать `readSubs/writeSubs` на `SELECT/INSERT push_subscriptions`.

`standingsService.js`, `calendarService.js`, `cupService.js` → после `fetchAndParse` делают `INSERT standings/calendar/cup` вместо `fs.writeFileSync`.

---

## 6. Бэкап и миграция в продакшен

1. `pg_dump` ежесуточно через cron на Render (или managed бэкапы провайдера).
2. Перед деплоем — снимок базы на staging, прогон миграций, smoke-тест API.
3. После прогона `migrate-json-to-pg.js` — оставить JSON-файлы на 30 дней read-only как fallback.
4. ENV `DATA_SOURCE=pg|json` — feature flag для отката (опц., если требуется hot-rollback).

---

## 7. Что меняется в HANDOFF после Sprint 3

- Раздел «Хранилище» переписать
- Раздел «Структура данных» — заменить на «Схема БД»
- Раздел «Конфигурация ENV» — добавить `DATABASE_URL`
- Раздел «Полезные команды» — добавить `npm run db:migrate`, `npm run db:seed`

---

## 8. Чек-лист готовности (Definition of Done)

- [ ] `001_init.sql` применяется без ошибок на пустой БД
- [ ] `migrate-json-to-pg.js --dry-run` печатает корректный SQL для всех файлов
- [ ] `migrate-json-to-pg.js --commit` отрабатывает за <30 сек на полном датасете
- [ ] Все существующие API-эндпоинты возвращают **идентичный** JSON до и после миграции (snapshot test через jest)
- [ ] Загрузка PDF (POST /api/upload-pdf) пишет в БД и эндпоинт `/api/data/match/:id` сразу видит новый матч
- [ ] Push-подписка сохраняется в БД, отправка работает
- [ ] Cron'ы standings/calendar/cup пишут snapshots
- [ ] `pg_dump` + `pg_restore` сохраняют все данные
- [ ] Render Web Service запускается с `DATABASE_URL` без падений

---

## 9. Точки риска

1. **Огромные match JSON** — один матч ≈ 200 КБ JSON, 100 матчей сезона ≈ 20 МБ. Это нормально для PG, но bulk-insert делать через `pg-format.format(template, rows)` чтобы не словить prepared-statement лимит.
2. **Bcrypt хеши пользователей** — переносим как есть, не пересчитываем.
3. **Матчи на Persistent Disk** (`MATCHES_DIR`) — после миграции БД эта переменная не нужна, удалить из ENV. PNG-карты остаются на диске.
4. **Cache в `dataLoader`** — заменить на short-lived (60 сек) memory-cache в `dataRepo` или вообще убрать (Postgres быстрый).
5. **Транзакционность апдейта стандингов** — `BEGIN; DELETE FROM standings WHERE age=$1 AND fetched_at < NOW() - 30 days; INSERT ...; COMMIT;`
