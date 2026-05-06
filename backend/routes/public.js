// Публичные read-only эндпоинты — без auth, для родителей и болельщиков.
// Возвращают только sanitized данные команды (расписание, результаты, без личной статистики).

import express from 'express';
import { loadCalendar, loadStandings } from '../services/dataLoader.js';

const router = express.Router();

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
