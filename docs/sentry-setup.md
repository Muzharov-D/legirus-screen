# Sentry — мониторинг ошибок и performance

## Что подключено

**Backend** (`backend/`):
- `@sentry/node` инициализируется первым в `instrument.js`
- `server.js` импортирует `instrument.js` ДО всех остальных require
- `Sentry.setupExpressErrorHandler(app)` после всех роутов — ловит ошибки Express
- Fallback error handler возвращает чистый JSON клиенту

**Frontend** (`frontend/`):
- *(подключим когда дашь frontend DSN)*

## Настройки

### Backend
- `tracesSampleRate: 0.1` — 10% запросов с performance-метриками
- `sendDefaultPii: true` — Sentry собирает IP, headers, query (при необходимости меняй на false для 152-ФЗ)
- `beforeSend` фильтр выкидывает шум:
  - сетевые ошибки FFSPB (ECONNRESET, ETIMEDOUT, ENOTFOUND, fetch failed)
  - запросы `/api/health` от Render

## Что нужно сделать

### 1. Установить зависимости (один раз локально)

```powershell
cd "C:\Users\dmuzharov\Documents\Claude\Projects\Экран Легирус\backend"
npm install
```

### 2. Добавить переменные окружения

#### Локально — `backend/.env` (не коммитить, в .gitignore)

```bash
SENTRY_DSN=https://0899819ef33a5c71944397952cecf71a@o4511302852149248.ingest.de.sentry.io/4511366650527824
SENTRY_ENVIRONMENT=development
```

#### На Render → Settings → Environment

| Key | Value |
|---|---|
| `SENTRY_DSN` | `https://0899819ef33a5c71944397952cecf71a@o4511302852149248.ingest.de.sentry.io/4511366650527824` |
| `SENTRY_ENVIRONMENT` | `production` |

После сохранения Render автоматически перезапустит сервис.

### 3. Проверить что работает

После деплоя:
1. В логах Render должно появиться: `[sentry] backend monitoring enabled, env=production`
2. В Sentry → ваш проект `legirus-backend` через 1-2 минуты после первой ошибки появятся события
3. Чтобы намеренно вызвать тестовую ошибку — добавь временный route:
   ```js
   app.get('/api/_sentry-test', (_req, _res) => { throw new Error('Sentry test'); });
   ```
   Открой `https://legirus-api.onrender.com/api/_sentry-test` — в Sentry прилетит `Error: Sentry test`. Удали роут после проверки.

## Как читать данные в Sentry

- **Issues** — список уникальных ошибок (группируются по stack trace)
- **Performance** — медленные транзакции (топ-50 endpoint'ов по времени)
- **Releases** — версии деплоев (мы передаём `RENDER_GIT_COMMIT` как release)

## Если квота исчерпана

Бесплатный план Sentry:
- 5K errors/мес
- 10K transactions/мес

При превышении — Sentry начнёт дропать события (молча). Если упрёмся:
1. Уменьшить `tracesSampleRate` с 0.1 до 0.01 (1%)
2. Расширить `beforeSend` чтобы фильтровать больше шума
3. Перейти на платный план $26/мес (50K errors)

## Frontend

**Что подключено:**
- `@sentry/react` инициализируется в `frontend/src/sentry.js`
- `main.jsx` импортирует `sentry.js` ПЕРЕД `App.jsx`
- `ErrorBoundary.componentDidCatch` отправляет ошибку в Sentry с тэгом `source=react-error-boundary` и React component stack
- `browserTracingIntegration` собирает performance-метрики (10% sample)
- `tracePropagationTargets` — distributed tracing для запросов к нашему API (фронт→бэк связи будут видны в одном trace)

**Игнор-фильтры (`ignoreErrors`):**
- Failed to fetch / Load failed / NetworkError / AbortError — offline-шум от Service Worker
- ResizeObserver loop — известный безвредный браузерный шум
- chrome-extension:// / moz-extension:// — расширения браузера

### Локально — `frontend/.env`

```bash
VITE_SENTRY_DSN=https://27b6f42cdff01ab5f525bc7bd7c4068b@o4511302852149248.ingest.de.sentry.io/4511366661865552
VITE_SENTRY_ENVIRONMENT=development
```

### На Vercel → Project → Settings → Environment Variables

| Key | Value | Environments |
|---|---|---|
| `VITE_SENTRY_DSN` | `https://27b6f42cdff01ab5f525bc7bd7c4068b@o4511302852149248.ingest.de.sentry.io/4511366661865552` | Production + Preview |
| `VITE_SENTRY_ENVIRONMENT` | `production` | Production |
| `VITE_SENTRY_ENVIRONMENT` | `preview` | Preview |

После сохранения сделай Redeploy последнего успешного билда (Vercel → Deployments → ⋯ → Redeploy), чтобы env'ы применились.

### Проверить что работает

1. После деплоя открой `mobile.legirus.sportdata.tech`, в DevTools Console должно быть `[sentry] frontend monitoring enabled`
2. В Sentry → проект `legirus-frontend` появятся первые события через 1-2 минуты после ошибок
3. Для теста добавить кнопку:
   ```jsx
   <button onClick={() => { throw new Error('Sentry test from button'); }}>Test Sentry</button>
   ```

### Source maps (опционально, для красивых stack traces)

Сейчас Sentry покажет минифицированные имена `index-CdI2L1fC.js:1:5832`. Если нужны исходные `PublicTeamHeader.jsx:42`:

1. `npm i -D @sentry/vite-plugin`
2. В `vite.config.js`:
   ```js
   import { sentryVitePlugin } from '@sentry/vite-plugin';
   export default defineConfig({
     build: { sourcemap: true },
     plugins: [
       react(),
       sentryVitePlugin({
         org: 'твой-org-slug',
         project: 'legirus-frontend',
         authToken: process.env.SENTRY_AUTH_TOKEN,
       }),
     ],
   });
   ```
3. В Sentry → Settings → Auth Tokens → Create Token (scope: `project:write`, `project:releases`) → положить в Vercel env как `SENTRY_AUTH_TOKEN`

Source maps будут заливаться при каждом Vercel-build и ассоциироваться с релизом по git commit hash.
