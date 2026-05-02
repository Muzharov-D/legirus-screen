import express from 'express';
import {
  loadTeams,
  loadPlayers,
  loadMetrics,
  loadMatchesIndex,
  loadMatch,
} from '../services/dataLoader.js';

const router = express.Router();

// Команды клуба. head_coach видит весь список, остальные — только свою.
router.get('/teams', (req, res) => {
  try {
    const all = loadTeams();
    if (req.user?.role === 'head_coach') return res.json(all);
    if (!req.user?.teamId) return res.json({ ...all, teams: [] });
    const filtered = {
      ...all,
      teams: (all.teams || []).filter((t) => t.id === req.user.teamId),
    };
    res.json(filtered);
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// Список игроков — фильтр по teamId / роли.
router.get('/players', (req, res) => {
  try {
    const all = loadPlayers();
    const requestedTeamId = req.query.teamId;

    if (req.user?.role === 'head_coach') {
      const players = requestedTeamId
        ? (all.players || []).filter((p) => p.teamId === requestedTeamId)
        : all.players;
      return res.json({ players });
    }

    const ownTeamId = req.user?.teamId;
    if (!ownTeamId) return res.json({ players: [] });
    const players = (all.players || []).filter((p) => p.teamId === ownTeamId);
    res.json({ players });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

router.get('/metrics', (_req, res) => {
  try { res.json(loadMetrics()); }
  catch (e) { res.status(500).json({ error: e.message }); }
});

// Список матчей — фильтр по teamId / роли.
router.get('/matches', (req, res) => {
  try {
    const all = loadMatchesIndex();
    const requestedTeamId = req.query.teamId;

    if (req.user?.role === 'head_coach') {
      const matches = requestedTeamId
        ? (all.matches || []).filter((m) => m.teamId === requestedTeamId)
        : all.matches;
      return res.json({ matches });
    }

    const ownTeamId = req.user?.teamId;
    if (!ownTeamId) return res.json({ matches: [] });
    const matches = (all.matches || []).filter((m) => m.teamId === ownTeamId);
    res.json({ matches });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

router.get('/match/:matchId', (req, res) => {
  try {
    const match = loadMatch(req.params.matchId);

    // Проверка доступа по команде. head_coach — всё; team_coach/player — только свою.
    if (req.user?.role !== 'head_coach') {
      if (!req.user?.teamId || match.teamId !== req.user.teamId) {
        return res.status(403).json({ error: 'Матч недоступен' });
      }
    }

    if (req.user?.role === 'player') {
      const ownId = req.user.playerId;

      const sanitize = (p) => {
        if (p.id === ownId) return p;
        const { splits, radar, maps, ...publicFields } = p;
        return publicFields;
      };

      const filtered = {
        ...match,
        players: (match.players || []).map(sanitize),
        _filteredFor: ownId,
      };
      return res.json(filtered);
    }

    res.json(match);
  } catch (e) {
    res.status(404).json({ error: `Матч ${req.params.matchId} не найден` });
  }
});

export default router;
