# Экран Легирус (АванDата) — техническое описание

Платформа спортивной аналитики для футбольной школы «Легирус» (5 возрастов, 2009–2013 г.р.). Делает доступной командную и индивидуальную статистику матчей в формате, понятном тренерам, игрокам и родителям. Источник матчевых данных — PDF-отчёты Sportvisor, источник турнирных таблиц — `stat.ffspb.org`.

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
- Backend: Render Web Service (push в `main` → пересборка); ENV `JWT_SECRET`, опц. `MATCHES_DIR`/`MAPS_DIR`/`CORS_ORIGIN`
- DNS/ENV: Vite использует `VITE_API_BASE_URL` для подключения к бэку

**Хранилище:**
- Все данные — JSON-файлы в `backend/data/`. БД нет.
- Загруженные карты-PNG — `frontend/public/assets/maps/`
- На Render опционально подключается Persistent Disk через `MATCHES_DIR` env (для матчей с долгой жизнью); если не подключён — данные живут в bundle и сбрасываются при редеплое.

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
- `services/dataLoader.js` — единый абстрактный read-layer над JSON-файлами с in-memory cache
- `services/pdfParser.js` — orchestrator: вызывает Python через `child_process` для парсинга
- `services/standingsService.js` — fetch + парсинг ffspb.org, cron на `setInterval`

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
- Глобальный `frontend/src/styles/mobile.css` импортируется в `main.jsx` и покрывает 5 брейкпоинтов:
  - `≤360px` — Galaxy Fold cover, маленькие айфоны
  - `≤480px` — узкие телефоны
  - `≤768px` — все мобильные
  - `769–1024px` — планшеты в портрете
  - `1025–1366px` — small desktop
  - `≤768 + ≤500h` — телефон в горизонтали
- Sidebar превращается в bottom-nav (КЛУБ / МАТЧ / МОЙ ПРОФИЛЬ); Аналитика скрыта на мобиле через `[data-nav-id="analytics"]`

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
│   ├── _config.json           # URL'ы парсера для 4 возрастов
│   └── {2010..2013}.json      # турнирная таблица: pos, team, games, wins, ..., points
├── metrics.json               # справочник метрик: radarAxes, metricLabels (для UI)
└── agent-rules.json           # правила ИИ-агента (не активно в текущем релизе)
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
GET    /api/data/matches                  role-filtered, ?teamId=
GET    /api/data/match/:matchId           role+player sanitized
GET    /api/data/metrics                  public after auth
GET    /api/data/standings                list ageGroups
GET    /api/data/standings/:ageGroup      table
POST   /api/data/standings/:age/refresh   coaches only
POST   /api/data/standings/refresh        head_coach only
POST   /api/upload-pdf                    coaches only, multipart/form-data {file, teamId, tournament}
POST   /api/agent/insight                 ИИ-агент (стоит, не активен)
GET    /api/maps/* и /assets/*            static
```

---

## 10. Точки роста

**Краткосрочно (1–2 спринта):**
1. **Множественные клубы.** Сейчас «Легирус» захардкожен в `_config.json` (`ourClubMatcher`) и в hero-стрингах. Вынести в БД клубов, поддержать N клубов на одном инстансе.
2. **Профиль игрока чужой команды для head_coach.** При клике с КЛУБа на игрока 2011 (когда выбран 2010) — `PlayerDetail` пытается достать его из последнего матча выбранной команды и не находит. Нужно автоматически переключать `selectedTeamId` через `player.teamId` перед редиректом.
3. **Кубковая ветка.** Включён UI-toggle Турнир/Кубок, бэкенд принимает `tournament` при загрузке PDF. Нужно довести до парсера (распознавать кубковые форматы) и до клубного зачёта (пока считается только Лига).
4. **Сравнение игроков.** `ComparisonView` существует на уровне команд. Дополнить сравнением 2–4 игроков по радару/таблице.
5. **Скачивание карточки игрока (PDF).** Кнопка в `PlayerDetail.jsx` отрисована, но `disabled`. Сделать через серверный рендер или html2canvas+jsPDF.
6. **Адаптация под `Persistent Disk`.** Сейчас матчи могут пропадать на cold-start Render. Если уровень нагрузки оправдает — подключить persistent volume и хранить там JSON+PNG. Альтернатива — переход на S3/B2.

**Среднесрочно (1 квартал):**
1. **Замена JSON-файлов на PostgreSQL.** Структура матчей и стандингс уже под это нормализована. Переход даст: индексы, транзакции, миграции, удобный admin.
2. **ИИ-агент.** В коде заглушка (`/api/agent/insight`, `agent-rules.json`). Подключить LLM (Claude/GPT) с retrieval по матчам сезона: «как сыграл Турапин в апреле?», «лидеры пресса за 5 матчей».
3. **Real-time обновления.** Сейчас фронт перезагружается через `window.location.reload()` после загрузки PDF. Заменить на SSE/WebSocket с инвалидацией React Query (или RTK Query).
4. **Фото-загрузчик игроков.** Сейчас фотки кладутся вручную в `frontend/public/assets/players/`. Сделать админ-страницу с upload + crop.
5. **История изменений рейтинга.** На странице игрока показывать тренд кривой по матчам сезона (sparkline).
6. **Пуш-уведомления.** PWA-уведомление о новом разобранном матче — для родителей.

**Долгосрочно (1+ квартал):**
1. **Мульти-тенантность.** SaaS для академий: каждая школа — отдельный воркспейс с своими ролями, теамами, парсерами.
2. **Интеграции с внешними источниками статистики** помимо Sportvisor: WyScout, Hudl, InStat — через адаптеры парсеров.
3. **Коучинг-инструменты.** Видео-аннотации, drag-и-drop фрагменты матча, индивидуальные планы развития на основе радара.
4. **Скаутинг.** Открытая база «других» команд региона, ранжирование талантов.

---

## 11. Известные ограничения

- **Render free tier** засыпает после 15 мин неактивности — первый запрос после паузы идёт ~30 сек. Для демо рекомендуется прогреть бэк до начала.
- **JSON datastore** не имеет транзакций. Если два пользователя одновременно загрузят PDF, возможна race condition в `data/matches.json` (read-modify-write). На текущем уровне (1 тренер на школу) — не проблема, но при росте — переход на БД обязателен.
- **Парсер ffspb** хрупок к перевёрстке источника. Если в HTML лиги сменят структуру `renderComponent('TournamentTable', {...})`, парсер сломается. Мониторинг: смотреть в Render Logs строки `[standings] {age}: ошибка — ...`
- **Нет миграций.** Изменения структуры JSON-данных требуют ручного rewrite или скрипта в `backend/scripts/`.
- **Кеш в `dataLoader.js`** — простой `Map`, не invalidate'ится по TTL. После прямой правки JSON на проде нужен redeploy.
- **Лого `(ЦФКСиЗ ВО)`** в данных stat.ffspb.org. Для отображения нормализуется на frontend (`displayTeamName`, `normalizeClubName`). Группировка по клубу строится на эвристике строки имени — не на ID.
- **Mobile bottom-nav** скрывает Аналитику; чтобы попасть на `/analytics`, нужен прямой URL. Если эта страница станет важной — добавить в нав.
- **Sportvisor PDF** должен иметь ровно 35 страниц определённого формата. Парсер не валидирует структуру, а ожидает её. Нестандартный отчёт → битые поля.

---

## 12. Конфигурация ENV

**Backend (Render):**
```
JWT_SECRET=<random 64+ chars, REQUIRED in production, иначе process.exit(1)>
PORT=4000
CORS_ORIGIN=https://your-frontend.vercel.app
MATCHES_DIR=/data/matches    # опционально, persistent disk
MAPS_DIR=/data/maps          # опционально
NODE_ENV=production
```

**Frontend (Vercel):**
```
VITE_API_BASE_URL=https://your-backend.onrender.com
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

**Сидинг пользователей:**
```bash
node backend/scripts/seed-users.js
```

**Сборка для прода:**
```bash
cd frontend && npm run build  # → frontend/dist
```

---

## 14. Кто что трогал в последнем спринте (для контекста)

Большой апгрейд от стартового состояния:
- Полный rebrand Легирус → АванDата (палитра, лого, кобрендинг убран)
- Главный экран `/club` с парсером турнирных таблиц
- Топ-7 игроков клуба по сезонной агрегации
- Турнир/Кубок toggle
- Match-vs-season-avg карточка
- Возрастные категории (U-14…U-18)
- Полный мобильный адаптив + Galaxy Fold + tablet
- Соперники по имени в плашке матчей
- Имя-нормализация в стандингс («ГБУ ДО СШОР …» → одно с «СШОР …»)

Все изменения в коммитах последних 24 часов в `git log --oneline`.
