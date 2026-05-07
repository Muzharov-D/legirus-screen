// Публичные read-only эндпоинты — без auth, для родителей и болельщиков.
// Возвращают только sanitized данные команды (расписание, результаты, без личной статистики).

import express from 'express';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { loadCalendar, loadStandings } from '../services/dataLoader.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const VENUES_PATH = path.resolve(__dirname, '..', 'data', 'venues.json');

const router = express.Router();

// Справочник стадионов с координатами для маршрутов в Я.Картах.
// GET /api/public/venues
router.get('/venues', (_req, res) => {
  try {
    if (!fs.existsSync(VENUES_PATH)) return res.json({ venues: [] });
    const data = JSON.parse(fs.readFileSync(VENUES_PATH, 'utf-8'));
    res.json(data);
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// Публичный календарь возрастной группы.
// GET /api/public/calendar/:age
router.get('/calendar/:age', (req, res) => {
  try {
    const data = loadCalendar(req.params.age);
    if (!data) return res.status(404).json({ error: `Календарь для ${req.params.age} ещё не загружен` });
    res.json(data);
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// Публичная турнирная таблица — для отображения позиции команды.
// GET /api/public/standings/:age
router.get('/standings/:age', (req, res) => {
  try {
    const data = loadStandings(req.params.age);
    if (!data) return res.status(404).json({ error: `Таблица для ${req.params.age} не загружена` });
    res.json(data);
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

export default router;
