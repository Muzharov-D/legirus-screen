# SPEC_FIXES_v4.md — Два визуальных бага

**Дата:** 2026-04-30
**Статус:** к реализации Claude Code
**Контекст:** четвёртая итерация. Две короткие правки UI на боевом продакшне.

---

## E1. На страницах игрока удалить блок «Лучший игрок матча»

### Симптом

Пользователь открывает `/players/{playerId}` (например `/players/p17-turapin`) и в hero видит карточку «Лучший игрок матча» с фото Галицкого (motm матча) — а не информацию о Турапине, чью страницу открыл. Выглядит логически ошибочно — блок про MOTM здесь лишний, потому что страница уже посвящена конкретному игроку.

### Где искать

`frontend/src/pages/PlayerDetail.jsx` или связанные компоненты, на которых рендерится карточка с текстом «Лучший игрок матча» / «Игрок матча» внутри роутом `/players/:playerId`.

Либо это `MatchDetail.jsx`, чей контент случайно показывается на players-detail (например, через общий layout/header), но скорее всего это отдельный блок прямо в `PlayerDetail.jsx`.

`grep -n "motm\|Лучший игрок\|Игрок матча" frontend/src/pages/PlayerDetail.jsx` поможет найти.

### Что сделать

**Вариант А (предпочтительный):** Удалить блок «Лучший игрок матча» из `PlayerDetail.jsx` целиком — на странице конкретного игрока MOTM-карточка нерелевантна.

**Вариант Б:** Заменить блок «Лучший игрок матча» на блок «Этот игрок» с фото и данными того самого игрока, чья страница открыта (`useParams().playerId` → `match.players.find(p => p.id === playerId)`), и добавить надпись «X-е место в матче» (вычислить через сортировку по `ratings.overall`). Это даст контекст «вот ты в матче».

Пользователь предпочитает Вариант А (быстрее и логичнее), если только Вариант Б не сильно проще. Реши на месте, что чище смотрится.

### Где НЕ трогать

- `ClubOverview.jsx` — там «Лучший игрок матча» уместен (это аналитика клуба, MOTM логичен).
- `MatchDetail.jsx` — там «Игрок матча» уместен (страница матча).

### Definition of done — E1

- [ ] Открываешь `/players/p17-turapin` — нигде на странице нет карточки «Лучший игрок матча» / «Игрок матча» с чужим фото.
- [ ] Открываешь `/players/p05-galitsky` (он сам motm) — поведение то же; страница про него, MOTM-карточка ему не нужна.
- [ ] `/analytics` и `/matches/match-001` — карточка MOTM на месте, не сломалась.

---

## E2. Перевести ключи teamAggregates на русский (ComparisonView)

### Симптом

На `/analytics/team` (это `frontend/src/pages/ComparisonView.jsx`) в секции «Командные дашборды (9 секций)» каждая карточка (Удары / Стандарты / Передачи и т.д.) показывает строки ключей **на английском**: «Total shots», «Pass forward», «Crosses», «Progressive», «Goal kicks», «Counterattacks», «Aerial duels», «Average PPDA» — потому что используется хелпер:

```js
function prettyKey(k) {
  const s = String(k).replace(/([a-z])([A-Z])/g, '$1 $2');
  return s.charAt(0).toUpperCase() + s.slice(1);
}
```

Он просто разбивает camelCase, но не переводит. По спеке всё должно быть на русском.

### Что сделать

**Файл:** `frontend/src/pages/ComparisonView.jsx`

Заменить функцию `prettyKey(k)` на словарь `AGG_KEY_LABELS` и фолбэк-логику.

Готовый код для замены — добавить **до** функции `ComparisonView()` (вместо текущей `prettyKey`):

```js
const AGG_KEY_LABELS = {
  // shooting (page 12)
  totalShots: 'Удары всего',
  avgShotDistance: 'Средняя дистанция удара, м',
  shotsOnTarget: 'Удары в створ',
  expectedGoals: 'xG',
  goalActions: 'Голевые моменты',
  shotsByHead: 'Удары головой',
  freeKickShots: 'Удары со штрафных',

  // setPieces (page 13)
  throwIns: 'Вбрасывания',
  freeKicks: 'Штрафные',
  freeKicksWithShot: 'Штрафные с ударом',
  penalty: 'Пенальти',
  corners: 'Угловые',
  offsides: 'Офсайды',
  directFreeKicks: 'Прямые штрафные',

  // possession (page 14)
  possessionsCount: 'Кол-во владений',
  losses: 'Потери',
  byThird: 'Владение по третям',
  dangerousLossesOwnHalf: 'Опасные потери на своей половине',
  technicalMistakes: 'Технические ошибки',
  averagePossessionTime: 'Среднее время владения, с',
  possessionPct: 'Владение, %',

  // passes (page 15)
  forward: 'Передачи вперёд',
  back: 'Передачи назад',
  sideways: 'Передачи в сторону',
  short: 'Короткие передачи',
  middle: 'Средние передачи',
  long: 'Длинные передачи',
  progressive: 'Прогрессивные передачи',
  toFinalThird: 'Передачи в финальную треть',
  crosses: 'Кроссы',
  goalKicks: 'Удары от ворот',
  oppda: 'OPPDA',
  passesPerMinute: 'Передач в минуту',
  totalPasses: 'Всего передач',
  passAccuracy: 'Точность передач, %',

  // attacks (page 16)
  positional: 'Позиционные атаки',
  counterattacks: 'Контратаки',
  defenceBreakthroughs: 'Прорывы обороны',
  crossingMidfield: 'Прохождения средней линии',
  attacksTotal: 'Всего атак',

  // recoveriesAndTackling (page 17)
  thirdLow: 'Возвраты — своя треть',
  thirdMid: 'Возвраты — средняя треть',
  thirdHigh: 'Возвраты — чужая треть',
  recoveries: 'Возвраты мяча',
  returns: 'Возвраты',
  tacklesLine: 'Отборы',
  recoveriesByThird: 'Возвраты по третям',

  // duels (page 18)
  totalDuels: 'Единоборств всего',
  aerialDuels: 'Воздушные дуэли',
  groundDuels: 'Дуэли в земле',

  // pressing (page 19)
  pressing: 'Прессинг',
  counterpressing: 'Контрпрессинг',
  averagePPDA: 'Средний PPDA',

  // positioning (page 20)
  shotsAgainst: 'Удары против',
  interceptions: 'Перехваты',
  clearance: 'Выносы',
  fouls: 'Нарушения',
  yellowCards: 'Жёлтые карточки',
  redCards: 'Красные карточки',
  blockedShots: 'Заблокированные удары',
  saves: 'Сейвы',
};

function prettyKey(k) {
  if (AGG_KEY_LABELS[k]) return AGG_KEY_LABELS[k];
  // fallback: camelCase → "Camel case" (как раньше) — на случай новых ключей
  const s = String(k).replace(/([a-z])([A-Z])/g, '$1 $2');
  return s.charAt(0).toUpperCase() + s.slice(1);
}
```

Вся остальная логика рендера в JSX остаётся без изменений — `prettyKey(k)` просто начнёт возвращать русские строки.

### Если ключи не совпадают с реальными в JSON

Возможно, какие-то ключи в `match-001.json/teamAggregates.{section}` отличаются от приведённых выше (например, парсер мог назвать иначе). Проверка:

В DevTools на `/analytics/team` нажми Network → запрос `/api/data/match/match-001` → Preview → разверни `teamAggregates.shooting`, `teamAggregates.passes` и т.д. — посмотри реальные ключи. Если какой-то ключ отсутствует в `AGG_KEY_LABELS` — fallback оставит его как есть (camelCase split), это не сломает страницу. Но желательно дозаполнить словарь.

### Definition of done — E2

- [ ] Открываешь `/analytics/team` → ни в одной из 9 секций не видно английских строк типа «Total shots», «Pass forward», «Goal kicks», «Counterattacks». Все на русском.
- [ ] Если какой-то ключ из JSON отсутствует в словаре — показывается через camelCase fallback, страница не падает.
- [ ] Заголовки секций («Удары», «Передачи», «Прессинг» и т.д.) — без изменений (там уже русский в `SECTIONS`).

---

## F. Карта изменяемых файлов

```
ИЗМЕНЯЮТСЯ:
~ frontend/src/pages/PlayerDetail.jsx       (удалить/перенести MOTM-карточку — E1)
~ frontend/src/pages/ComparisonView.jsx     (AGG_KEY_LABELS словарь — E2)
```

Никакие seed-данные, парсеры, стили, бэкенд НЕ трогаются.

---

## G. Команда для Claude Code

```
Реализуй SPEC_FIXES_v4.md в этой папке.

Прочитай SPEC_FIXES_v4.md и сделай две правки:
  E1: убрать с PlayerDetail.jsx блок «Лучший игрок матча» / «Игрок матча»
      (если он там вообще есть — перепроверь grep'ом). Оставить такой
      блок в ClubOverview.jsx и MatchDetail.jsx.
  E2: в ComparisonView.jsx заменить функцию prettyKey на словарь
      AGG_KEY_LABELS + fallback. Готовый код приведён в спеке.

После — npm run build, убедись что ошибок нет, push в main. Vercel
сам пересоберёт за 1-2 минуты.

Не трогай backend/, парсеры, seed-данные, остальные страницы.
```

---

## Контакт

- Проект: «Экран Легирус» (АванDата × ФК Легирус 2010)
- Бренд: SportData (`ai4sportdata@gmail.com`)
- Дата спеки: 30.04.2026
- Связана с: SPEC_FIXES_v1.md / v2.md / v3.md
