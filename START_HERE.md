# START HERE — Экран Легирус (АванData × Легирус MVP)

> Этот файл — точка входа для Code или нового агента. Прочитать в порядке списка ниже.

## Что это

Desktop MVP «Золотой профиль спортсмена» для футбольного клуба **Легирус 2010** (год рождения 2010, академия). Co-brand АванData × Легирус.

**Архитектура:** React + Vite (Vercel) + Node.js Express (Render) + JSON-данные. Дизайн повторяет существующий проект "Экран клуба" (рядом, в папке `Экран клуба`).

**Главное отличие:** вместо дашбордов «ЛИГА» (нет данных по лиге) — три новых дашборда: «Игрок vs команда», «Сравнение по позиции», «1 тайм vs 2 тайм».

**PDF-генерации НЕТ.** PDF (Sportvisor) — это источник данных на входе. Бэк парсит PDF → JSON. Frontend читает JSON и рендерит экраны.

---

## Что уже готово (seed)

- ✅ **TASK_SPEC_FOR_CODE.md** — полная задача на реализацию (16 разделов): screen inventory, data model, screen agent, парсер PDF, deploy, definition of done
- ✅ **DATA_DICTIONARY.md** — описание каждого поля match-001.json + маппинг PDF page → JSON path
- ✅ **GAP_ANALYSIS.md** — что извлечено и что нет, со статусом по каждому gap
- ✅ **backend/data/** — seed JSONs: teams.json, players.json, matches.json, metrics.json
- ✅ **backend/data/matches/match-001.json** — 313 KB полных данных матча Легирус 4:0 Пороховчанин (19.04.2026): 15 игроков × 105 split-метрик × M/1тайм/2тайм + 9 командных дашбордов + формация
- ✅ **backend/parsers/** — рабочие Python-скрипты, проверенные на текущем PDF (parse_team_tables, parse_player_splits, parse_team_aggregates, parse_page1, build_match, crop_maps, crop_player_maps, fetch_player_photos)
- ✅ **frontend/public/assets/players/** — 15 PNG-фото игроков (400×400)
- ✅ **frontend/public/assets/maps/** — 76 PNG-карт (8 командных + 30 игроцких heatmap/passmap + 38 алиасов и full-page рендеров)
- ✅ **frontend_starter/components/** — SoccerFieldImageMap.jsx (для PNG-карт) и SoccerFieldZoneMap.jsx (для SVG-перерисовки)

## Что нужно от Code

Реализовать desktop-MVP с нуля по `TASK_SPEC_FOR_CODE.md`. Использовать seed-данные. Не выдумывать данные. Архитектурный паттерн — из проекта "Экран клуба" (в соседней папке, читать но не менять).

### Минимальный объём:

1. Скаффолд React+Vite + Express
2. 6 экранов: analytics-overview, analytics-team-positive/negative, match-initial, match-detail, players-leaders, players-detail (золотой профиль), players-rating
3. SidebarNav + Header АванData × Легирус + базовые компоненты (как в Экран клуба)
4. **FormationField** — SVG-схема состава с фото и рейтингами на page match-detail (новый, не было в Экран клуба)
5. **3 league-replacement дашборда** на странице players-detail
6. Карты на match-detail и players-detail через SoccerFieldImageMap (рендер PNG)
7. Screen Agent (rule-based, не LLM): `POST /api/agent/insight` → structured response (Что важно / Что значит / Что открыть)
8. PDF Upload endpoint: `POST /api/upload-pdf` → child_process к Python-скриптам в backend/parsers/ → новый match-{NNN}.json + новые карты
9. Deploy: vercel.json для frontend, render.yaml для backend (с persistent disk + apt-get install poppler-utils python3)

### Definition of done — см. §14 TASK_SPEC

---

## Команды для запуска Claude Code

### Шаг 1: Открыть проект в Claude Code

```cmd
cd /d "C:\Users\dmuzharov\Documents\Claude\Projects\Экран Легирус"
claude
```

### Шаг 2: Дать Claude Code эту инструкцию (вставить в чат)

```
Реализуй MVP по TASK_SPEC_FOR_CODE.md в этой папке.

Перед началом ОБЯЗАТЕЛЬНО прочитай в порядке:
  1. START_HERE.md (этот файл)
  2. TASK_SPEC_FOR_CODE.md (главная спека, 16 разделов)
  3. DATA_DICTIONARY.md (структура match-001.json)
  4. GAP_ANALYSIS.md (известные ограничения)
  5. ../Экран клуба/TASK_SPEC_MVP.md и ../Экран клуба/frontend/src/ — паттерн, не менять

Seed-данные уже готовы в backend/data/ и frontend/public/assets/ — НЕ перегенерируй их.
Парсеры в backend/parsers/ — рабочие, не переписывай без необходимости.

Порядок реализации (см. §16 TASK_SPEC):
  1. Скаффолд проекта (Vite + Express)
  2. Backend API endpoints для чтения JSON
  3. Frontend MainLayout + sidebar + header
  4. analytics-overview (самый простой)
  5. match-detail + FormationField + map rendering
  6. players-leaders
  7. players-detail (золотой профиль) + 3 league-replacement дашборда + карты
  8. Screen Agent
  9. PDF Upload endpoint
  10. Deploy (vercel.json, render.yaml)

Ограничения:
  - Не выдумывать данные. Если в JSON нет — показывать "Нет данных".
  - Все тексты на русском.
  - Desktop only (min 1536px).
  - Visual fidelity к паттерну "Экран клуба".
  - Стабильные ID игроков (p17-turapin, не autoincrement).

Начни с прочтения spec и отчёта, что понял.
```

---

## Структура проекта (после прочтения этого файла)

```
Экран Легирус/
├── START_HERE.md                    ⭐ ты здесь
├── TASK_SPEC_FOR_CODE.md            главная спека для Code
├── DATA_DICTIONARY.md
├── GAP_ANALYSIS.md
├── backend/
│   ├── data/
│   │   ├── teams.json               2 команды
│   │   ├── players.json             15 игроков (справочник)
│   │   ├── matches.json             индекс матчей
│   │   ├── metrics.json             метрики, радар-оси, русские лейблы
│   │   └── matches/
│   │       └── match-001.json       313 KB, полные данные матча
│   └── parsers/
│       ├── parse_team_tables.py
│       ├── parse_player_splits.py
│       ├── parse_team_aggregates.py
│       ├── parse_page1.py
│       ├── build_match.py
│       ├── crop_maps.py
│       ├── crop_player_maps.py
│       ├── fetch_player_photos.py   ← вспомогательный, для фото из URL
│       └── player_photos_list.txt   ← заполненный список 15 игроков
├── frontend/
│   └── public/assets/
│       ├── players/                 15 PNG (400×400)
│       ├── logos/                   пусто, нужны legirus.png + porohovchanin.png
│       └── maps/                    76 PNG-карт (команда + игроки)
└── frontend_starter/
    └── components/
        ├── SoccerFieldImageMap.jsx
        └── SoccerFieldZoneMap.jsx
```

---

## Ключевые решения, уже принятые

| Решение | Источник |
|---------|----------|
| 3 раздела (Аналитика/Матч/Игроки) — не «один игрок в фокусе» | пользователь |
| 3 league-replacement дашборда | пользователь |
| PDF-генератора нет | пользователь |
| Vercel (frontend) + Render (backend) с upload PDF | пользователь |
| Co-brand АванData × Легирус | пользователь |
| Главный экран = сводные рейтинги команды + лидеры | пользователь |
| Фото игроков загружены из URL пользователя | сделано |
| Карты PDF извлечены как PNG (зональные числа недоступны как текст) | технически |
| Screen Agent — rule-based, не LLM | паттерн Экран клуба |
| Persistence — Render disk на /var/data | паттерн Экран клуба |
| Стабильные ID игроков `p17-turapin` | сделано |
| Радарные оси — фиксированный порядок 14 шт. | metrics.json |

---

## Проверки целостности данных

```
- 15/15 игроков с полным профилем (radar 16/16, ratings, splits 105 шт., stats 90 полей)
- match-001.json: 6782 числовых leaf-значения
- 8 командных карт + 30 индивидуальных = 38 уникальных PNG (не считая алиасов)
- 15 player photos 400×400 PNG
- Команда: средние рейтинги 8.08 / 7.63 / 6.85 / 7.14 (Overall/Fitness/Attack/Defence)
- Лучший игрок матча: Михаил Галицкий (#5, ЦЗ, 9.5)
- Авторы голов: Воронков (×2, 1+1 тайм), Закусилов, Октябрев
```

Известные gaps — в `GAP_ANALYSIS.md`. Ни один не блокирует MVP.

---

## Контакт / источники

- **PDF-источник:** `6097_4265.pdf` (Sportvisor, 35 страниц)
- **Дата матча:** 19.04.2026, Легирус 2010 4:0 Пороховчанин 2010
- **Бренд:** SportData (`ai4sportdata@gmail.com`)
