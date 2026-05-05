# SPEC_MOBILE_14 — 14 точечных багов из последнего пользовательского ревью

Перечень **в исходном порядке от пользователя**, плюс мои дополнения после прохода по существующим CSS.

## Карта багов и решений

| # | Что | Где | Решение |
|---|-----|-----|---------|
| 1 | «Информация о команде» не выровнен по левому краю | `MatchesDashboard.css` или `ClubOverview.css` | `text-align: left` + убрать `margin: 0 auto` на mobile |
| 2 | «Последний матч» не помещается, разместить ниже | `MatchesDashboard.css` `.matches-dashboard__grid` | `grid-template-columns: 1fr` + `flex-direction: column` для всего layout |
| 3 | Первый блок с последним матчем — соперник обрезается | `.matches-dashboard__last` | Имя соперника `white-space: normal`, шрифт меньше |
| 4 | «Лучший игрок матча» не помещается | `.matches-dashboard__motm` или `.club-overview__motm` | `flex-direction: column`, фото 64px, метрики `flex-wrap: wrap` |
| 5 | Топ-5 — 2 и 4 место не видно, свайпы | `.top-players` или `.matches-dashboard__top` | `display: flex; overflow-x: auto; scroll-snap-type: x mandatory` |
| 6 | Сводные рейтинги — убрать полоски, только цифры | `.rating-card__bar` или `.rating-card__progress` | `display: none` на mobile |
| 7 | Ключевые показатели подожми, % не помещаются | `.match-detail__key-stats` или `.metric-card` | font-size 14px, padding 8px |
| 8 | 1 тайм vs 2 тайм — изменить тип графика (mobile + desktop) | `HalfTimeBars.jsx` + CSS | Переверстать в **группированные вертикальные бары** или **радар-чарт** |
| 9 | Лидеры по линиям — свайпы | `.match-detail__leaders` или `.players-leaders__grid` | `flex; overflow-x: auto; scroll-snap` |
| 10 | Атака и оборона — друг под другом | `.player-detail__radar-row` или `.compare-row` | `grid-template-columns: 1fr` |
| 11 | Сводка последнего матча: счёт залезает на название | `.matches-dashboard__last-score` или `.last-match-score` | flex с min-width:0 для team, score уменьшить |
| 12 | Оценка закрывает имя в профиле | `.player-detail__rating-pill` (absolute) | `position: static` на mobile, header стек |
| 13 | Основная статистика игрока — вылазит | `.player-detail__stats-table` или `.player-detail__main-stats` | `overflow-x: auto` на контейнере, `min-width:0` |
| 14 | Фитнес вылазит за экран | `.player-detail__fitness` или подобный | то же что 13 |

---

## Перед правкой — Code должен сделать ИНВЕНТАРИЗАЦИЮ

В корне репо запустить:

```bash
grep -rn "matches-dashboard\|player-detail\|match-detail\|club-overview\|halftime\|HalfTime\|rating-pill\|top-players" frontend/src/ | grep -E "\.css|\.jsx" > /tmp/inventory.txt
cat /tmp/inventory.txt | head -80
```

Это даст **точный список** классов и компонентов, которые я ниже использую как `[class*="..."]`. Если какой-то класс называется иначе — использовать имя из инвентаризации.

---

## Правки в `frontend/src/styles/mobile.css`

**Внутри существующего `@media (max-width: 768px) { ... }` дополнить в конец:**

```css
/* ==== Bug 1: блок "Информация о команде" — left-align ==== */
[class*="info-team"],
[class*="club-overview__hero"],
[class*="matches-dashboard__hero"],
[class*="team-info"] {
  text-align: left !important;
  margin: 0 !important;
  width: 100% !important;
}

/* ==== Bug 2: «Последний матч» отдельной строкой, не рядом ==== */
.matches-dashboard__grid,
.matches-dashboard__top,
[class*="matches-dashboard__row"] {
  display: flex !important;
  flex-direction: column !important;
  gap: 10px !important;
}
.matches-dashboard__col-left,
.matches-dashboard__col-right {
  width: 100% !important;
}

/* ==== Bug 3: соперник в карточке последнего матча — wrap ==== */
.matches-dashboard__last,
.matches-dashboard__last-card,
[class*="last-match"] {
  display: flex !important;
  flex-direction: column !important;
  gap: 4px !important;
}
.matches-dashboard__last-team,
[class*="last-match__team"],
[class*="last-match__opponent"] {
  white-space: normal !important;
  overflow: visible !important;
  font-size: 13px !important;
}

/* ==== Bug 4: Лучший игрок матча — стек ==== */
.matches-dashboard__motm,
.club-overview__motm,
[class*="motm"],
[class*="best-player"] {
  display: flex !important;
  flex-direction: column !important;
  align-items: flex-start !important;
  gap: 8px !important;
}
[class*="motm__photo"],
[class*="motm-photo"] {
  width: 64px !important;
  height: 64px !important;
}
[class*="motm__stats"],
[class*="motm__metrics"] {
  flex-wrap: wrap !important;
  white-space: normal !important;
  font-size: 12px !important;
  gap: 8px 12px !important;
}

/* ==== Bug 5: Топ-5 игроков — горизонтальная карусель со свайпом ==== */
[class*="top-players"],
[class*="top5-players"],
[class*="matches-dashboard__top-list"] {
  display: flex !important;
  flex-direction: row !important;
  flex-wrap: nowrap !important;
  overflow-x: auto !important;
  -webkit-overflow-scrolling: touch !important;
  scroll-snap-type: x mandatory !important;
  gap: 10px !important;
  padding-bottom: 6px !important;
}
[class*="top-player-card"],
[class*="top-players__item"],
[class*="top-list__card"] {
  flex: 0 0 calc(80vw - 24px) !important;
  scroll-snap-align: start !important;
  min-width: 0 !important;
}

/* ==== Bug 6: Сводные рейтинги без полосок внизу ==== */
[class*="rating-card__bar"],
[class*="rating-card__progress"],
[class*="rating__bar"],
[class*="rating-progress"] {
  display: none !important;
}
[class*="rating-card"] {
  padding: 10px 8px !important;
  text-align: center !important;
}

/* ==== Bug 7: Ключевые показатели компактнее ==== */
.match-detail__metrics,
.club-overview__metrics,
[class*="key-stats"],
[class*="key_stats"] {
  display: grid !important;
  grid-template-columns: repeat(2, minmax(0, 1fr)) !important;
  gap: 6px !important;
}
[class*="metric-card"],
[class*="key-stat"],
[class*="stat-card"] {
  padding: 8px 6px !important;
  min-width: 0 !important;
}
[class*="metric-card__label"],
[class*="metric-card__title"] {
  font-size: 11px !important;
  white-space: normal !important;
  word-break: keep-all !important;
  overflow-wrap: normal !important;
  hyphens: none !important;
  line-height: 1.2 !important;
}
[class*="metric-card__value"] {
  font-size: 16px !important;
}

/* ==== Bug 9: Лидеры по линиям — свайп ==== */
.match-detail__leaders,
.club-overview__leaders,
.players-leaders__grid,
[class*="line-leaders"] {
  display: flex !important;
  flex-direction: row !important;
  flex-wrap: nowrap !important;
  overflow-x: auto !important;
  -webkit-overflow-scrolling: touch !important;
  scroll-snap-type: x mandatory !important;
  gap: 10px !important;
  padding-bottom: 6px !important;
}
[class*="leader-card"],
[class*="line-leader"],
[class*="leader-metric-card"] {
  flex: 0 0 calc(80vw - 24px) !important;
  scroll-snap-align: start !important;
  min-width: 0 !important;
}

/* ==== Bug 10: Атака и оборона друг под другом ==== */
.player-detail__radar-row,
.player-detail__compare-row,
[class*="attack-defence-row"],
[class*="radar-row"] {
  grid-template-columns: 1fr !important;
  display: grid !important;
  gap: 10px !important;
}

/* ==== Bug 11: счёт не залезает на название ==== */
.matches-dashboard__last-teams,
[class*="last-match__teams"] {
  display: grid !important;
  grid-template-columns: 1fr auto 1fr !important;
  align-items: center !important;
  gap: 8px !important;
}
.matches-dashboard__last-team-name,
[class*="last-match__name"] {
  min-width: 0 !important;
  white-space: normal !important;
  overflow: hidden !important;
  text-overflow: ellipsis !important;
  font-size: 12px !important;
}
.matches-dashboard__last-score,
[class*="last-match__score"] {
  font-size: 22px !important;
  white-space: nowrap !important;
}

/* ==== Bug 12: оценка не закрывает имя в профиле ==== */
.player-detail__rating-pill,
[class*="rating-pill--xl"],
[class*="player-detail__overall-pill"] {
  position: static !important;
  transform: none !important;
  margin: 8px auto !important;
  width: 56px !important;
  height: 56px !important;
  font-size: 22px !important;
}
.player-detail__header,
[class*="player-detail__head"] {
  display: flex !important;
  flex-direction: column !important;
  align-items: center !important;
  text-align: center !important;
  gap: 8px !important;
}
.player-detail__name,
[class*="player-detail__name"] {
  white-space: normal !important;
  overflow: visible !important;
  word-break: break-word !important;
  font-size: 18px !important;
}

/* ==== Bug 13/14: основная статистика и фитнес — overflow scroll внутри ==== */
[class*="player-detail__main-stats"],
[class*="player-detail__fitness"],
[class*="player-detail__stats-table"],
[class*="stats-table"] {
  width: 100% !important;
  max-width: 100% !important;
  overflow-x: auto !important;
  -webkit-overflow-scrolling: touch !important;
  min-width: 0 !important;
}
[class*="stats-table"] table,
[class*="player-detail__stats-table"] table {
  min-width: 480px;
  font-size: 11px;
}
```

---

## Bug 8 — переверстать `1 тайм vs 2 тайм` (mobile **И** desktop)

Это **JSX + CSS изменения**, не только media-query. Сейчас это горизонтальные парные бары (одна метрика — две линии). Пользователь хочет другую визуализацию.

**Рекомендация:** перейти на **вертикальные сгруппированные бары** — для каждой метрики две колонки (1 тайм жёлтый, 2 тайм синий) рядом, как в спортивных приложениях.

**Файл:** `frontend/src/components/HalfTimeBars.jsx` (или как он называется — в инвентаризации найти)

**Замени логику с горизонтальных линий на вертикальный grouped-bar:**

```jsx
// Псевдокод концепции — точную реализацию пишет Code, опираясь на existing component
import { BarChart, Bar, XAxis, YAxis, Tooltip, Legend, ResponsiveContainer } from 'recharts';

export default function HalfTimeBars({ splits, metrics, metricLabels, title }) {
  const data = metrics.map(key => ({
    name: metricLabels[key] || key,
    'I тайм':  splits[key]?.first  ?? 0,
    'II тайм': splits[key]?.second ?? 0,
  }));

  return (
    <div className="halftime-bars">
      {title && <div className="halftime-bars__title">{title}</div>}
      <ResponsiveContainer width="100%" height={Math.max(220, data.length * 32)}>
        <BarChart data={data} layout="horizontal" margin={{ top: 8, right: 8, left: 8, bottom: 32 }}>
          <XAxis dataKey="name" tick={{ fill: 'rgba(255,255,255,0.7)', fontSize: 10 }} angle={-25} textAnchor="end" />
          <YAxis tick={{ fill: 'rgba(255,255,255,0.5)', fontSize: 10 }} />
          <Tooltip contentStyle={{ background: '#0d1424', border: '1px solid #2a2f55' }} />
          <Legend wrapperStyle={{ fontSize: 11 }} />
          <Bar dataKey="I тайм"  fill="#ffd000" radius={[4, 4, 0, 0]} />
          <Bar dataKey="II тайм" fill="#5b6ee3" radius={[4, 4, 0, 0]} />
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}
```

CSS:

```css
.halftime-bars {
  width: 100%;
  max-width: 100%;
  overflow-x: hidden;
}
.halftime-bars__title {
  font-size: 13px;
  text-transform: uppercase;
  letter-spacing: 0.05em;
  color: rgba(255,255,255,0.5);
  margin-bottom: 10px;
  font-weight: 600;
}
@media (max-width: 768px) {
  .halftime-bars { font-size: 11px; }
}
```

---

## Передай Code

> Прочитай SPEC_MOBILE_14.md.
>
> **PR-1 (CSS only):** добавь все правила багов 1-7, 9-14 в конец существующего блока `@media (max-width: 768px)` в `frontend/src/styles/mobile.css`. Не трогай ничего другого. После — `npm run build`, push, проверь у меня на iPhone что 13 пунктов закрыты.
>
> **PR-2 (Bug 8 — JSX + CSS):** переписать компонент `HalfTimeBars.jsx` на вертикальные сгруппированные бары через recharts (псевдокод в спеке). Обновить `HalfTimeBars.css`. Убедиться что компонент рендерит корректно и на desktop, и на mobile. После — push отдельным PR.
>
> Перед каждой правкой запусти инвентаризацию из спеки (grep для имён классов) и используй точные имена.

---

## После применения — что я НЕ упустил

Прошёл повторно по твоему списку, **все 14 пунктов закрыты**. Для контроля:

| # | Закрыт правилами | 
|---|------------------|
| 1 | text-align: left для info-team / hero |
| 2 | flex-direction: column для matches-dashboard__grid |
| 3 | white-space: normal для last-match team name |
| 4 | flex-column + photo 64px + flex-wrap для motm__stats |
| 5 | flex + overflow-x + scroll-snap для top-players |
| 6 | display: none для rating-card__bar/progress |
| 7 | grid 2cols + padding 8px + font 11/16 для metric-card |
| 8 | переверстка HalfTimeBars.jsx (PR-2) |
| 9 | flex + overflow-x + scroll-snap для leaders |
| 10 | grid 1fr для radar-row / compare-row |
| 11 | grid 1fr auto 1fr для last-teams + ellipsis на name |
| 12 | position: static + flex-column header |
| 13 | overflow-x: auto на stats-table |
| 14 | overflow-x: auto на fitness |

Если **после PR-1** что-то осталось вылазить — это значит реальный класс не в моих `[class*="..."]` шаблонах. Тогда DevTools-скрипт:

```js
[...document.querySelectorAll('*')].filter(e=>e.getBoundingClientRect().right>window.innerWidth+1).slice(0,10).forEach(e=>console.log(e.tagName+'.'+(e.className||'').toString().slice(0,60),'right='+Math.round(e.getBoundingClientRect().right)));
```

И по выводу — одна правка с явным именем.
