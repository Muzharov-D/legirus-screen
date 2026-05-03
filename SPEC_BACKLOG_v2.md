# SPEC_BACKLOG_v2 — План работ

Полный технический беклог проекта «Экран Легирус» после первой производственной фазы. Пункты ранжированы по приоритету. Каждый — отдельная единица работы; делать строго в порядке указанной нумерации, маленькими PR'ами.

---

## P1 — КРИТИЧНО (защита от регрессии)

### 1.1 teamId guard в pdfParser.js

**Цель:** не допустить ситуации когда `match.json` создаётся без `teamId` (мы уже теряли это поле, и игроки не видели матч).

**Файлы:** `backend/services/pdfParser.js`

**Что делать:** после `JSON.parse(fs.readFileSync(outJson, 'utf-8'))` добавить блок:

```js
if (!matchData.teamId || matchData.teamId !== teamId) {
  matchData.teamId = teamId;  // force-set, чтобы guard не падал
  fs.writeFileSync(outJson, JSON.stringify(matchData, null, 2), 'utf-8');
  invalidateCache(outJson);
}
if (!matchData.teamId) {
  throw new Error(`Парсер не записал teamId в ${outJson} — миграция отказана`);
}
```

И аналогичный assert на entry перед `appendMatchToIndex`:
```js
if (!entry.teamId) throw new Error('Match entry missing teamId — refusing to write index');
```

**Acceptance:** прогнать smoke (UI как coach2010 → match виден) после намеренного `delete match.teamId` локально — должна быть понятная ошибка, а не молчаливый bad state.

**Оценка:** 30 минут.

---

### 1.2 Backup /var/data на Render

**Цель:** ежедневный snapshot persistent disk в безопасное место (потеря данных = катастрофа, восстанавливать неоткуда).

**Файлы:** новый `backend/scripts/backup-vardata.sh` + scheduled task в Render

**Что делать:**

1. Создать `backend/scripts/backup-vardata.sh`:
```bash
#!/usr/bin/env bash
set -euo pipefail
TS=$(date +%Y%m%d-%H%M%S)
DEST="/var/data/backups"
mkdir -p "$DEST"
tar czf "$DEST/vardata-$TS.tar.gz" -C /var/data --exclude=backups matches matches.json users.json maps teams.json players.json metrics.json 2>/dev/null || true
# Rotate — keep last 7 daily backups
ls -1t "$DEST"/vardata-*.tar.gz 2>/dev/null | tail -n +8 | xargs -r rm
echo "backup OK: $DEST/vardata-$TS.tar.gz"
```

2. На Render Dashboard → legirus-api → Cron Jobs (если нет — создать новый Cron Job сервис, читающий тот же disk):
   - Schedule: `0 3 * * *` (3 утра каждый день)
   - Command: `bash /opt/render/project/src/backend/scripts/backup-vardata.sh`

3. Опционально (надёжнее): scheduled push в GitHub Releases или S3. Это отдельный пункт 1.2-bis, не блокер.

**Acceptance:** на Render Shell `ls /var/data/backups/` должно показывать недавний tar.gz; `tar tzf vardata-XXXX.tar.gz | head` — содержит `matches/match-001.json`.

**Оценка:** 1 час (создать скрипт + настроить Cron Job).

---

### 1.3 Pre-deploy CI

**Цель:** автоматический golden-test + lint + build перед мерджем в main. Сегодня регрессии ловились в проде, должны ловиться в PR.

**Файлы:** `.github/workflows/ci.yml`

**Содержимое:**
```yaml
name: CI
on: [push, pull_request]
jobs:
  test:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-python@v5
        with: { python-version: '3.10' }
      - uses: actions/setup-node@v4
        with: { node-version: '20' }
      - name: Install Python deps
        run: pip install pdfplumber pillow pytest
      - name: Run parser tests
        run: cd backend/parsers && python -m pytest tests/ -v
      - name: Frontend build
        run: cd frontend && npm ci && npm run build
      - name: Backend syntax check
        run: cd backend && node -c server.js && for f in routes/*.js services/*.js middleware/*.js; do node -c "$f"; done
```

**Acceptance:** PR в main, который ломает golden-test, должен иметь красный CI и быть заблокирован на merge.

**Оценка:** 30-45 минут.

---

## P2 — UX-РОСТ (когда матчей > 1)

### 2.1 Список матчей сезона + фильтры

**Цель:** `MatchesDashboard.jsx` показывает все матчи сезона в виде карточек/таблицы; фильтры: команда, противник, период.

**Файлы:** `frontend/src/pages/MatchesDashboard.jsx`, `MatchesDashboard.css`

**Acceptance:** при наличии 5+ матчей в `matches.json` рендерятся все, можно фильтровать.

**Оценка:** 3-4 часа.

---

### 2.2 Прогресс игрока по сезону

**Цель:** на странице игрока — линейный график overall/fitness/attack/defence rating по матчам.

**Файлы:** `frontend/src/pages/PlayerDetail.jsx`, новый компонент `PlayerProgressChart.jsx`. Использовать recharts (уже подключён в проекте).

**Backend:** новый endpoint `/api/data/player/:playerId/timeline` возвращающий массив `[{date, matchId, ratings}]` по всем матчам игрока в его команде.

**Оценка:** 3-4 часа.

---

### 2.3 Загрузка нескольких PDF разом

**Цель:** в `PdfUploadDialog` — drag-and-drop списка файлов, парсинг в очередь, прогресс по каждому.

**Файлы:** `frontend/src/components/PdfUploadDialog.jsx`, `backend/routes/upload.js`

**Backend:** `POST /api/upload-pdf/batch` — принимает массив файлов, парсит последовательно, возвращает array of `{filename, matchId, status}`.

**Оценка:** 4-5 часов.

---

### 2.4 Аватарки и позиции для игроков 2011

**Цель:** заполнить `players.json` для legirus-2011 — `photo`, `position`, `positionFull`.

**Файлы:** `backend/data/players.json` + 14 PNG в `frontend/public/assets/photos/` (или другая папка которую UI читает).

**Что делать:** руками собрать 14 фото игроков 2011, конвертировать в одинаковый формат (квадрат, ~150x150), сохранить как `p<num>-<lastname>-2011-photo.png`. В `players.json` подставить пути и позиции.

**Оценка:** 1-2 часа (если фото уже есть у тренера) + 30 минут если нужно конвертировать.

---

## P3 — ПАРСЕР DOODLES (точечные доводки)

### 3.1 Success rate split key — last вместо first

**Файл:** `backend/parsers/aggregates/splits.py`

**Что делать:** для ключа `"Success rate"` в parser использовать `re.findall(...)` и брать **последний** match. На странице PDF этот label встречается 3 раза («Tackle success rate», «Duel success rate», «Dribble success rate»); golden хранит последний (Goal kick).

**Acceptance:** golden test для player p17 «Success rate» совпадает с golden, общий счёт с 1550/1575 → 1551/1575.

**Оценка:** 15 минут.

---

### 3.2 penaltyWithShot / freeKicksWithShot в setPieces

**Файл:** `backend/parsers/aggregates/set_pieces.py`

**Что делать:** на странице 13 после labels FREE KICKS / PENALTY есть «WITH SHOT» подзаголовок с тройкой value/pct/successful. Извлекать через regex `WITH SHOT\s+(\d+)(\d+)%\s*(\d+)` и выбирать первый/второй match для freeKicksWithShot/penaltyWithShot соответственно.

**Acceptance:** match-001 setPieces 21/21 fields с golden.

**Оценка:** 30 минут.

---

### 3.3 recoveriesAndTackling.returnsByThird

**Файл:** `backend/parsers/aggregates/recoveries.py`

**Что делать:** на странице 17 в правой колонке 3 числа: «IN FIRST THIRD <n>», «IN SECOND THIRD <n>», «IN THIRD THIRD <n>» (rаньше встречаются те же labels с тремя значениями для recoveries). Извлекать второе вхождение каждого third (после первого, который уже использован для inFirstThird/inSecondThird/inThirdThird).

**Acceptance:** match-001 recoveriesAndTackling 18/20 → 20/20 (включая returns + returnsByThird).

**Оценка:** 1 час.

---

## P4 — БЕЗОПАСНОСТЬ (когда юзеров > 50)

### 4.1 Rate limiting на /api/auth/login

**Файлы:** `backend/server.js`, новая dependency `express-rate-limit`

**Что делать:**
```js
import rateLimit from 'express-rate-limit';
const authLimiter = rateLimit({ windowMs: 15*60*1000, max: 10 });
app.use('/api/auth/login', authLimiter);
```

**Acceptance:** 11 неудачных логинов с одного IP за 15 минут возвращают 429.

**Оценка:** 30 минут.

---

### 4.2 Audit log

**Файлы:** `backend/middleware/audit.js` (новый), `backend/server.js`

**Что делать:** middleware пишет JSON-line в `/var/data/audit.log` для каждого write-запроса (POST/PUT/DELETE) с полями `{ts, user, role, method, path, ip}`. Отдельный endpoint `/api/admin/audit` (только head_coach) для просмотра.

**Оценка:** 1.5 часа.

---

### 4.3 JWT secret rotation

**Цель:** возможность менять `JWT_SECRET` без выкидывания всех сессий. Backend проверяет два секрета (old + new) при verify; новые токены подписываются только new.

**Файлы:** `backend/middleware/auth.js`, env vars `JWT_SECRET` + `JWT_SECRET_OLD`

**Оценка:** 2 часа.

---

## P5 — АРХИТЕКТУРА (когда матчей > 50)

### 5.1 Миграция в SQLite

**Цель:** JSON-файлы упрутся в производительность и race conditions при concurrent uploads. SQLite даёт ACID, индексы, query.

**Файлы:** новый `backend/services/db.js` (better-sqlite3), миграция данных из JSON в `/var/data/legirus.db`.

**Оценка:** 1-2 дня.

---

### 5.2 Async upload через очередь

**Цель:** PDF парсится 2-3 секунды; при batch upload UI зависает. Bull/BullMQ + Redis.

**Файлы:** `backend/services/queue.js`, отдельный worker process.

**Render setup:** добавить Redis instance + worker service.

**Оценка:** 1 день.

---

## Порядок исполнения (рекомендуемый)

1. P1.1 (teamId guard) — 30 мин
2. P1.2 (backup) — 1 час
3. P1.3 (CI) — 45 мин
4. P3.1, P3.2, P3.3 (парсер doodles, ~2 часа суммарно)
5. P2.4 (фото 2011, 1 час)
6. P2.1 (список матчей, 3-4 часа)
7. P4.1 (rate limiting, 30 мин)
8. P2.2, P2.3 (прогресс игрока, batch upload, ~7-9 часов)
9. P4.2, P4.3 (audit, JWT rotation, ~3.5 часа)
10. P5 (архитектура, когда матчей > 50)

Итого до пункта 8 — ~20-25 часов работы. Это закрывает 90% беклога, оставляя архитектурные правки на потом.

---

## Защита от FS-truncation на mount

При работе с большими файлами (>1.5 KB) через Edit-tool возможна обрезка. Все P-пункты выше предусматривают компактные изменения; для крупных правок (P2.1, P2.3) делать их **прямо в PowerShell**, минуя WSL mount, или разбивать на множество мелких файлов (<1.5 KB каждый).
