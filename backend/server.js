// ⚠️ ВАЖНО: instrument.js должен быть импортирован САМЫМ ПЕРВЫМ — до любых
// других import. Иначе Sentry не успеет проинструментировать http/express/pg.
import './instrument.js';
import * as Sentry from '@sentry/node';

// Загружаем .env (если есть) до всех остальных импортов, чтобы services увидели VAPID и т.п.
// На Render/проде ENV приходят из dashboard, .env отсутствует — dotenv молча пропускает.
import 'dotenv/config';

import express from 'express';
import cors from 'cors';
import path from 'path';
import { fileURLToPath } from 'url';
import dataRoutes from './routes/data.js';
import uploadRoutes from './routes/upload.js';
import authRoutes from './routes/auth.js';
import pushRoutes from './routes/push.js';
import publicRoutes from './routes/public.js';
import trainingsRoutes from './routes/trainings.js';
import callupsRoutes from './routes/callups.js';
import { authenticate, authorize } from './middleware/auth.js';
import { ensureMatchesDir } from './services/dataLoader.js';
import { startStandingsCron } from './services/standingsService.js';
import { startCupCron } from './services/cupService.js';
import { startCalendarCron } from './services/calendarService.js';
import { startPlayersSyncCron } from './services/playersSyncService.js';
import { startMatchEventsCron } from './services/matchEventsService.js';
import { configurePush } from './services/pushService.js';
import { startNotifCron } from './services/notifCron.js';
import { getPool, ping } from './db/pool.js';

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
app.use('/api/maps', express.static(MAPS_DIR));
app.use('/assets', express.static(ASSETS_DIR));

app.get('/api/health', (_req, res) => res.json({ status: 'ok' }));

// Public — без auth
app.use('/api/auth', authRoutes);
app.use('/api/public', publicRoutes);

// Protected
app.use('/api/data', authenticate, dataRoutes);
app.use('/api/upload-pdf', authenticate, authorize('head_coach', 'team_coach'), uploadRoutes);
app.use('/api/push', authenticate, pushRoutes);
app.use('/api/trainings', authenticate, trainingsRoutes);
app.use('/api/callups', authenticate, callupsRoutes);

ensureMatchesDir();
startStandingsCron();
startCupCron();
startCalendarCron();
startPlayersSyncCron();
startMatchEventsCron();
configurePush();
startNotifCron();

// Eager-инициализация PG пула при старте, чтобы isPgEnabled() сразу возвращал true,
// и cron'ы / dataRepo использовали PG, а не legacy JSON.
if (process.env.DATABASE_URL) {
  getPool(); // создаёт singleton-пул
  ping().then((r) => {
    if (r.ok) console.log('[pg] connected: ' + (r.version || '').split(' ').slice(0, 2).join(' '));
    else console.error('[pg] ping failed:', r.error);
  });
} else {
  console.log('[pg] DATABASE_URL не задан — fallback на JSON');
}

// Sentry error handler — должен быть ПОСЛЕ всех роутов, но ПЕРЕД нашими error middleware.
// Перехватывает ошибки в Express-handler'ах и шлёт в Sentry.
Sentry.setupExpressErrorHandler(app);

// Fallback error handler — отдаёт пользователю чистый JSON вместо HTML-стектрейса.
app.use((err, _req, res, _next) => {
  console.error('[express] unhandled error:', err);
  res.status(err.status || 500).json({
    error: 'internal',
    message: process.env.NODE_ENV === 'production' ? 'Server error' : err.message,
  });
});

app.listen(PORT, () => {
  console.log(`Backend listening on :${PORT}`);
});
