# SPEC_MOBILE_REAL — конкретные правки по найденным классам

Это финальный SPEC по реальным проблемам из скриншотов. Не общие `mobile.css` правила, а точечные media queries в существующих CSS файлах.

## Правка 1 — Скрыть ИИ-агента на мобильном

**Файл:** `frontend/src/components/AgentTriggerButton.css`

**В конец файла:**

```css
@media (max-width: 768px) {
  .agent-trigger { display: none !important; }
}
```

И параллельно скрыть AgentCard если открыта:

**Файл:** `frontend/src/components/AgentCard.css`

**В конец файла:**

```css
@media (max-width: 768px) {
  .agent-card { display: none !important; }
}
```

---

## Правка 2 — ClubOverview (Аналитика)

**Файл:** `frontend/src/pages/ClubOverview.css`

**В конец файла:**

```css
@media (max-width: 768px) {
  /* Главный layout — был 320px sidebar + 1fr контент */
  .club-overview { grid-template-columns: 1fr !important; gap: 12px; }
  /* Карточки сводных рейтингов: было 4 колонки, делаем 2 */
  .club-overview__ratings { grid-template-columns: repeat(2, 1fr) !important; gap: 8px; }
  /* «Ключевые показатели»: было 5 колонок, делаем 2 */
  .club-overview__metrics { grid-template-columns: repeat(2, 1fr) !important; gap: 8px; }
  /* Лидеры по линиям — карусель → стек или snap-scroll */
  .club-overview__leaders {
    display: flex !important;
    flex-direction: row;
    overflow-x: auto;
    scroll-snap-type: x mandatory;
    -webkit-overflow-scrolling: touch;
    gap: 10px;
    padding-bottom: 8px;
  }
  .club-overview__leader-card {
    flex: 0 0 calc(100vw - 48px);
    scroll-snap-align: start;
  }
  /* Hero «лучший игрок матча» — стек, не grid */
  .club-overview__motm { grid-template-columns: 1fr !important; }
  .club-overview__motm-info { text-align: center; padding-top: 12px; }
}
```

---

## Правка 3 — MatchDetail (Матч)

**Файл:** `frontend/src/pages/MatchDetail.css`

**В конец файла:**

```css
@media (max-width: 768px) {
  /* Главный layout: было 380px 1fr 320px (3 колонки) */
  .match-detail__grid { grid-template-columns: 1fr !important; gap: 12px; }
  /* Сводные рейтинги: 4 → 2 колонки */
  .match-detail__ratings { grid-template-columns: repeat(2, 1fr) !important; gap: 8px; }
  /* Лидеры: 3 → snap-scroll (видим целую карточку) */
  .match-detail__leaders {
    display: flex !important;
    flex-direction: row;
    overflow-x: auto;
    scroll-snap-type: x mandatory;
    -webkit-overflow-scrolling: touch;
    gap: 10px;
    padding-bottom: 8px;
  }
  .match-detail__leaders > * {
    flex: 0 0 calc(100vw - 48px);
    scroll-snap-align: start;
  }
  /* Hero score — однострочный flex, без обрезаний */
  .match-detail__hero { grid-template-columns: 1fr !important; gap: 8px; }
  .match-detail__hero-team { justify-content: center; }
  .match-detail__hero-team-name {
    white-space: normal !important;
    overflow: visible !important;
    text-overflow: clip !important;
    word-break: break-word;
    font-size: 14px;
  }
  /* «1 тайм vs 2 тайм» заголовок — wrap */
  .match-detail__halftime-title,
  .page-section-title {
    white-space: normal !important;
    overflow: visible !important;
    text-overflow: clip !important;
    word-break: break-word;
  }
}
```

---

## Правка 4 — PlayerDetail (Мой профиль)

**Файл:** `frontend/src/pages/PlayerDetail.css`

**В конец файла:**

```css
@media (max-width: 768px) {
  /* Хедер игрока — фото + текст в стек */
  .player-detail__header { grid-template-columns: 1fr !important; gap: 10px; text-align: center; }
  .player-detail__name {
    white-space: normal !important;
    overflow: visible !important;
    word-break: break-word;
    font-size: 18px;
  }
  /* Кнопки «К списку / К матчу / Скачать карточку» — wrap */
  .player-detail__nav-buttons {
    flex-wrap: wrap !important;
    gap: 6px;
  }
  .player-detail__nav-buttons button,
  .player-detail__nav-buttons a {
    flex: 1 1 auto;
    min-width: 90px;
    font-size: 12px !important;
    padding: 6px 10px !important;
  }
  /* Сводные рейтинги: 3 колонки → 2 */
  .player-detail__ratings { grid-template-columns: repeat(2, 1fr) !important; gap: 8px; }
  /* «Лучший в команде» — стек */
  .player-detail__best { grid-template-columns: 1fr !important; gap: 8px; }
  /* Радарная диаграмма + сравнение по позиции — стек, не 2 колонки */
  .player-detail__radar-row,
  .player-detail__compare-row { grid-template-columns: 1fr !important; gap: 12px; }
  /* Заголовки карточек — wrap */
  .player-detail__section-title,
  .page-section-title {
    white-space: normal !important;
    overflow: visible !important;
    word-break: break-word;
    font-size: 14px;
  }
  /* Карты атаки/тепловая — стек */
  .player-detail__maps { grid-template-columns: 1fr !important; }
}
```

---

## Правка 5 — Глобальный fail-safe против nowrap

В `frontend/src/styles/mobile.css` (если ещё есть) или в `App.css` в самый конец:

```css
@media (max-width: 768px) {
  /* Любой текст-блок не имеет nowrap по умолчанию */
  .card h1, .card h2, .card h3, .card h4,
  .page-section-title,
  .hero-eyebrow,
  .info-row,
  .stat-row {
    white-space: normal !important;
    overflow-wrap: anywhere;
  }
}
```

---

## Smoke-тест на iPhone после деплоя

1. **ИИ-агент пропал** на mobile — bottom-nav кнопки кликабельны
2. **Аналитика** → 4 карточки рейтингов в 2 колонки (2x2), не вылазят
3. **Аналитика** → лидеры по линиям swipe-карусель, видна целая карточка с snap
4. **Матч** → hero (счёт + команды) в одну колонку, имя «Пороховчанин 2010» полностью читаемо
5. **Матч** → 4 рейтинга 2x2, заголовок «1 тайм vs 2 тайм — командно...» переносится на 2 строки
6. **Мой профиль** → хедер фото + имя стеком, имя «Артем Закусилов» полностью видно
7. **Мой профиль** → кнопки «К списку / К матчу / Скачать карточку» в две строки если не помещаются
8. **Мой профиль** → 3 рейтинга 2+1 (или все три в 2 колонки)

---

## Объём

- 5 файлов, ~150 строк CSS суммарно
- Каждый файл < 1.5 KB добавок — в зоне безопасности от FS-truncation
- Никакого JSX
- ~30-40 минут работы Code

---

## Проверка после применения

```bash
cd frontend && npm run build
```

Если build зелёный — push, Vercel задеплоит за минуту, проверить на iPhone.

Если что-то не помещается даже после этого — открой страницу в Chrome DevTools на iPhone 12 (390x844) и в консоли:

```js
[...document.querySelectorAll('*')].filter(el => el.getBoundingClientRect().right > 391).slice(0,10).forEach(el => console.log(el.className||el.tagName, el.getBoundingClientRect().right));
```

Этот скрипт выведет первые 10 элементов которые вылазят за 390px viewport. По именам классов сделаю следующую точечную правку.
