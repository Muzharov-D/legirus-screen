# TASK SPEC: АванData × Легирус — MVP «Золотой профиль спортсмена»

**Источник дизайна (паттерны/UX):** проект "Экран клуба" (papka `Экран клуба`, рядом)
**Источник данных:** PDF Sportvisor `6097_4265.pdf` — отчёт по матчу Легирус 2010 — Пороховчанин 2010 (4:0, 19.04.2026)
**Дата:** 2026-04-30
**Статус:** Готов к реализации

---

## 1. Project Goal

Собрать desktop MVP с нуля — кликабельный прототип аналитической платформы «Золотой профиль спортсмена» для футбольной академии Легирус.

Пользователь — тренерский штаб. Платформа позволяет:
- видеть командные показатели матча (агрегаты, топ-игроки)
- открывать детальный матч (формация, статистика, таймовая разбивка)
- открывать **золотой профиль** каждого игрока (рейтинги, радар, 105+ метрик с разбивкой 1/2 тайм)
- получать AI-подсказки на каждом экране (Screen Agent)
- загружать новые PDF-отчёты Sportvisor через UI и автоматически парсить их в JSON
- сравнивать игрока с командой, по позициям, и по таймам (3 дашборда — заменители «ЛИГА»)

**PDF-генерации НЕТ.** Отчёт PDF уже на входе — это источник данных, а не выход.

---

## 2. Tech Stack

| Слой | Технология |
|------|------------|
| Frontend | React 19 + Vite + react-router-dom + recharts |
| Backend | Node.js (Express) |
| Data | Editable JSON в `backend/data/` |
| PDF parser | Node.js child_process pdftotext + pdfimages, или `pdf-parse` + `pdf-img-extract` |
| Язык UI | Русский |
| Платформа | Desktop only (min 1536px width) |
| Deploy frontend | Vercel |
| Deploy backend | Render (web service + persistent disk для data) |

---

## 3. Input Assumptions

- Уже подготовлены seed-JSON в `backend/data/`:
  - `teams.json` — клуб Легирус и соперник
  - `players.json` — справочник 15 игроков
  - `matches.json` — список матчей (1 матч на старте)
  - `matches/match-001.json` — полные данные матча Легирус 4:0 Пороховчанин (313KB)
  - `metrics.json` — определения метрик и метки на русском
- Готовый Python-парсер в `backend/parsers/` — Code должен переписать его на Node.js для backend, либо запускать как child_process
- PDF в формате Sportvisor с фиксированной структурой (35 страниц, см. DATA_DICTIONARY.md)
- Папка `frontend/public/assets/players/` создаётся пустой — фото игроков пользователь загрузит сам в формате `{playerId}.png` (например `p17-turapin.png`)

**Запрещено** генерировать дополнительные данные «на глаз». Всё, что не прописано в JSON, помечается как «Нет данных».

---

## 4. Screen Inventory

Архитектура повторяет «Экран клуба»: **Аналитика → Матч → Игроки**, но адаптирована под футбол и «золотой профиль».

### 4.1. КЛУБ_АНАЛИТИКА

#### Screen `analytics-overview`
Стартовый экран. Главный блок — **сводные рейтинги команды + лидеры матча**.

**Блоки:**
- **Header:** лого `АванData × Легирус` (co-brand), переключатель РУС, селектор клуба «Легирус 2010», кнопка обновления
- **Left sidebar:** иконки: Аналитика, Матч, Игроки
- **Year tabs:** 2010 (один год для MVP, можно показать 2011, 2012 как disabled)
- **Section tabs:** ОБЩЕЕ | МОЯ КОМАНДА (для MVP оба ведут на одно содержимое)
- **Левая панель:** список матчей (на старте — 1 матч). Использует тот же компонент `MatchList`, что и в Экран клуба
- **Правая панель — ИНФОРМАЦИЯ О КОМАНДЕ:** название «ФК ЛЕГИРУС 2010», средний рейтинг команды (расчёт = среднее ratings.overall × 100, например 808), главный тренер (если есть), эмблема
- **Правая панель — ЛУЧШИЙ ИГРОК МАТЧА:** автоматически — игрок с max overallIndex (Галицкий М., 9.5 в match-001). Фото, имя, позиция, рейтинг, голы, ассисты
- **Правая панель — СВОДНЫЕ РЕЙТИНГИ КОМАНДЫ:** 4 крупные карточки — Общий, Фитнес, Атака, Защита (среднее по 11 стартерам или по 15)
- **Правая панель — КЛЮЧЕВЫЕ ПОКАЗАТЕЛИ КОМАНДЫ:** забитые голы, пропущенные, владение, удары, xG, передачи, отборы, перехваты — берётся из match-001.json/teamSummaryStats (home для нашей команды)
- **Правая панель — АТАКА / ОБОРОНА:** ключевые метрики из teamAggregates

#### Screen `analytics-team-positive` / `analytics-team-negative`
Идентичны «Экран клуба»: один компонент с tab-toggle.

- **ПОЛОЖИТЕЛЬНЫЕ:** Удары всего, Удары в створ, xG, Прогрессивные передачи, Передачи в финальную треть, Угловые, Отборы, Перехваты, Прессинг, Контрпрессинг, Сейвы, Возврат мяча
- **ОТРИЦАТЕЛЬНЫЕ:** Потери, Опасные потери на своей половине, Технические ошибки, Офсайды, Жёлтые/красные карточки, Нарушения, Удары против в створ, Заблокированные удары
- **Источник:** match-001.json/teamAggregates

### 4.2. КЛУБ_МАТЧ

#### Screen `match-initial`
Список матчей + сводка по сезону.

**Блоки:**
- **Левая панель:** список матчей (как `analytics-overview`)
- **Правая панель — ИНФОРМАЦИЯ ПО СЕЗОНУ:** Всего сыграно матчей, Всего забито голов (агрегация по `matches.json`), Среднее голов за игру, Сухие матчи, Жёлтые/красные карточки, Игроков на поле — для MVP считается из доступных матчей (1 матч)
- **Кнопка «Загрузить отчёт Sportvisor»** — открывает диалог выбора PDF и отправки на `POST /api/upload-pdf` (см. §9)

#### Screen `match-detail`
Детальный матч по match-001.json.

**Блоки:**
- **Header info:** дата, домашняя/гостевая команды, счёт 4:0
- **Состав на поле (формация):** ВИЗУАЛЬНАЯ СХЕМА — главное визуальное отличие от Экран клуба. SVG-поле с расстановкой 11 стартеров по `formation.starters[].positionSlot` + 4 запасных строкой ниже. Каждый игрок — карточка: фото (placeholder если нет), номер, фамилия, рейтинг (8.4 цвет в зависимости от рейтинга: ≥9 зелёный, 8-9 жёлто-зелёный, 7-8 жёлтый, 6-7 оранжевый, <6 красный). Опциональный кружок с x2 для забитых голов
- **Заблокированный блок «Состав соперника»:** показать `match.guestTeamPlaceholder` плейсхолдер с кнопкой «Назначить игроков» (для MVP — disabled)
- **Командная статистика (центральная панель):** для каждой метрики — два значения home vs away и горизонтальный бар:
  - Владение: 58% / 42%
  - Удары: 13 (69%, 9 в створ) / 11 (36%, 4)
  - Ожидаемые голы (xG): 2.5 / 2.1
  - Передачи: 413 (62%, 257) / 334 (57%, 192)
  - Штрафные удары: 6 / 6
  - Угловые: 4 (25%, 1) / 3 (67%, 2)
  - Нарушения: 6 / 6
  - Жёлтые карточки: 0 / 0
  - Красные карточки: 0 / 0
  - Офсайды: 0 / 0
- **Игрок матча:** Галицкий М. (max overallIndex 9.5)
- **Donut/bar charts:** «Удары в створ», «Прогрессивные передачи», «Отборы», «Перехваты», «Голевые моменты», «Удачные обводки» — паттерн `DonutComparisonCard` из Экран клуба
- **Tabs:** ОБЩЕЕ | МОЯ КОМАНДА (для MVP — toggle, но контент почти идентичен; «МОЯ КОМАНДА» фокусируется только на home stats и player breakdowns)

#### Screen `match-team-aggregates`
Командные дашборды — 9 секций из teamAggregates (Shooting, Set pieces, Possession, Passes, Attacks, Recoveries & tackling, Duels, Pressing, Positioning). Каждая секция — отдельная карточка с тематическими метриками. **Это ровно та структура, что на pages 12-20 PDF.**

**Каждая секция включает:** числовые показатели (слева) + soccer field map (PNG из `teamAggregates.{section}.mapImage`, справа). Map отображается через `<SoccerFieldImageMap>`.

Карты доступны для 8 секций (Shooting, Set pieces, Passes, Attacks, Recoveries, Duels, Pressing, Positioning). У Possession карты нет — только line charts по 15-мин бакетам.

### 4.3. КЛУБ_ИГРОКИ — Раздел Игроков

#### Screen `players-leaders`
Лидеры по категориям (как Экран клуба).

**Блоки:**
- **Year tabs / Tour tabs:** для MVP — single tour (Тур 1 = match-001)
- **РЕЙТИНГ ИГРОКА (top card):** игрок с max overall (Галицкий М. 9.5 / 95 в шкале 100), фото, имя, позиция, рейтинг, удары, отборы, голы
- **Grid лидеров (2 × 5):**
  - Удары в створ — лидер по `attack4.shot.value` (Турапин М. 4)
  - Голы — лидер по `attack4.goal` (Воронков В. 2)
  - Голевые передачи — лидер по `attack1.assist` (Дютиль А. 1, Клебанов С. 1)
  - Отборы — лидер по `defence1.tackle.value` (Клебанов С. 10)
  - Перехваты — лидер по `defence1.interception.value` (Галицкий М. 16)
  - Прогрессивные передачи — лидер по `attack2.progressivePass.value` (Октябрев А. 22)
  - Прессинг действия — лидер по `defence2.pressing.value` (Ахмадов Д. 10)
  - Сейвы — лидер по `defence3.save` (Татарченко Г. 3)
  - Дистанция — лидер по `fitness.totalDistance` (Макаров К. 12568.23)
  - Спринты — лидер по `fitness.sprintsCount` (Турапин М. 77)

#### Screen `players-detail` — **Золотой профиль игрока**
Главный экран продукта. Это перенос pages 21-35 PDF в интерактив.

**Блоки:**
- **Header:** фото, номер, ФИО, позиция (positionFull), сыгранные минуты
- **4 крупные карточки рейтинга:** Общий, Фитнес, Атака, Защита (значения из ratings.*)
- **Радарная диаграмма** — 14 осей (см. metrics.json/radarAxes), значения из player.radar.* (шкала 0-10)
- **Секция «Атака»:** все split-метрики из splits, отфильтрованные по группе атаки. Каждая строка: метка (русская через metrics.json), Match, 1 тайм, 2 тайм, дельта-индикатор (стрелка, если 2 тайм > 1 тайм)
- **Секция «Защита»:** аналогично, defensive метрики
- **Секция «Фитнес»:** Total distance, Distance 4-5.5 m/s, Distance 5.5-7 m/s, Sprint distance, Sprint count, Sprint sideways, Intensity, Min., Speed average — всё из stats.fitness
- **Дашборд «1 тайм vs 2 тайм»:** bar chart по 8-10 ключевым метрикам — кто прибавил, кто сдал. Цветная индикация
- **Дашборд «Игрок vs команда»:** radar overlay — рейтинги игрока на фоне средних по команде (`teamAvgRatings`)
- **Дашборд «По позиции»:** все игроки той же позиции (например все ЦП) на одном радаре — где этот игрок относительно соседей по позиции
- **Карта пасов и ударов** (Attack map): PNG из `player.maps.attackMap` через `<SoccerFieldImageMap title="Карта пасов и ударов" />`
- **Тепловая карта движения** (Fitness heatmap): PNG из `player.maps.fitnessHeatmap` через `<SoccerFieldImageMap title="Тепловая карта движения" />`

**Список 15 профилей** (всегда доступны через nav):
| ID | # | ФИО | Позиция | Overall |
|----|---|-----|---------|---------|
| p05-galitsky | 5 | Михаил Галицкий | ЦЗ | 9.5 |
| p12-klebanov | 12 | Семён Клебанов | ПЗ | 9.2 |
| p02-oktyabrev | 2 | Арсений Октябрев | ЦЗ | 9.0 |
| p19-bondar | 19 | Даниил Бондарь | ЛЗ | 8.7 |
| p23-ahmadov | 23 | Джайхун Ахмадов | SUB | 8.4 |
| p09-voronkov | 9 | Владимир Воронков | ЦН | 8.4 |
| p08-zakusilov | 8 | Артем Закусилов | ПП | 8.1 |
| p31-bezborodkin | 31 | Дмитрий Безбородкин | SUB | 8.1 |
| p33-makarov | 33 | Кузьма Макаров | ЛП | 8.0 |
| p15-dutil | 15 | Андрей Дютиль | ЦАП | 7.8 |
| p52-tatarchenko | 52 | Георгий Татарченко | ВР | 7.8 |
| p17-turapin | 17 | Матвей Турапин | ЦАП | 7.7 |
| p21-bobin | 21 | Денис Бобин | ЦАП | 7.7 |
| p22-kondakov | 22 | Алексей Кондаков | SUB | 7.2 |
| p01-maksim | 1 | Максим Семёнов | SUB ВР | 5.6 |

#### Screen `players-rating`
Таблица всех 15 игроков с сортировкой по выбранной метрике (как «Экран клуба»). По клику на строку — открывается `players-detail` для этого игрока.

---

## 5. Navigation and Interaction Requirements

| Раздел | Элемент | Поведение |
|--------|---------|-----------|
| Header | Лого АванData × Легирус | Переход на `analytics-overview` |
| Sidebar | Аналитика / Матч / Игроки | Переключение разделов |
| Все экраны | Year tabs (2010 active) | Фильтр по году рождения. Для MVP другие года disabled |
| Аналитика | ОБЩЕЕ / МОЯ КОМАНДА | Toggle (для MVP контент почти идентичен) |
| Аналитика | ПОЛОЖИТЕЛЬНЫЕ / ОТРИЦАТЕЛЬНЫЕ | Toggle тактических метрик |
| Матч | Кнопка «Загрузить PDF» | Открыть file picker → POST /api/upload-pdf |
| Матч | Клик по матчу | Перейти на `/matches/match-001` |
| Матч | Клик по игроку в формации | Перейти на `/players/{playerId}` |
| Игроки | Клик по карточке лидера | Перейти на `players-detail` с фокусом на эту метрику |
| Игроки | Клик по строке рейтинга | Перейти на `players-detail` |
| Игроки | Радар на странице игрока | Hover показывает значения по осям |
| Любой экран | Кнопка «ИИ-агент» | Открыть карточку Screen Agent (см. §7) |

---

## 6. JSON Data Model

### 6.1. `teams.json` — список команд (см. seed)

### 6.2. `players.json` — справочник игроков (см. seed)

### 6.3. `matches.json` — индекс матчей (см. seed)

### 6.4. `matches/match-001.json` — детальные данные матча (313KB, см. seed)

Корневая структура:
```
{
  "id": "match-001",
  "date": "2026-04-19",
  "homeTeam": { "id", "name", "isOurTeam" },
  "awayTeam": { ... },
  "score": { "home", "away" },
  "teamSummaryStats": { "home": {...}, "away": {...} }, // page 1
  "formation": { "starters": [...11], "substitutes": [...4] }, // page 1
  "teamAggregates": {                                    // pages 12-20
    "shooting", "setPieces", "possession", "passes",
    "attacks", "recoveriesAndTackling", "duels",
    "pressing", "positioning"
  },
  "players": [                                            // 15 объектов
    {
      "id", "number", "fullName", "lastName", "firstName",
      "shortName", "position", "positionFull", "minutes",
      "ratings": { "overall", "fitness", "attack", "defence" },
      "radar": { 14 ключей },
      "stats": {
        "fitness", "attack1"-"attack5", "defence1"-"defence3"  // pages 2-11
      },
      "splits": { "<metric label>": { "match", "first", "second" } }  // pages 21-35, 105 метрик
    }
  ],
  "teamAvgRatings": { "overall", "fitness", "attack", "defence" },
  "guestTeamPlaceholder": "..."
}
```

### 6.5. `metrics.json` — метаданные (см. seed)

---

## 7. Screen Agent Specification

Полностью идентичен Экран клуба:
- Кнопка «ИИ-агент» на каждом экране
- Карточка с structured response
- Формат ответа:
  - **Что важно сейчас** (1 предложение)
  - **Что это значит** (1-2 предложения)
  - **Что открыть дальше** (ссылка на соседний экран)

### Правила по экранам

| screen_id | ключевые метрики | примеры выводов | переход |
|-----------|------------------|-----------------|---------|
| analytics-overview | teamAvgRatings, teamSummaryStats | «Команда выиграла 4:0 при xG 2.5 vs 2.1 — преимущество в атаке реализовано» | match-detail |
| match-detail | possession, xG, shots | «Доминировали в обороне (отборы 12 vs 5), но xG почти равный» | match-team-aggregates или players-detail |
| players-leaders | leaderInCategory | «Галицкий лидер по перехватам (16) и общему рейтингу (9.5)» | players-detail |
| players-detail | ratings.overall, splits, position | «Игрок прибавил во 2 тайме: спринты 21 vs 19, голы 1 vs 1» | сравнение по позиции |
| match-team-aggregates | aggregate ratios | «Контрпрессинг 21 — почти каждое 4-е давление переходит в перехват» | match-detail |

### Endpoints

```
POST /api/agent/insight
Body: {
  "screenId": "players-detail",
  "context": { "matchId", "playerId", "selectedMetric" }
}
Response: {
  "important": "...", "meaning": "...",
  "nextStep": { "label": "...", "screen": "..." }
}
```

Реализация: rule-based (не LLM). Правила в `backend/data/agent-rules.json` — паттерн идентичен «Экран клуба».

---

## 8. PDF Upload & Parsing Pipeline (Backend)

### 8.1. Endpoint

```
POST /api/upload-pdf
Content-Type: multipart/form-data
Field: file (PDF)

Flow:
1. Сохранить временный PDF в /tmp
2. Запустить парсер (Node.js spawn pdftotext или pdf-parse + Python скрипт)
3. Извлечь:
   - page 1 (formation, team summary stats)
   - pages 2-11 (15 players × 10 stat groups → table data)
   - pages 12-20 (9 team aggregate dashboards)
   - pages 21-35 (15 individual splits, ~105 metrics × M/1/2)
   - изображения игроков (опционально, через pdfimages)
4. Сохранить новый матч как matches/match-{NNN}.json
5. Обновить matches.json (добавить запись)
6. Вернуть { matchId, status: "ready" }
```

### 8.2. Парсер

В `backend/parsers/` приложены **рабочие Python-скрипты**, проверенные на текущем PDF и извлекающие 105 split-метрик × 15 игроков + командные таблицы. Code должен:
- **Вариант A:** запускать их через child_process spawn `python3` (требует Python в Render runtime)
- **Вариант B:** переписать на Node.js, используя `pdf-parse` для текста и `pdfjs-dist` или `pdf-img-extract` для изображений

Рекомендуется вариант A — быстрее, скрипты уже верифицированы. В render.yaml добавить `apt: poppler-utils python3-full` через build hook.

### 8.3. Известные ограничения парсера (см. GAP_ANALYSIS.md)

- Дистанции по 15-мин бакетам визуально расположены в bar chart — pdftotext не сохраняет порядок. Сейчас не парсятся. Можно достать через позиции в `pdftotext -layout` (TODO для Code).
- Soccer field карты — векторная графика. Извлекаются как PNG через рендер страниц + кроп (см. §8.4).
- Игроки соперника отсутствуют в PDF (placeholder в page 1).

### 8.4. Извлечение карт (heat / shot / pass maps)

Карты в PDF — это paths, нарисованные Chromium. Числа в зонах поля недоступны через text extraction. Решение: рендер страницы → кроп региона карты → сохранение PNG.

**Workflow на бэке при upload-pdf:**

```
1. pdftocairo -png -r 200 -f 12 -l 20 input.pdf renders/p
2. Для каждой команды-страницы (12-20) обрезать регион (760, 220, 1245, 1115)
   и сохранить как /var/data/maps/match-{id}-team-{section}-map.png
3. pdftocairo -png -r 200 -f 21 -l 35 input.pdf renders/p
4. Для каждой индивидуальной страницы (21-35) обрезать:
   - Attack map: (725, 130, 1020, 720)
   - Fitness heatmap: (1200, 1000, 1495, 1495)
   и сохранить как /var/data/maps/match-{id}-{playerId}-{attack-map|heatmap}.png
5. Записать ссылки в matches/match-{id}.json
```

Скрипты-референс приложены: `backend/parsers/crop_maps.py` и `crop_player_maps.py`.

**Frontend: компоненты для отображения карт**

В `frontend_starter/components/`:
- `SoccerFieldImageMap.jsx` — отображает PNG-карту (используется в MVP)
- `SoccerFieldZoneMap.jsx` — рисует поле SVG + zone heatmap + scatter points (для будущего использования, когда зональные значения будут доступны через OCR / ручной ввод)

Использование в MVP:
```jsx
import SoccerFieldImageMap from '../../frontend_starter/components/SoccerFieldImageMap';
<SoccerFieldImageMap src={match.teamAggregates.shooting.mapImage}
                     title="Карта ударов" height={420} />
```

---

## 9. 3 «League replacement» Дашборда

Заменяют дашборд ЛИГА из Экран клуба (данных по лиге нет).

### 9.1. «Игрок vs команда»
- Радарная диаграмма
- Серый полигон — средние ratings по 11 стартерам команды
- Цветной полигон — ratings выбранного игрока
- Размещается в `players-detail`, секция «Сравнения»

### 9.2. «Сравнение по позиции»
- Радарная диаграмма
- Все игроки одной позиции (например все ЦАП) — каждый своим цветом
- В подписи легенды: имена + Overall
- Tooltip на hover показывает значения по осям
- Размещается в `players-detail`, табличный переключатель «По позиции»

### 9.3. «1 тайм vs 2 тайм»
- Bar chart горизонтальный
- 8-10 ключевых метрик из splits (Pass, Shot, Tackle, Pressing, Sprint forward, Recovery, Goal actions, Interception, Cross)
- Две полосы на метрику: 1 тайм / 2 тайм
- Дельта-индикатор (стрелка вверх/вниз)
- Размещается в `players-detail` для индивида и в `match-detail` для команды (агрегированные splits по 11 стартерам)

---

## 10. Backend Architecture

```
backend/
├── server.js                    Express, /api/* routes
├── render.yaml                  deploy config с persistent disk
├── package.json
├── data/
│   ├── teams.json
│   ├── players.json
│   ├── matches.json
│   ├── metrics.json
│   ├── agent-rules.json
│   └── matches/
│       └── match-001.json       seed
├── parsers/
│   ├── parse_team_tables.py
│   ├── parse_team_aggregates.py
│   ├── parse_player_splits.py
│   ├── parse_page1.py
│   └── build_match.py
├── routes/
│   ├── data.js                  GET /api/data/{teams|matches|players|metrics|match/:id}
│   ├── agent.js                 POST /api/agent/insight
│   └── upload.js                POST /api/upload-pdf
└── services/
    ├── dataLoader.js            кеширование JSON в памяти
    ├── pdfParser.js             child_process к Python скриптам
    └── ruleEngine.js            screen agent правила
```

### API endpoints

```
GET  /api/health
GET  /api/data/teams
GET  /api/data/players
GET  /api/data/matches
GET  /api/data/match/:matchId    -> matches/match-{matchId}.json
GET  /api/data/metrics
POST /api/agent/insight
POST /api/upload-pdf             -> { matchId, status }
```

### CORS
`process.env.CORS_ORIGIN` — origin фронта на Vercel (или `*` для MVP)

### Persistence
Render persistent disk монтируется на `/var/data`. matches/ хранится там. Ключ env `MATCHES_DIR=/var/data/matches`. Если /var/data пустой при cold start, копировать seed из `backend/data/matches/`.

---

## 11. Frontend Architecture

```
frontend/
├── src/
│   ├── main.jsx
│   ├── App.jsx                       routes
│   ├── App.css
│   ├── layouts/MainLayout.jsx
│   ├── pages/
│   │   ├── ClubOverview.jsx          analytics-overview
│   │   ├── MatchesDashboard.jsx      match-initial
│   │   ├── MatchDetail.jsx           match-detail
│   │   ├── PlayersLeaders.jsx        players-leaders
│   │   ├── PlayerDetail.jsx          players-detail (золотой профиль)
│   │   └── ComparisonView.jsx        analytics team-positive/negative + aggregates
│   ├── components/
│   │   ├── AppHeader.jsx             АванData × Легирус
│   │   ├── SidebarNav.jsx
│   │   ├── ClubSelector.jsx
│   │   ├── YearTabs.jsx
│   │   ├── SectionTabs.jsx
│   │   ├── MatchList.jsx
│   │   ├── TeamLogo.jsx
│   │   ├── PlayerPhoto.jsx           src=`/assets/players/${id}.png` с fallback на инициалы
│   │   ├── PlayerMiniCard.jsx
│   │   ├── PlayerHighlightCard.jsx
│   │   ├── FormationField.jsx        ⭐ NEW — SVG поле с расстановкой
│   │   ├── RadarChart.jsx
│   │   ├── BarChartCard.jsx
│   │   ├── DonutComparisonCard.jsx
│   │   ├── HalfTimeBars.jsx          ⭐ NEW — 1 vs 2 тайм
│   │   ├── PositionRadar.jsx         ⭐ NEW — сравнение по позиции
│   │   ├── PlayerVsTeamRadar.jsx     ⭐ NEW
│   │   ├── StatGrid.jsx
│   │   ├── MetricStatGrid.jsx
│   │   ├── RatingTable.jsx
│   │   ├── LeaderMetricCard.jsx
│   │   ├── ScreenAgent.jsx
│   │   ├── AgentTriggerButton.jsx
│   │   ├── AgentCard.jsx
│   │   └── PdfUploadDialog.jsx       ⭐ NEW
│   └── services/api.js               fetch wrappers
├── public/
│   ├── favicon.svg
│   └── assets/
│       ├── logos/
│       │   ├── legirus.png
│       │   └── porohovchanin.png
│       └── players/                   пустая папка, пользователь загрузит фото вручную
└── package.json
```

### Routes (App.jsx)

```jsx
<Route element={<MainLayout/>}>
  <Route path="/" element={<Navigate to="/analytics" replace/>}/>
  <Route path="/analytics" element={<ClubOverview/>}/>
  <Route path="/analytics/team" element={<ComparisonView/>}/>
  <Route path="/matches" element={<MatchesDashboard/>}/>
  <Route path="/matches/:matchId" element={<MatchDetail/>}/>
  <Route path="/players" element={<PlayersLeaders/>}/>
  <Route path="/players/:playerId" element={<PlayerDetail/>}/>
</Route>
```

### Backend URL

`VITE_API_BASE_URL` — env variable, в Vercel настраивается на Render URL.

---

## 12. Deploy

### Vercel (frontend)
- `vercel.json`:
  ```json
  { "rewrites": [{ "source": "/(.*)", "destination": "/index.html" }] }
  ```
- Build: `npm install && npm run build`
- Output: `dist/`

### Render (backend)
- `render.yaml` (см. шаблон ниже):
  ```yaml
  services:
    - type: web
      name: legirus-api
      runtime: node
      rootDir: backend
      buildCommand: |
        apt-get update && apt-get install -y poppler-utils python3-full
        npm install
      startCommand: npm start
      healthCheckPath: /api/health
      disk:
        name: matches-disk
        mountPath: /var/data
        sizeGB: 5
      envVars:
        - key: NODE_VERSION
          value: 20.11.1
        - key: CORS_ORIGIN
          value: "https://<your-vercel-url>"
        - key: MATCHES_DIR
          value: /var/data/matches
  ```
- При первом запуске backend копирует seed из `backend/data/matches/` в `/var/data/matches/` если пусто.

---

## 13. Implementation Constraints

1. **«Экран клуба» — паттерн истины UX/визуала.** Не изобретать новые UX без прямого основания в текущем проекте.
2. **Не выдумывать данные.** Если в JSON нет — показывать «Нет данных» или disabled.
3. **Не смешивать Screen Agent и парсер.** Это два независимых модуля.
4. **PDF-генерации нет.** Не добавлять никаких PDF outputs.
5. **Все тексты на русском.** Включая UI, ответы агента, лейблы метрик (см. metrics.json/metricLabels).
6. **Desktop only**, min 1536px.
7. **Семантические ID игроков** (`p17-turapin`), не autoincrement — для стабильности при добавлении матчей.
8. **Парсер не дублировать.** Использовать существующие Python скрипты, не переписывать их без необходимости.
9. **Радарные оси — фиксированный порядок** из metrics.json/radarAxes.
10. **Цветовая шкала рейтинга** для FormationField и таблиц: ≥9.0 → #2e7d32 (зелёный), 8.0-9.0 → #7cb342 (жёлто-зелёный), 7.0-8.0 → #fbc02d (жёлтый), 6.0-7.0 → #fb8c00 (оранжевый), <6.0 → #d32f2f (красный)

---

## 14. Definition of Done

### Экран считается готовым, если:
- [ ] Визуально и структурно соответствует паттерну Экран клуба (header, sidebar, layout, spacing)
- [ ] Навигация работает между всеми разделами и драйллдаунами
- [ ] Все интеракции работают (tabs, filters, sorting, drill-down, hover на радарах)
- [ ] Данные берутся из JSON (через `/api/data/*` endpoints)
- [ ] Screen Agent получает корректный context и возвращает structured response
- [ ] Числа в UI совпадают с числами в JSON (никаких хардкодов в компонентах)

### Загрузка PDF считается готовой, если:
- [ ] UI диалог принимает PDF файл
- [ ] Backend парсит и сохраняет новый матч
- [ ] matches.json обновляется автоматически
- [ ] Список матчей на frontend обновляется без перезагрузки
- [ ] Если PDF не Sportvisor формата → понятная ошибка
- [ ] Сохранность данных: 105 split-метрик × 15 игроков воспроизводится при upload текущего PDF

### MVP считается завершённым, если:
- [ ] Все 6 экранов работают
- [ ] 3 league-replacement дашборда (игрок vs команда, по позиции, 1/2 тайм) работают
- [ ] Загрузка нового PDF работает (по тестовому PDF Sportvisor)
- [ ] Деплой на Vercel + Render успешен
- [ ] match-001.json (Легирус 4:0 Пороховчанин) корректно отображается на всех экранах
- [ ] Никаких потерь данных относительно PDF

---

## 15. Known Ambiguities and Safe Assumptions

| # | Неопределённость | Safe assumption | Обоснование |
|---|-----------------|-----------------|-------------|
| 1 | Дистанции по 15-мин бакетам | Не отображать в первой версии, запланировать TODO | pdftotext не сохраняет порядок чисел в bar chart |
| 2 | Shot map / pass map координаты | Не отображать (нет данных в text-extracted PDF) | Координаты в PNG, не в тексте |
| 3 | Соперник «Пороховчанин» — стат игроков | Placeholder из page 1 | В PDF нет данных |
| 4 | Tabs ОБЩЕЕ / МОЯ КОМАНДА | Контент почти идентичный, разница только в фокусе на home stats | Из паттерна Экран клуба |
| 5 | Цвет рейтинга в формации | Шкала из §13 | Безопасный паттерн |
| 6 | Год рождения 2010 — другие года tabs | Disabled | Только 2010 в текущем матче |
| 7 | Логотип «Легирус» | Placeholder с инициалами «Л» если нет файла | Пользователь загрузит логотип позже |
| 8 | Фото игроков | `/assets/players/{playerId}.png` с fallback на инициалы (PlayerPhoto компонент) | Пользователь загрузит фото позже |
| 9 | Co-brand АванData × Легирус | Текстовый header с разделителем «×» | Минималистичный паттерн |
| 10 | URL парсера на бэке | child_process spawn к Python | Скрипты уже работают |
| 11 | Persistent disk на Render | /var/data + копирование seed при cold start | Стандартный Render паттерн |
| 12 | Валидация PDF при upload | Проверка title metadata = "Sportvisor" + 35 страниц | Защита от чужих PDF |

---

## 16. Order of implementation (Code, рекомендуется)

1. **Скаффолд проекта:** Vite + Express, копирование seed из `backend/data/`
2. **Backend API endpoints** GET /api/data/* — без парсера PDF, просто чтение JSON
3. **Frontend MainLayout + sidebar + header** (паттерны из Экран клуба)
4. **`analytics-overview`** — самый простой экран, использует teamAvgRatings и сводные блоки
5. **`match-detail`** + FormationField (новый компонент-SVG)
6. **`players-leaders`** — лидеры по категориям
7. **`players-detail`** — золотой профиль (главный экран продукта)
8. **3 league-replacement дашборда** в `players-detail`
9. **Screen Agent** — endpoint + UI карточка + правила
10. **Upload PDF endpoint** — child_process к Python parsers
11. **Verification:** загрузить тот же PDF, убедиться что данные идентичны seed
12. **Deploy** Vercel + Render
