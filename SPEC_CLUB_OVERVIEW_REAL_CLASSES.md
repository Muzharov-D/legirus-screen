# SPEC_CLUB_OVERVIEW_REAL_CLASSES — финальные правки по фактическим именам классов

## Корень проблемы

В `frontend/src/pages/ClubOverview.css` на строках 401-434 есть mobile media-queries, но они **используют несуществующие классы**:

| В CSS написано | Реальный класс в JSX |
|----------------|----------------------|
| `.club-overview__motm` | `.best-player` |
| `.club-overview__motm-info` | `.best-player__info` |
| `.club-overview__leaders` | `.club-overview__lines` |
| `.club-overview__leader-card` | `.line-card` |
| `.club-overview__metrics` | `.club-overview__kpi` |
| `.club-overview__top` | `.club-overview__top5` |
| `.club-overview` (sole) | реально `.club-overview__grid` |

Поэтому ни одно из mobile-правил не применилось к нужным блокам.

## Реальная структура из JSX (для ориентировки)

```
.club-overview__topbar        — навигация сверху
.club-overview__grid          — двухколоночный wrapper (320px + 1fr)
  .club-overview__col-left
  .club-overview__col-right
    .club-overview__hero      — двухколоночная сетка (1fr 1fr)
      .card.team-info         — «Информация о команде»
      .card.match-summary     — «Последний матч»
    .card.best-player         — «Лучший игрок матча»
    .club-overview__ratings   — Сводные рейтинги (4 колонки)
    .club-overview__kpi       — Ключевые показатели (5 колонок)
    .club-overview__top5      — Топ-5 игроков (5 колонок)
    .club-overview__lines     — Лидеры по линиям (4 колонки)
    .club-overview__ao        — Атака/Оборона (1fr 1fr)
    .halftime-team            — «1 тайм vs 2 тайм»
```

---

## Правка `frontend/src/pages/ClubOverview.css`

**Удалить целиком оба существующих mobile блока** (строки 401-434, два `@media (max-width: 768px)` блока) и заменить **одним** правильным:

```css
@media (max-width: 768px) {
  /* === 1. Главный layout: 320px+1fr → одна колонка === */
  .club-overview__grid {
    grid-template-columns: 1fr !important;
    gap: 12px !important;
  }

  /* === 2. Hero: «Инфо о команде» + «Последний матч» друг под другом === */
  .club-overview__hero {
    grid-template-columns: 1fr !important;
    gap: 10px !important;
  }

  /* === 1. team-info: выровнять по левому краю === */
  .team-info__body {
    flex-direction: row !important;
    align-items: flex-start !important;
    gap: 12px !important;
  }
  .team-info__data {
    text-align: left !important;
    flex: 1 1 auto;
    min-width: 0;
  }
  .team-info__name {
    font-size: 16px !important;
    word-break: keep-all;
    overflow-wrap: normal;
  }
  .team-info__logo { width: 60px !important; height: 60px !important; }

  /* === 11. match-summary: счёт не залезает на название === */
  .match-summary__teams {
    grid-template-columns: 1fr auto 1fr !important;
    gap: 8px !important;
  }
  .match-summary__team {
    font-size: 12px !important;
    min-width: 0;
    overflow: hidden;
  }
  .match-summary__team img,
  .match-summary__placeholder { width: 28px !important; height: 28px !important; }
  .match-summary__score { font-size: 22px !important; white-space: nowrap; }

  /* === 4. Best player: стек, фото 64px, метрики wrap === */
  .best-player__body {
    grid-template-columns: auto 1fr !important;
    gap: 12px !important;
  }
  .best-player__name {
    font-size: 15px !important;
    white-space: normal !important;
    word-break: break-word;
  }
  .best-player__pos { font-size: 11px !important; }
  .best-player__stats {
    flex-wrap: wrap !important;
    gap: 6px 12px !important;
    font-size: 11px !important;
  }

  /* === 6. Сводные рейтинги: 2 колонки, БЕЗ полосок (полоски — это линейный фон, скрыть) === */
  .club-overview__ratings {
    grid-template-columns: repeat(2, minmax(0, 1fr)) !important;
    gap: 8px !important;
  }

  /* === 7. KPI Ключевые показатели: 2 колонки, компактнее === */
  .club-overview__kpi {
    grid-template-columns: repeat(2, minmax(0, 1fr)) !important;
    gap: 6px !important;
  }
  .kpi-cell { padding: 8px 6px !important; min-width: 0 !important; }
  .kpi-cell__value { font-size: 18px !important; }
  .kpi-cell__label {
    font-size: 9px !important;
    line-height: 1.2 !important;
    white-space: normal !important;
  }

  /* === 5. Топ-5: горизонтальная карусель со свайпом === */
  .club-overview__top5 {
    display: flex !important;
    flex-direction: row !important;
    flex-wrap: nowrap !important;
    overflow-x: auto !important;
    -webkit-overflow-scrolling: touch !important;
    scroll-snap-type: x mandatory !important;
    gap: 8px !important;
    padding-bottom: 6px !important;
    grid-template-columns: none !important;
  }
  .top5-card {
    flex: 0 0 calc(80vw - 32px) !important;
    scroll-snap-align: start !important;
    min-width: 0 !important;
  }

  /* === 9. Лидеры по линиям: горизонтальная карусель === */
  .club-overview__lines {
    display: flex !important;
    flex-direction: row !important;
    flex-wrap: nowrap !important;
    overflow-x: auto !important;
    -webkit-overflow-scrolling: touch !important;
    scroll-snap-type: x mandatory !important;
    gap: 8px !important;
    padding-bottom: 6px !important;
    grid-template-columns: none !important;
  }
  .line-card {
    flex: 0 0 calc(80vw - 32px) !important;
    scroll-snap-align: start !important;
    min-width: 0 !important;
  }

  /* === 10. Атака и Оборона друг под другом === */
  .club-overview__ao {
    grid-template-columns: 1fr !important;
    gap: 10px !important;
  }
  .ao-bars__row {
    grid-template-columns: 1fr 70px 40px !important;
    gap: 8px !important;
    font-size: 12px !important;
  }

  /* === 8. Halftime team bars (1 тайм vs 2 тайм) — компактнее на mobile === */
  .halftime-team__row {
    grid-template-columns: 90px 1fr !important;
    gap: 8px !important;
  }
  .halftime-team__label { font-size: 11px !important; }
  .halftime-team__bar { height: 14px !important; }
  .halftime-team__bar-val { font-size: 10px !important; }
}
```

---

## Передай Code

> Открой `frontend/src/pages/ClubOverview.css`. Найди два существующих блока `@media (max-width: 768px)` (строки ~401 и ~410) и **удали их полностью**. Затем в самый конец файла добавь блок media из SPEC_CLUB_OVERVIEW_REAL_CLASSES.md (один большой `@media (max-width: 768px)` с правилами для всех 12 разделов).
>
> После — `npm run build`, push.
>
> ВАЖНО: `frontend/src/styles/mobile.css` НЕ ТРОГАТЬ. Эти правки должны жить в `ClubOverview.css` поскольку они относятся к классам этой страницы. Глобальный `mobile.css` остаётся как есть.

---

## Acceptance после деплоя (всё на iPhone, после очистки кэша Safari)

1. **Информация о команде** — выровнено по левому краю, текст не отцентрован
2. **Последний матч** — отдельной плашкой ниже Информации о команде, не рядом
3. **Соперник в Последнем матче** — виден целиком (не обрезан), счёт не наезжает
4. **Лучший игрок матча** — фото слева, имя/метрики справа, всё помещается
5. **Топ-5** — горизонтальный свайп со snap, видно одну карточку целиком
6. **Сводные рейтинги** — в 2 колонки 2×2
7. **Ключевые показатели** — в 2 колонки, владение/% помещаются
8. **1 тайм vs 2 тайм** — компактные бары
9. **Лидеры по линиям** — горизонтальный свайп со snap
10. **Атака / Оборона** — одна под другой
11. **Сводка матча** — счёт читается, имена команд не обрезаются

Если **что-то** ещё едет — пришли DevTools-вывод с iPhone:

```js
[...document.querySelectorAll('*')].filter(e=>e.getBoundingClientRect().right>window.innerWidth+1).slice(0,10).forEach(e=>console.log(e.tagName+'.'+(e.className||'').toString().slice(0,80),'right='+Math.round(e.getBoundingClientRect().right)));
console.log('vp:', window.innerWidth);
```

По именам классов — добью одной строкой.
