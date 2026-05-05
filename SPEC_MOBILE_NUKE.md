# SPEC_MOBILE_NUKE — выкорчёвываем horizontal scroll и zoom

## Главное правило

После применения **на любом мобильном экране** (≤768px) НЕ ДОЛЖНО быть:
- Горизонтального скролла страницы
- Автозума при фокусе на input (Safari зумит если font-size < 16px)
- Контента который вылазит вправо (карточки рейтингов, лидеры, имена)

Если эти три пункта не выполнены — этот SPEC не применён правильно. После каждой правки **проверять на iPhone**, не на DevTools.

---

## ШАГ 1 — viewport мета

**Файл:** `frontend/index.html`

Найти строку `<meta name="viewport" ...>`. Заменить целиком на:

```html
<meta name="viewport" content="width=device-width, initial-scale=1.0, viewport-fit=cover" />
```

Без `maximum-scale`, без `user-scalable`, без `minimum-scale`. Эти параметры либо ломают accessibility, либо вызывают автозум.

---

## ШАГ 2 — заменить (или создать) `frontend/src/styles/mobile.css` целиком

**Удалить старое содержимое полностью.** Заменить на это (~3.5 KB, может разбиться на 3 файла если FS-truncation мешает):

```css
/* === GLOBAL — действует на всех экранах === */

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

/* iOS auto-zoom prevention: input font-size ≥ 16px */
input, select, textarea, button {
  font-size: 16px;
}

/* === MOBILE: ≤768px === */
@media (max-width: 768px) {

  body { font-size: 14px; }

  /* App-level layout */
  .app-body {
    flex-direction: column !important;
    width: 100% !important;
  }
  .app-content,
  .page {
    padding: 10px !important;
    padding-bottom: 70px !important;
    width: 100% !important;
    max-width: 100vw !important;
    overflow-x: hidden !important;
  }

  /* === Все cards и контейнеры — никогда не вылазят === */
  .card,
  [class*="-card"],
  [class*="__card"],
  [class*="-hero"],
  [class*="__hero"] {
    min-width: 0 !important;
    max-width: 100% !important;
    width: 100% !important;
    overflow-x: hidden !important;
    word-break: break-word;
  }

  /* === Все grids → max 2 колонки === */
  [class*="grid"],
  [class*="-ratings"],
  [class*="__ratings"],
  [class*="-leaders"],
  [class*="__leaders"],
  [class*="-metrics"],
  [class*="__metrics"],
  [class*="-teams"],
  [class*="__teams"],
  [class*="-stats"],
  [class*="__stats"],
  [class*="-cards"],
  [class*="__cards"] {
    grid-template-columns: repeat(2, minmax(0, 1fr)) !important;
    gap: 8px !important;
    width: 100% !important;
    max-width: 100% !important;
  }

  /* Special: hero score, header — single column */
  [class*="-hero"],
  [class*="__hero"],
  [class*="-header"],
  [class*="__header"],
  [class*="-row"],
  [class*="__row"] {
    grid-template-columns: 1fr !important;
  }

  /* Заголовки и текст — не обрезаем */
  h1, h2, h3, h4, h5, h6,
  .page-section-title,
  [class*="title"],
  [class*="__name"],
  [class*="-name"],
  [class*="hero-eyebrow"],
  [class*="hero-sub"] {
    white-space: normal !important;
    overflow: visible !important;
    text-overflow: clip !important;
    overflow-wrap: anywhere !important;
    word-break: break-word !important;
    max-width: 100% !important;
  }

  /* === Header (top app bar) === */
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

  /* === ИИ-агент скрыть === */
  .agent-trigger,
  .agent-card { display: none !important; }

  /* === Лидеры / карусели — превращаем в snap-scroll или wrap === */
  [class*="leaders"] {
    display: grid !important;
    grid-template-columns: repeat(2, minmax(0, 1fr)) !important;
    gap: 8px !important;
  }

  /* Кнопки — touch-friendly, wrap */
  button, a.button, .btn,
  [class*="nav-buttons"] {
    flex-wrap: wrap !important;
  }

  /* Recharts SVG fully responsive */
  .recharts-wrapper,
  .recharts-surface,
  .recharts-responsive-container {
    width: 100% !important;
    max-width: 100% !important;
    height: auto !important;
  }

  /* Любые таблицы — горизонтальный scroll внутри table-wrapper, не страницы */
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

  /* На совсем узких экранах разрешаем 1 колонку для рейтингов если 2 не лезут */
  [class*="-ratings"],
  [class*="__ratings"] {
    grid-template-columns: 1fr !important;
  }
}
```

---

## ШАГ 3 — гарантировать импорт mobile.css

**Файл:** `frontend/src/main.jsx` (или `App.jsx`, где импортируется `App.css`)

**Найти** строку:
```js
import './App.css';
```

**После неё ДОБАВИТЬ:**
```js
import './styles/mobile.css';
```

Если строки `import './styles/mobile.css'` уже есть — оставить **только последнюю** перед `ReactDOM.render` или `createRoot`. Этот файл должен загружаться **последним** в каскаде CSS, чтобы перебить специфичные правила.

---

## ШАГ 4 — контрольный тест на iPhone

После build и Vercel-deploy:

1. Открыть https://legirus-screen.vercel.app на iPhone
2. **Hard reload**: в Safari — настройки → Очистить историю и данные сайтов (или в Chrome → меню → История → Очистить данные). PWA-кеш может удерживать старое.
3. Перелогиниться
4. Все 3 вкладки прокрутить:
   - **Аналитика** — нет горизонтального scroll? рейтинги в 2 колонки? имена не обрезаются?
   - **Матч** — нет horizontal scroll? командные карты 2-3 в ряд?
   - **Мой профиль** — фото центрировано? имя «Артем Закусилов» полное? 3 рейтинга в 2 колонки (или 1)?

5. Сделать DevTools-проверку (любой Chrome через USB-debug, либо Safari Web Inspector). В консоли:

```js
const w = window.innerWidth;
const overflow = [...document.querySelectorAll('*')]
  .filter(el => el.getBoundingClientRect().right > w + 1)
  .map(el => `${el.tagName}.${el.className}: right=${Math.round(el.getBoundingClientRect().right)}, w=${w}`);
console.log('OVERFLOW elements:', overflow.length, overflow.slice(0,15));
```

Если выведется 0 — задача закрыта. Если что-то осталось — пришли список (5-10 элементов с именами классов), я сделаю точечный fix.

---

## ШАГ 5 — если PWA закеширована, инвалидировать SW

PWA может удерживать старую версию CSS. Если это случилось:

1. На iPhone Safari: Настройки → Safari → Дополнения → Данные веб-сайтов → найти legirus-screen → удалить
2. На Android Chrome: меню → История → Очистить данные (включая cache)
3. Удалить иконку приложения с рабочего стола, переустановить через «Поделиться → На экран Домой»

---

## Что эта правка точно делает

- `html, body { overflow-x: hidden; max-width: 100vw }` — горизонтальный scroll **физически невозможен**
- `* { box-sizing: border-box }` — padding не добавляет ширину
- `[class*="grid"] { grid-template-columns: repeat(2, minmax(0, 1fr)) }` — все 4-колоночные/3-колоночные/5-колоночные сетки на mobile становятся 2-колоночными
- `minmax(0, 1fr)` — критично! Без него grid items могут не сжиматься. Это финальный фикс который перебивает intrinsic sizing.
- `word-break: break-word` на заголовках — длинные имена переносятся вместо обрезания
- `.agent-trigger { display: none }` — кнопка ИИ-агента скрыта на mobile
- `font-size: 16px` на input — Safari больше не зумит при фокусе

---

## Если после этого SPEC всё ещё плохо

Запусти DevTools-скрипт из шага 4 на проблемной странице и пришли список. Без `[class*="..."]` я бы не угадал точно — есть селекторы-attribute которые матчат КАК минимум 80% классов в проекте.
