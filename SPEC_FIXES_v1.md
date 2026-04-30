# SPEC_FIXES_v1.md — Дизайн и фичи MVP, итерация 1

**Дата:** 2026-04-30
**Статус:** к реализации Claude Code
**Контекст:** после первичной сборки MVP пользователь дал фидбек. В этой спеке две части:

- **Часть А** — что уже внесено в код. Claude Code должен ОТКРЫТЬ перечисленные файлы, ПРОВЕРИТЬ корректность изменений, при ошибках/несоответствиях — поправить.
- **Часть Б** — что нужно ДОПИСАТЬ. Это задание на код.

Все правки строго в этой папке: `C:\Users\dmuzharov\Documents\Claude\Projects\Экран Легирус`.

---

## Фидбек пользователя (исходник)

> Блок с годами убираем пока что. Должна быть таблица игроков команды с фильтром метрик, откуда переходили бы в профили. Пока как-будто пустовато. Название Аван(кириллица)D(латиница)ата(кириллица) — внимательно. В logos есть logo АванDата и фоны — используй их в дизайне и лого клуба. Пока MVP слабоватый относительно волейбола.

---

## Часть А — Уже внесено в код, проверить

### A1. Удалён блок Year tabs (2010 / 2011 / 2012)

**Файлы:**

- `frontend/src/pages/ClubOverview.jsx` — удалены import и использование `<YearTabs/>`. В `.club-overview__topbar` остались только `<SectionTabs/>`.
- `frontend/src/pages/PlayersLeaders.jsx` — удалён import и весь топбар-блок `.players-leaders__topbar` (он содержал только Year tabs).
- `frontend/src/pages/MatchesDashboard.jsx` — удалён import; вместо Year tabs в топбар добавлен текстовый заголовок `<div className="matches-dashboard__title">Матчи сезона</div>` слева от кнопки upload.
- `frontend/src/components/YearTabs.jsx` — оставлен в репозитории на всякий случай, но нигде не импортируется. Можно удалить полностью (опционально).

**Что проверить Claude Code:**

1. `grep -r "YearTabs" frontend/src` — должно дать 0 совпадений за пределами самого `YearTabs.jsx`.
2. На каждом из трёх экранов открыть DevTools и убедиться, что верхний топбар не содержит вкладок 2010/2011/2012 и раскладка не сломалась (нет лишних gap, кнопка upload и заголовок выровнены по высоте).
3. Если `YearTabs.jsx` не импортируется ни разу — удалить файл и его упоминания.

**Definition of done:** ни на одном экране не виден блок выбора года; раскладка топбара выглядит цельной.

---

### A2. Бренд переименован в «АванDата» (D — латинская)

**Файлы:**

- `frontend/src/components/AppHeader.jsx` — полностью переписан. Убран текстовый бренд («АванData»), вместо него подключены два изображения через `<img>`:
  - Слева — логотип АванDата: `/assets/logos/log-3_white.png` (alt="АванDата")
  - В центре — разделитель `×`
  - Справа — логотип ФК Легирус: `/assets/logos/legirus.png` (alt="ФК Легирус")
  - Под лого клуба — текст «ФК Легирус» (главная строка) и слоган «Золотой профиль спортсмена» (sub).
- `frontend/index.html` — `<title>` обновлён на «АванDата × ФК Легирус — Золотой профиль спортсмена».

**Что проверить Claude Code:**

1. `grep -rn "АванData" frontend/src frontend/public` — должно быть 0 совпадений (искать с латинской `Data`). В `frontend/dist/` старое значение остаётся до пересборки — это нормально.
2. `grep -rn "АванDата" frontend/src frontend/public` — должно быть только в alt-атрибутах и любых текстах (шрифт АванDата с латинской D).
3. Header при загрузке страницы должен показывать оба лого + слоган «Золотой профиль спортсмена».
4. При hover/клике на левый блок — переход на `/analytics` (есть `onClick` на `.app-header__left`).

**Definition of done:** в исходниках нигде не написано «АванData» через латинскую `Data`. Везде — «АванDата» (АванDата с латинской `D`).

---

### A3. Логотипы и фоны бренда подключены

**Файлы:**

- `frontend/public/assets/logos/legirus.png` — скопирован из `8RuaLPQ6.png` (содержит лого ФК Легирус). Старый `8RuaLPQ6.png` оставлен на месте — можно удалить, не критично.
- `frontend/src/components/AppHeader.css` — переписан полностью:
  - `.app-header` — высота 68px, фон: тёмный градиент (rgba(8,8,32,0.92) → rgba(14,30,80,0.85)) поверх `fon for web.png` справа (`right center / auto 100% no-repeat`).
  - `.app-header__brand-logo` — height 32px, drop-shadow с синим свечением.
  - `.app-header__club-logo` — height 40px, drop-shadow.
  - `.app-header__brand-sep` — золотой ×.
  - `.app-header__brand-text` — две строки: club name (17px, 800) и sub (11px, золотой, uppercase).
  - `z-index: 5` — чтобы header был выше декоративной подложки.
- `frontend/src/App.css` — добавлены:
  - `.app-layout` теперь использует двойной фон: тёмный градиент (rgba(7,7,28,0.92) → rgba(14,14,42,0.95)) поверх `fon-2_Монтажная область 1.jpg` (cover, fixed, no-repeat).
  - `::before` псевдоэлемент с `fon for web.png` снизу, opacity 0.06 — лёгкая декоративная подложка.
  - `.app-body { position: relative; z-index: 1; }` и `.app-content { position: relative; z-index: 1; }` — чтобы контент был над подложкой.
- `frontend/src/pages/ClubOverview.jsx` — в карточке «Информация о команде» вместо буквы `Л` теперь `<img src="/assets/logos/legirus.png">`.
- `frontend/src/pages/ClubOverview.css` — `.team-info__logo` переделан: квадратная плашка 80×80, padding 4px, лёгкий border, drop-shadow на `img`.

**Что проверить Claude Code:**

1. Все четыре файла в `frontend/public/assets/logos/` доступны: `log-3_white.png`, `legirus.png`, `fon for web.png`, `fon-2_Монтажная область 1.jpg`. Размеры файлов > 50 KB каждый — это не битые placeholder'ы.
2. В DevTools Network вкладке при загрузке `/analytics` все четыре картинки скачались успешно (200 OK).
3. Контраст текста на фоне: проверить что белый текст на header читается (фон тёмный градиент — должен быть ОК).
4. Background-attachment: fixed на `.app-layout` — проверить что при скролле фон не «прыгает» и не вызывает performance issues. Если на 1536px есть проблемы — заменить `fixed` на `scroll`.
5. Если `fon-2_...jpg` тяжёлый (>500 KB) — рассмотреть оптимизацию (webp/jpeg quality 70).

**Definition of done:** в шапке оба лого видны и кликабельны; за контентом виден тёмно-синий брендовый фон; в карточке «Информация о команде» — реальное лого Легируса (красный щит).

---

### A4. Таблица игроков с фильтром метрик и переходом в профиль

**Новые файлы:**

- `frontend/src/pages/PlayersRating.jsx` — страница «Рейтинг игроков»:
  - 21 метрика для сортировки (4 primary рейтинга: overall/fitness/attack/defence + 17 stat-метрик: голы, удары в створ, ассисты, ключевые пасы, xG, прогрессивные пасы, в финальную треть, кроссы, отборы, перехваты, прессинг, контрпрессинг, сейвы, дистанция, спринты, спринтерская дистанция, минуты).
  - Селектор метрики — chips (round-pill, активный — золотисто-голубой градиент).
  - Фильтр по позиции — chips (Все / ЦЗ / ЦП / ЦАП / ВР / SUB / ЛЗ / ПЗ / ЛП / ПП / ЦН в зависимости от того, какие позиции есть в матче).
  - Переключатель направления сортировки (`↓ По убыванию` / `↑ По возрастанию`).
  - Колонки таблицы: №, фото (36px), ФИО + номер, позиция (positionFull), минуты, RatingPill (общий), выбранная метрика — горизонтальный progress bar + значение.
  - Для primary метрик (рейтинги) progress bar окрашивается через `ratingColor()` (зелёный/жёлтый/оранжевый/красный). Для остальных метрик — gradient (`#2c66c7 → #ffd000`).
  - Клик по строке → `navigate('/players/${player.id}')`.
  - Sub-nav вверху: `Лидеры | Рейтинг` (NavLink из react-router-dom).
- `frontend/src/pages/PlayersRating.css` — стили chips, таблицы, progress bars (полный CSS, готов).

**Изменённые файлы:**

- `frontend/src/App.jsx` — добавлен `import PlayersRating` и роут `<Route path="/players/rating" element={<PlayersRating />} />` ПЕРЕД `<Route path="/players/:playerId" />` (порядок важен, иначе `rating` будет перехвачено как `playerId`).
- `frontend/src/pages/PlayersLeaders.jsx` — добавлен import `NavLink`, добавлен sub-nav над hero-блоком (`<NavLink>Лидеры</NavLink> <NavLink>Рейтинг</NavLink>`), используя те же CSS классы из `PlayersRating.css`.

**Что проверить Claude Code:**

1. Открыть `/players` → видны лидеры + sub-nav «Лидеры | Рейтинг» вверху.
2. Кликнуть «Рейтинг» → переход на `/players/rating` → видна таблица 15 игроков, отсортированных по умолчанию по `overall` desc.
3. Менять метрику в chips → таблица пересортируется, прогресс-бар меняет цвет/масштаб.
4. Менять позицию (например, `ЦЗ`) → отображаются только защитники.
5. Клик по строке → переход на `/players/{id}`.
6. Прямой переход на `/players/rating` через URL bar — должен работать (а не падать в `<PlayerDetail playerId="rating">`).
7. Все 15 игроков из match-001 присутствуют в таблице.

**Известные краевые случаи:**

- Если у игрока метрика отсутствует (например, save для полевых игроков) — значение `null`, в таблице отображается `—`, в сортировке пушится в самый низ (через `-Infinity`).
- ratingColor возвращает solid color, не gradient — это нормально, на progress bar выглядит как заливка цветом.

**Definition of done:** таблица работает, любая из 21 метрики корректно сортирует, любая позиция корректно фильтрует, клик ведёт в профиль игрока.

---

### A5. Расширен ClubOverview (главный экран)

**Файл:** `frontend/src/pages/ClubOverview.jsx` — переписан полностью с большим количеством блоков.

**Новые блоки (порядок сверху вниз):**

1. **Hero (`.club-overview__hero`):** двухколоночный блок:
   - Левая колонка — карточка «Информация о команде» (как раньше + добавлена строка «Игроков в составе: 15»).
   - Правая колонка — НОВАЯ карточка «Последний матч» (`.match-summary`):
     - Заголовок «Последний матч»
     - Дата матча, отформатированная через `toLocaleDateString('ru-RU', ...)` — например «19 апреля 2026 г.»
     - Сетка `team — score — team`: лого Легируса + название слева; счёт по центру (победный счёт золотым); название соперника + плейсхолдер `?` справа
     - Кнопка «Открыть матч →» (CTA, ведёт на `/matches/{matchId}`)
2. **Best Player** (как раньше) — но добавлены ещё две stat: «Перехваты» и «Минуты».
3. **Топ-5 игроков матча** — горизонтальная сетка из 5 мини-карточек:
   - `.top5-card`: ранг (`1`–`5`), фото 56px, ФИО (Фамилия + И.), номер · позиция, RatingPill (md).
   - Клик → `/players/{id}`.
4. **Сводные рейтинги** (как раньше — 4 RatingCard).
5. **Ключевые показатели** — расширены с 10 до 12 ячеек:
   - Забитые (золотой акцент через `kpi-cell--gold`), Пропущенные, Владение %, Удары всего, Удары в створ, xG, Передачи, % точных, Угловые, Штрафные удары, Нарушения, Офсайды.
6. **«1 тайм vs 2 тайм — командно»** — НОВАЯ карточка с двойными horizontal bars по 6 метрикам:
   - Расчёт: `teamSplitSum(match, key, 'first' | 'second')` — суммирует `splits[key].first|second` по всем 15 игрокам.
   - Метрики: Удары (`Shot`), Передачи (`Pass`), Отборы (`Tackle`), Перехваты (`Interception`), Прессинг (`Pressing`), Голы (`Goal`).
   - Каждая строка — две полоски: жёлто-оранжевая (1 тайм) и сине-фиолетовая (2 тайм). Под рядом — легенда с цветными точками.
7. **Лидеры по линиям** — НОВАЯ карточка, 4 мини-карточки:
   - Группы: Вратари (по `position === 'ВР'` или regex `врат`), Защита (`защ|ЛЗ|ПЗ|ЦЗ`), Полузащита (`пол|ЦП|ЦАП|ОП`), Нападение (`нап|ЦН|ЛП|ПП|ПФ`).
   - В карточке: название группы, кол-во игроков в линии, мини-блок «лидер» (фото 44px, фамилия, номер), две метрики: рейтинг лидера (цвет = `ratingColor()`) и средний рейтинг линии.
   - Клик → `/players/{leaderId}`.
8. **Атака / Оборона** — заменена простая `ao-list` на новый компонент `AoBars`:
   - 6 строк по каждой стороне.
   - Каждая строка: label, horizontal track + fill (золотой для атаки, зелёный для обороны), value справа.
   - Атака: Удары в створ, xG, Прогрессивные передачи, Передачи в финальную треть, Угловые, Кроссы.
   - Оборона: Перехваты, Отборы (totalDuels), Прессинг, Контрпрессинг, Сейвы, Заблокированные удары.

**⚠️ КРИТИЧНОЕ TODO ДЛЯ Claude Code:**

`frontend/src/pages/ClubOverview.css` — стили **уже существуют для старых классов**, но НЕ ДОПИСАНЫ для новых, добавленных в JSX:

- `.club-overview__hero`
- `.match-summary`, `.match-summary__date`, `.match-summary__teams`, `.match-summary__team`, `.match-summary__team--home`, `.match-summary__team--away`, `.match-summary__score`, `.match-summary__score-sep`, `.match-summary__score .win`, `.match-summary__placeholder`, `.match-summary__open`
- `.club-overview__top5`, `.top5-card`, `.top5-card__rank`, `.top5-card__info`, `.top5-card__name`, `.top5-card__pos`
- `.kpi-cell--gold`
- `.halftime-team`, `.halftime-team__row`, `.halftime-team__label`, `.halftime-team__bars`, `.halftime-team__bar`, `.halftime-team__bar--first`, `.halftime-team__bar--second`, `.halftime-team__bar-fill`, `.halftime-team__bar-val`, `.halftime-team__legend`, `.dot`, `.dot--first`, `.dot--second`
- `.club-overview__lines`, `.line-card`, `.line-card__group`, `.line-card__count`, `.line-card__player`, `.line-card__name`, `.line-card__pos`, `.line-card__metrics`, `.line-card__metric-label`, `.line-card__metric-val`, `.line-card__metric-val--muted`
- `.ao-bars`, `.ao-bars__row`, `.ao-bars__label`, `.ao-bars__track`, `.ao-bars__fill`, `.ao-bars__val`

**Без этих стилей экран ClubOverview будет выглядеть сломанным.** Claude Code обязан дописать `frontend/src/pages/ClubOverview.css`. Подробное руководство по стилям — см. **Часть Б, B1**.

---

## Часть Б — Что нужно доделать

### B1. Дописать CSS для ClubOverview.jsx (КРИТИЧНО)

Дописать в `frontend/src/pages/ClubOverview.css` (в конец файла) все стили для новых блоков. Ниже — конкретные правила (можно использовать как отправную точку):

```css
/* HERO */
.club-overview__hero {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 12px;
}

/* MATCH SUMMARY */
.match-summary {
  display: flex;
  flex-direction: column;
  gap: 12px;
}
.match-summary__date {
  font-size: 13px;
  color: rgba(255,255,255,0.6);
  margin-top: -4px;
}
.match-summary__teams {
  display: grid;
  grid-template-columns: 1fr auto 1fr;
  align-items: center;
  gap: 16px;
  padding: 8px 0;
}
.match-summary__team {
  display: flex;
  align-items: center;
  gap: 10px;
  font-weight: 600;
  font-size: 14px;
}
.match-summary__team--away { justify-content: flex-end; }
.match-summary__team img { width: 36px; height: 36px; object-fit: contain; }
.match-summary__placeholder {
  width: 36px; height: 36px;
  border-radius: 50%;
  background: rgba(255,255,255,0.06);
  border: 1px dashed rgba(255,255,255,0.2);
  display: flex; align-items: center; justify-content: center;
  color: rgba(255,255,255,0.4);
  font-weight: 700;
}
.match-summary__score {
  display: flex; align-items: center; gap: 6px;
  font-size: 32px; font-weight: 800;
  color: rgba(255,255,255,0.85);
  font-variant-numeric: tabular-nums;
}
.match-summary__score .win { color: #ffd000; }
.match-summary__score-sep { color: rgba(255,255,255,0.3); }
.match-summary__open {
  margin-top: 4px;
  background: linear-gradient(135deg, #1a4ba0, #2c66c7);
  border: none; color: #fff;
  padding: 8px 16px;
  border-radius: 8px;
  cursor: pointer;
  font-size: 13px;
  font-weight: 600;
  transition: background 0.15s;
  font-family: inherit;
}
.match-summary__open:hover { background: linear-gradient(135deg, #2c66c7, #4a86e8); }

/* TOP-5 */
.club-overview__top5 {
  display: grid;
  grid-template-columns: repeat(5, 1fr);
  gap: 10px;
}
.top5-card {
  display: grid;
  grid-template-columns: 24px auto 1fr auto;
  align-items: center;
  gap: 10px;
  padding: 10px 12px;
  background: rgba(20, 20, 60, 0.7);
  border: 1px solid rgba(255,255,255,0.08);
  border-radius: 10px;
  cursor: pointer;
  transition: border-color 0.15s, transform 0.15s;
}
.top5-card:hover { border-color: rgba(255,208,0,0.4); transform: translateY(-2px); }
.top5-card__rank {
  font-size: 16px; font-weight: 800;
  color: #ffd000;
  text-align: center;
}
.top5-card__name { font-weight: 700; font-size: 13px; color: #fff; }
.top5-card__pos { font-size: 11px; color: rgba(255,255,255,0.55); margin-top: 2px; }

/* KPI gold accent */
.kpi-cell--gold .kpi-cell__value { color: #ffd000; }

/* HALF-TIME TEAM BARS */
.halftime-team { display: flex; flex-direction: column; gap: 12px; }
.halftime-team__row {
  display: grid;
  grid-template-columns: 130px 1fr;
  align-items: center;
  gap: 14px;
}
.halftime-team__label {
  font-size: 13px;
  color: rgba(255,255,255,0.85);
  font-weight: 600;
}
.halftime-team__bars { display: flex; flex-direction: column; gap: 4px; }
.halftime-team__bar {
  position: relative;
  height: 18px;
  background: rgba(255,255,255,0.04);
  border-radius: 4px;
  overflow: hidden;
}
.halftime-team__bar-fill {
  height: 100%;
  border-radius: 4px;
  transition: width 0.3s;
}
.halftime-team__bar--first .halftime-team__bar-fill { background: linear-gradient(90deg, #ffb74d, #ffd000); }
.halftime-team__bar--second .halftime-team__bar-fill { background: linear-gradient(90deg, #5e7cff, #2c66c7); }
.halftime-team__bar-val {
  position: absolute;
  right: 8px; top: 50%;
  transform: translateY(-50%);
  font-size: 11px;
  font-weight: 700;
  color: #fff;
  font-variant-numeric: tabular-nums;
}
.halftime-team__legend {
  display: flex; gap: 16px;
  margin-top: 8px;
  font-size: 12px;
  color: rgba(255,255,255,0.6);
}
.dot { display: inline-block; width: 8px; height: 8px; border-radius: 50%; margin-right: 6px; vertical-align: middle; }
.dot--first { background: #ffd000; }
.dot--second { background: #2c66c7; }

/* LINE LEADERS */
.club-overview__lines {
  display: grid;
  grid-template-columns: repeat(4, 1fr);
  gap: 10px;
}
.line-card {
  background: rgba(20,20,60,0.7);
  border: 1px solid rgba(255,255,255,0.08);
  border-radius: 10px;
  padding: 12px;
  cursor: pointer;
  transition: border-color 0.15s;
  display: flex; flex-direction: column;
  gap: 8px;
}
.line-card:hover { border-color: rgba(255,208,0,0.4); }
.line-card__group {
  font-size: 11px;
  text-transform: uppercase;
  letter-spacing: 0.05em;
  color: rgba(255,255,255,0.55);
  font-weight: 600;
}
.line-card__count { font-size: 10px; color: rgba(255,255,255,0.4); margin-top: -4px; }
.line-card__player { display: flex; align-items: center; gap: 10px; }
.line-card__name { font-weight: 700; font-size: 13px; color: #fff; }
.line-card__pos { font-size: 11px; color: rgba(255,255,255,0.5); margin-top: 2px; }
.line-card__metrics {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 8px;
  margin-top: auto;
  padding-top: 8px;
  border-top: 1px solid rgba(255,255,255,0.05);
}
.line-card__metric-label { font-size: 10px; color: rgba(255,255,255,0.45); text-transform: uppercase; letter-spacing: 0.05em; }
.line-card__metric-val { font-size: 18px; font-weight: 800; }
.line-card__metric-val--muted { color: rgba(255,255,255,0.7); }

/* AO BARS */
.ao-bars { display: flex; flex-direction: column; gap: 8px; }
.ao-bars__row {
  display: grid;
  grid-template-columns: 1fr 100px 50px;
  gap: 12px;
  align-items: center;
}
.ao-bars__label { font-size: 13px; color: rgba(255,255,255,0.85); }
.ao-bars__track {
  height: 8px;
  background: rgba(255,255,255,0.06);
  border-radius: 4px;
  overflow: hidden;
}
.ao-bars__fill { height: 100%; border-radius: 4px; transition: width 0.3s; }
.ao-bars__val {
  text-align: right;
  font-weight: 700;
  color: #ffd000;
  font-size: 14px;
  font-variant-numeric: tabular-nums;
}
```

**Definition of done:** все блоки на `/analytics` визуально цельные — нет «голого» HTML без стилей, тексты не наезжают, прогресс-бары видны, hover-эффекты работают.

---

### B2. Уплотнить экран match-detail

Сейчас экран `/matches/:matchId` (`frontend/src/pages/MatchDetail.jsx`) — посмотреть текущее состояние и добавить недостающее по спеке `TASK_SPEC_FOR_CODE.md` §4.2 «Screen `match-detail`»:

1. **4 рейтинговые карточки** в hero (как в players-detail): Общий, Фитнес, Атака, Защита — берутся из `match.teamAvgRatings`. Использовать существующий `<RatingCard>`.
2. **DonutComparisonCard** — 6 штук в сетке 3×2:
   - Удары в створ (`teamSummaryStats.home.shots.onTarget` vs `away`)
   - Прогрессивные передачи (`teamAggregates.passes.progressive` — для команды; противника нет → показать 0 или `—` с пометкой «Нет данных по сопернику»)
   - Отборы (`teamAggregates.duels.totalDuels` — для команды)
   - Перехваты (`teamAggregates.positioning.interceptions` — для команды)
   - Голевые моменты (`teamAggregates.shooting.goalActions` или агрегат из splits)
   - Удачные обводки (`teamAggregates.attacks.dribble.success`)
   - Использовать существующий `<DonutComparisonCard>`.
3. **Кнопка / ссылка «Командные дашборды по 9 секциям»** — ведёт на новый экран match-team-aggregates (если он не реализован — TODO в этой же спеке) ИЛИ разворачивает 9 карточек прямо на текущей странице ниже.
4. **Карта на match-detail** — для каждой из 8 секций (без possession) показать `<SoccerFieldImageMap src={match.teamAggregates.shooting.mapImage} title="Карта ударов">`.
5. **Tabs «ОБЩЕЕ / МОЯ КОМАНДА»** — по спеке. На «МОЯ КОМАНДА» фокус только на home stats и player breakdowns (топ-3 игрока по голам, ассистам, отборам).

**Definition of done:** экран match-detail не выглядит пустым; присутствуют рейтинги, donuts, командные карты, формация (уже есть через `<FormationField>`).

---

### B3. Уплотнить экран players-detail (золотой профиль)

Сейчас экран `/players/:playerId` (`frontend/src/pages/PlayerDetail.jsx`) — уже довольно насыщен (радар, Player vs Team, Position radar, HalfTimeBars, две карты, fitness grid, splits таблицы). Можно добавить:

1. **Лента «Лучший в команде»** — после блока ratings: горизонтальная полоска бейджей вида «🏆 Лучший по перехватам (16)», «🥈 #2 по передачам (53)» и т.п. Вычисляется ранжированием игрока по каждой ключевой метрике относительно команды. Показывать только топ-3 места.
2. **Сравнение с лидером линии** — мини-карточка «Линия: Защита» с двумя радарами/барами: текущий игрок vs лидер своей линии (из `lineLeaders` ClubOverview, ту же логику можно вынести в `utils/lines.js`).
3. **Индикатор формы** — рядом с каждым из 4 рейтингов: маленькая стрелочка, показывающая, прибавил ли игрок (по сравнению с avg.лиги/линии). Без данных по другим матчам — нечего показывать; этот пункт можно отложить.
4. **Кнопка «Скачать карточку игрока»** — placeholder (disabled), на будущее.

**Definition of done:** PlayerDetail имеет минимум 8 содержательных блоков; экран не выглядит пустым на 1536px и 1920px.

---

### B4. Уплотнить MatchesDashboard

Сейчас `/matches` — две колонки: список матчей + сезонная сводка + подсказка про upload. Добавить:

1. **Карточка «Сводка последнего матча»** в правую колонку (то же что в ClubOverview hero) — счёт, дата, кнопка «Открыть».
2. **Топ-3 бомбардира сезона** — мини-таблица из агрегата по всем матчам (на 1 матче будет 3 максимальных голевых действия из match-001).
3. **Хедер сезона** — шапка с фоном `/assets/logos/fon-3_Монтажная область 1.jpg` и заголовком «Сезон 2025-2026».

**Definition of done:** `/matches` не выглядит «двухкарточечным»; есть минимум 4 содержательных блока в правой колонке.

---

### B5. Полировка дизайна под бренд

Принципы:

- **Золотой `#ffd000`** — фирменный акцент Легируса. Использовать только для важных значений (рейтинг лидера, score, primary CTA, активные chips).
- **Синий градиент `linear-gradient(135deg, #1a4ba0, #2c66c7)`** — фирменный градиент АванDата. Использовать для navigation active states, секций, кнопок CTA.
- **Тёмно-синий фон `#0e0e2a` / `#07071c`** — основа layout, хорошо ложится на `fon-2_...jpg`.
- **Зелёный `#7cb342` / `#2e7d32`** — рейтинг 8+ / 9+; жёлтый `#fbc02d` — 7-8; оранжевый `#fb8c00` — 6-7; красный `#d32f2f` — <6 (через `ratingColor()` в `utils/colors.js`).

Конкретные места:

1. SidebarNav — активный пункт должен иметь синий→золотой gradient слева как «pill» индикатор.
2. AppHeader — кнопка ↻ обновления при hover окрашивается в золотой.
3. Все clickable cards — добавить hover effect: `border-color: rgba(255,208,0,0.4); transform: translateY(-2px);`.
4. Все progress bars — fixed easing 0.3s.
5. Tooltip на радарах (если ещё нет) — через `recharts` Tooltip компонент с темой `{ background: '#1a1a4a', border: '1px solid rgba(255,208,0,0.3)' }`.

**Definition of done:** во всех экранах визуально читается единый бренд: тёмно-синий → золотой акцент. Hover-стейты на карточках работают единообразно. Активные элементы навигации подчёркнуты.

---

### B6. Финальная сборка и smoke-test

```bash
cd frontend
npm install   # на случай новых зависимостей
npm run build # должно пройти без ошибок
npm run dev   # стартовать dev server
```

Открыть `http://localhost:5173` (или порт vite по умолчанию) и пройти smoke-test:

- [ ] `/analytics` — все блоки видны, hover работает, клик в матч/игрока/линию ведёт куда надо
- [ ] `/matches` — открывается, кнопка upload не падает
- [ ] `/matches/match-001` — формация рендерится, командные блоки на месте
- [ ] `/players` — sub-nav «Лидеры | Рейтинг» виден, лидеры карточек работают
- [ ] `/players/rating` — таблица 15 игроков, переключатель метрик и позиций работает
- [ ] `/players/p05-galitsky` — золотой профиль рендерится, карты видны, splits таблицы заполнены
- [ ] backend `npm start` (в отдельном терминале) — `/api/health` возвращает 200; `/api/data/matches` возвращает 1 матч

**Definition of done:** `npm run build` без ошибок; ни один из 6 экранов не падает; все ссылки рабочие.

---

## Порядок реализации (рекомендация)

1. **B1** — дописать CSS (СНАЧАЛА, иначе будет невозможно проверить экран ClubOverview).
2. **A1–A5** — пройтись по чек-листам Part A, проверить каждый пункт, поправить найденные ошибки.
3. **B2, B3, B4** — уплотнение оставшихся экранов.
4. **B5** — полировка дизайна.
5. **B6** — сборка, smoke-test.

---

## Карта изменённых / созданных файлов

```
СОЗДАНЫ:
+ frontend/public/assets/logos/legirus.png            (копия 8RuaLPQ6.png)
+ frontend/src/pages/PlayersRating.jsx
+ frontend/src/pages/PlayersRating.css
+ SPEC_FIXES_v1.md                                    (этот файл)

ИЗМЕНЕНЫ:
~ frontend/index.html                                 (title)
~ frontend/src/App.jsx                                (роут /players/rating)
~ frontend/src/App.css                                (фоны бренда, z-index)
~ frontend/src/components/AppHeader.jsx               (новый бренд + лого)
~ frontend/src/components/AppHeader.css               (новый дизайн header)
~ frontend/src/pages/ClubOverview.jsx                 (большое расширение)
~ frontend/src/pages/ClubOverview.css                 (team-info logo как img — ТРЕБУЕТ ДОПИСАТЬ B1)
~ frontend/src/pages/MatchesDashboard.jsx             (убран YearTabs)
~ frontend/src/pages/PlayersLeaders.jsx               (убран YearTabs, добавлен sub-nav)
```

---

## Что осталось НЕТРОНУТЫМ (на будущее)

- Парсеры (`backend/parsers/*.py`) — не трогать.
- Seed-данные (`backend/data/**`) — не трогать.
- PNG-карты и фото игроков — не трогать.
- `match-team-aggregates` экран (9 секций по pages 12-20) — **не реализован**, упомянут в `TASK_SPEC_FOR_CODE.md` §4.2 — это отдельная задача, не входит в эту спеку.
- PDF Upload pipeline (`POST /api/upload-pdf`) — отдельная задача, не входит в эту спеку.

---

## Контакт

- Проект: «Экран Легирус» (АванDата × ФК Легирус 2010)
- Бренд: SportData (`ai4sportdata@gmail.com`)
- Дата спеки: 30.04.2026
