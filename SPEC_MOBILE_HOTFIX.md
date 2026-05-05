# SPEC_MOBILE_HOTFIX — срочный откат + правильный fix

## Что сломалось

Прошлый SPEC_MOBILE_NUKE применил два опасных правила:
1. `[class*="grid"]` НЕ матчит `.club-overview` (там нет «grid» в имени) → 2-колоночный layout не схлопнулся в 1
2. `word-break: break-word !important` + `overflow-wrap: anywhere !important` на универсальном селекторе → текст рендерится **буква-в-букву** вертикально в узких колонках

Результат — ад на скриншоте: «ФК ЛЕГИРУС 2010» столбиком по одной букве.

## Hotfix — ЗАМЕНИТЬ `frontend/src/styles/mobile.css` ЦЕЛИКОМ

Удалить старое содержимое полностью. Заменить на это:

```css
/* === GLOBAL === */

html, body {
  overflow-x: hidden !important;
  max-width: 100vw !important;
  -webkit-text-size-adjust: 100%;
  text-size-adjust: 100%;
}

*, *::before, *::after {
  box-sizing: border-box !important;
}

img, svg, canvas, video, picture {
  max-width: 100% !important;
  height: auto;
}

input, select, textarea, button {
  font-size: 16px;
}

/* === MOBILE: ≤768px === */
@media (max-width: 768px) {

  body { font-size: 14px; }

  /* App layout */
  .app-body { flex-direction: column !important; }
  .app-content, .page {
    padding: 10px !important;
    padding-bottom: 70px !important;
    width: 100% !important;
    max-width: 100vw !important;
    overflow-x: hidden !important;
  }

  /* === Главное: схлопнуть ВСЕ многоколоночные layouts в один === */
  /* Перечислены все известные двух-/трёх-/четырёх-колоночные обёртки */
  .club-overview,
  .matches-dashboard__grid,
  .match-detail__grid,
  .player-detail__grid,
  .player-detail__header,
  .player-detail__radar-row,
  .player-detail__compare-row,
  .player-detail__maps,
  .comparison-view__grid {
    display: block !important;
    grid-template-columns: none !important;
  }
  .club-overview > *,
  .matches-dashboard__grid > *,
  .match-detail__grid > *,
  .player-detail__grid > *,
  .comparison-view__grid > * {
    width: 100% !important;
    max-width: 100% !important;
    margin: 0 0 10px 0 !important;
  }

  /* Сводные рейтинги: 4 в строку → 2 в строку */
  .club-overview__ratings,
  .match-detail__ratings,
  .player-detail__ratings {
    display: grid !important;
    grid-template-columns: repeat(2, minmax(0, 1fr)) !important;
    gap: 8px !important;
  }

  /* Ключевые показатели: 5 → 2 */
  .club-overview__metrics,
  .match-detail__metrics {
    display: grid !important;
    grid-template-columns: repeat(2, minmax(0, 1fr)) !important;
    gap: 8px !important;
  }

  /* Лидеры: 3 в строку → 2 */
  .club-overview__leaders,
  .match-detail__leaders,
  .players-leaders__grid {
    display: grid !important;
    grid-template-columns: repeat(2, minmax(0, 1fr)) !important;
    gap: 8px !important;
  }

  /* Hero blocks — стек */
  .matches-dashboard__hero,
  .match-detail__hero,
  .club-overview__motm,
  .club-overview__hero {
    display: flex !important;
    flex-direction: column !important;
    align-items: stretch !important;
    gap: 8px !important;
  }

  /* Cards — без min-width, чтобы не вылазили */
  .card,
  [class*="-card"],
  [class*="__card"] {
    min-width: 0 !important;
    max-width: 100% !important;
    width: 100% !important;
  }

  /* === Текст: НОРМАЛЬНЫЙ wrap, не ломаем буквами === */
  /* word-break: normal — не ломает слова посимвольно
     overflow-wrap: break-word — ломает только если слово не помещается целиком */
  body, .card, p, span, div, h1, h2, h3, h4, h5, h6, a, button, li {
    word-break: normal !important;
    overflow-wrap: break-word !important;
    hyphens: none !important;
  }

  /* Заголовки секций: разрешаем перенос на 2 строки */
  .page-section-title,
  [class*="title"] {
    white-space: normal !important;
    overflow: visible !important;
    text-overflow: clip !important;
    max-width: 100% !important;
  }

  /* === Header (top bar) === */
  .app-header {
    padding: 6px 10px !important;
    height: 52px !important;
    flex-wrap: wrap;
  }

  /* === Sidebar → bottom nav === */
  .sidebar-nav {
    position: fixed !important;
    bottom: 0 !important; left: 0 !important; right: 0 !important; top: auto !important;
    width: 100% !important; height: 56px !important;
    flex-direction: row !important;
    border-right: none !important;
    border-top: 1px solid rgba(255,255,255,0.1);
    z-index: 100;
    background: var(--card-bg, #0d1424);
  }
  .sidebar-nav__item {
    flex: 1 !important;
    flex-direction: column !important;
    padding: 6px 4px !important;
    font-size: 10px !important;
    text-align: center;
  }
  .sidebar-nav__icon { font-size: 20px !important; margin-bottom: 2px; }

  /* ИИ-агент скрыть */
  .agent-trigger,
  .agent-card { display: none !important; }

  /* Recharts SVG */
  .recharts-wrapper,
  .recharts-surface,
  .recharts-responsive-container {
    width: 100% !important;
    max-width: 100% !important;
    height: auto !important;
  }

  /* Tables */
  table {
    display: block;
    overflow-x: auto;
    -webkit-overflow-scrolling: touch;
    max-width: 100%;
  }
}

/* === SMALL MOBILE: ≤480px === */
@media (max-width: 480px) {
  body { font-size: 13px; }
  .page, .app-content { padding: 6px !important; padding-bottom: 70px !important; }
}
```

## Ключевые изменения от прошлой версии

1. **`word-break: normal !important`** заменяет `break-word` — больше НЕ ломает текст по буквам
2. **`overflow-wrap: break-word`** (не `anywhere`) — переносит слова только если они не помещаются целиком
3. **`hyphens: none`** — отключает автоматическое расставление дефисов внутри слов
4. **Перечислены конкретные классы** двухколоночных обёрток (`.club-overview`, `.match-detail__grid`, etc.) — заменены на `display: block` чтобы дети шли стеком
5. **`> *` селекторы** — каждый дочерний элемент занимает 100% ширины

## Acceptance после деплоя

1. На iPhone Safari: Настройки → Safari → Очистить историю и данные сайтов → удалить `legirus-screen`
2. Открыть legirus-screen.vercel.app → перелогиниться
3. **«ФК Легирус 2010» — пишется в одну строку** (не вертикально)
4. **Аналитика** — нет двух узких колонок, всё стеком сверху вниз
5. **Матч и Мой профиль** — то же самое, всё в одну колонку

## Передай Code

> Замени файл `frontend/src/styles/mobile.css` целиком на содержимое из секции «Hotfix» в SPEC_MOBILE_HOTFIX.md. Удали старое содержимое полностью. Не добавляй ничего своего. После — `npm run build`, push.

После применения — проверь на iPhone, текст «ФК Легирус 2010» должен идти горизонтально, а не столбиком.

Если ещё что-то ломается — сделай скриншот и пришли. По имени класса который не схлопнулся я добавлю одну строку в этот файл.
