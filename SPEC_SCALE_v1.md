# SPEC_SCALE_v1.md — Масштабирование до полной академии

**Дата:** 2026-04-30
**Статус:** к реализации Claude Code (фазами)
**Контекст:** клуб «Легирус» — академия с 5–10 возрастными командами (U-9 … U-19). Каждая команда — свой ростер 15–25 игроков, свои матчи, свой тренер. Главный тренер видит всю академию, тренер команды — только свою. Игрок — только свою команду в командных дашбордах + детальный свой профиль. Загрузка PDF Sportvisor через UI.

Это эволюция архитектуры: данные, роли, бэк, фронт. Раскатываем 4 фазами, каждую можно деплоить отдельно.

---

## G0. Целевая модель

### Команды

Внутри клуба Легирус — массив возрастных команд:

```
legirus-2009  → ФК Легирус 2009 (U-17)
legirus-2010  → ФК Легирус 2010 (U-16)   ← уже есть
legirus-2011  → ФК Легирус 2011 (U-15)
legirus-2012  → ФК Легирус 2012 (U-14)
legirus-2013  → ФК Легирус 2013 (U-13)
…
```

Каждая команда независима: свои игроки, свои матчи. Имя клуба общее.

### Роли

| Роль | teamId | Что видит |
|------|--------|-----------|
| `head_coach` | `null` | Все команды клуба, все игроки, все матчи. Может выбирать команду через селектор. |
| `team_coach` | `legirus-2010` | Только свою команду — игроков, матчи. Может загружать PDF только для своей команды. |
| `player` | `legirus-2010` | Командные дашборды своей команды; свой детальный профиль. |

`coach` (универсальный) уходит — его место занимает `head_coach` (полные права) или `team_coach` (ограниченный).

### Идентификаторы

Существующие ID игроков (`p17-turapin`) и матчей (`match-001`) **остаются без изменений** — у них уже есть поле `teamId` в данных, которое мы добавим. Глобальной уникальности не требуется, потому что у каждой команды свой scope. Это упрощает миграцию.

---

## G1. Фаза 1 — модель данных и backend (без UI-изменений)

**Цель:** Бэкенд готов к мультикомандности; фронт продолжает показывать только Легирус 2010 (как сейчас).

### G1.1 teams.json

Заменить на массив команд клуба. Все команды Легируса флагуются `isOurTeam: true`.

```json
{
  "club": {
    "id": "legirus",
    "name": "Легирус",
    "logo": "/assets/logos/legirus.png"
  },
  "teams": [
    {
      "id": "legirus-2010",
      "name": "Легирус 2010",
      "ageGroup": "U-16",
      "year": 2010,
      "headCoach": null,
      "logo": "/assets/logos/legirus.png",
      "isOurTeam": true,
      "active": true
    },
    {
      "id": "legirus-2011",
      "name": "Легирус 2011",
      "ageGroup": "U-15",
      "year": 2011,
      "headCoach": null,
      "logo": "/assets/logos/legirus.png",
      "isOurTeam": true,
      "active": false   // ← неактивные команды показывать в селекторе серым/disabled
    },
    ...
  ]
}
```

`active: true` — команда уже наполнена данными (есть игроки и хотя бы один матч). На старте только `legirus-2010` active=true.

### G1.2 players.json

Добавить поле `teamId` каждому игроку:

```json
{
  "players": [
    {
      "id": "p17-turapin",
      "teamId": "legirus-2010",
      "fullName": "Матвей Турапин",
      ...
    },
    ...
  ]
}
```

Скрипт миграции (одна строка node):

```js
const data = require('./backend/data/players.json');
data.players.forEach(p => p.teamId = 'legirus-2010');
fs.writeFileSync('./backend/data/players.json', JSON.stringify(data, null, 2));
```

### G1.3 matches.json и match-NNN.json

Добавить `teamId` к индексу и каждому файлу матча:

`backend/data/matches.json`:
```json
{
  "matches": [
    {
      "id": "match-001",
      "teamId": "legirus-2010",
      "date": "2026-04-19",
      "homeTeamId": "legirus-2010",
      ...
    }
  ]
}
```

`backend/data/matches/match-001.json` — добавить root-поле `"teamId": "legirus-2010"`.

Файловая структура матчей **остаётся плоской** (все json-ы в `backend/data/matches/`) — Render persistent disk не любит вложенность, а имена и так уникальны.

### G1.4 users.json — новые роли

Скрипт `backend/scripts/seed-users.js` обновить:

```js
{
  "users": [
    {
      "id": "u-head-coach",
      "username": "coach",
      "passwordHash": "$2a$...",
      "role": "head_coach",
      "teamId": null,
      "fullName": "Главный тренер академии"
    },
    {
      "id": "u-team-coach-2010",
      "username": "coach2010",
      "passwordHash": "$2a$...",
      "role": "team_coach",
      "teamId": "legirus-2010",
      "fullName": "Тренер Легирус 2010"
    },
    {
      "id": "u-p17-turapin",
      "username": "turapin",
      "passwordHash": "$2a$...",
      "role": "player",
      "teamId": "legirus-2010",
      "playerId": "p17-turapin",
      "fullName": "Матвей Турапин"
    },
    ...
  ]
}
```

При миграции существующих учёток: `coach` (старый) → `role: head_coach, teamId: null` (легче дать ему все права, сделав «главным»). Игроки уже имеют `playerId` и `role: player` — добавляем `teamId: 'legirus-2010'`. Новые роли применяются к новым учёткам, существующие пароли НЕ меняем.

### G1.5 Backend routes

**`backend/middleware/auth.js`** — расширить `req.user`:

```js
req.user = {
  id, username, role, fullName,
  teamId: user.teamId,           // null для head_coach, конкретный для team_coach/player
  playerId: user.playerId || null,
};
```

И добавить хелпер:

```js
export function authorizeTeam(teamId) {
  return (req, res, next) => {
    if (!req.user) return res.status(401).json({ error: 'Требуется авторизация' });
    if (req.user.role === 'head_coach') return next();           // главный — везде
    if (req.user.teamId === teamId) return next();               // тренер/игрок своей команды
    return res.status(403).json({ error: 'Команда недоступна' });
  };
}
```

**`backend/routes/data.js`** — фильтрация:

```js
// GET /api/data/teams — head_coach видит все, остальные только свою
router.get('/teams', (req, res) => {
  const all = loadTeams();
  if (req.user.role === 'head_coach') return res.json(all);
  const filtered = {
    ...all,
    teams: all.teams.filter(t => t.id === req.user.teamId)
  };
  res.json(filtered);
});

// GET /api/data/players?teamId=legirus-2010
router.get('/players', (req, res) => {
  const all = loadPlayers();
  const requestedTeamId = req.query.teamId;

  if (req.user.role === 'head_coach') {
    // может смотреть любую команду
    const filtered = requestedTeamId
      ? all.players.filter(p => p.teamId === requestedTeamId)
      : all.players;
    return res.json({ players: filtered });
  }

  // team_coach / player — только свою
  const filtered = all.players.filter(p => p.teamId === req.user.teamId);
  res.json({ players: filtered });
});

// GET /api/data/matches?teamId=legirus-2010
router.get('/matches', (req, res) => {
  const all = loadMatchesIndex();
  const requestedTeamId = req.query.teamId;

  if (req.user.role === 'head_coach') {
    const filtered = requestedTeamId
      ? all.matches.filter(m => m.teamId === requestedTeamId)
      : all.matches;
    return res.json({ matches: filtered });
  }

  const filtered = all.matches.filter(m => m.teamId === req.user.teamId);
  res.json({ matches: filtered });
});

// GET /api/data/match/:matchId — проверка teamId
router.get('/match/:matchId', (req, res) => {
  try {
    const match = loadMatch(req.params.matchId);
    if (req.user.role !== 'head_coach' && match.teamId !== req.user.teamId) {
      return res.status(403).json({ error: 'Матч недоступен' });
    }

    // Фильтрация для player — как в SPEC_FIXES_v5
    if (req.user.role === 'player') {
      const ownId = req.user.playerId;
      const sanitize = (p) => {
        if (p.id === ownId) return p;
        const { splits, radar, maps, ...publicFields } = p;
        return publicFields;
      };
      const filtered = { ...match, players: (match.players || []).map(sanitize) };
      return res.json(filtered);
    }

    res.json(match);
  } catch (e) {
    res.status(404).json({ error: `Матч ${req.params.matchId} не найден` });
  }
});
```

### G1.6 Definition of done — Фаза 1

- [ ] `teams.json` содержит массив `teams` с >= 2 команд (даже если active: false для остальных).
- [ ] У всех 15 игроков в `players.json` поле `teamId: 'legirus-2010'`.
- [ ] У `match-001` (как в индексе, так и в файле) — `teamId: 'legirus-2010'`.
- [ ] users.json содержит хотя бы одного `head_coach` и одного `team_coach` (плюс существующих игроков).
- [ ] `GET /api/data/teams` для head_coach возвращает все, для team_coach/player — только свою.
- [ ] `GET /api/data/match/match-001` для head_coach отдаёт всё; для team_coach legirus-2010 отдаёт всё; для team_coach legirus-2011 — 403.
- [ ] Существующий фронт продолжает работать (показывает Легирус 2010), не сломался.

---

## G2. Фаза 2 — UI селектор команды + фильтрация

**Цель:** В шапке появляется селектор команды; head_coach может переключаться, team_coach/player видят свою.

### G2.1 Контекст выбранной команды

**Новый файл:** `frontend/src/contexts/TeamContext.jsx`

```jsx
import { createContext, useContext, useState, useEffect } from 'react';
import { useAuth } from './AuthContext';
import { fetchTeams } from '../services/api';

const TeamCtx = createContext(null);
const STORAGE_KEY = 'legirus.selectedTeamId';

export function TeamProvider({ children }) {
  const { user } = useAuth();
  const [teams, setTeams] = useState([]);
  const [selectedTeamId, setSelectedTeamId] = useState(null);

  useEffect(() => {
    if (!user) { setTeams([]); setSelectedTeamId(null); return; }
    fetchTeams().then(({ teams: t }) => {
      setTeams(t || []);
      // Авто-выбор команды: для team_coach/player — своя; для head_coach — последняя выбранная или первая active.
      let initial;
      if (user.teamId) {
        initial = user.teamId;
      } else {
        const stored = localStorage.getItem(STORAGE_KEY);
        const validStored = t.find(x => x.id === stored && x.active);
        initial = validStored?.id || t.find(x => x.active)?.id || t[0]?.id || null;
      }
      setSelectedTeamId(initial);
    });
  }, [user]);

  function select(teamId) {
    setSelectedTeamId(teamId);
    localStorage.setItem(STORAGE_KEY, teamId);
  }

  return (
    <TeamCtx.Provider value={{ teams, selectedTeam: teams.find(t => t.id === selectedTeamId), selectedTeamId, select }}>
      {children}
    </TeamCtx.Provider>
  );
}

export function useTeam() {
  return useContext(TeamCtx);
}
```

### G2.2 App.jsx — обернуть в TeamProvider

```jsx
<AuthProvider>
  <TeamProvider>
    <Routes>...</Routes>
  </TeamProvider>
</AuthProvider>
```

### G2.3 AppHeader — селектор команды

Заменить статичный «Легирус 2010» на dropdown:

```jsx
import { useTeam } from '../contexts/TeamContext';
import { useAuth } from '../contexts/AuthContext';
// ...
const { teams, selectedTeamId, select } = useTeam();
const { user } = useAuth();
const canSwitch = user?.role === 'head_coach';

// Заменить .app-header__club-selector на:
<div className="app-header__team-selector">
  {canSwitch ? (
    <select value={selectedTeamId || ''} onChange={(e) => select(e.target.value)}>
      {teams.filter(t => t.active).map(t => (
        <option key={t.id} value={t.id}>{t.name} · {t.ageGroup}</option>
      ))}
    </select>
  ) : (
    <span className="app-header__team-name">
      {teams.find(t => t.id === selectedTeamId)?.name || '—'}
    </span>
  )}
</div>
```

CSS — стили под select-bling (gold + dark) в духе бренда.

### G2.4 Все API-запросы данных проходят с teamId

В `frontend/src/services/api.js`:

```js
export const fetchPlayers = (teamId) =>
  fetchJson(`/data/players${teamId ? `?teamId=${teamId}` : ''}`);

export const fetchMatches = (teamId) =>
  fetchJson(`/data/matches${teamId ? `?teamId=${teamId}` : ''}`);
```

В страницах:

```jsx
const { selectedTeamId } = useTeam();
const playersRes = useApi(() => fetchPlayers(selectedTeamId), [selectedTeamId]);
const matchesRes = useApi(() => fetchMatches(selectedTeamId), [selectedTeamId]);
```

При смене selectedTeamId — все списки перезагружаются.

### G2.5 Definition of done — Фаза 2

- [ ] head_coach: в шапке dropdown с активными командами; смена команды → перезагрузка `/analytics`, `/matches`, `/players` с данными выбранной команды.
- [ ] team_coach: в шапке текстовое имя команды (без dropdown); никаких UI-возможностей переключиться.
- [ ] player: в шапке текстовое имя команды; «Мой профиль» в SidebarNav указывает на свой `playerId` в своей команде.
- [ ] localStorage помнит выбор head_coach между сессиями.
- [ ] При обновлении страницы выбор сохраняется.

---

## G3. Фаза 3 — PDF Upload через UI

**Цель:** team_coach (или head_coach с выбранной командой) может загрузить PDF Sportvisor; бэк парсит и добавляет матч.

### G3.1 Backend — POST /api/upload-pdf

Уже описано в `TASK_SPEC_FOR_CODE.md` §8 и `SPEC_FIXES_v3.md` D1.6. Конкретно:

`backend/routes/upload.js`:

```js
import express from 'express';
import multer from 'multer';
import { spawn } from 'child_process';
import path from 'path';
import fs from 'fs';
import { authenticate, authorize } from '../middleware/auth.js';
import { appendMatchToIndex, PATHS } from '../services/dataLoader.js';

const router = express.Router();
const upload = multer({ dest: '/tmp', limits: { fileSize: 50 * 1024 * 1024 } });

// Только head_coach и team_coach могут загружать
router.post('/', authenticate, authorize('head_coach', 'team_coach'), upload.single('file'), async (req, res) => {
  const teamId = req.body.teamId || req.user.teamId;
  if (!teamId) return res.status(400).json({ error: 'teamId обязателен' });
  if (req.user.role === 'team_coach' && req.user.teamId !== teamId) {
    return res.status(403).json({ error: 'Можно загружать только для своей команды' });
  }
  if (!req.file) return res.status(400).json({ error: 'PDF не загружен' });

  try {
    // Запускаем парсер (Python child process)
    const pythonBin = process.env.PYTHON_BIN || 'python3';
    const parserScript = path.resolve('parsers', 'build_match.py');

    // Генерируем новый matchId. Берём максимальный + 1.
    const allMatches = fs.readdirSync(PATHS.MATCHES_DIR).filter(f => f.endsWith('.json'));
    const nextNum = allMatches.length + 1;
    const matchId = `match-${String(nextNum).padStart(3, '0')}`;
    const outFile = path.join(PATHS.MATCHES_DIR, `${matchId}.json`);

    const child = spawn(pythonBin, [parserScript, req.file.path, outFile, teamId, matchId]);
    let stderr = '';
    child.stderr.on('data', (d) => { stderr += d.toString(); });

    child.on('close', (code) => {
      // удаляем tmp PDF
      fs.unlink(req.file.path, () => {});
      if (code !== 0) {
        return res.status(500).json({ error: `Парсер упал: ${stderr}` });
      }
      // Читаем результат, добавляем в index
      try {
        const result = JSON.parse(fs.readFileSync(outFile, 'utf-8'));
        appendMatchToIndex({
          id: matchId,
          teamId,
          date: result.date,
          homeTeamId: result.homeTeam?.id,
          score: result.score,
        });
        res.json({ matchId, status: 'ready' });
      } catch (e) {
        res.status(500).json({ error: `Не удалось прочитать результат: ${e.message}` });
      }
    });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

export default router;
```

### G3.2 Парсер на стороне Python

Скрипт `backend/parsers/build_match.py` уже есть, но нужно адаптировать под аргументы:

```python
# Использование: python build_match.py <input.pdf> <output.json> <teamId> <matchId>
```

И в скрипте принимать teamId/matchId, добавлять их в результат, записывать в outFile. Также обрезать карты (crop_maps.py / crop_player_maps.py) и сохранять PNG в `MAPS_DIR/{matchId}-...png`.

Если скрипт сейчас не принимает аргументы — Claude Code должен добавить argparse:

```python
import argparse
parser = argparse.ArgumentParser()
parser.add_argument('input_pdf')
parser.add_argument('output_json')
parser.add_argument('team_id')
parser.add_argument('match_id')
args = parser.parse_args()
# ...
result['id'] = args.match_id
result['teamId'] = args.team_id
```

### G3.3 Frontend — PdfUploadDialog

Компонент уже есть в `frontend/src/components/PdfUploadDialog.jsx`, нужно подключить к API:

```jsx
import { uploadPdf } from '../services/api';
import { useTeam } from '../contexts/TeamContext';
// ...
const { selectedTeamId } = useTeam();
const handleUpload = async (file) => {
  setUploading(true);
  try {
    const result = await uploadPdf(file, selectedTeamId);
    // result = { matchId, status }
    onSuccess(result.matchId);
  } catch (e) {
    setError(e.message);
  } finally {
    setUploading(false);
  }
};
```

В `services/api.js`:

```js
export async function uploadPdf(file, teamId) {
  const fd = new FormData();
  fd.append('file', file);
  if (teamId) fd.append('teamId', teamId);
  const headers = {};
  const token = getToken();
  if (token) headers.Authorization = `Bearer ${token}`;
  const res = await fetch(`${PREFIX}/upload-pdf`, { method: 'POST', body: fd, headers });
  if (!res.ok) {
    const text = await res.text().catch(() => '');
    throw new Error(text || `Upload failed: ${res.status}`);
  }
  return res.json();
}
```

### G3.4 MatchesDashboard — кнопка upload

Кнопка «Загрузить отчёт Sportvisor» уже там. Доработать:
- Видна только для head_coach и team_coach (НЕ player)
- При клике открывается PdfUploadDialog
- После успеха `window.location.reload()` или `setMatchesRes(...)`

### G3.5 Definition of done — Фаза 3

- [ ] team_coach 2010: на /matches видит кнопку «Загрузить»; клик открывает диалог; загружает PDF Sportvisor для команды 2010 — через 30–60 сек появляется новый матч в списке.
- [ ] team_coach 2010 не может загружать PDF для команды 2011 (бэк отдаёт 403).
- [ ] head_coach: может загружать для любой выбранной команды.
- [ ] player: кнопки «Загрузить» нет.
- [ ] При загрузке невалидного PDF (не Sportvisor) — внятная ошибка в UI.
- [ ] Новые карты PNG лежат в /var/data/maps и доступны через /assets/maps/.

---

## G4. Фаза 4 — UI создания команд и игроков (опционально, для будущего)

**Цель:** head_coach может создать новую команду и добавить ростер без правки JSON руками.

Это **опциональная фаза**, можно отложить — до неё команды создаются через скрипт `seed-teams.js` или ручную правку `teams.json`.

Если решим делать:
- `POST /api/data/teams` (head_coach) — создание новой команды
- `POST /api/data/players` (head_coach или team_coach) — добавление игрока
- `PATCH /api/data/players/:id` — редактирование (минуты, фото, имя)
- UI: страница `/admin/teams` и `/admin/players`

Не входит в этот документ — отдельная спека позже, если понадобится.

---

## G5. Что не меняется

- Парсеры PDF — уже работают (рукояли в `backend/parsers/`), нужны небольшие правки под teamId/matchId аргументы.
- Существующий рендер /analytics, /matches/:id, /players, /players/:id — логика та же, просто данные приходят другие через teamId-фильтр.
- ID игроков (`p17-turapin`) и матчей (`match-001`) — остаются прежними; новые матчи получают `match-002`, `match-003` и т.д.
- Auth, JWT, .gitignore (users.json/credentials.txt в ignore) — без изменений.

---

## G6. Карта изменяемых файлов (по фазам)

### Фаза 1 — данные и backend

```
ИЗМЕНЯЮТСЯ:
~ backend/data/teams.json                  (массив команд клуба)
~ backend/data/players.json                (поле teamId у каждого)
~ backend/data/matches.json                (поле teamId у каждой записи)
~ backend/data/matches/match-001.json     (поле teamId на корневом уровне)
~ backend/middleware/auth.js               (req.user.teamId, authorizeTeam helper)
~ backend/routes/data.js                   (фильтрация по teamId/role)
~ backend/scripts/seed-users.js            (роли head_coach/team_coach)

СОЗДАЁТСЯ:
+ backend/scripts/migrate-add-teamid.js    (одноразовый: добавить teamId в существующие данные)
```

### Фаза 2 — UI селектор и фильтр

```
ИЗМЕНЯЮТСЯ:
~ frontend/src/services/api.js             (fetchPlayers(teamId), fetchMatches(teamId))
~ frontend/src/App.jsx                     (TeamProvider обёртка)
~ frontend/src/components/AppHeader.jsx    (селектор команды)
~ frontend/src/components/AppHeader.css    (стили dropdown)
~ frontend/src/components/SidebarNav.jsx   (учитывает useTeam)
~ frontend/src/pages/ClubOverview.jsx      (selectedTeamId как зависимость)
~ frontend/src/pages/MatchesDashboard.jsx
~ frontend/src/pages/PlayersLeaders.jsx
~ frontend/src/pages/PlayersRating.jsx
~ frontend/src/pages/PlayerDetail.jsx
~ frontend/src/pages/MatchDetail.jsx
~ frontend/src/pages/ComparisonView.jsx

СОЗДАЁТСЯ:
+ frontend/src/contexts/TeamContext.jsx
```

### Фаза 3 — PDF upload

```
ИЗМЕНЯЮТСЯ:
~ backend/routes/upload.js                 (полная реализация)
~ backend/parsers/build_match.py           (argparse на teamId/matchId)
~ backend/parsers/crop_maps.py             (matchId-префикс в именах PNG)
~ backend/parsers/crop_player_maps.py      (matchId-префикс)
~ frontend/src/services/api.js             (uploadPdf принимает teamId)
~ frontend/src/components/PdfUploadDialog.jsx (вызов uploadPdf)
~ frontend/src/pages/MatchesDashboard.jsx  (кнопка только для coach-ролей)
```

---

## G7. Порядок реализации

1. **Фаза 1** (1–2 дня): миграция + бэк → деплой → проверить что фронт продолжает работать как раньше.
2. **Фаза 2** (1 день): UI селектор → деплой → создать вторую команду в teams.json (active: true) для проверки переключения.
3. **Фаза 3** (1–2 дня): PDF upload → деплой → проверить на тестовом Sportvisor PDF.
4. **Фаза 4** (опционально): UI создания команд/игроков.

После каждой фазы — git push + smoke-test на проде. Не делать всё одним коммитом — слишком большой риск регрессии.

---

## G8. Команды для Claude Code (Фаза 1, потом отдельно по каждой)

```
Реализуй Фазу 1 из SPEC_SCALE_v1.md (G1) — миграция модели данных
и backend для мульти-команд. Фронт пока не трогаем.

Шаги:
1. Прочитай SPEC_SCALE_v1.md, особенно G1.1–G1.6.
2. Расширь backend/data/teams.json по образцу из G1.1 (одна команда
   active: legirus-2010, остальные 4 как inactive placeholder).
3. Запусти node-скрипт чтобы добавить teamId='legirus-2010' ко всем
   игрокам в players.json и к match-001.json (как в индексе, так
   и в файле). Закоммить как один коммит "data: add teamId field".
4. Перепиши backend/routes/data.js согласно G1.5 — фильтрация по
   teamId и роли.
5. Расширь backend/middleware/auth.js: добавь req.user.teamId,
   helper authorizeTeam.
6. Обнови backend/scripts/seed-users.js — поддержка трёх ролей
   (head_coach с teamId=null, team_coach с teamId, player как было,
   но + teamId).
7. ВАЖНО: для существующих учёток на Render — добавь скрипт
   backend/scripts/migrate-users-add-teamid.js, который добавит
   role='head_coach' старому coach (если был) и teamId='legirus-2010'
   всем игрокам. Запустить ОДИН РАЗ в Render Shell — пользователь
   сам сделает после деплоя.
8. npm run build для backend (проверить что не сломали).
9. git commit + git push.
10. После деплоя в Render → пользователь запустит migrate-users-add-teamid.js
    в Shell.

Smoke-test после Фазы 1:
- На /api/data/teams для head_coach: возвращает массив с >= 2 элементов.
- /api/data/match/match-001 для head_coach: 200 + полный объект.
- /api/data/match/match-001 для team_coach с teamId='legirus-2011': 403.
- Существующий фронт показывает Легирус 2010 как раньше (не сломался).

Не трогай:
  - frontend/* (Фаза 2 — отдельный коммит)
  - backend/parsers/* (Фаза 3)
  - все ассеты (фото, лого, карты)
```

После Фазы 1 — отдельные команды для Фазы 2 и Фазы 3, формулируем когда время дойдёт.

---

## Контакт

- Проект: «Экран Легирус» (АванDата × Академия Легирус)
- Бренд: SportData (`ai4sportdata@gmail.com`)
- Дата спеки: 30.04.2026
- Связана с: SPEC_FIXES_v3 (auth и роли) — теперь расширяются; SPEC_FIXES_v5 (фильтр player) — остаётся, но дополняется teamId-проверкой
- Следующие итерации: Фаза 4 (UI управления командами), история сезона, сравнение между командами, экспорт отчётов
