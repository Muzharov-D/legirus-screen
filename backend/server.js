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
import { authenticate, authorize } from './middleware/auth.js';
import { ensureMatchesDir } from './services/dataLoader.js';
import { startStandingsCron } from './services/standingsService.js';
import { startCupCron } from './services/cupService.js';
import { startCalendarCron } from './services/calendarService.js';
import { configurePush } from './services/pushService.js';

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

// Public
app.use('/api/auth', authRoutes);

// Protected
app.use('/api/data', authenticate, dataRoutes);
app.use('/api/upload-pdf', authenticate, authorize('head_coach', 'team_coach'), uploadRoutes);
app.use('/api/push', authenticate, pushRoutes);

ensureMatchesDir();
startStandingsCron();
startCupCron();
startCalendarCron();
configurePush();

app.listen(PORT, () => {
  console.log(`Backend listening on :${PORT}`);
});
