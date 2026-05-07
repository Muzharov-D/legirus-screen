# Экран Легирус (АванDата) — техническое описание

Платформа спортивной аналитики для футбольной школы «Легирус» (5 возрастов, 2009–2013 г.р.). Делает доступной командную и индивидуальную статистику матчей в формате, понятном тренерам, игрокам и родителям. Источник матчевых данных — PDF-отчёты Sportvisor, источник турнирных таблиц — `stat.ffspb.org`.

---

## ⚡ Текущий статус (после Sprint 5 + FFSPB API integration, май 2026)

**Sprint 1 ✅** — клубный лендинг `/club`, парсер ffspb standings, кубковая ветка, мобильный адаптив, ребрендинг в АванDата.
**Sprint 2 ✅** — PWA push-уведомления о новых разборах матчей, страница календаря сезона `/calendar`, уборка мёртвого ИИ-агента.
**Sprint 3 ✅** — миграция JSON → PostgreSQL (Render Frankfurt). 7 миграций, импорт всех данных, dataRepo с PG/JSON-fallback, dual-write для cron-сервисов.
**Sprint 4 📋** — multi-club поддержка (10 клубов лиги). ТЗ есть, не реализовано.
**Sprint 5 ✅** — Тренировки, посещаемость, призыв на матч (Model C — тренер диктует), push-cron 36/24/6h, public-страница для родителей с iCal-фидом.
**Sprint 5.5 ✅** — FFSPB API integration: HTML-скрейп заменён на официальный API stat.ffspb.org/api (calendar/standings/cup/players auto-sync). Cleanup legacy player-IDs → `ffspb-NNN`.

### Что в проде сейчас (auto-pilot)

- **Каждые 6h:** обновляется календарь матчей (4 возраста × 2 турнира = 8 источников через FFSPB API)
- **Каждые 24h:** обновляются турнирные таблицы и кубковые сетки
- **Каждые 12h:** синкается заявочный лист каждой команды (`/api/players?team=...`)
- **Каждые 30 мин:** push-cron проверяет окна 36h/24h/6h до наших матчей и шлёт напоминания подписчикам
- **При тренерском «Отправить призыв»:** push сразу выбранным игрокам через PWA-подписку

### Public flow (родители)

- `/public/team/:age` — расписание команды без авторизации, с venue, shields, картой Я.Карт
- `iCal-feed` `/api/public/calendar/:age.ics` — подписка через webcal:// для iOS/Android/Mac
- PWA-манифест per-age — родители добавляют команду как app на главный экран
- **Privacy-first:** индивидуальная статистика остаётся между тренером и игроком; родители видят только базовое расписание

### Coach flow

- `/calendar` — все матчи, для своих upcoming видна кнопка «👥 Состав на матч» (CallupRoster)
- `/trainings` — CRUD тренировок + массовая отметка посещаемости постфактум (present/late/excused/absent)
- `/week` — недельный вид (матчи + тренировки на 7 дней)
- `/club` — таблица лиги + общеклубный зачёт + позиция в лиге
- CallupRoster — выбор состава на матч, кнопка «👶 Игроки на год младше» для cross-age вызовов

### Player flow

- `/club` MyCallups — блок «Тебя вызвали на матч», три кнопки: Иду / Не смогу (раскрытие: уваж. причина / просто не могу)
- `/players/:id` — индивидуальная статистика SportVisor + блок «Посещаемость тренировок» (% явки за месяц/3мес/сезон)

---

## 1. Архитектура

```
┌──────────────────┐  HTTPS   ┌─────────────────────┐
│  Frontend        │ ───────► │  Backend (Render)   │
│  React + Vite    │  /api/*  │  Express + Node 20  │
│  (Vercel)        │          │                     │
└──────────────────┘          │  ├─ JSON datastore  │
                              │  ├─ JWT auth        │
                              │  ├─ Multer upload   │
                              │  └─ standings cron  │
                              └─────────┬───────────┘
                                        │
                                        ▼
                              ┌─────────────────────┐
                              │  Python parsers     │
                              │  (Sportvisor PDF)   │
                              └─────────────────────┘
```

**Деплой:**
- Frontend: Vercel (push в `main` → авто-сборка)
- Backend: Render Web Service (push в `main` → пересборка)
- БД: Render PostgreSQL Starter, Frankfurt EU
- DNS: `legirus.sportdata.tech` → Vercel; rewrite `/api/*` → Render (обход RKN-блокировок)
- ENV (Render): `DATABASE_URL`, `JWT_SECRET`, `VAPID_*`, `FFSPB_API_KEY`, `FFSPB_ENDPOINT`, `CORS_ORIGIN`, `FRONTEND_URL`

**Хранилище:**
- **PostgreSQL** — все данные (clubs/teams/players/users/matches/match_players/standings/calendar/cup_brackets/trainings/training_attendance/match_callups/notif_log/push_subscriptions/training_templates)
- **JSON в `backend/data/`** — теперь только fallback на случай отсутствия `DATABASE_URL` (никакой prod-data там нет; используется как кэш cron-сервисов до записи в PG)
- Загруженные карты-PNG — `frontend/public/assets/maps/` (на Render — Persistent Disk через `MAPS_DIR`)

---

## 2. Технический стек

**Frontend** (`frontend/`)
- React 18 + Vite, React Router v6
- Recharts для графиков (BarChart, RadarChart custom)
- Чистый CSS без UI-фреймворка (по компонентам), глобальный `mobile.css` для адаптива
- Палитра АванDаты: основной `#22d3ee` (cyan), акцент `#3b82f6` (deep blue), фон `#07071c`
- PWA: `manifest.json` через `frontend/public/icons/site.webmanifest`, `start_url=/club`

**Backend** (`backend/`)
- Node 20+ ESM (`"type": "module"` в package.json)
- Express, Multer (загрузка PDF), bcrypt + jsonwebtoken (auth), cors
- `web-push` (Sprint 2) — VAPID Web Push для PWA уведомлений
- `services/dataLoader.js` — единый абстрактный read-layer над JSON-файлами с in-memory cache
- `services/pdfParser.js` — orchestrator: вызывает Python через `child_process` для парсинга
- `services/standingsService.js` — fetch + парсинг ffspb.org standings, cron на `setInterval` (24h)
- `services/calendarService.js` — fetch + парсинг ffspb.org calendar (Sprint 2), cron 24h
- `services/cupService.js` — кубковая сетка
- `services/pushService.js` — Web Push send/store, no-op без VAPID ENV

**Python parsers** (`backend/parsers/`)
- pdfplumber, PyPDF2, Pillow для извлечения и кропа карт
- Структурированный pipeline: `parse_page1.py` → `parse_player_splits.py` → `crop_player_maps.py` → `build_match.py`

---

## 3. Основные экраны

| Путь | Файл | Описание |
|---|---|---|
| `/login` | `pages/Login.jsx` | Вход; редирект на `/club` после успеха |
| `/club` | `pages/ClubPage.jsx` | **Лендинг.** Клубный зачёт (агрегат 4 возрастов) ↔ Турнирная таблица возраста; топ-7 игроков по рейтингу/голам/ассистам/xG/xA/фитнесу/пробегу |
| `/matches` | `pages/MatchesDashboard.jsx` | Список матчей, переключатель Турнир/Кубок, последний матч, топ-5 игроков сезона с трендом |
| `/matches/:id` | `pages/MatchDetail.jsx` | Расстановка, командная статистика, лидеры матча, «этот матч vs средний по сезону», 8 PNG-карт |
| `/players` | `pages/PlayersLeaders.jsx` | Лидеры по 10 метрикам матча |
| `/players/rating` | `pages/PlayersRating.jsx` | Таблица всех игроков с фильтром по метрике |
| `/players/:id` | `pages/PlayerDetail.jsx` | Профиль игрока: 4 рейтинга, радары, тепловая карта, splits-table по таймам |
| `/calendar` | `pages/CalendarPage.jsx` | **Календарь сезона** (Sprint 2). Будущие/сыгранные матчи возрастной группы из ffspb. Фильтр по возрасту и статусу матча. |
| `/analytics` | `pages/ClubOverview.jsx` | Командные дашборды; на мобиле скрыт из меню (КЛУБ заменил его как лендинг) |
| `/analytics/team` | `pages/ComparisonView.jsx` | Командная статистика — сравнение секций |

---

## 4. Роли и доступ

`backend/middleware/auth.js` + `backend/routes/data.js` — фильтрация на стороне сервера.

| Роль | Видит | Может |
|---|---|---|
| `head_coach` | Все команды клуба, всех игроков, все матчи | Загружать PDF любой команды, переключать команду в шапке |
| `team_coach` | Только свою команду (`teamId`) | Загружать PDF своей команды |
| `player` | Только свою команду; полные данные только по себе, остальные игроки в `locked` режиме | Только просмотр |

**Важно:** на frontend `canSeePlayer(playerId)` отрабатывает блокировку UI; на backend `data.js` блокирует payload (sanitize в `loadMatch`).

---

## 5. Парсер турнирных таблиц

`backend/services/standingsService.js`

**Источники** — `backend/data/standings/_config.json`:
```json
{
  "season": "2025-2026",
  "league": "Вторая лига",
  "ourClubMatcher": "Легирус",
  "sources": {
    "2010": "https://stat.ffspb.org/tournament44333",
    "2011": "https://stat.ffspb.org/tournament44334",
    "2012": "https://stat.ffspb.org/tournament44335",
    "2013": "https://stat.ffspb.org/tournament44336"
  }
}
```

**Алгоритм:**
1. `fetch(url)` — HTML страницы
2. Регексп на `renderComponent("...", 'TournamentTable', {...})` с балансом скобок выдаёт массив `users[]` для нужной лиги
3. Нормализация: stripTags, parseDifference, isOurClub по `ourClubMatcher`
4. Запись в `backend/data/standings/{age}.json`

**Cron:** `setInterval(refreshAll, 24h)` + первый прогон через 5 сек после `app.listen`. При падении источника — `console.error`, сервер не падает (catch в обёртке).

**Endpoints:**
- `GET  /api/data/standings/:age` — таблица возраста
- `GET  /api/data/standings` — список доступных возрастов
- `POST /api/data/standings/:age/refresh` — ручной перерасчёт (для тренеров)
- `POST /api/data/standings/refresh` — все возрасты (только head_coach)

**Клубный зачёт** считается на frontend в `ClubPage.jsx`: суммируем `games/wins/draws/losses/goalsFor/goalsAgainst/points` по нормализованным именам клубов (схлопываются `(ЦФКСиЗ ВО)`, `ГБУ ДО ` и тп).

---

## 6. Парсер PDF (Sportvisor)

`backend/services/pdfParser.js` оркестрирует Python-скрипты:

1. `python parsers/build_match.py {pdfPath} {outJson} {teamId} {matchId}` — главный entry
2. Внутри он вызывает `parse_page1.py` (командная сводка), `parse_player_splits.py` (метрики игроков), `crop_player_maps.py` (тепловые карты + карты атаки)
3. Результат — `data/matches/{matchId}.json` + PNG в `frontend/public/assets/maps/{matchId}/`
4. Backend дополняет entry полями `tournament`, `homeTeamName`, `awayTeamName` и пишет в `data/matches.json`

**Зависимости:** Python 3.10+, `pdfplumber`, `PyPDF2`, `Pillow`. На Render устанавливаются через `requirements.txt` если задеплоен Python build.

---

## 7. PWA / адаптив

- `frontend/index.html` → `<link rel="manifest" href="/icons/site.webmanifest">`
- `start_url=/club`, `scope=/`, `display=standalone`
- Иконки 192/512 px maskable, apple-touch 180px, favicon.svg
- **Service Worker** `frontend/public/sw.js` (Sprint 2) — обработка push и notificationclick. Регистрируется в `main.jsx` после `window.load`.
- **Push-уведомления** (Sprint 2):
  - VAPID-ключи генерируются один раз: `npm run vapid` в `backend/`
  - Подписка инициируется кнопкой 🔔 в `AppHeader` (компонент `PushOptInButton`)
  - Бэкенд отправляет push после успешного парсинга PDF: `notifyMatchProcessed()` в `routes/upload.js`
  - Адресация — по `teamId`: уведомление получают подписчики только нужной команды
  - Клик по уведомлению открывает `/matches/:id`
  - Подписки хранятся в `backend/data/push-subscriptions.json` (после Sprint 3 — в БД)
  - **Без VAPID ENV** push работает в no-op режиме: лог в консоль, без падений
- Глобальный `frontend/src/styles/mobile.css` импортируется в `main.jsx` и покрывает 5 брейкпоинтов:
  - `≤360px` — Galaxy Fold cover, маленькие айфоны
  - `≤480px` — узкие телефоны
  - `≤768px` — все мобильные
  - `769–1024px` — планшеты в портрете
  - `1025–1366px` — small desktop
  - `≤768 + ≤500h` — телефон в горизонтали
- Sidebar превращается в bottom-nav (КЛУБ / МАТЧ / КАЛЕНДАРЬ / МОЙ ПРОФИЛЬ); Аналитика скрыта на мобиле через `[data-nav-id="analytics"]`

---

## 8. Структура данных (ключевые JSON)

```
backend/data/
├── teams.json                 # клуб + 5 команд + соперники, ageGroup, year, isOurTeam
├── players.json               # все игроки, привязаны к teamId
├── users.json                 # auth: head_coach + 15 игроков
├── matches.json               # индекс матчей (id, date, homeTeamId, awayTeamId, score, tournament, teamNames)
├── matches/match-NNN.json     # полный матч: players[], stats, splits, ratings, maps, teamSummaryStats
├── standings/
│   ├── _config.json           # URL'ы парсера standings + cup + (опц.) calendarSources
│   └── {2010..2013}.json      # турнирная таблица: pos, team, games, wins, ..., points
├── calendar/                  # Sprint 2 — расписание, парсится из ffspb /calendar
│   └── {2010..2013}.json      # { matches: [{date, home, away, score?, isOurMatch, ...}] }
├── cup/                       # сетка кубка по возрастам
│   └── {2010..2013}.json
├── metrics.json               # справочник метрик: radarAxes, metricLabels (для UI)
├── push-subscriptions.json    # Sprint 2 — Web Push подписки {endpoint, keys, userId, teamId, role}
└── agent-rules.json           # DEPRECATED (Sprint 2 cleanup) — пустой stub, физическое удаление снаружи
```

Каждый match-файл содержит:
- `homeTeam`, `awayTeam` (id+name), `score`, `date`, `season`, `tournament`
- `teamSummaryStats.{home,away}` — командные показатели (xG, владение, удары, передачи)
- `teamAggregates` — секции (shooting, setPieces, passes, attacks, recoveriesAndTackling, duels, pressing, positioning) с PNG-картой каждой
- `teamAvgRatings` — 4 рейтинга команды (overall/fitness/attack/defence)
- `players[]` с полями: `id, fullName, number, position, positionFull, minutes, ratings.{4}, stats.{attack1..4, defence1..3, fitness}, splits[k].{first,second,match}, radar[k], maps.{attackMap, fitnessHeatmap}`

---

## 9. API endpoints (полный список)

```
POST   /api/auth/login                    public
GET    /api/auth/me                       JWT
GET    /api/data/teams                    role-filtered
GET    /api/data/players                  role-filtered, ?teamId=
GET    /api/data/player/:playerId         role-filtered (для cross-team navigation head_coach)
GET    /api/data/matches                  role-filtered, ?teamId=
GET    /api/data/match/:matchId           role+player sanitized
GET    /api/data/metrics                  public after auth

GET    /api/data/standings                список ageGroups
GET    /api/data/standings/:ageGroup      таблица
POST   /api/data/standings/:age/refresh   coaches only
POST   /api/data/standings/refresh        head_coach only

GET    /api/data/cup                      список ageGroups (кубковая сетка)
GET    /api/data/cup/:ageGroup            сетка
POST   /api/data/cup/:age/refresh         coaches only
POST   /api/data/cup/refresh              head_coach only

GET    /api/data/calendar                 Sprint 2 — список ageGroups календаря
GET    /api/data/calendar/:ageGroup       Sprint 2 — расписание возраста
POST   /api/data/calendar/:age/refresh    Sprint 2 — coaches only
POST   /api/data/calendar/refresh         Sprint 2 — head_coach only

POST   /api/upload-pdf                    coaches only, multipart/form-data {file, teamId, tournament}
                                          триггерит push notifyMatchProcessed после успеха

GET    /api/push/public-key               Sprint 2 — VAPID public для PushManager
POST   /api/push/subscribe                Sprint 2 — { endpoint, keys: { p256dh, auth } }
POST   /api/push/unsubscribe              Sprint 2 — { endpoint }
POST   /api/push/test                     Sprint 2 — coaches only
GET    /api/push/subscriptions            Sprint 2 — head_coach only

GET    /api/maps/* и /assets/*            static
```

**Удалено в Sprint 2:** `POST /api/agent/insight` — rule-based ИИ-агент. Будет заменён реальным LLM в отдельной итерации.

---

## 10. Точки роста

**В работе / следующее (Sprint 3-4):**
1. **Sprint 3 — PostgreSQL.** Полное ТЗ: [`SPEC_SPRINT_3_POSTGRES.md`](./SPEC_SPRINT_3_POSTGRES.md). Schema (10 таблиц), migrations, JSON→PG скрипт, рефактор `dataLoader → dataRepo`, бэкапы.
2. **Sprint 4 — Multi-club.** Полное ТЗ: [`SPEC_SPRINT_4_MULTI_CLUB.md`](./SPEC_SPRINT_4_MULTI_CLUB.md). Требует Sprint 3 завершённым. Scoping по `club_id`, super-admin роль, scrape_config таблица, брендинг per-club.

**Краткосрочно (1–2 спринта после Sprint 4):**
1. **Профиль игрока чужой команды для head_coach.** При клике с КЛУБа на игрока 2011 (когда выбран 2010) — `PlayerDetail` пытается достать его из последнего матча выбранной команды и не находит. Нужно автоматически переключать `selectedTeamId` через `player.teamId` перед редиректом.
2. **Кубковая ветка.** Включён UI-toggle Турнир/Кубок, бэкенд принимает `tournament` при загрузке PDF. Нужно довести до парсера (распознавать кубковые форматы) и до клубного зачёта (пока считается только Лига).
3. **Сравнение игроков.** `ComparisonView` существует на уровне команд. Дополнить сравнением 2–4 игроков по радару/таблице.
4. **Скачивание карточки игрока (PDF).** Кнопка в `PlayerDetail.jsx` отрисована, но `disabled`. Сделать через серверный рендер или html2canvas+jsPDF.
5. **Адаптация под `Persistent Disk`** — снимется автоматически после Sprint 3 (PG как persistent layer).

**Среднесрочно (1 квартал):**
1. **ИИ-агент v2.** Старый rule-based удалён в Sprint 2 cleanup. Подключить LLM (Claude/GPT) с retrieval по матчам сезона: «как сыграл Турапин в апреле?», «лидеры пресса за 5 матчей».
2. **Real-time обновления.** Сейчас фронт перезагружается через `window.location.reload()` после загрузки PDF. Заменить на SSE/WebSocket с инвалидацией React Query (или RTK Query). Push-уведомления Sprint 2 уже частично решают — приходит уведомление, клик ведёт на свежий матч.
3. **Фото-загрузчик игроков.** Сейчас фотки кладутся вручную в `frontend/public/assets/players/`. Сделать админ-страницу с upload + crop.
4. **История изменений рейтинга.** На странице игрока показывать тренд кривой по матчам сезона (sparkline).
5. ✅ **~~Пуш-уведомления.~~** Сделано в Sprint 2 — Web Push API через VAPID, бэк отправляет после загрузки PDF.

**Долгосрочно (1+ квартал):**
1. **Мульти-тенантность.** SaaS для академий: каждая школа — отдельный воркспейс с своими ролями, теамами, парсерами.
2. **Интеграции с внешними источниками статистики** помимо Sportvisor: WyScout, Hudl, InStat — через адаптеры парсеров.
3. **Коучинг-инструменты.** Видео-аннотации, drag-и-drop фрагменты матча, индивидуальные планы развития на основе радара.
4. **Скаутинг.** Открытая база «других» команд региона, ранжирование талантов.

---

## 11. Известные ограничения

- **Render free tier** засыпает после 15 мин неактивности — первый запрос после паузы идёт ~30 сек. Для демо рекомендуется прогреть бэк до начала.
- **JSON datastore** не имеет транзакций. Если два пользователя одновременно загрузят PDF, возможна race condition в `data/matches.json` (read-modify-write). Снимется с переходом на PG в Sprint 3.
- **Парсер ffspb (standings)** хрупок к перевёрстке источника. Если в HTML лиги сменят структуру `renderComponent('TournamentTable', {...})`, парсер сломается. Мониторинг: смотреть в Render Logs строки `[standings] {age}: ошибка — ...`
- **Парсер ffspb (calendar, Sprint 2)** ещё более хрупкий: пробует 7 разных маркеров (`CalendarTable`, `TournamentCalendar`, `GamesList`, ...). Если ни один не подходит — `parserHint: 'fallback-empty'` в ответе и подсказка в UI. Может потребовать допилки селекторов под реальную верстку — увидеть структуру удобно через `curl '<url>/calendar' | grep -o "renderComponent[^,]*"` и добавить актуальный маркер в `extractMatchesFromHtml`.
- **Push-уведомления требуют HTTPS** — на `localhost` Web Push работает, но в проде VAPID отказывает на http. Vercel/Render по умолчанию отдают https, так что это требование закрыто.
- **iOS Safari + push** — поддержка появилась только с iOS 16.4 (март 2023). На старых версиях `pushSupported()` вернёт false и кнопка 🔔 в шапке скроется автоматически.
- **Подписка не пересохраняется при смене аккаунта** — если на одном устройстве разлогиниться и зайти другим юзером, его уведомления уйдут на endpoint предыдущего. Workaround: вызывать `unsubscribe()` в `logout()`. **TODO** — сделать в следующей итерации.
- **Нет миграций.** Изменения структуры JSON-данных требуют ручного rewrite или скрипта в `backend/scripts/`. Снимется в Sprint 3.
- **Кеш в `dataLoader.js`** — простой `Map`, не invalidate'ится по TTL. После прямой правки JSON на проде нужен redeploy.
- **Лого `(ЦФКСиЗ ВО)`** в данных stat.ffspb.org. Для отображения нормализуется на frontend (`displayTeamName`, `normalizeClubName`). Группировка по клубу строится на эвристике строки имени — не на ID.
- **Sportvisor PDF** должен иметь ровно 35 страниц определённого формата. Парсер не валидирует структуру, а ожидает её. Нестандартный отчёт → битые поля.

---

## 12. Конфигурация ENV

**Backend (Render):**
```
JWT_SECRET=<random 64+ chars, REQUIRED in production, иначе process.exit(1)>
PORT=4000
CORS_ORIGIN=https://your-frontend.vercel.app
MATCHES_DIR=/data/matches    # опционально, persistent disk (после Sprint 3 не нужен)
MAPS_DIR=/data/maps          # опционально
NODE_ENV=production

# Sprint 2 — Web Push (опционально; без них push в no-op режиме)
VAPID_PUBLIC_KEY=<base64url>     # сгенерировать: cd backend && npm run vapid
VAPID_PRIVATE_KEY=<base64url>
VAPID_SUBJECT=mailto:owner@your-domain.com

# Sprint 3 (planned) — Postgres
DATABASE_URL=postgres://user:pass@host:5432/avandata?sslmode=require
DATABASE_POOL_MAX=10
DATABASE_SSL=true
```

**Frontend (Vercel):**
```
VITE_API_BASE_URL=https://your-backend.onrender.com
VITE_VAPID_PUBLIC_KEY=<тот же что backend, опц. — fallback fetched from /api/push/public-key>
```

---

## 13. Полезные команды

**Локально:**
```bash
# Backend
cd backend && npm install && npm run start
# или с автоперезапуском:
node --watch server.js

# Frontend
cd frontend && npm install && npm run dev
```

**Парсер таблиц лиги вручную:**
```bash
cd backend
node -e "import('./services/standingsService.js').then(m => m.refreshAll())"
```

**Парсер календаря вручную (Sprint 2):**
```bash
cd backend
node -e "import('./services/calendarService.js').then(m => m.refreshCalendarAll())"
```

**Генерация VAPID-ключей для push (Sprint 2, разовая операция):**
```bash
cd backend
npm install web-push       # если ещё не установлен
npm run vapid              # печатает VAPID_PUBLIC_KEY / VAPID_PRIVATE_KEY
# результат → в backend/.env и frontend/.env
```

**Тест push-уведомления (только тренеры, после подписки):**
```bash
curl -X POST https://your-backend.onrender.com/api/push/test \
  -H "Authorization: Bearer <jwt>" \
  -H "Content-Type: application/json" \
  -d '{"title":"Тест","body":"Push работает!"}'
```

**Сидинг пользователей:**
```bash
node backend/scripts/seed-users.js
```

**Сборка для прода:**
```bash
cd frontend && npm run build  # → frontend/dist
```

---

## 14. История спринтов

### Sprint 1 (стартовый апгрейд)
- Полный rebrand Легирус → АванDата (палитра, лого, кобрендинг убран)
- Главный экран `/club` с парсером турнирных таблиц
- Топ-7 игроков клуба по сезонной агрегации
- Турнир/Кубок toggle
- Match-vs-season-avg карточка
- Возрастные категории (U-14…U-18)
- Полный мобильный адаптив + Galaxy Fold + tablet
- Соперники по имени в плашке матчей
- Имя-нормализация в стандингс («ГБУ ДО СШОР …» → одно с «СШОР …»)

### Sprint 2 (текущий, май 2026)
- ✅ **PWA push-уведомления** — Web Push API через VAPID, `services/pushService.js` + `routes/push.js` + service worker `frontend/public/sw.js`. Кнопка-toggle 🔔 в `AppHeader`. Триггер из `routes/upload.js` после успешного парсинга PDF. Работает в no-op без VAPID ENV — не падает.
- ✅ **Календарь сезона `/calendar`** — `services/calendarService.js` скрейпит ffspb по ссылке турнира + `/calendar`. Страница `pages/CalendarPage.jsx` с фильтром «Будущие/Сыгранные/Все» и переключателем возраста. Данные в `backend/data/calendar/{age}.json`.
- ✅ **Уборка мёртвого кода**:
  - Удалён ИИ-агент целиком (`backend/routes/agent.js`, `backend/services/ruleEngine.js`, `backend/data/agent-rules.json`, `frontend/src/components/AgentCard.{jsx,css}`, `AgentTriggerButton.{jsx,css}`). Все файлы оставлены как stub'ы с deprecation-комментом — физическое удаление см. § 15.
  - Удалён `HalfTimeBars.{jsx,css}` (не использовался — его роль на себя взяли inline-блоки `halftime-team` в `ClubOverview.jsx` и `PlayerDetail.jsx`).
  - `loadAgentRules` из `dataLoader.js` убран. `fetchAgentInsight` из `frontend/src/services/api.js` убран.
- ✅ **HANDOFF.md** — этот документ полностью обновлён под Sprint 2.

### Sprint 3 (планируется, ~2 недели)
PostgreSQL миграция. Полное ТЗ: [`SPEC_SPRINT_3_POSTGRES.md`](./SPEC_SPRINT_3_POSTGRES.md).

### Sprint 4 (планируется, ~1.5 недели, требует Sprint 3)
Multi-club support. Полное ТЗ: [`SPEC_SPRINT_4_MULTI_CLUB.md`](./SPEC_SPRINT_4_MULTI_CLUB.md).

---

## 15. Файлы на физическое удаление

В Sprint 2 cleanup эти файлы превращены в пустые stub'ы (потому что у выполняющего агента не было прав на `rm`). После проверки можно удалить физически — никаких импортов на них не осталось:

```bash
# из корня проекта
del "frontend\src\components\HalfTimeBars.jsx"
del "frontend\src\components\HalfTimeBars.css"
del "frontend\src\components\AgentCard.jsx"
del "frontend\src\components\AgentCard.css"
del "frontend\src\components\AgentTriggerButton.jsx"
del "frontend\src\components\AgentTriggerButton.css"
del "backend\routes\agent.js"
del "backend\services\ruleEngine.js"
del "backend\data\agent-rules.json"
```

Или одной командой через PowerShell:
```powershell
Remove-Item @(
  'frontend\src\components\HalfTimeBars.jsx',
  'frontend\src\components\HalfTimeBars.css',
  'frontend\src\components\AgentCard.jsx',
  'frontend\src\components\AgentCard.css',
  'frontend\src\components\AgentTriggerButton.jsx',
  'frontend\src\components\AgentTriggerButton.css',
  'backend\routes\agent.js',
  'backend\services\ruleEngine.js',
  'backend\data\agent-rules.json'
)
```

После удаления — `git status` покажет только эти 9 файлов, можно коммитить.

**Замечание по `ClubOverview` фрагментам:** в задаче была формулировка «удалённые табы», но при проверке `pages/ClubOverview.jsx` (на 374 строки) откровенно мёртвых секций не нашлось — все компоненты (hero, top-5, ratings, KPI, halftime-team, line leaders, attack/defence) активно используются. Если есть конкретные блоки на удаление — указать в следующей итерации.
