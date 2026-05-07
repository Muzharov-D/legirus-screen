// REST для тренировок (Sprint 5.1).
// Все эндпоинты ниже требуют authenticate (подключается в server.js).
//
// Права:
//   - head_coach: всё, по любой команде
//   - team_coach: своя команда (req.user.teamId)
//   - player: только GET по своей команде
//
// Маршруты:
//   GET    /api/trainings/team/:teamId        — список (?scope=upcoming|past, ?limit=)
//   GET    /api/trainings/:id                 — деталь
//   POST   /api/trainings                     — создать
//   PATCH  /api/trainings/:id                 — обновить
//   DELETE /api/trainings/:id                 — удалить
//   GET    /api/trainings/:id/attendance      — карта посещаемости
//   POST   /api/trainings/:id/attendance      — массовая отметка
//   GET    /api/trainings/team/:teamId/player/:playerId/stats  — статистика игрока

import express from 'express';
import {
  listTrainings, getTraining, createTraining, updateTraining, deleteTraining,
  getAttendance, setAttendance, playerAttendanceStats,
} from '../services/trainingsRepo.js';

const router = express.Router();

function isCoach(role) { return role === 'head_coach' || role === 'team_coach'; }

function canManageTeam(user, teamId) {
  if (!user) return false;
  if (user.role === 'head_coach') return true;
  if (user.role === 'team_coach' && user.teamId === teamId) return true;
  return false;
}

function canViewTeam(user, teamId) {
  if (!user) return false;
  if (user.role === 'head_coach') return true;
  if (user.teamId && user.teamId === teamId) return true;
  return false;
}

// GET список
router.get('/team/:teamId', (req, res) => {
  try {
    if (!canViewTeam(req.user, req.params.teamId)) {
      return res.status(403).json({ error: 'Команда недоступна' });
    }
    const list = listTrainings(req.params.teamId, {
      scope: req.query.scope,
      from:  req.query.from,
      to:    req.query.to,
      limit: req.query.limit,
    });
    res.json({ trainings: list });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// GET деталь
router.get('/:id', (req, res) => {
  try {
    const t = getTraining(req.params.id);
    if (!t) return res.status(404).json({ error: 'not found' });
    if (!canViewTeam(req.user, t.teamId)) {
      return res.status(403).json({ error: 'Команда недоступна' });
    }
    res.json({ training: t, attendance: getAttendance(t.id) });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// POST создать
router.post('/', (req, res) => {
  try {
    if (!isCoach(req.user.role)) return res.status(403).json({ error: 'Только тренер' });
    const { teamId } = req.body || {};
    if (!canManageTeam(req.user, teamId)) {
      return res.status(403).json({ error: 'Команда недоступна' });
    }
    const t = createTraining(req.body, req.user);
    res.status(201).json({ training: t });
  } catch (e) { res.status(400).json({ error: e.message }); }
});

// PATCH обновить
router.patch('/:id', (req, res) => {
  try {
    const existing = getTraining(req.params.id);
    if (!existing) return res.status(404).json({ error: 'not found' });
    if (!canManageTeam(req.user, existing.teamId)) {
      return res.status(403).json({ error: 'Команда недоступна' });
    }
    const t = updateTraining(req.params.id, req.body || {}, req.user);
    res.json({ training: t });
  } catch (e) { res.status(400).json({ error: e.message }); }
});

// DELETE удалить
router.delete('/:id', (req, res) => {
  try {
    const existing = getTraining(req.params.id);
    if (!existing) return res.status(404).json({ error: 'not found' });
    if (!canManageTeam(req.user, existing.teamId)) {
      return res.status(403).json({ error: 'Команда недоступна' });
    }
    deleteTraining(req.params.id);
    res.status(204).end();
  } catch (e) { res.status(400).json({ error: e.message }); }
});

// GET attendance
router.get('/:id/attendance', (req, res) => {
  try {
    const t = getTraining(req.params.id);
    if (!t) return res.status(404).json({ error: 'not found' });
    if (!canViewTeam(req.user, t.teamId)) return res.status(403).json({ error: 'Команда недоступна' });
    res.json({ attendance: getAttendance(t.id) });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// POST attendance — массовая отметка { marks: { playerId: 'present', ... } }
router.post('/:id/attendance', (req, res) => {
  try {
    const t = getTraining(req.params.id);
    if (!t) return res.status(404).json({ error: 'not found' });
    if (!canManageTeam(req.user, t.teamId)) return res.status(403).json({ error: 'Команда недоступна' });
    const slot = setAttendance(t.id, req.body?.marks || {}, req.user);
    res.json({ attendance: slot });
  } catch (e) { res.status(400).json({ error: e.message }); }
});

// GET статистика игрока за период
router.get('/team/:teamId/player/:playerId/stats', (req, res) => {
  try {
    const { teamId, playerId } = req.params;
    if (!canViewTeam(req.user, teamId)) return res.status(403).json({ error: 'Команда недоступна' });
    // Игрок видит только свою статистику
    if (req.user.role === 'player' && req.user.playerId !== playerId) {
      return res.status(403).json({ error: 'Чужая статистика недоступна' });
    }
    const stats = playerAttendanceStats(teamId, playerId, { from: req.query.from, to: req.query.to });
    res.json({ stats });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

export default router;
