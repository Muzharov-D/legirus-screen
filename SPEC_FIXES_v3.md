# SPEC_FIXES_v3.md — Аутентификация, роли и деплой

**Дата:** 2026-04-30
**Статус:** к реализации Claude Code
**Контекст:** третья итерация. Нужно ввести логин/пароль, две роли (тренер / игрок), фильтрацию данных на бэке, защиту от перехода в чужой профиль и подготовить полные команды для деплоя на Render + Vercel.

Все правки строго в `C:\Users\dmuzharov\Documents\Claude\Projects\Экран Легирус`.

---

## D0. Итоговая модель доступа

| Роль   | Доступ |
|--------|--------|
| `coach` | Полный — все экраны, командные дашборды, все 15 профилей игроков, загрузка PDF, ИИ-агент |
| `player` | Командные дашборды (`/analytics`, `/matches`, `/matches/:id`, `/players` — список лидеров и таблица рейтинга — публичные); собственный «золотой профиль» (`/players/{ownId}`); ИИ-агент. **НЕТ:** доступа в чужие профили, НЕТ загрузки PDF |

**Принцип «защиты в глубину»:**

- Frontend: меню/кнопки фильтруются по роли + редирект `/players/{otherId}` → `/players/{ownId}` для роли player.
- Backend: middleware валидирует JWT; `/api/data/match/:id` для роли player возвращает объект, в котором `players[]` усечён до одного игрока (своего); `/api/upload-pdf` доступен только coach.

Без обоих уровней защиты система не считается готовой.

---

## D1. Backend — auth и фильтрация данных

### D1.1 Зависимости

`backend/package.json` → добавить в `dependencies`:

```json
{
  "dependencies": {
    "bcryptjs": "^2.4.3",
    "cors": "^2.8.5",
    "express": "^4.19.2",
    "express-rate-limit": "^7.4.0",
    "jsonwebtoken": "^9.0.2",
    "multer": "^1.4.5-lts.1"
  }
}
```

Установить: `cd backend && npm install`.

`bcryptjs` (а не `bcrypt`) выбран намеренно — pure-JS, не требует native build на Render.

---

### D1.2 Хранилище пользователей

**Файл:** `backend/data/users.json` — НЕ коммитить с реальными хэшами; коммитить пустой шаблон. Реальный файл создаётся скриптом seed-users (см. D1.7) и хранится:

- В разработке: `backend/data/users.json` (gitignore)
- В продакшне на Render: `/var/data/users.json` (persistent disk; путь задаётся env `USERS_PATH`)

Формат:

```json
{
  "users": [
    {
      "id": "u-coach",
      "username": "coach",
      "passwordHash": "$2a$10$....",
      "role": "coach",
      "fullName": "Главный тренер",
      "createdAt": "2026-04-30T10:00:00Z"
    },
    {
      "id": "u-p17-turapin",
      "username": "turapin",
      "passwordHash": "$2a$10$....",
      "role": "player",
      "playerId": "p17-turapin",
      "fullName": "Матвей Турапин",
      "createdAt": "2026-04-30T10:00:00Z"
    }
  ]
}
```

Поле `playerId` обязательно для роли `player` и должно совпадать с одним из ID в `players.json`.

**Также добавить в `backend/.gitignore`:**

```
data/users.json
.env
```

---

### D1.3 Сервис userStore

**Новый файл:** `backend/services/userStore.js`:

```js
import fs from 'fs';
import path from 'path';
import bcrypt from 'bcryptjs';
import { PATHS } from './dataLoader.js';

const USERS_PATH = process.env.USERS_PATH
  ? path.resolve(process.env.USERS_PATH)
  : path.join(PATHS.DATA_DIR, 'users.json');

let _cache = null;

function load() {
  if (_cache) return _cache;
  if (!fs.existsSync(USERS_PATH)) {
    _cache = { users: [] };
    return _cache;
  }
  _cache = JSON.parse(fs.readFileSync(USERS_PATH, 'utf-8'));
  return _cache;
}

export function invalidateUsersCache() { _cache = null; }

export function findUserByUsername(username) {
  if (!username) return null;
  return load().users.find((u) => u.username === username);
}

export function findUserById(id) {
  if (!id) return null;
  return load().users.find((u) => u.id === id);
}

export async function verifyPassword(user, password) {
  if (!user || !user.passwordHash || !password) return false;
  return bcrypt.compare(password, user.passwordHash);
}

export function getUsersFilePath() { return USERS_PATH; }

export function listUsers() {
  return load().users.map(({ passwordHash, ...rest }) => rest);
}

export function persist(users) {
  const dir = path.dirname(USERS_PATH);
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(USERS_PATH, JSON.stringify({ users }, null, 2), 'utf-8');
  invalidateUsersCache();
}
```

---

### D1.4 Middleware auth

**Новый файл:** `backend/middleware/auth.js`:

```js
import jwt from 'jsonwebtoken';
import { findUserById } from '../services/userStore.js';

const SECRET = process.env.JWT_SECRET || 'dev-secret-change-me-in-prod';

if (process.env.NODE_ENV === 'production' && SECRET === 'dev-secret-change-me-in-prod') {
  console.error('FATAL: JWT_SECRET не задан в продакшне.');
  process.exit(1);
}

export function authenticate(req, res, next) {
  const auth = req.headers.authorization || '';
  const token = auth.startsWith('Bearer ') ? auth.slice(7) : null;
  if (!token) return res.status(401).json({ error: 'Требуется авторизация' });

  try {
    const payload = jwt.verify(token, SECRET);
    const user = findUserById(payload.userId);
    if (!user) return res.status(401).json({ error: 'Пользователь не найден' });
    req.user = {
      id: user.id,
      username: user.username,
      role: user.role,
      playerId: user.playerId || null,
      fullName: user.fullName,
    };
    next();
  } catch (e) {
    return res.status(401).json({ error: 'Недействительный или истёкший токен' });
  }
}

export function authorize(...roles) {
  return (req, res, next) => {
    if (!req.user) return res.status(401).json({ error: 'Требуется авторизация' });
    if (roles.length && !roles.includes(req.user.role)) {
      return res.status(403).json({ error: 'Доступ запрещён' });
    }
    next();
  };
}

export const SIGNING_SECRET = SECRET;
```

---

### D1.5 Routes — `/api/auth`

**Новый файл:** `backend/routes/auth.js`:

```js
import express from 'express';
import jwt from 'jsonwebtoken';
import rateLimit from 'express-rate-limit';
import { findUserByUsername, verifyPassword } from '../services/userStore.js';
import { authenticate, SIGNING_SECRET } from '../middleware/auth.js';

const router = express.Router();

const loginLimiter = rateLimit({
  windowMs: 60 * 1000,
  max: 8,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'Слишком много попыток. Подождите минуту.' },
});

router.post('/login', loginLimiter, async (req, res) => {
  const { username, password } = req.body || {};
  if (!username || !password) {
    return res.status(400).json({ error: 'Логин и пароль обязательны' });
  }
  const user = findUserByUsername(String(username).toLowerCase().trim());
  if (!user) return res.status(401).json({ error: 'Неверный логин или пароль' });
  const ok = await verifyPassword(user, password);
  if (!ok) return res.status(401).json({ error: 'Неверный логин или пароль' });

  const token = jwt.sign(
    { userId: user.id, role: user.role },
    SIGNING_SECRET,
    { expiresIn: '7d' }
  );
  res.json({
    token,
    user: {
      id: user.id,
      username: user.username,
      role: user.role,
      playerId: user.playerId || null,
      fullName: user.fullName,
    },
  });
});

router.get('/me', authenticate, (req, res) => res.json({ user: req.user }));

export default router;
```

---

### D1.6 Изменения в `backend/server.js`

Заменить блок маршрутов:

```js
import express from 'express';
import cors from 'cors';
import path from 'path';
import { fileURLToPath } from 'url';
import dataRoutes from './routes/data.js';
import agentRoutes from './routes/agent.js';
import uploadRoutes from './routes/upload.js';
import authRoutes from './routes/auth.js';
import { authenticate, authorize } from './middleware/auth.js';
import { ensureMatchesDir } from './services/dataLoader.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
const PORT = process.env.PORT || 4000;
const CORS_ORIGIN = process.env.CORS_ORIGIN || '*';

app.use(cors({ origin: CORS_ORIGIN }));
app.use(express.json({ limit: '5mb' }));

const ASSETS_DIR = path.resolve(__dirname, '..', 'frontend', 'public', 'assets');
const MAPS_DIR = process.env.MAPS_DIR
  ? path.resolve(process.env.MAPS_DIR)
  : path.join(ASSETS_DIR, 'maps');
app.use('/assets/maps', express.static(MAPS_DIR));
app.use('/assets', express.static(ASSETS_DIR));

app.get('/api/health', (_req, res) => res.json({ status: 'ok' }));

// Public
app.use('/api/auth', authRoutes);

// Protected
app.use('/api/data', authenticate, dataRoutes);
app.use('/api/agent', authenticate, agentRoutes);
app.use('/api/upload-pdf', authenticate, authorize('coach'), uploadRoutes);

ensureMatchesDir();

app.listen(PORT, () => {
  console.log(`Backend listening on :${PORT}`);
});
```

---

### D1.7 Скрипт первичного посева пользователей

**Новый файл:** `backend/scripts/seed-users.js`:

```js
// Запуск:  node scripts/seed-users.js
// Создаёт users.json (тренер + 15 игроков) с bcrypt-хэшами и выводит пары login:password.
import fs from 'fs';
import path from 'path';
import bcrypt from 'bcryptjs';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const DATA_DIR = path.resolve(__dirname, '..', 'data');

const USERS_PATH = process.env.USERS_PATH || path.join(DATA_DIR, 'users.json');

function transliterate(s) {
  const map = {
    а:'a', б:'b', в:'v', г:'g', д:'d', е:'e', ё:'e', ж:'zh', з:'z', и:'i', й:'y',
    к:'k', л:'l', м:'m', н:'n', о:'o', п:'p', р:'r', с:'s', т:'t', у:'u', ф:'f',
    х:'h', ц:'ts', ч:'ch', ш:'sh', щ:'sch', ъ:'', ы:'y', ь:'', э:'e', ю:'yu', я:'ya',
  };
  return String(s || '').toLowerCase().split('').map((c) => map[c] ?? c).join('').replace(/[^a-z0-9]/g, '');
}

function genPassword() {
  // короткий, читаемый пароль 10 символов
  const alpha = 'abcdefghjkmnpqrstuvwxyz';
  const digit = '23456789';
  let s = '';
  for (let i = 0; i < 7; i++) s += alpha[Math.floor(Math.random() * alpha.length)];
  for (let i = 0; i < 3; i++) s += digit[Math.floor(Math.random() * digit.length)];
  return s;
}

async function main() {
  if (fs.existsSync(USERS_PATH)) {
    console.error(`users.json уже существует: ${USERS_PATH}`);
    console.error('Удалите файл вручную, если хотите пересоздать. Скрипт прерван.');
    process.exit(1);
  }

  const playersPath = path.join(DATA_DIR, 'players.json');
  const players = JSON.parse(fs.readFileSync(playersPath, 'utf-8'));

  const users = [];
  const credentials = [];

  // тренер
  const coachPwd = genPassword();
  users.push({
    id: 'u-coach',
    username: 'coach',
    passwordHash: bcrypt.hashSync(coachPwd, 10),
    role: 'coach',
    fullName: 'Главный тренер',
    createdAt: new Date().toISOString(),
  });
  credentials.push({ login: 'coach', password: coachPwd, role: 'coach', name: 'Главный тренер' });

  // игроки
  const usedUsernames = new Set(['coach']);
  for (const p of players.players) {
    let base = transliterate(p.lastName || p.fullName || p.id);
    if (!base) base = p.id.replace(/[^a-z0-9]/g, '');
    let username = base;
    let i = 2;
    while (usedUsernames.has(username)) {
      username = `${base}${i++}`;
    }
    usedUsernames.add(username);

    const pwd = genPassword();
    users.push({
      id: `u-${p.id}`,
      username,
      passwordHash: bcrypt.hashSync(pwd, 10),
      role: 'player',
      playerId: p.id,
      fullName: p.fullName,
      createdAt: new Date().toISOString(),
    });
    credentials.push({ login: username, password: pwd, role: 'player', playerId: p.id, name: p.fullName });
  }

  const dir = path.dirname(USERS_PATH);
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(USERS_PATH, JSON.stringify({ users }, null, 2), 'utf-8');

  // Также сохраняем plain credentials в credentials.txt (рядом с users.json) — для тренера.
  const credPath = path.join(dir, 'credentials.txt');
  const credText = [
    '# Учётные записи Легирус 2010 — сгенерированы автоматически',
    `# Дата: ${new Date().toISOString()}`,
    '# ВАЖНО: после раздачи учёток удалите этот файл.',
    '',
    ...credentials.map((c) =>
      `${c.role.padEnd(7)}  ${c.login.padEnd(20)}  ${c.password}  ${c.playerId || ''}  ${c.name}`
    ),
    '',
  ].join('\n');
  fs.writeFileSync(credPath, credText, 'utf-8');

  console.log(`✅ Создано ${users.length} пользователей в ${USERS_PATH}`);
  console.log(`✅ Реквизиты сохранены в ${credPath}`);
  console.log('\nПервые учётки:');
  for (const c of credentials.slice(0, 3)) {
    console.log(`  ${c.login} / ${c.password}  (${c.role}) ${c.name}`);
  }
  console.log('\n⚠️ После раздачи учёток удалите credentials.txt');
}

main().catch((e) => { console.error(e); process.exit(1); });
```

---

### D1.8 Фильтрация match для роли player

**Файл:** `backend/routes/data.js` — заменить:

```js
import express from 'express';
import {
  loadTeams,
  loadPlayers,
  loadMetrics,
  loadMatchesIndex,
  loadMatch,
} from '../services/dataLoader.js';

const router = express.Router();

router.get('/teams', (_req, res) => {
  try { res.json(loadTeams()); }
  catch (e) { res.status(500).json({ error: e.message }); }
});

router.get('/players', (_req, res) => {
  try { res.json(loadPlayers()); } // публичный справочник: имя, номер, фото, позиция
  catch (e) { res.status(500).json({ error: e.message }); }
});

router.get('/metrics', (_req, res) => {
  try { res.json(loadMetrics()); }
  catch (e) { res.status(500).json({ error: e.message }); }
});

router.get('/matches', (_req, res) => {
  try { res.json(loadMatchesIndex()); }
  catch (e) { res.status(500).json({ error: e.message }); }
});

router.get('/match/:matchId', (req, res) => {
  try {
    const match = loadMatch(req.params.matchId);

    if (req.user?.role === 'player') {
      const ownId = req.user.playerId;
      const owned = (match.players || []).find((p) => p.id === ownId);
      const filtered = {
        ...match,
        // оставляем только свой объект игрока со статистикой/splits/maps;
        // командные данные (teamSummaryStats, teamAggregates, formation, score, teamAvgRatings)
        // остаются как есть — это «общая командная статистика».
        players: owned ? [owned] : [],
        _filteredFor: ownId, // отметка для отладки на фронте
      };
      return res.json(filtered);
    }

    res.json(match);
  } catch (e) {
    res.status(404).json({ error: `Матч ${req.params.matchId} не найден` });
  }
});

export default router;
```

⚠️ Команды (`teams`, `players`-справочник, `matches`-индекс, `metrics`) — отдаются полностью обеим ролям: это публичные сведения (имя, номер, фото, позиция, общий рейтинг — он виден на формации в командных дашбордах).

Если потребуется в будущем скрыть индивидуальные рейтинги от игроков — **точка изменения именно эта функция** + аналогичный фильтр в `formation.starters`.

---

### D1.9 render.yaml — обновить

```yaml
services:
  - type: web
    name: legirus-api
    runtime: node
    rootDir: backend
    plan: starter
    healthCheckPath: /api/health
    buildCommand: |
      apt-get update && apt-get install -y poppler-utils python3-full python3-pip
      pip3 install --break-system-packages pdfplumber pillow
      npm install
    startCommand: npm start
    disk:
      name: matches-disk
      mountPath: /var/data
      sizeGB: 5
    envVars:
      - key: NODE_VERSION
        value: 20.11.1
      - key: NODE_ENV
        value: production
      - key: PYTHON_BIN
        value: python3
      - key: MATCHES_DIR
        value: /var/data/matches
      - key: MAPS_DIR
        value: /var/data/maps
      - key: USERS_PATH
        value: /var/data/users.json
      - key: CORS_ORIGIN
        sync: false        # задаётся вручную после первого деплоя Vercel
      - key: JWT_SECRET
        generateValue: true # Render сам сгенерит криптографически стойкий секрет
```

---

## D2. Frontend — auth, защита роутов, фильтр UI

### D2.1 services/api.js — token + 401 handler

Заменить файл целиком:

```js
const RAW_BASE = import.meta.env.VITE_API_BASE_URL || '';
const API_BASE = String(RAW_BASE).replace(/\/+$/, '');
const PREFIX = `${API_BASE}/api`;
const TOKEN_KEY = 'legirus.auth.token';

export function getToken() { return localStorage.getItem(TOKEN_KEY); }
export function setToken(t) {
  if (t) localStorage.setItem(TOKEN_KEY, t);
  else localStorage.removeItem(TOKEN_KEY);
}

async function fetchJson(path, opts = {}) {
  const token = getToken();
  const headers = { ...(opts.headers || {}) };
  if (token) headers.Authorization = `Bearer ${token}`;

  const res = await fetch(`${PREFIX}${path}`, { ...opts, headers });

  if (res.status === 401) {
    setToken(null);
    if (typeof window !== 'undefined' && window.location.pathname !== '/login') {
      window.location.href = '/login';
    }
    throw new Error('Не авторизован');
  }
  if (!res.ok) {
    const text = await res.text().catch(() => '');
    let msg = `API ${res.status}: ${res.statusText}`;
    try { msg = JSON.parse(text).error || msg; } catch (_) { if (text) msg = text; }
    throw new Error(msg);
  }
  return res.json();
}

// Auth
export async function login(username, password) {
  const res = await fetch(`${PREFIX}/auth/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ username, password }),
  });
  const text = await res.text().catch(() => '');
  if (!res.ok) {
    let msg = `Ошибка входа (${res.status})`;
    try { msg = JSON.parse(text).error || msg; } catch (_) { if (text) msg = text; }
    throw new Error(msg);
  }
  const data = JSON.parse(text);
  setToken(data.token);
  return data.user;
}
export async function fetchMe() { return fetchJson('/auth/me'); }
export function logout() { setToken(null); }

// Data
export const fetchTeams = () => fetchJson('/data/teams');
export const fetchPlayers = () => fetchJson('/data/players');
export const fetchMatches = () => fetchJson('/data/matches');
export const fetchMatch = (id) => fetchJson(`/data/match/${id}`);
export const fetchMetrics = () => fetchJson('/data/metrics');

export async function fetchAgentInsight(screenId, context) {
  return fetchJson('/agent/insight', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ screenId, context: context || {} }),
  });
}

export async function uploadPdf(file) {
  const fd = new FormData();
  fd.append('file', file);
  const headers = {};
  const token = getToken();
  if (token) headers.Authorization = `Bearer ${token}`;
  const res = await fetch(`${PREFIX}/upload-pdf`, { method: 'POST', body: fd, headers });
  if (res.status === 401) {
    setToken(null);
    window.location.href = '/login';
    throw new Error('Не авторизован');
  }
  if (!res.ok) {
    const text = await res.text().catch(() => '');
    throw new Error(text || `Upload failed: ${res.status}`);
  }
  return res.json();
}

export function toAssetUrl(p) {
  if (!p) return null;
  if (/^https?:\/\//i.test(p)) return p;
  if (p.startsWith('/assets')) return API_BASE ? `${API_BASE}${p}` : p;
  return p;
}
```

---

### D2.2 AuthContext

**Новый файл:** `frontend/src/contexts/AuthContext.jsx`:

```jsx
import { createContext, useContext, useEffect, useState } from 'react';
import { fetchMe, login as apiLogin, logout as apiLogout, getToken } from '../services/api';

const AuthCtx = createContext(null);

export function AuthProvider({ children }) {
  const [user, setUser] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!getToken()) { setLoading(false); return; }
    fetchMe()
      .then(({ user }) => setUser(user))
      .catch(() => setUser(null))
      .finally(() => setLoading(false));
  }, []);

  const value = {
    user,
    loading,
    isAuthenticated: !!user,
    isCoach: user?.role === 'coach',
    isPlayer: user?.role === 'player',
    canSeePlayer: (playerId) =>
      user?.role === 'coach' || (user?.role === 'player' && user.playerId === playerId),
    login: async (u, p) => {
      const usr = await apiLogin(u, p);
      setUser(usr);
      return usr;
    },
    logout: () => { apiLogout(); setUser(null); },
  };
  return <AuthCtx.Provider value={value}>{children}</AuthCtx.Provider>;
}

export function useAuth() {
  const ctx = useContext(AuthCtx);
  if (!ctx) throw new Error('useAuth должен использоваться внутри AuthProvider');
  return ctx;
}
```

---

### D2.3 ProtectedRoute

**Новый файл:** `frontend/src/components/ProtectedRoute.jsx`:

```jsx
import { Navigate, useLocation } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';

export default function ProtectedRoute({ children, roles }) {
  const { user, loading } = useAuth();
  const location = useLocation();

  if (loading) return <div className="empty-state">Проверка авторизации…</div>;
  if (!user) return <Navigate to="/login" replace state={{ from: location }} />;
  if (roles && roles.length && !roles.includes(user.role)) {
    return <Navigate to="/analytics" replace />;
  }
  return children;
}
```

---

### D2.4 Login page

**Новый файл:** `frontend/src/pages/Login.jsx`:

```jsx
import { useState } from 'react';
import { useNavigate, useLocation, Navigate } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';
import './Login.css';

export default function Login() {
  const { login, user } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const [u, setU] = useState('');
  const [p, setP] = useState('');
  const [error, setError] = useState(null);
  const [busy, setBusy] = useState(false);

  if (user) return <Navigate to="/analytics" replace />;

  async function submit(e) {
    e.preventDefault();
    setError(null); setBusy(true);
    try {
      await login(u.trim().toLowerCase(), p);
      const from = location.state?.from?.pathname || '/analytics';
      navigate(from, { replace: true });
    } catch (err) {
      setError(err.message || 'Ошибка входа');
    } finally { setBusy(false); }
  }

  return (
    <div className="login-page">
      <div className="login-card">
        <div className="login-brand">
          <img src="/assets/logos/log-3_white.png" alt="АванDата" />
          <span className="login-brand__sep">×</span>
          <img src="/assets/logos/legirus.png" alt="ФК Легирус" />
        </div>
        <h1 className="login-title">Вход в систему</h1>
        <div className="login-sub">Золотой профиль спортсмена</div>
        <form className="login-form" onSubmit={submit}>
          <label>Логин</label>
          <input
            type="text"
            value={u}
            onChange={(e) => setU(e.target.value)}
            autoComplete="username"
            autoFocus
            required
          />
          <label>Пароль</label>
          <input
            type="password"
            value={p}
            onChange={(e) => setP(e.target.value)}
            autoComplete="current-password"
            required
          />
          {error && <div className="login-error">{error}</div>}
          <button type="submit" disabled={busy}>
            {busy ? 'Проверка…' : 'Войти'}
          </button>
        </form>
        <div className="login-help">
          Нет учётной записи? Обратитесь к тренеру.
        </div>
      </div>
    </div>
  );
}
```

**Новый файл:** `frontend/src/pages/Login.css`:

```css
.login-page {
  min-height: 100vh;
  min-width: 100vw;
  display: flex;
  align-items: center;
  justify-content: center;
  background:
    linear-gradient(180deg, rgba(7, 7, 28, 0.92) 0%, rgba(14, 14, 42, 0.95) 100%),
    url('/assets/logos/fon-2_Монтажная область 1.jpg') center / cover no-repeat;
  font-family: 'Inter', system-ui, sans-serif;
  color: #fff;
}

.login-card {
  width: 420px;
  background: rgba(20, 20, 60, 0.85);
  border: 1px solid rgba(255, 208, 0, 0.25);
  border-radius: 14px;
  padding: 32px 32px 28px;
  box-shadow: 0 20px 50px rgba(0, 0, 0, 0.5);
  backdrop-filter: blur(8px);
}
.login-brand {
  display: flex; align-items: center; gap: 12px;
  margin-bottom: 18px;
}
.login-brand img { height: 36px; width: auto; }
.login-brand__sep { color: rgba(255, 208, 0, 0.7); font-size: 22px; }
.login-title { font-size: 22px; font-weight: 800; margin: 6px 0 4px; }
.login-sub {
  font-size: 12px;
  text-transform: uppercase;
  letter-spacing: 0.06em;
  color: rgba(255, 208, 0, 0.7);
  margin-bottom: 22px;
}
.login-form { display: flex; flex-direction: column; gap: 8px; }
.login-form label {
  font-size: 11px;
  text-transform: uppercase;
  letter-spacing: 0.05em;
  color: rgba(255, 255, 255, 0.5);
  margin-top: 6px;
}
.login-form input {
  background: rgba(255, 255, 255, 0.05);
  border: 1px solid rgba(255, 255, 255, 0.12);
  color: #fff;
  font-size: 14px;
  padding: 10px 12px;
  border-radius: 8px;
  font-family: inherit;
  outline: none;
}
.login-form input:focus { border-color: rgba(255, 208, 0, 0.5); }
.login-form button {
  margin-top: 14px;
  background: linear-gradient(135deg, #ffd000 0%, #ffae00 100%);
  color: #0e0e2a;
  border: none;
  font-weight: 800;
  font-size: 14px;
  padding: 12px 14px;
  border-radius: 10px;
  cursor: pointer;
  transition: filter 0.15s;
  font-family: inherit;
}
.login-form button:hover:not(:disabled) { filter: brightness(1.1); }
.login-form button:disabled { opacity: 0.5; cursor: wait; }
.login-error {
  background: rgba(211, 47, 47, 0.18);
  border: 1px solid rgba(211, 47, 47, 0.4);
  color: #ff8a8a;
  padding: 8px 10px;
  border-radius: 8px;
  font-size: 13px;
  margin-top: 6px;
}
.login-help {
  margin-top: 18px;
  font-size: 12px;
  color: rgba(255, 255, 255, 0.45);
  text-align: center;
}
```

---

### D2.5 App.jsx — обернуть в AuthProvider, добавить /login и Protected

Заменить:

```jsx
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { AuthProvider } from './contexts/AuthContext';
import ProtectedRoute from './components/ProtectedRoute';
import MainLayout from './layouts/MainLayout';
import Login from './pages/Login';
import ClubOverview from './pages/ClubOverview';
import MatchesDashboard from './pages/MatchesDashboard';
import MatchDetail from './pages/MatchDetail';
import ComparisonView from './pages/ComparisonView';
import PlayersLeaders from './pages/PlayersLeaders';
import PlayersRating from './pages/PlayersRating';
import PlayerDetail from './pages/PlayerDetail';
import ErrorBoundary from './components/ErrorBoundary';
import './App.css';

export default function App() {
  return (
    <ErrorBoundary>
      <BrowserRouter>
        <AuthProvider>
          <Routes>
            <Route path="/login" element={<Login />} />
            <Route element={<ProtectedRoute><MainLayout /></ProtectedRoute>}>
              <Route path="/" element={<Navigate to="/analytics" replace />} />
              <Route path="/analytics" element={<ClubOverview />} />
              <Route path="/analytics/team" element={<ComparisonView />} />
              <Route path="/matches" element={<MatchesDashboard />} />
              <Route path="/matches/:matchId" element={<MatchDetail />} />
              <Route path="/players" element={<PlayersLeaders />} />
              <Route path="/players/rating" element={<PlayersRating />} />
              <Route path="/players/:playerId" element={<PlayerDetail />} />
              <Route path="*" element={<Navigate to="/analytics" replace />} />
            </Route>
          </Routes>
        </AuthProvider>
      </BrowserRouter>
    </ErrorBoundary>
  );
}
```

---

### D2.6 AppHeader — отображение пользователя и logout

В `frontend/src/components/AppHeader.jsx` после `<div className="app-header__right">` добавить блок (перед существующими кнопками):

```jsx
import { useAuth } from '../contexts/AuthContext';
// ...
const { user, logout } = useAuth();
// ...
{user && (
  <div className="app-header__user">
    <div className="app-header__user-name">{user.fullName}</div>
    <div className="app-header__user-role">
      {user.role === 'coach' ? 'Тренер' : 'Игрок'}
    </div>
  </div>
)}
{user && (
  <button
    className="app-header__btn app-header__btn--logout"
    onClick={() => logout()}
    title="Выйти"
  >Выход</button>
)}
```

CSS — дописать в `AppHeader.css`:

```css
.app-header__user {
  display: flex;
  flex-direction: column;
  line-height: 1.15;
  margin-right: 6px;
  text-align: right;
}
.app-header__user-name { font-size: 13px; color: #fff; font-weight: 600; }
.app-header__user-role {
  font-size: 10px;
  color: rgba(255, 208, 0, 0.7);
  text-transform: uppercase;
  letter-spacing: 0.05em;
}
.app-header__btn--logout {
  cursor: pointer;
  color: rgba(255, 255, 255, 0.85);
}
.app-header__btn--logout:hover { color: #ffd000; background: rgba(255, 208, 0, 0.1); }
```

---

### D2.7 SidebarNav — фильтр по роли

В `frontend/src/components/SidebarNav.jsx` ограничить пункты для роли player. Конкретно: пункт «Аналитика» доступен обоим, «Матч» — обоим, «Игроки» — обоим (но внутри будет редирект). Можно дополнительно добавить пункт «Мой профиль» для player вместо обобщённого «Игроки»:

```jsx
import { useAuth } from '../contexts/AuthContext';
// ...
const { user, isPlayer } = useAuth();
const navItems = [
  { id: 'analytics', label: 'Аналитика', path: '/analytics', icon: '◉' },
  { id: 'matches',   label: 'Матч',      path: '/matches',   icon: '⚽' },
  isPlayer
    ? { id: 'me', label: 'Мой профиль', path: `/players/${user.playerId}`, icon: '👤' }
    : { id: 'players', label: 'Игроки', path: '/players', icon: '👤' },
];
```

И обновить `isActive` для нового пункта `me` (срабатывает на `/players/:id` где id == user.playerId).

---

### D2.8 PlayerDetail — редирект для чужого профиля

В `frontend/src/pages/PlayerDetail.jsx` добавить (в начале функции, после useParams):

```jsx
import { useAuth } from '../contexts/AuthContext';
// ...
const { user, isPlayer } = useAuth();
useEffect(() => {
  if (isPlayer && user?.playerId && user.playerId !== playerId) {
    navigate(`/players/${user.playerId}`, { replace: true });
  }
}, [isPlayer, user, playerId, navigate]);
```

Этот эффект должен сработать ДО любых fetch'ей; пользователь не увидит чужие данные ни на мгновение, потому что бэк всё равно вернёт ему только свои.

Также добавить id-атрибуты на секции для anchor-навигации из ИИ-агента (см. SPEC_FIXES_v2.md C2.4): `id="vs-team"`, `id="by-position"`, `id="halftime"`.

---

### D2.9 PlayersRating + PlayersLeaders — ограничить переходы

В `frontend/src/pages/PlayersRating.jsx` и `PlayersLeaders.jsx`:

- Импортировать `useAuth`
- В обработчике клика по строке/карточке: если `!canSeePlayer(player.id)` — не делать `navigate`. Опционально визуально приглушить чужие строки (`opacity: 0.55`, `cursor: default`, добавить класс `--locked`).

Пример для PlayersRating строки:

```jsx
const { canSeePlayer } = useAuth();
// ...
<div
  key={player.id}
  className={'players-rating__row' + (canSeePlayer(player.id) ? '' : ' players-rating__row--locked')}
  onClick={() => { if (canSeePlayer(player.id)) navigate(`/players/${player.id}`); }}
  role="button"
  tabIndex={0}
>
```

CSS:
```css
.players-rating__row--locked {
  cursor: default;
  opacity: 0.6;
}
.players-rating__row--locked:hover { background: transparent; }
```

---

### D2.10 PdfUploadDialog — скрыть для player

В `frontend/src/pages/MatchesDashboard.jsx`:

```jsx
const { isCoach } = useAuth();
// ...
{isCoach && (
  <button className="matches-dashboard__upload" onClick={() => setUploadOpen(true)}>
    + Загрузить отчёт Sportvisor
  </button>
)}
```

---

## D3. Деплой — пошаговые команды

### D3.1 Подготовка локально

```bash
# 1. Backend dependencies + первичный посев пользователей
cd "C:\Users\dmuzharov\Documents\Claude\Projects\Экран Легирус\backend"
npm install
node scripts/seed-users.js
# В консоли появятся первые 3 учётки. Полный список — в backend/data/credentials.txt
# СОХРАНИТЕ файл credentials.txt в надёжное место — пароли больше нигде не хранятся.

# 2. Frontend
cd "..\frontend"
npm install

# 3. Локальный запуск (два терминала)
#   Terminal 1:
cd backend
$env:JWT_SECRET="dev-secret-32-chars-min"  # PowerShell
npm start
#   Terminal 2:
cd frontend
npm run dev
# Открыть http://localhost:5173/login
# Войти как coach / <пароль из credentials.txt>
```

### D3.2 Создание репозитория и пуш

```bash
cd "C:\Users\dmuzharov\Documents\Claude\Projects\Экран Легирус"
git init
git add .
git commit -m "MVP Экран Легирус: auth + frontend + backend"
git branch -M main
git remote add origin https://github.com/<USER>/legirus-screen.git
git push -u origin main
```

⚠️ Перед пушем убедиться, что `.gitignore` в backend и в корне исключает:
```
node_modules
dist
backend/data/users.json
backend/data/credentials.txt
.env
*.log
```

### D3.3 Деплой backend на Render

1. Зайти на https://dashboard.render.com и нажать **New + → Blueprint**.
2. Подключить GitHub-репозиторий `legirus-screen`.
3. Render обнаружит `backend/render.yaml` и предложит создать сервис `legirus-api` + persistent disk.
4. Нажать **Apply**. Сборка займёт 4–6 минут (apt-get + pip3 + npm install).
5. После «Live»: открыть **Environment** и убедиться, что заданы:
   - `JWT_SECRET` — Render сгенерил автоматически (`generateValue: true`)
   - `MATCHES_DIR=/var/data/matches`, `MAPS_DIR=/var/data/maps`, `USERS_PATH=/var/data/users.json` — из yaml
   - `CORS_ORIGIN` — пока пусто, заполним после Vercel
6. Открыть **Shell** в Render dashboard, выполнить:
   ```bash
   cd /opt/render/project/src
   USERS_PATH=/var/data/users.json node scripts/seed-users.js
   cat /var/data/credentials.txt   # скопировать всё в надёжное место
   rm /var/data/credentials.txt    # после копирования удалить
   ```
7. Проверить health: `https://legirus-api-XXXX.onrender.com/api/health` должен вернуть `{"status":"ok"}`.

### D3.4 Деплой frontend на Vercel

1. Зайти на https://vercel.com → **Add New → Project** → импорт того же репозитория.
2. **Root Directory** = `frontend`.
3. **Framework Preset** — Vite (определится автоматически, vercel.json уже есть).
4. **Environment Variables**:
   - `VITE_API_BASE_URL` = `https://legirus-api-XXXX.onrender.com` (URL из Render, без `/api` в конце)
5. **Deploy**. Vercel выдаст URL вида `https://legirus-screen.vercel.app`.

### D3.5 Замкнуть CORS

1. Вернуться в Render dashboard → Environment, задать:
   - `CORS_ORIGIN` = `https://legirus-screen.vercel.app` (URL из Vercel, без `/` в конце)
2. Нажать **Save Changes** — Render перезапустит сервис.

### D3.6 Smoke-test продакшна

1. Открыть `https://legirus-screen.vercel.app/login`.
2. Войти как `coach` с паролем из credentials.txt → должен открыться `/analytics` со всеми блоками.
3. Открыть `/players/p17-turapin` → должна загрузиться карточка Турапина.
4. Logout → редирект на `/login`.
5. Войти как `turapin` (его пароль из credentials.txt) → редирект на `/analytics`. В сайдбаре пункт «Мой профиль» вместо «Игроки».
6. Перейти на `/players/p05-galitsky` (вручную в URL) → автоматический редирект на `/players/p17-turapin`.
7. Проверить DevTools Network: запрос `/api/data/match/match-001` для роли player вернул объект, в `players[]` ровно 1 элемент с `id === "p17-turapin"`.
8. Проверить, что без токена запрос `/api/data/teams` возвращает 401.
9. Проверить, что игрок при попытке загрузить PDF получает 403 (или кнопки нет вовсе — это ОК).

---

## D4. Definition of done

### Backend
- [ ] `npm install` без ошибок (bcryptjs, jsonwebtoken, express-rate-limit установлены)
- [ ] `node scripts/seed-users.js` создаёт `users.json` (1 coach + 15 players) и `credentials.txt`
- [ ] Все маршруты `/api/data/*` и `/api/agent/*` без токена → 401
- [ ] `/api/auth/login` с верным паролем → 200 + token; с неверным → 401
- [ ] `/api/data/match/:id` для роли player → объект с `players.length === 1` (свой)
- [ ] `/api/upload-pdf` для роли player → 403; для coach → 200

### Frontend
- [ ] `/login` рендерится без авторизации; redirect с любого защищённого роута на `/login`
- [ ] После логина токен сохраняется в localStorage; refetch `/auth/me` восстанавливает сессию при reload
- [ ] AppHeader показывает имя+роль и кнопку «Выход»
- [ ] SidebarNav: для player пункт «Мой профиль» вместо «Игроки»
- [ ] PlayerDetail: переход на чужой playerId автоматически редиректит на свой
- [ ] PlayersRating + PlayersLeaders: чужие игроки приглушены (locked) для player; клик по ним не работает
- [ ] MatchesDashboard: кнопка upload видна только coach
- [ ] Logout → редирект на /login, токен очищен

### Деплой
- [ ] Render: статус Live, /api/health → 200, в логах нет ошибок
- [ ] Vercel: статус Ready, главная страница → /login (нет токена)
- [ ] CORS_ORIGIN на Render выставлен на Vercel-URL
- [ ] Полный сценарий: логин coach → клик по матчу → клик по игроку → выход → логин игрока → редирект защиты → выход

---

## D5. Что вне рамок

- **Сброс пароля** — у тренера будет файл credentials.txt; смена пароля только через ручную перегенерацию хеша. Полноценный flow «забыл пароль» → email — отдельная фича.
- **Управление пользователями из UI** — пока только через `seed-users.js`. Будущая фича: страница `/admin/users` для coach, где он может добавлять/удалять/менять пароли.
- **2FA, audit log, sessions across devices** — не в MVP.
- **Refresh tokens** — JWT живёт 7 дней; после истечения пользователь логинится заново. Refresh-tokens с rotation — отдельная фича.
- **HTTPS-only cookies** — в MVP используется Bearer header в localStorage. Это допустимо для внутреннего инструмента команды; для публичного продакшна стоит мигрировать на httpOnly cookies + CSRF-токены.
- **Rate limit на остальные эндпоинты** — пока только на /login. Если появится злоупотребление, добавить общий лимитер.

---

## D6. Карта изменяемых файлов

```
СОЗДАЮТСЯ:
+ backend/middleware/auth.js
+ backend/routes/auth.js
+ backend/services/userStore.js
+ backend/scripts/seed-users.js
+ backend/data/users.json                       (генерируется seed-users.js, в .gitignore)
+ backend/data/credentials.txt                  (генерируется seed-users.js, удалить после раздачи)
+ frontend/src/contexts/AuthContext.jsx
+ frontend/src/components/ProtectedRoute.jsx
+ frontend/src/pages/Login.jsx
+ frontend/src/pages/Login.css

ИЗМЕНЯЮТСЯ:
~ backend/package.json                          (новые зависимости)
~ backend/server.js                             (auth routes + middleware на data/agent/upload)
~ backend/routes/data.js                        (фильтр match для роли player)
~ backend/render.yaml                           (NODE_ENV, USERS_PATH, JWT_SECRET)
~ backend/.gitignore                            (users.json, credentials.txt, .env)
~ frontend/src/services/api.js                  (token + 401 handler + login/me/logout)
~ frontend/src/App.jsx                          (AuthProvider + /login + ProtectedRoute)
~ frontend/src/components/AppHeader.jsx + .css  (user info + logout)
~ frontend/src/components/SidebarNav.jsx        (пункт «Мой профиль» для player)
~ frontend/src/pages/PlayerDetail.jsx           (редирект чужого playerId + id на секциях)
~ frontend/src/pages/PlayersRating.jsx          (locked-режим для чужих)
~ frontend/src/pages/PlayersRating.css          (стиль .players-rating__row--locked)
~ frontend/src/pages/PlayersLeaders.jsx         (locked-режим для чужих)
~ frontend/src/pages/MatchesDashboard.jsx       (кнопка upload только coach)
```

Никакие seed-данные матча, парсеры, PNG-карты, фотки игроков НЕ трогаются.

---

## D7. Тестовые учётки (формат вывода seed-users.js)

```
coach    coach                 abcdfgh234   —              Главный тренер
player   maksimsemyonov        klmnpqr567   p01-maksim     Максим Семёнов
player   oktyabrev             stuvwxy891   p02-oktyabrev  Арсений Октябрев
player   galitsky              abcdefg234   p05-galitsky   Михаил Галицкий
player   zakusilov             hjkmnpq567   p08-zakusilov  Артем Закусилов
player   voronkov              rstuvwx891   p09-voronkov   Владимир Воронков
player   klebanov              abcdefg345   p12-klebanov   Семён Клебанов
player   dutil                 hjkmnpq456   p15-dutil      Андрей Дютиль
player   turapin               rstuvwx678   p17-turapin    Матвей Турапин
player   bondar                abcdefg789   p19-bondar     Даниил Бондарь
player   bobin                 hjkmnpq234   p21-bobin      Денис Бобин
player   kondakov              rstuvwx345   p22-kondakov   Алексей Кондаков
player   ahmadov               abcdefg456   p23-ahmadov    Джайхун Ахмадов
player   bezborodkin           hjkmnpq567   p31-bezborodkin Дмитрий Безбородкин
player   makarov               rstuvwx678   p33-makarov    Кузьма Макаров
player   tatarchenko           abcdefg891   p52-tatarchenko Георгий Татарченко
```

(Пароли в примере — иллюстративные; реальные сгенерятся скриптом.)

---

## Контакт

- Проект: «Экран Легирус» (АванDата × ФК Легирус 2010)
- Бренд: SportData (`ai4sportdata@gmail.com`)
- Дата спеки: 30.04.2026
- Связана с:
  - `SPEC_FIXES_v1.md` — дизайн, лого, таблица игроков
  - `SPEC_FIXES_v2.md` — lightbox карт, навигация ИИ-агента
- Следующая итерация (предположительно): экран `match-team-aggregates`, история матчей, управление пользователями из UI
