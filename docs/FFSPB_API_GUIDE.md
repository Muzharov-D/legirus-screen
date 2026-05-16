# FFSPB API — практическое руководство

База: `https://stat.ffspb.org/api`. Документация: `https://stat.ffspb.org/api/docs.json` (OpenAPI 3, на API Platform / Hydra).

Этот документ — выжимка из боевой интеграции в проекте Легирус (`backend/services/ffspbApi.js`) + находки, которые в публичных доках не описаны или описаны криво. Если смежный продукт «не видит расписание» — почти наверняка дело в одной из ловушек ниже.

---

## 1. Авторизация

Заголовок:
```
X-AUTH-TOKEN: <ваш_ключ>
```

Ключ запрашивается у FFSPB вручную (письмо в их поддержку, выдают per-проект). В env:
```
FFSPB_API_KEY=<секрет>
FFSPB_ENDPOINT=https://stat.ffspb.org/api
```

**Гочи:**
- Без токена многие эндпоинты вернут пустой массив или 401 без внятного описания.
- Один токен — на один проект. Если используете тот же токен в нескольких сервисах под высокой нагрузкой — словите 429.

---

## 2. Accept-заголовки — это критично

Большинство эндпоинтов отдают **JSON-LD / Hydra**. Везде, кроме `/docs.json`:
```
Accept: application/ld+json
```

С `application/json` API часто отдаёт «голый» массив без Hydra-обёртки, и пагинация (`hydra:view.hydra:next`) пропадает — получите только первую страницу и не поймёте, почему данных меньше, чем ожидалось.

**Исключение:** `/docs.json` (OpenAPI спека) НЕ поддерживает `ld+json`. Запрос с `Accept: application/ld+json` вернёт **406 Not Acceptable**:
```
Requested format "application/ld+json" is not supported. Supported MIME types are "application/json", …
```
Для OpenAPI используйте `Accept: application/json`.

---

## 3. Hydra-пагинация

Любой list-эндпоинт возвращает структуру:
```json
{
  "@context": "/api/contexts/Tournament",
  "@id": "/api/tournaments",
  "@type": "hydra:Collection",
  "hydra:member": [ /* массив объектов */ ],
  "hydra:totalItems": 524,
  "hydra:view": {
    "@id": "/api/tournaments?page=1",
    "@type": "hydra:PartialCollectionView",
    "hydra:first": "/api/tournaments?page=1",
    "hydra:last": "/api/tournaments?page=18",
    "hydra:next": "/api/tournaments?page=2"
  }
}
```

Алгоритм auto-pagination:
```
1. Делаем GET /endpoint?itemsPerPage=100
2. Берём all = data['hydra:member']
3. next = data['hydra:view']?.['hydra:next']
4. Пока next: GET next, добавляем member'ы, обновляем next
5. STOP когда next отсутствует
```

`itemsPerPage` лимит — обычно **100**. Дефолт сервера — 30. Без явного `itemsPerPage=100` сделаете в 3 раза больше запросов.

**Защита от бесконечного цикла:** ставьте safety counter (например, 50 итераций — это 5000 элементов, для матчей с лихвой).

Готовая реализация:
```js
async function listAll(path, params = {}) {
  const url = new URL(ENDPOINT + path);
  for (const [k, v] of Object.entries(params)) {
    if (Array.isArray(v)) for (const item of v) url.searchParams.append(`${k}[]`, item);
    else if (v != null) url.searchParams.set(k, v);
  }
  if (!url.searchParams.has('itemsPerPage')) url.searchParams.set('itemsPerPage', '100');

  const all = [];
  let next = url.toString();
  let safety = 50;
  while (next && safety-- > 0) {
    const res = await fetch(next, {
      headers: { 'Accept': 'application/ld+json', 'X-AUTH-TOKEN': KEY }
    });
    const data = await res.json();
    for (const item of data['hydra:member'] || []) all.push(item);
    const view = data['hydra:view'];
    next = view?.['hydra:next'] ? new URL(view['hydra:next'], ENDPOINT).toString() : null;
  }
  return all;
}
```

---

## 4. Retry на 5xx и сеть

FFSPB иногда отвечает 502/504 при холодном старте или нагрузке. Добавьте простой retry с экспоненциальным backoff:
```js
async function fetchWithRetry(url, opts = {}, attempt = 1) {
  try {
    const res = await fetch(url, opts);
    if (res.status >= 500 && attempt < 3) {
      await new Promise(r => setTimeout(r, 500 * attempt));
      return fetchWithRetry(url, opts, attempt + 1);
    }
    if (!res.ok) throw new Error(`FFSPB ${res.status}: ${(await res.text()).slice(0, 200)}`);
    return res.json();
  } catch (e) {
    if (attempt < 3 && /timeout|ECONNRESET|fetch failed/i.test(e.message)) {
      await new Promise(r => setTimeout(r, 500 * attempt));
      return fetchWithRetry(url, opts, attempt + 1);
    }
    throw e;
  }
}
```

---

## 5. Получение расписания (типичная задача)

### 5.1. Узнать tournamentId

`tournament_id` — это **целое число**, видно в URL на сайте: `https://stat.ffspb.org/tournament44333/...` → tournamentId = `44333`.

Список доступных турниров можно подтянуть:
```
GET /api/tournaments?itemsPerPage=100
```

Фильтры (опционально):
- `season` — например `2025-2026`
- `discipline.code` — например `football`
- `name` — частичный поиск по названию

### 5.2. Список матчей турнира

```
GET /api/matches?tournament_id=44333&itemsPerPage=100
```

Дополнительные фильтры:
| Параметр | Значение | Смысл |
|---|---|---|
| `tournament_id` | число | **обязателен** — иначе вернёт пустоту или error |
| `has_lineups` | `0` или `1` | только матчи с заявкой / без |
| `date[gte]` | **Unix seconds** | от какой даты |
| `date[lte]` | **Unix seconds** | до какой даты |
| `order[date]` | `asc` или `desc` | сортировка |

**⚠️ Ловушка:** даты идут в **Unix секундах**, не миллисекундах. И не в ISO.
```js
params['date[gte]'] = Math.floor(new Date('2025-09-01').getTime() / 1000);
```

Если передадите ISO-строку — API не упадёт, но фильтр молча проигнорирует, и вернёт ВСЕ матчи турнира. Это самая частая причина «не вижу свежие данные».

### 5.3. Полный объект матча

```
GET /api/matches/{id}
```

Возвращает **весь** объект, включая:
- `host` / `guest` — IRI команд
- `events[]` — события матча (голы, карточки)
- `participatedPlayers[]` — обе заявки (см. §7)
- `score_home` / `score_away` (если матч сыгран)
- `tournament`, `stadium`, `matchReferees`, `viewersCount`
- `status` / `statuses`

---

## 6. EventType — расшифровка

В `match.events[]` каждое событие имеет числовой `eventType`. В OpenAPI он описан только как `integer`, без enum. Расшифровка получена эмпирически на 300 реальных матчах + сверкой с UI FFSPB:

| `eventType` | Что | Заметки |
|---:|---|---|
| `0` | Гол с игры | Самое частое |
| `1` | **Автогол** | Идёт в счёт **противоположной** команды! `team` события — это команда забившего |
| `2` | Гол с пенальти | |
| `3` | Незабитый пенальти | |
| `4` | Жёлтая карточка | Обычная, без удаления. `comment` — стандартная FIFA-формулировка |
| `5` | Красная карточка | Прямая. `wideComment` часто содержит подробное описание |
| `6` | **2-я ЖК с удалением** | Обе ЖК этого игрока за матч помечены `eventType=6` (а не одна `4` + одна `5`) |
| `15` | Травма | `comment` — записка врача |

**Важно:** замены в `events[]` **НЕ приходят**. Они в `participatedPlayers[]` (см. §7).

Структура одного события (примерно одинаковая для всех типов):
```json
{
  "@id": "/api/match_events/7577111",
  "@type": "MatchEvent",
  "author": { "@id": "/api/players/...", "surname": "Иванов", "firstName": "Иван", "publicExtra": [...] },
  "team": { "@id": "/api/teams/421427", "shortName": "Солярис" },
  "minute": 61,
  "addedTime": false,
  "comment": "Неспортивное поведение",
  "wideComment": "",
  "assist": null,
  "ignore": false,
  "eventType": 6,
  "whenAdded": 0
}
```

**Сверка голов со счётом:** `Σ events team=X, type ∈ {0, 2}` + `Σ events team=Y, type=1` = `score(X)`. Если расходится — обычно автоголы или протокол ещё не доделан.

**Эндпоинт `/api/match_events?match.id={id}` НЕ работает** — возвращает 500. Берите события через `GET /api/matches/{id}` → `.events[]`.

---

## 7. Составы и замены — `participatedPlayers`

В объекте матча есть массив `participatedPlayers[]`. Каждый элемент:
```json
{
  "@id": "/api/player_participations/21103621",
  "@type": "PlayerParticipation",
  "request": { "@id": "/api/players/10369189", "surname": "Бондарь", "firstName": "Даниил", ... },
  "team": { "@id": "/api/teams/424228", "shortName": "Легирус" },
  "bench": 0,                   // 0 = в стартовом составе, 1 = на лавке
  "number": 19,                 // номер на матч
  "replacedBy": {               // null если не заменялся; иначе — Player
    "@id": "/api/players/10369205",
    "surname": "Кондаков", ...
  },
  "replaceMin": 64              // 0 если не заменялся; иначе минута замены
}
```

**Семантика — критически важно:**
- Поля `replacedBy` и `replaceMin` заполняются **только у УХОДЯЩЕГО** игрока. У ВОШЕДШЕГО на замену — `replacedBy = null` и `replaceMin = 0`.
- Чтобы реконструировать замены: пройти по всему массиву, найти записи с `replacedBy != null`, для каждой такой записи: «уходит игрок A → выходит игрок B (по ссылке `replacedBy.@id`)».

```js
const byPlayerId = new Map(participatedPlayers.map(p => [p.request['@id'], p]));
const subs = [];
for (const p of participatedPlayers) {
  if (!p.replacedBy || !p.replaceMin) continue;
  const inEntry = byPlayerId.get(p.replacedBy['@id']);
  subs.push({
    minute: p.replaceMin,
    teamSide: p.team['@id'] === match.host['@id'] ? 'host' : 'guest',
    out: { name: p.request.surname, number: p.number, photo: p.request.photo },
    in:  { name: p.replacedBy.surname, number: inEntry?.number, photo: p.replacedBy.photo },
  });
}
```

Стартовый состав — `participatedPlayers.filter(p => p.bench === 0)`, запасные — `.filter(p => p.bench === 1)`.

---

## 8. Другие эндпоинты

### 8.1. Турнирная таблица
**Параметр — `tournament` (IRI), не `tournament_id`!**
```
GET /api/standings?tournament=/api/tournaments/44333
```
С `tournament_id` вернёт ошибку или пустоту.

### 8.2. Кубковая сетка
То же самое — IRI:
```
GET /api/playoffs?tournament=/api/tournaments/44345
```

### 8.3. Топ-бомбардиры
```
GET /api/tournament_top_players?tournament_id=44333
```

### 8.4. Команда и её игроки
```
GET /api/teams/{id}                          # сама команда (часто с embedded players)
GET /api/players?currentTeam.id={teamId}     # все игроки команды
```

### 8.5. Игрок
В `Player.publicExtra[]` лежат свободные поля анкеты — номер, амплуа, гражданство, «клуб, из которого игрок переходит». Структура:
```json
{
  "publicExtra": [
    { "field": { "name": "Номер игрока" }, "value": "11" },
    { "field": { "name": "Амплуа" }, "value": "Полузащитник" },
    { "field": { "name": "Гражданство" }, "value": "РФ" }
  ]
}
```
Названия `field.name` могут меняться у разных проектов FFSPB. Парсите по `name`, а не по индексу.

---

## 9. Ловушки и контр-меры

| Симптом | Причина | Решение |
|---|---|---|
| Получаю всего 30 матчей вместо ожидаемых сотен | Не указали `itemsPerPage` и не идёте по `hydra:next` | См. §3 |
| Фильтр по дате не работает, возвращает всё | Передали ISO-строку вместо Unix seconds | См. §5.2 |
| `/standings?tournament_id=X` → пусто или ошибка | Этот эндпоинт ждёт IRI, не id | См. §8.1 |
| `/match_events?match.id=X` → 500 | Эндпоинт по факту нерабочий | Берите события через `getMatch` (§5.3) |
| `/docs.json` → 406 | Дефолтный `application/ld+json` | Только для `/docs.json` — `application/json` |
| Нет замен в `events[]` | Они в `participatedPlayers[]`, не в событиях | См. §7 |
| Команда `«Легирус 2010»` vs `«ФК Легирус (ЦФКСиЗ ВО)»` в разных местах | Разные ID/имена в разных контекстах — FFSPB не нормализует | Всегда матчите по `@id`, не по name |
| Время матча сдвигается на час/день | Все таймстемпы — UTC. Игры играются по МСК (UTC+3) | Для сравнения дат используйте `AT TIME ZONE 'Europe/Moscow'` или `new Date(iso)` в JS — браузер сам |
| Спустя минуту после матча `events[]` пустой | Судья заполняет протокол постфактум (1–24 часа) | Ретраить, пока `events.length === 0`, окно 7 дней |

---

## 10. Минимальный self-contained пример (Node)

```js
const ENDPOINT = 'https://stat.ffspb.org/api';
const KEY = process.env.FFSPB_API_KEY;

async function get(path, params = {}) {
  const url = new URL(ENDPOINT + path);
  for (const [k, v] of Object.entries(params)) {
    if (v != null) url.searchParams.set(k, v);
  }
  const res = await fetch(url, {
    headers: { 'Accept': 'application/ld+json', 'X-AUTH-TOKEN': KEY },
  });
  if (!res.ok) throw new Error(`HTTP ${res.status}: ${await res.text()}`);
  return res.json();
}

async function listAll(path, params = {}) {
  params.itemsPerPage = 100;
  const url = new URL(ENDPOINT + path);
  for (const [k, v] of Object.entries(params)) {
    if (v != null) url.searchParams.set(k, v);
  }
  const all = [];
  let next = url.toString();
  while (next) {
    const res = await fetch(next, {
      headers: { 'Accept': 'application/ld+json', 'X-AUTH-TOKEN': KEY },
    });
    const data = await res.json();
    all.push(...(data['hydra:member'] || []));
    next = data['hydra:view']?.['hydra:next']
      ? new URL(data['hydra:view']['hydra:next'], ENDPOINT).toString()
      : null;
  }
  return all;
}

// Пример: все матчи турнира 44333 за сентябрь 2025
const matches = await listAll('/matches', {
  tournament_id: 44333,
  'date[gte]': Math.floor(new Date('2025-09-01').getTime() / 1000),
  'date[lte]': Math.floor(new Date('2025-09-30').getTime() / 1000),
  'order[date]': 'asc',
});
console.log('matches:', matches.length);

// Один полный матч (с events и participatedPlayers)
const m = await get('/matches/3844273');
console.log('events:', m.events.length, 'players:', m.participatedPlayers.length);
```

---

## 11. Где это всё лежит у нас (для справки)

- HTTP-клиент: `backend/services/ffspbApi.js` — `listAll`, `getOne`, `listMatches`, `getMatch`, etc.
- Cron'ы:
  - `calendarService.js` — список матчей турниров (каждые ~30 мин)
  - `standingsService.js` — турнирные таблицы
  - `cupService.js` — кубковая сетка
  - `matchEventsService.js` — события + lineups (5–30 мин в зависимости от близости к матчу)
  - `playersSyncService.js` — игроки команд

Контактное лицо для вопросов по самой интеграции — Дмитрий (ai4sportdata@gmail.com).
