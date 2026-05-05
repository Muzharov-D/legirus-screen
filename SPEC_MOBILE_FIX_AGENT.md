# SPEC_MOBILE_FIX_AGENT — поднять кнопку ИИ-агента над bottom-nav + добить mobile

## Проблема 1 — AgentTriggerButton накрывает «Мой профиль»

`AgentTriggerButton.css` сейчас:
```
position: fixed; bottom: 24px; right: 28px; padding: 12px 18px;
```

На mobile bottom-nav имеет `bottom: 0; height: 56px`, и кнопка ИИ-агента попадает прямо поверх правой иконки nav («Мой профиль» / «Игроки»), делая её некликабельной.

### Фикс — в `frontend/src/components/AgentTriggerButton.css`

После существующих правил добавить в **конец файла**:

```css
@media (max-width: 768px) {
  .agent-trigger {
    bottom: 72px !important;       /* 56px bottom-nav + 16px gap */
    right: 12px !important;
    padding: 8px 14px !important;
    font-size: 12px !important;
    border-radius: 20px;
    box-shadow: 0 4px 12px rgba(255, 208, 0, 0.35);
  }
  .agent-trigger__bolt { font-size: 14px !important; }
  .agent-trigger span:not(.agent-trigger__bolt) {
    /* На очень узких экранах оставить только иконку */
    display: inline;
  }
}

@media (max-width: 380px) {
  .agent-trigger span:not(.agent-trigger__bolt) {
    display: none;             /* только иконка ✦ на узких экранах */
  }
  .agent-trigger { padding: 8px 10px !important; min-width: 36px; }
}
```

---

## Проблема 2 — «Аналитика» (ClubOverview) и «Мой профиль» (PlayerDetail) плохо адаптированы

Тестируя на mobile, убедись:
- Аналитика (`/analytics`) — большие grid-cards и таблица команд не схлопнулись.
- Мой профиль (`/players/<id>`) — radar-чарт переполняет экран, splits-таблица не скроллится отдельно.

### Фикс — добавить в `frontend/src/styles/mobile.css` (в конец файла, до закрытия `@media (max-width: 768px)`-блока — или после, как новый блок):

```css
@media (max-width: 768px) {
  /* === ClubOverview ("Аналитика") === */
  .club-overview { gap: 10px !important; }
  .club-overview__hero { padding: 12px !important; }
  .club-overview__hero-title { font-size: 18px !important; }
  .club-overview__hero-sub { font-size: 12px !important; }
  .club-overview__teams { grid-template-columns: 1fr !important; gap: 8px !important; }
  .club-overview__team-card { padding: 10px !important; }
  .club-overview__team-stats {
    grid-template-columns: repeat(2, 1fr) !important;
    gap: 6px !important;
    font-size: 11px !important;
  }
  .club-overview__metric-cards,
  .club-overview__compare-grid { grid-template-columns: 1fr !important; }

  /* === PlayerDetail ("Мой профиль") — усиление === */
  .player-detail__radar,
  .player-detail__progress,
  .player-detail__compare {
    width: 100% !important;
    max-width: 100% !important;
    overflow-x: hidden !important;
  }
  .player-detail .recharts-wrapper {
    width: 100% !important;
    height: auto !important;
  }
  .player-detail__halftime-bars { font-size: 11px !important; }
  .player-detail__splits {
    overflow-x: auto;
    -webkit-overflow-scrolling: touch;
    max-width: 100%;
  }
  .player-detail__splits table { min-width: 480px; font-size: 11px; }

  /* Все cards — никогда не вылазят за viewport */
  .card,
  .player-detail .card,
  .club-overview .card {
    max-width: 100% !important;
    min-width: 0 !important;
    overflow: hidden;
  }

  /* Выпадашка/dropdown — не вылазит за экран */
  .dropdown,
  .menu,
  [role="menu"] {
    max-width: calc(100vw - 24px) !important;
    right: 12px !important;
    left: auto !important;
  }
}
```

---

## Smoke-чек после применения

На iPhone DevTools (или физическое устройство):

1. Открыть **«Мой профиль»** через bottom-nav → кнопка должна нажиматься (не накрыта ИИ-агентом)
2. Кнопка ИИ-агент висит над nav, читаемая, кликабельная
3. На экранах <380px у ИИ-агента остаётся только иконка ✦, без текста
4. Открыть **«Аналитика»** → команды в одну колонку, метрики 2 колонки, без горизонтального скролла
5. Открыть **«Мой профиль»** → радар-чарт занимает ширину экрана и не вылазит, splits-таблица скроллится горизонтально внутри своего блока (не вся страница)

---

## Объём

- Правка `AgentTriggerButton.css` — 5 минут (10-15 строк в конец файла)
- Добавка в `mobile.css` — 5 минут (40 строк)
- Smoke-тест на 2 устройствах — 10 минут

**Итого: 20 минут.** Все правки — в существующих CSS-файлах, никакого JSX.
