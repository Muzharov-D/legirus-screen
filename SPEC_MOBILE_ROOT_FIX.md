# SPEC_MOBILE_ROOT_FIX — корневая причина горизонтального скролла

## Что я нашёл при системном аудите

Аудит всех CSS-файлов на фиксированные ширины показал **8 точек** где есть `min-width` или `width` в пикселях. Главные две — критичны:

| Файл | Строка | Что | Эффект |
|------|--------|-----|--------|
| `frontend/src/App.css` | 5 | `min-width: 1536px` на `.app-layout` | **Весь сайт не может быть уже 1536px** |
| `frontend/src/index.css` | 11 | `min-width: 1536px` на `body` или `#root` | **Дубликат, держит ширину даже если первую убрать** |
| `frontend/src/components/RatingCard.css` | 10 | `min-width: 140px` | На mobile 4 карточки в строку = 4×140=560px, не помещается |
| `frontend/src/components/AgentCard.css` | 5 | `width: 380px` | Карточка ИИ-агента вылазит за viewport |
| `frontend/src/components/FormationField.css` | 54 | `width: 110px` на slot | Слоты формации не сжимаются |
| `frontend/src/components/PdfUploadDialog.css` | 12 | `width: 480px` на модал | Не помещается на 390px viewport |
| `frontend/src/components/SoccerFieldImageMap.css` | 24 | `width: 480px` на карту | Тоже вылазит |
| `frontend/src/pages/Login.css` | 15 | `width: 420px` на форму | Чуть-чуть вылазит на узких экранах |

**Вывод:** все мои предыдущие SPEC'и (mobile.css с !important, схлопывание grids) не работали потому что `min-width: 1536px` на корневом контейнере физически держит весь DOM шире viewport. CSS на дочерних элементах ничего не может сделать с родителем который требует 1536px.

---

## Правка 1 — `frontend/src/App.css`

**Найти строку 5:**
```css
.app-layout {
  display: flex;
  flex-direction: column;
  min-height: 100vh;
  min-width: 1536px;          ← УДАЛИТЬ ЭТУ СТРОКУ
  background:
    ...
}
```

**Удалить полностью строку `min-width: 1536px;`** (она лишняя; flex-column сам растягивается по контенту).

Если по какой-то причине нужно сохранить desktop-минимум для очень больших экранов — обернуть в media query:

```css
@media (min-width: 1536px) {
  .app-layout { min-width: 1536px; }
}
```

Но я бы просто удалил — нет smysl'а в принудительной 1536px ширине.

---

## Правка 2 — `frontend/src/index.css`

**Найти строку 11:**
```css
body {
  ...
  min-width: 1536px;          ← УДАЛИТЬ ЭТУ СТРОКУ
}
```

**Удалить полностью** (или обернуть в `@media (min-width: 1536px)` как в Правке 1).

После этих двух удалений `body` и `.app-layout` смогут стать любой ширины. **Это решает 90% проблемы.** Остальные правки — точечные.

---

## Правка 3 — `frontend/src/components/RatingCard.css`

**Найти строку 10:**
```css
.rating-card {
  ...
  min-width: 140px;
}
```

**Заменить на:**
```css
.rating-card {
  ...
  min-width: 0;          /* было 140px — критично! без min-width:0 grid items не сжимаются */
}

@media (min-width: 769px) {
  .rating-card { min-width: 140px; }   /* возвращаем только на desktop */
}
```

`min-width: 0` на mobile — это финальный ключ к тому, чтобы grid-items в `repeat(2, minmax(0, 1fr))` действительно сжались.

---

## Правка 4 — `frontend/src/components/AgentCard.css`

**Строка 5:**
```css
.agent-card { width: 380px; ... }
```

**Заменить на:**
```css
.agent-card {
  width: min(380px, calc(100vw - 24px));
  max-width: 100%;
  ...
}
```

`min(380px, 100vw - 24px)` — берёт меньшее из двух, гарантируя что карточка ИИ-агента не вылезет на узком экране.

---

## Правка 5 — `frontend/src/components/PdfUploadDialog.css`

**Строка 12:**
```css
.pdf-upload-dialog__card { width: 480px; ... }
```

**Заменить на:**
```css
.pdf-upload-dialog__card {
  width: min(480px, calc(100vw - 24px));
  max-width: 100%;
}
```

---

## Правка 6 — `frontend/src/components/SoccerFieldImageMap.css`

**Строка 24:**
```css
.soccer-field-image-map { width: 480px; ... }
```

**Заменить на:**
```css
.soccer-field-image-map {
  width: min(480px, 100%);
  max-width: 100%;
}
.soccer-field-image-map img {
  width: 100%;
  height: auto;
}
```

---

## Правка 7 — `frontend/src/pages/Login.css`

**Строка 15:**
```css
.login__card { width: 420px; ... }
```

**Заменить на:**
```css
.login__card {
  width: min(420px, calc(100vw - 24px));
  max-width: 100%;
}
```

---

## Правка 8 — `frontend/src/components/FormationField.css`

**Строка 54** (`width: 110px` на slot) — это слоты игроков на схеме поля. На mobile они должны сжиматься пропорционально:

```css
.formation__slot {
  width: 110px;          /* desktop default */
  ...
}

@media (max-width: 768px) {
  .formation__slot { width: clamp(72px, 22vw, 110px); }
}
```

Или просто оставить как есть — формация уже отрендерена как картинка через `formationImage`, поэтому если структурный рендер не используется на mobile, эта правка некритична.

---

## Правка 9 — `frontend/src/styles/mobile.css`

**После удаления двух `min-width: 1536px` пред мостоит сильно сократить mobile.css до минимума.** Заменить файл целиком на:

```css
/* === Global === */
html, body {
  overflow-x: hidden;
  max-width: 100vw;
  -webkit-text-size-adjust: 100%;
}
*, *::before, *::after { box-sizing: border-box; }
img, svg, video { max-width: 100%; height: auto; }

/* iOS prevent autozoom on inputs */
@media (max-width: 768px) {
  input, select, textarea { font-size: 16px; }
}

/* === Mobile layout adaptations === */
@media (max-width: 768px) {
  body { font-size: 14px; }

  .app-body { flex-direction: column !important; }
  .app-content, .page {
    padding: 12px !important;
    padding-bottom: 70px !important;
    max-width: 100vw !important;
  }

  /* Многоколоночные сетки → 1 или 2 */
  .club-overview,
  .matches-dashboard__grid,
  .match-detail__grid,
  .player-detail__grid,
  .player-detail__maps,
  .comparison-view__grid {
    grid-template-columns: 1fr !important;
  }
  .club-overview__ratings,
  .match-detail__ratings,
  .player-detail__ratings,
  .club-overview__metrics,
  .match-detail__metrics,
  .club-overview__leaders,
  .match-detail__leaders {
    grid-template-columns: repeat(2, minmax(0, 1fr)) !important;
    gap: 8px !important;
  }

  /* Sidebar → bottom nav */
  .sidebar-nav {
    position: fixed; bottom: 0; left: 0; right: 0; top: auto;
    width: 100%; height: 56px;
    flex-direction: row !important;
    border-right: none;
    border-top: 1px solid rgba(255,255,255,0.1);
    z-index: 100;
    background: var(--card-bg, #0d1424);
  }
  .sidebar-nav__item {
    flex: 1; flex-direction: column;
    padding: 6px 4px; font-size: 10px;
    text-align: center;
  }
  .sidebar-nav__icon { font-size: 20px; }

  .agent-trigger, .agent-card { display: none !important; }
}

@media (max-width: 480px) {
  .club-overview__ratings,
  .match-detail__ratings,
  .player-detail__ratings {
    grid-template-columns: 1fr !important;
  }
}
```

**Ключевое отличие** от прошлых попыток: **никакого word-break: break-word**. С удалением `min-width: 1536px` он стал не нужен.

---

## Acceptance — что должно работать после Правок 1+2 (это самое важное)

Уже после Правок 1 и 2 (удаление двух `min-width: 1536px`):

1. На iPhone Safari после очистки кеша сайта — нет горизонтального скролла на главных экранах
2. Layout схлопывается в виде «как widow поменьше», все блоки помещаются по ширине
3. Текст «ФК Легирус 2010» не идёт буква-в-букву

Правки 3-8 — точечные, их можно делать постепенно. Но **Правки 1 и 2 — критичны и делаются сразу**.

---

## Передай Code

> Прочитай SPEC_MOBILE_ROOT_FIX.md и сделай Правки 1, 2, 3 в первый PR (это критичные:
> 1. Удалить `min-width: 1536px` из `frontend/src/App.css` (строка 5)
> 2. Удалить `min-width: 1536px` из `frontend/src/index.css` (строка 11)
> 3. Заменить `min-width: 140px` в RatingCard.css на `min-width: 0` + `@media (min-width: 769px)` для desktop
> 
> Затем Правка 9 — заменить `frontend/src/styles/mobile.css` на упрощённую версию из спеки.
> 
> Правки 4-8 — отдельным следующим PR. Не делай их в этом, чтобы не путаться.
> 
> После каждого PR — `npm run build`, push, я проверю.

---

## Почему это сработает

Корень всех зол — `min-width: 1536px` на корневом элементе. Его удаление превратит **любые** мои или твои media queries из бессмысленных в работающие, потому что layout сможет физически стать узким.

Я полтора часа писал спеки про grids/word-break, а реальное лекарство — две строчки удалить. Спрятать стыд под профессиональным «это были итерации сужения проблемы» не буду — я должен был аудит делать первым делом.
