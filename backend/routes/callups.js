// REST для match_callups (Sprint 5.B). Все эндпоинты под authenticate.
//
// Маршруты:
//   GET    /api/callups/match/:age/:extMatchId       — список призыва (тренер видит весь)
//   GET    /api/callups/match/:age/:extMatchId/summary — счётчики
//   GET    /api/callups/me                           — upcoming призывы для player.playerId
//   POST   /api/callups/match/:age/:extMatchId/call  — добавить игроков (body: { playerIds: [...] })
//   POST   /api/callups/match/:age/:extMatchId/call-all — обновить pending → called
//   DELETE /api/callups/match/:age/:extMatchId/player/:playerId — убрать из призыва
//   POST   /api/callups/match/:age/:extMatchId/respond — RSVP (body: { status, note, playerId? })
//
// Roles:
//   - head_coach: всё, любая команда
//   - team_coach: своя команда
//   - player: GET /me, POST /respond за свой playerId

import express from 'express';
import {
  listCallupsByMatch, listUpcomingCallupsForPlayer, getCallup,
  callPlayers, callAllPending, respondCallup, removeFromCallup, callupSummary,
} from '../services/callupsRepo.js';

const router = express.Router();

const CLUB_ID = 'legirus'; // Sprint 5 — single club; Sprint 4 расширит

function isCoach(role) { return role === 'head_coach' || role === 'team_coach'; }
function canManageAge(user, age) {
  if (!user) return false;
  if (user.role === 'head_coach') return true;
  // team_coach: его teamId должен соответствовать age (legirus-2010 → '2010')
  if (user.role === 'team_coach' && user.teamId) {
    const m = String(user.teamId).match(/(\d{4})$/);
    return m && m[1] === String(age);
  }
  return false;
}
function canViewAge(user, age) {
  if (!user) return false;
  if (user.role === 'head_coach') return true;
  if (user.teamId) {
    const m = String(user.teamId).match(/(\d{4})$/);
    return m && m[1] === String(age);
  }
  return false;
}

// GET список призыва на матч
router.get('/match/:age/:extMatchId', async (req, res) => {
  try {
    const { age, extMatchId } = req.params;
    if (!canViewAge(req.user, age)) return res.status(403).json({ error: 'Команда недоступна' });
    const list = await listCallupsByMatch(CLUB_ID, age, extMatchId);
    res.json({ callups: list });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// GET сводка
router.get('/match/:age/:extMatchId/summary', async (req, res) => {
  try {
    const { age, extMatchId } = req.params;
    if (!canViewAge(req.user, age)) return res.status(403).json({ error: 'Команда недоступна' });
    const s = await callupSummary(CLUB_ID, age, extMatchId);
    res.json({ summary: s });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// GET мои предстоящие призывы (только player)
router.get('/me', async (req, res) => {
  try {
    const playerId = req.user?.playerId;
    if (!playerId) return res.json({ callups: [] });
    const list = await listUpcomingCallupsForPlayer(playerId);
    res.json({ callups: list });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// POST добавить игроков в призыв
router.post('/match/:age/:extMatchId/call', async (req, res) => {
  try {
    const { age, extMatchId } = req.params;
    if (!canManageAge(req.user, age)) return res.status(403).json({ error: 'Только тренер команды' });
    const { playerIds } = req.body || {};
    if (!Array.isArray(playerIds) || playerIds.length === 0) {
      return res.status(400).json({ error: 'playerIds required' });
    }
    const rows = await callPlayers(CLUB_ID, age, extMatchId, playerIds, req.user);
    res.json({ callups: rows });
  } catch (e) { res.status(400).json({ error: e.message }); }
});

// POST вызвать всех pending → called (тренер «отправить призыв всем»)
router.post('/match/:age/:extMatchId/call-all', async (req, res) => {
  try {
    const { age, extMatchId } = req.params;
    if (!canManageAge(req.user, age)) return res.status(403).json({ error: 'Только тренер команды' });
    const rows = await callAllPending(CLUB_ID, age, extMatchId, req.user);
    res.json({ called: rows.length, callups: rows });
  } catch (e) { res.status(400).json({ error: e.message }); }
});

// DELETE убрать игрока
router.delete('/match/:age/:extMatchId/player/:playerId', async (req, res) => {
  try {
    const { age, extMatchId, playerId } = req.params;
    if (!canManageAge(req.user, age)) return res.status(403).json({ error: 'Только тренер команды' });
    await removeFromCallup(CLUB_ID, age, extMatchId, playerId);
    res.status(204).end();
  } catch (e) { res.status(400).json({ error: e.message }); }
});

// POST RSVP — игрок отвечает за себя; тренер может отвечать за любого
router.post('/match/:age/:extMatchId/respond', async (req, res) => {
  try {
    const { age, extMatchId } = req.params;
    const { status, note } = req.body || {};
    let playerId = req.body?.playerId;
    if (req.user.role === 'player') {
      if (!req.user.playerId) return res.status(400).json({ error: 'у юзера нет playerId' });
      // Игрок RSVP только за себя
      playerId = req.user.playerId;
    } else if (isCoach(req.user.role)) {
      if (!playerId) return res.status(400).json({ error: 'playerId required' });
      if (!canManageAge(req.user, age)) return res.status(403).json({ error: 'Команда недоступна' });
    } else {
      return res.status(403).json({ error: 'Нет прав' });
    }
    // Проверяем что callup существует (или авто-создан) — если нет, создаём pending → respond
    const existing = await getCallup(CLUB_ID, age, extMatchId, playerId);
    if (!existing) {
      // Если pending не было (например игрок не из стартового состава) — добавим pending перед ответом
      await callPlayers(CLUB_ID, age, extMatchId, [playerId], req.user);
    }
    const row = await respondCallup(CLUB_ID, age, extMatchId, playerId, status, note, req.user);
    res.json({ callup: row });
  } catch (e) { res.status(400).json({ error: e.message }); }
});

export default router;
