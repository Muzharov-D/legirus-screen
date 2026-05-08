# HANDOFF — вставь это в новый чат Cowork если потерял контекст

Привет. Продолжаю работу над проектом «Экран Легирус» — desktop MVP «Золотой профиль спортсмена» для футбольного клуба Легирус 2010.

## Контекст

Это co-brand АванData × Легирус. Архитектура повторяет 1:1 проект «Экран клуба» (соседняя папка `C:\Users\dmuzharov\Documents\Claude\Projects\Экран клуба` — паттерн истины UX/визуала, читать но не менять).

**Tech stack:** React + Vite (Vercel) + Node.js Express (Render) + JSON-данные.

**Данные:** один матч **Легирус 2010 — Пороховчанин 2010 (4:0, 19.04.2026)** распарсен из PDF Sportvisor `6097_4265.pdf` (35 страниц).

**Главные отличия от Экран клуба:**
1. PDF-генератора **нет** (PDF — это вход, не выход)
2. Бэк парсит загруженный PDF Sportvisor → JSON (через child_process к Python скриптам)
3. Вместо дашбордов «ЛИГА» (нет данных по лиге) — **3 новых дашборда**: «Игрок vs команда», «Сравнение по позиции», «1 тайм vs 2 тайм»

**Папка проекта:** `C:\Users\dmuzharov\Documents\Claude\Projects\Экран Легирус`

## Что уже готово

**Документация:**
- `START_HERE.md` — entry point с инструкцией
- `TASK_SPEC_FOR_CODE.md` — полная спека (16 разделов)
- `DATA_DICTIONARY.md` — структура match-001.json
- `GAP_ANALYSIS.md` — известные ограничения

**Seed-данные (НЕ ТРОГАТЬ, не перегенерировать):**
- `backend/data/teams.json` — Легирус + Пороховчанин
- `backend/data/players.json` — справочник 15 игроков, ID `p17-turapin` и т.д.
- `backend/data/matches.json` — индекс
- `backend/data/matches/match-001.json` — **313 KB, 6782 значения**: 15 игроков × 105 split-метрик × 3 (M/1/2) + командные дашборды + формация
- `backend/data/metrics.json` — определения, радар-оси, русские лейблы

**Готовые ассеты:**
- `frontend/public/assets/players/` — **15 PNG-фото** игроков 400×400 (загружены пользователем)
- `frontend/public/assets/maps/` — **76 PNG-карт**: 8 командных (shooting, set-pieces, passes, attacks, recoveries, duels, pressing, positioning) + 30 индивидуальных (attack-map + fitness-heatmap для каждого из 15 игроков)

**Парсеры (рабочие, проверены на текущем PDF):**
- `backend/parsers/parse_team_tables.py` — pages 2-11
- `backend/parsers/parse_player_splits.py` — pages 21-35
- `backend/parsers/parse_team_aggregates.py` — pages 12-20
- `backend/parsers/parse_page1.py` — формация и сводка
- `backend/parsers/build_match.py` — мердж в match-001.json
- `backend/parsers/crop_maps.py` + `crop_player_maps.py` — извлечение карт через pdftocairo + PIL crop
- `backend/parsers/fetch_player_photos.py` — вспомогательный загрузчик фото из списка URL

**React-стартеры:**
- `frontend_starter/components/SoccerFieldImageMap.jsx` — для отображения PNG-карт
- `frontend_starter/components/SoccerFieldZoneMap.jsx` — SVG-перерисовка полем + zone heatmap (на будущее)

## Ключевые решения

- 3 раздела (Аналитика/Матч/Игроки) как в «Экран клуба»
- Главный экран — сводные рейтинги команды + лидеры
- Формация на match-detail — SVG-схема состава с фото и рейтингами (новый компонент `FormationField`)
- Стабильные ID игроков (`p17-turapin`, не autoincrement)
- Радарные оси — 14 фиксированных, в `metrics.json/radarAxes`
- Screen Agent — rule-based, не LLM, structured response
- Цветовая шкала рейтинга: ≥9.0 зелёный, 8-9 жёлто-зелёный, 7-8 жёлтый, 6-7 оранжевый, <6 красный
- Desktop only, min 1536px
- Все тексты на русском

## Известные gaps (не блокируют MVP)

1. Фитнес-дистанции по 15-мин бакетам не парсятся (pdftotext не сохраняет порядок чисел в bar chart). Match-totals доступны.
2. Зональные числа на картах в PDF — не текст, а векторные paths. Решено через рендер→кроп PNG.
3. Логотипы клубов — пользователь загрузит вручную в `assets/logos/legirus.png` и `porohovchanin.png`.

## Что нужно сделать сейчас

Реализовать MVP по `TASK_SPEC_FOR_CODE.md`. Подробности — там. Порядок реализации — в §16 спеки.

Прочитай эти файлы перед работой:
1. `START_HERE.md`
2. `TASK_SPEC_FOR_CODE.md`
3. `DATA_DICTIONARY.md`
4. `GAP_ANALYSIS.md`
5. `../Экран клуба/frontend/src/` — паттерн UX (читать)

Начни с прочтения spec и отчёта, что понял. Не выдумывай данные. Не перегенерируй seed JSONs или PNG-карты.
