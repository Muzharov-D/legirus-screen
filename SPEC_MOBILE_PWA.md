# SPEC_MOBILE_PWA — мобильная вёрстка + установка как приложение

## Контекст

Аудитория «Экран Легирус» — родители игроков подросткового футбольного клуба и тренеры команд. 70-80% будут заходить **с телефонов**. Сейчас фронт оптимизирован под desktop — на мобильных таблицы вылазят за экран, sidebar занимает половину виду, формационная картинка не помещается. Конверсия теряется в первые 5 секунд.

Решение в две части:
1. **Mobile-responsive** — стандартные CSS media queries для адаптации существующих экранов под узкие viewports.
2. **PWA (Progressive Web App)** — иконка на рабочем столе у пользователя, fullscreen launch, splash screen. Это бесплатный «native-like» опыт без разработки приложения.

---

## Часть 1 — PWA basics (1-1.5 часа)

### 1.1 Manifest

**Файл:** `frontend/public/manifest.json`

```json
{
  "name": "АванDата · ФК Легирус",
  "short_name": "АванDата",
  "description": "Аналитика подросткового футбола ФК Легирус",
  "start_url": "/",
  "display": "standalone",
  "orientation": "portrait",
  "background_color": "#0d1424",
  "theme_color": "#1a4ba0",
  "icons": [
    { "src": "/icons/icon-192.png", "sizes": "192x192", "type": "image/png", "purpose": "any maskable" },
    { "src": "/icons/icon-512.png", "sizes": "512x512", "type": "image/png", "purpose": "any maskable" },
    { "src": "/icons/apple-touch-icon.png", "sizes": "180x180", "type": "image/png" }
  ],
  "scope": "/",
  "lang": "ru-RU"
}
```

### 1.2 Иконки

**Файлы:** `frontend/public/icons/icon-192.png`, `icon-512.png`, `apple-touch-icon.png`

Сгенерировать из существующего логотипа АванDата + щит Легируса:
- Квадратный canvas с цветом фона `#1a4ba0` (тёмный синий клуба)
- В центре — белый «А» от АванDата или щит Легируса
- Оставить 10% safe-area по краям для maskable icon

Если у тебя нет дизайнера — можно сгенерить через https://realfavicongenerator.net/ (загрузить логотип, скачать готовый bundle).

### 1.3 Метатеги в index.html

**Файл:** `frontend/index.html`

В `<head>` добавить:

```html
<link rel="manifest" href="/manifest.json" />
<meta name="theme-color" content="#1a4ba0" />
<meta name="apple-mobile-web-app-capable" content="yes" />
<meta name="apple-mobile-web-app-status-bar-style" content="black-translucent" />
<meta name="apple-mobile-web-app-title" content="АванDата" />
<link rel="apple-touch-icon" href="/icons/apple-touch-icon.png" />
<meta name="viewport" content="width=device-width, initial-scale=1, maximum-scale=5, viewport-fit=cover" />
```

(viewport и без `user-scalable=no` — пользователь должен иметь возможность зумить heatmap-карты)

### 1.4 Service Worker (опционально, для оффлайн)

Можно пропустить в v1. Vite-plugin-pwa делает за один заход всё, но это +30 минут на конфиг. В v1 без offline — манифест и иконки уже дают «установить на главный экран».

### Acceptance:
- На iPhone Safari: «Поделиться» → «На экран Домой» → иконка появилась с правильным названием.
- На Android Chrome: всплывает банер «Add to Home Screen», после нажатия — иконка ставится.
- При запуске с иконки сайт открывается без адресной строки браузера (standalone mode).

---

## Часть 2 — Mobile-responsive (4-6 часов)

### 2.1 Глобальные брейкпоинты

**Файл:** `frontend/src/App.css`

Добавить в конец:

```css
/* === Mobile breakpoints === */
@media (max-width: 768px) {
  body, .page { font-size: 14px; }
  .page { padding: 12px !important; }
  .card { padding: 12px !important; border-radius: 10px; }
  .page-section-title { font-size: 16px; }
}
@media (max-width: 480px) {
  body, .page { font-size: 13px; }
  .page { padding: 8px !important; }
  .card { padding: 10px !important; }
}
```

### 2.2 AppHeader — burger menu

**Файл:** `frontend/src/components/AppHeader.css` + `AppHeader.jsx`

На mobile (<768px):
- Логотип сжать (24px высота)
- Дропшоу команды и роль убрать в hamburger menu (кнопка справа)
- Кнопка "Выход" перенести в dropdown menu

В JSX добавить state `mobileMenuOpen` и условный рендер.

### 2.3 SidebarNav — bottom navigation

**Файл:** `frontend/src/components/SidebarNav.css` + `SidebarNav.jsx`

Самый важный mobile-pattern: на mobile sidebar превращается в **bottom navigation bar** (как в iOS app).

CSS:
```css
@media (max-width: 768px) {
  .sidebar-nav {
    position: fixed;
    bottom: 0; left: 0; right: 0; top: auto;
    width: 100%; height: 56px;
    flex-direction: row;
    border-right: none;
    border-top: 1px solid var(--border);
    z-index: 100;
  }
  .sidebar-nav__item {
    flex: 1; flex-direction: column; padding: 6px;
    font-size: 11px; text-align: center;
  }
  .sidebar-nav__item-icon { font-size: 20px; margin-bottom: 2px; }
  /* Подушка снизу страницы под bottom-nav */
  .page { padding-bottom: 70px !important; }
}
```

JSX — без изменений, только CSS.

### 2.4 MatchDetail — однокол layout

**Файл:** `frontend/src/pages/MatchDetail.css`

```css
@media (max-width: 768px) {
  .match-detail__grid { grid-template-columns: 1fr !important; gap: 12px; }
  .match-detail__hero-score { font-size: 28px; }
  .match-detail__hero-team img { width: 32px; height: 32px; }
  .formation__pitch-img { width: 100%; }
  .team-summary-stats { font-size: 12px; }
  .team-summary-stats__row { padding: 6px 0; }
}
```

### 2.5 PlayerDetail — компактнее

**Файл:** `frontend/src/pages/PlayerDetail.css`

```css
@media (max-width: 768px) {
  .player-detail__header { flex-direction: column; align-items: center; text-align: center; }
  .player-detail__photo { width: 80px; height: 80px; }
  .player-detail__name { font-size: 18px; }
  .player-detail__pos { font-size: 13px; }
  .player-detail__radar { height: 280px !important; }
  .player-detail__maps { grid-template-columns: 1fr; }
  /* Splits table — overflow scroll */
  .player-splits-table { overflow-x: auto; -webkit-overflow-scrolling: touch; }
  .player-splits-table table { min-width: 480px; font-size: 11px; }
}
```

### 2.6 PlayersRating + ClubOverview — компактные таблицы

**Файлы:** `PlayersRating.css`, `ClubOverview.css`

Стандартный приём — оборачивать таблицу в div с `overflow-x: auto`:

```css
@media (max-width: 768px) {
  .players-rating__table { overflow-x: auto; -webkit-overflow-scrolling: touch; }
  .players-rating__table table { min-width: 600px; font-size: 12px; }
  .col-photo { display: none; }  /* фото убираем на мобильном для компактности */
  .col-pos, .col-minutes { display: none; }  /* оставляем самое важное */
}
```

### 2.7 MatchesDashboard — стек карточек

**Файл:** `frontend/src/pages/MatchesDashboard.css`

```css
@media (max-width: 768px) {
  .matches-dashboard__hero { padding: 16px; }
  .matches-dashboard__hero-title { font-size: 22px; }
  .matches-dashboard__grid { grid-template-columns: 1fr; gap: 12px; }
  .matches-dashboard__season {
    grid-template-columns: repeat(2, 1fr); gap: 8px;
  }
  .season-stat__value { font-size: 18px; }
  .season-stat__label { font-size: 11px; }
}
```

### 2.8 Login — fullscreen на мобильном

**Файл:** `frontend/src/pages/Login.css`

```css
@media (max-width: 480px) {
  .login__card { width: calc(100vw - 24px); padding: 20px; }
  .login__title { font-size: 20px; }
}
```

### 2.9 SoccerFieldImageMap — touch zoom

**Файл:** `frontend/src/components/SoccerFieldImageMap.css`

```css
@media (max-width: 768px) {
  .soccer-field-image-map img {
    max-width: 100%;
    height: auto;
    touch-action: pinch-zoom;
  }
}
```

---

## Часть 3 — Smoke-тестирование на мобильном

После применения проверить на iPhone (Safari) или Android (Chrome):

1. Открыть Vercel URL → загрузка <3 сек, нет горизонтального скролла
2. Логин → форма читабельна
3. MatchesDashboard → карточки в одну колонку, числа большие
4. Открыть матч → командная статистика читается, формация-картинка помещается
5. Открыть игрока → радар-чарт не вылазит, splits-таблица скроллится горизонтально
6. PlayersRating → таблица скроллится, название столбца «Метрика» читается
7. Bottom navigation в SidebarNav работает
8. Из Safari: «Поделиться» → «На экран Домой» → иконка добавлена
9. Запуск с иконки → fullscreen без адресной строки

---

## Объём работы

- Часть 1 (PWA): ~1.5 часа (включая генерацию иконок)
- Часть 2 (responsive): ~4-6 часов
- Smoke-тест на 2-3 устройствах: 30 минут

**Итого: 6-8 часов** на полностью адаптивный UX + установку как приложения.

---

## Защита от FS-truncation

Все правки в этой спеке — это CSS media queries (пасторали), небольшие правки JSX, новые маленькие файлы (manifest.json, иконки PNG). Каждый файл < 1.5 KB по добавляемым строкам — в зоне безопасности от mount-truncation.

PWA-иконки PNG бинарные, не подвержены truncation; их можно положить в `frontend/public/icons/` и добавить в git.

---

## Что НЕ делаем в этой спеке

- Native React Native приложение (это отдельный проект на 2-3 недели).
- Push-уведомления (это требует backend + service worker).
- Offline mode (можно добавить позже через vite-plugin-pwa).
- Переписывание UI с нуля под mobile-first — слишком инвазивно.
