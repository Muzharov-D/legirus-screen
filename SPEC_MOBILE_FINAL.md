# SPEC_MOBILE_FINAL — точечные фиксы по скриншотам

После аудита — главное (`min-width: 1536px`) уже убрано. Осталось 7 конкретных багов из ваших последних скриншотов.

## Баг 1 — Бары «1 тайм vs 2 тайм» уезжают вправо

Чарт-полоски выходят за viewport справа. У контейнера/SVG нет `max-width: 100%`.

**Файл:** `frontend/src/styles/mobile.css` — добавить в блок `@media (max-width: 768px)`:

```css
@media (max-width: 768px) {
  /* Halftime bars chart container — full width SVG */
  [class*="halftime"],
  [class*="halftime-bars"],
  [class*="HalfTime"] {
    max-width: 100% !important;
    overflow: hidden !important;
  }
  [class*="halftime"] svg,
  [class*="halftime-bars"] svg {
    width: 100% !important;
    max-width: 100% !important;
    height: auto !important;
  }
}
```

## Баг 2 — Ключевые показатели матча обрезаются справа («41» вместо «413»)

`.match-detail__metrics` или подобный грид имеет `repeat(4, 1fr)` без `minmax(0, ...)` — карточки не сжимаются.

**В тот же блок mobile.css:**

```css
@media (max-width: 768px) {
  [class*="metrics"],
  [class*="key-stats"],
  [class*="key_stats"] {
    display: grid !important;
    grid-template-columns: repeat(2, minmax(0, 1fr)) !important;
    gap: 8px !important;
  }
  [class*="metric-card"],
  [class*="metrics__card"],
  [class*="key-stat"] {
    min-width: 0 !important;
    overflow: hidden;
  }
}
```

## Баг 3 — «Лучший игрок матча» — текст обрезается («Перехваты: 16 Ми...»)

Строка с метриками идёт `white-space: nowrap` или flex без wrap.

```css
@media (max-width: 768px) {
  [class*="motm"],
  [class*="best-player"],
  [class*="motm__stats"] {
    flex-wrap: wrap !important;
    white-space: normal !important;
    overflow: visible !important;
  }
  [class*="motm__stats"] > *,
  [class*="motm__row"] > * {
    flex: 0 0 auto;
    margin-right: 8px;
  }
}
```

## Баг 4 — Топ-5 игроков матча карусель обрезается

Горизонтальная карусель карточек. Превратить в 1-колоночный стек или 2-колоночный grid.

```css
@media (max-width: 768px) {
  [class*="top-players"],
  [class*="top5"],
  [class*="top-5"],
  [class*="players-row"],
  [class*="player-card-row"] {
    display: grid !important;
    grid-template-columns: repeat(2, minmax(0, 1fr)) !important;
    gap: 8px !important;
    overflow: visible !important;
  }
  [class*="top-player-card"],
  [class*="player-card"] {
    min-width: 0 !important;
    width: 100% !important;
  }
}

@media (max-width: 480px) {
  [class*="top-players"],
  [class*="players-row"] {
    grid-template-columns: 1fr !important;
  }
}
```

## Баг 5 — «Лидеры по линиям» правая часть обрезана

То же что Топ-5: горизонтальная карусель.

```css
@media (max-width: 768px) {
  [class*="leaders"],
  [class*="line-leaders"],
  [class*="leaders-row"] {
    display: grid !important;
    grid-template-columns: repeat(2, minmax(0, 1fr)) !important;
    gap: 8px !important;
    overflow: visible !important;
  }
  [class*="leader-card"],
  [class*="line-leader"] {
    min-width: 0 !important;
    width: 100% !important;
  }
}

@media (max-width: 480px) {
  [class*="leaders"],
  [class*="line-leaders"] {
    grid-template-columns: 1fr !important;
  }
}
```

## Баг 6 — Большой «8.1» overlay перекрывает имя «Артем Закус...»

На странице игрока есть rating-pill (большая зелёная плашка с числом), absolute-positioned поверх имени. На mobile нужно либо переставить ниже, либо уменьшить.

**Найди класс этого rating-pill** в `PlayerDetail.css`. Скорее всего что-то типа `.player-detail__rating-pill` или `.rating-pill--xl`. Если не уверен — пришли вывод:

```bash
grep -rn "rating-pill\|RatingPill" frontend/src/components/ frontend/src/pages/ | head -10
```

Универсальный фикс пока — на mobile сделать pill **inline вместо absolute**:

```css
@media (max-width: 768px) {
  [class*="rating-pill--xl"],
  [class*="rating-pill__big"],
  [class*="player-detail__rating-pill"],
  [class*="player-detail__overall"] {
    position: static !important;
    transform: none !important;
    margin: 8px auto !important;
    font-size: 24px !important;
    width: 64px !important;
    height: 64px !important;
  }
  /* Хедер игрока — фото + имя стеком, потом pill */
  .player-detail__header {
    display: flex !important;
    flex-direction: column !important;
    align-items: center !important;
    text-align: center;
    gap: 10px;
  }
  .player-detail__name {
    white-space: normal !important;
    overflow: visible !important;
    word-break: break-word;
    font-size: 18px !important;
  }
}
```

## Баг 7 — Кнопки «К списку / К матчу / Скачать карточку» — третья отрезана

Flex-row без wrap.

```css
@media (max-width: 768px) {
  [class*="player-detail__nav-buttons"],
  [class*="player-detail__back"],
  [class*="back-buttons"] {
    flex-wrap: wrap !important;
    gap: 6px !important;
  }
  [class*="player-detail__nav-buttons"] > *,
  [class*="back-buttons"] > * {
    flex: 1 1 auto;
    min-width: 90px;
    font-size: 12px !important;
    padding: 6px 10px !important;
  }
  /* «Скачать карточку» если не помещается — на отдельную строку, во всю ширину */
  [class*="player-detail__nav-buttons"] [class*="download"],
  [class*="back-buttons"] [class*="download"] {
    flex: 1 1 100%;
    margin-top: 4px;
  }
}
```

---

## Передай Code

> Открой `frontend/src/styles/mobile.css` и **внутри существующего блока `@media (max-width: 768px) { ... }` дополни** правилами из секций «Баг 1»–«Баг 7» SPEC_MOBILE_FINAL.md. Не переписывай весь файл, только добавь правила в конец блока. Также добавь блок `@media (max-width: 480px)` если его нет, с правилами для Бага 4 и Бага 5.
>
> Не трогай ничего другого — ни JSX, ни CSS-файлы компонентов.
>
> После — `npm run build`, push.

После Vercel deploy:

1. Очистить данные сайта на iPhone (Settings → Safari → Дополнения → Данные веб-сайтов → удалить `legirus-screen`)
2. Перезагрузить
3. По всем 7 точкам — проверить что вылезание справа исчезло

Если **что-то** ещё не помещается — открой страницу в Safari Web Inspector (Mac) или Chrome DevTools (USB Android) и в консоль:

```js
[...document.querySelectorAll('*')].filter(el => el.getBoundingClientRect().right > window.innerWidth + 1).slice(0, 8).forEach(el => console.log(el.tagName + '.' + el.className, '→', Math.round(el.getBoundingClientRect().right) + 'px (vp=' + window.innerWidth + ')'));
```

Этот скрипт выведет первые 8 элементов с конкретными именами классов которые торчат за viewport. По именам — дам одну точечную правку. Без скрипта дальше угадывать перестаю.
