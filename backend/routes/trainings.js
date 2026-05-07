// REST для тренировок (Sprint 5.1 + 5.2 PG-aware).
// Все эндпоинты требуют authenticate (подключается в server.js).
//
// Права:
//   - head_coach: всё, по любой команде
//   - team_coach: своя команда
//   - player: GET по своей команде + RSVP на /respond за себя
//
// Маршруты:
//   GET    /api/trainings/team/:teamId        — список (?scope=upcoming|past, ?from, ?to, ?limit)
//   GET    /api/trainings/:id                 — деталь
//   POST   /api/trainings                     — создать (тренер)
//   PATCH  /api/trainings/:id                 — обновить (тренер)
//   DELETE /api/trainings/:id                 — удалить (тренер)
//   GET    /api/trainings/:id/attendance      — карта посещаемости
//   POST   /api/trainings/:id/attendance      — массовая отметка тренером (presence: present/late/excused/absent)
//   POST   /api/trainings/:id/respond         — RSVP игроком за себя (response: going/not_going)
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
router.get('/team/:teamId', async (req, res) => {
  try {
    if (!canViewTeam(req.user, req.params.teamId)) {
      return res.status(403).json({ error: 'Команда недоступна' });
    }
    const list = await listTrainings(req.params.teamId, {
      scope: req.query.scope,
      from:  req.query.from,
      to:    req.query.to,
      limit: req.query.limit,
    });
    res.json({ trainings: list });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// GET деталь
router.get('/:id', async (req, res) => {
  try {
    const t = await getTraining(req.params.id);
    if (!t) return res.status(404).json({ error: 'not found' });
    if (!canViewTeam(req.user, t.teamId)) {
      return res.status(403).json({ error: 'Команда недоступна' });
    }
    const attendance = await getAttendance(t.id);
    res.json({ training: t, attendance });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// POST создать
router.post('/', async (req, res) => {
  try {
    if (!isCoach(req.user.role)) return res.status(403).json({ error: 'Только тренер' });
    const { teamId } = req.body || {};
    if (!canManageTeam(req.user, teamId)) {
      return res.status(403).json({ error: 'Команда недоступна' });
    }
    const t = await createTraining(req.body, req.user);
    res.status(201).json({ training: t });
  } catch (e) { res.status(400).json({ error: e.message }); }
});

// PATCH обновить
router.patch('/:id', async (req, res) => {
  try {
    const existing = await getTraining(req.params.id);
    if (!existing) return res.status(404).json({ error: 'not found' });
    if (!canManageTeam(req.user, existing.teamId)) {
      return res.status(403).json({ error: 'Команда недоступна' });
    }
    const t = await updateTraining(req.params.id, req.body || {}, req.user);
    res.json({ training: t });
  } catch (e) { res.status(400).json({ error: e.message }); }
});

// DELETE удалить
router.delete('/:id', async (req, res) => {
  try {
    const existing = await getTraining(req.params.id);
    if (!existing) return res.status(404).json({ error: 'not found' });
    if (!canManageTeam(req.user, existing.teamId)) {
      return res.status(403).json({ error: 'Команда недоступна' });
    }
    await deleteTraining(req.params.id);
    res.status(204).end();
  } catch (e) { res.status(400).json({ error: e.message }); }
});

// GET attendance
router.get('/:id/attendance', async (req, res) => {
  try {
    const t = await getTraining(req.params.id);
    if (!t) return res.status(404).json({ error: 'not found' });
    if (!canViewTeam(req.user, t.teamId)) return res.status(403).json({ error: 'Команда недоступна' });
    const attendance = await getAttendance(t.id);
    res.json({ attendance });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// POST attendance — массовая отметка тренером (presence: present|late|excused|absent)
router.post('/:id/attendance', async (req, res) => {
  try {
    const t = await getTraining(req.params.id);
    if (!t) return res.status(404).json({ error: 'not found' });
    if (!canManageTeam(req.user, t.teamId)) return res.status(403).json({ error: 'Команда недоступна' });
    const slot = await setAttendance(t.id, req.body?.marks || {}, req.user);
    res.json({ attendance: slot });
  } catch (e) { res.status(400).json({ error: e.message }); }
});

// POST respond — RSVP игроком за себя (going/not_going)
router.post('/:id/respond', async (req, res) => {
  try {
    const t = await getTraining(req.params.id);
    if (!t) return res.status(404).json({ error: 'not found' });
    if (!canViewTeam(req.user, t.teamId)) return res.status(403).json({ error: 'Команда недоступна' });
    const playerId = req.user.playerId || req.body?.playerId;
    if (!playerId) return res.status(400).json({ error: 'playerId required' });
    // Player может RSVP только за себя; coach может за любого из своей команды
    if (req.user.role === 'player' && req.user.playerId !== playerId) {
      return res.status(403).json({ error: 'Можно только за себя' });
    }
    const status = req.body?.status;
    if (!['going', 'not_going'].includes(status)) {
      return res.status(400).json({ error: 'status must be going|not_going' });
    }
    const note = req.body?.note || null;
    const slot = await setAttendance(t.id, { [playerId]: { status, note } }, req.user);
    res.json({ attendance: slot });
  } catch (e) { res.status(400).json({ error: e.message }); }
});

// GET статистика игрока
router.get('/team/:teamId/player/:playerId/stats', async (req, res) => {
  try {
    const { teamId, playerId } = req.params;
    if (!canViewTeam(req.user, teamId)) return res.status(403).json({ error: 'Команда недоступна' });
    if (req.user.role === 'player' && req.user.playerId !== playerId) {
      return res.status(403).json({ error: 'Чужая статистика недоступна' });
    }
    const stats = await playerAttendanceStats(teamId, playerId, { from: req.query.from, to: req.query.to });
    res.json({ stats });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

export default router;
