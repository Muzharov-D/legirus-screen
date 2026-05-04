import express from 'express';
import {
  loadTeams,
  loadPlayers,
  loadMetrics,
  loadMatchesIndex,
  loadMatch,
  loadStandings,
  listStandings,
} from '../services/dataLoader.js';
import { refreshAge, refreshAll } from '../services/standingsService.js';

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
function enrichMatch(m) {
  if (m.homeTeamName && m.awayTeamName) return m;
  try {
    const detail = loadMatch(m.id);
    return {
      ...m,
      homeTeamName: m.homeTeamName || detail?.homeTeam?.name || null,
      awayTeamName: m.awayTeamName || detail?.awayTeam?.name || null,
      tournament: m.tournament || 'league',
    };
  } catch (_e) {
    return { ...m, tournament: m.tournament || 'league' };
  }
}

router.get('/matches', (req, res) => {
  try {
    const all = loadMatchesIndex();
    const requestedTeamId = req.query.teamId;

    let matches;
    if (req.user?.role === 'head_coach') {
      matches = requestedTeamId
        ? (all.matches || []).filter((m) => m.teamId === requestedTeamId)
        : (all.matches || []);
    } else {
      const ownTeamId = req.user?.teamId;
      if (!ownTeamId) return res.json({ matches: [] });
      matches = (all.matches || []).filter((m) => m.teamId === ownTeamId);
    }

    res.json({ matches: matches.map(enrichMatch) });
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

// Турнирная таблица возрастной группы (Клубный зачёт)
router.get('/standings/:ageGroup', (req, res) => {
  try {
    const data = loadStandings(req.params.ageGroup);
    if (!data) return res.status(404).json({ error: `Таблица для возраста ${req.params.ageGroup} ещё не загружена` });
    res.json(data);
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

router.get('/standings', (_req, res) => {
  try {
    res.json({ ageGroups: listStandings() });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// Ручное переобновление таблицы (только для тренеров) — полезно после правки конфига
router.post('/standings/:ageGroup/refresh', async (req, res) => {
  try {
    if (!['head_coach', 'team_coach'].includes(req.user?.role)) {
      return res.status(403).json({ error: 'Доступ только для тренеров' });
    }
    const data = await refreshAge(req.params.ageGroup);
    res.json({ ok: true, ageGroup: req.params.ageGroup, teams: data.table.length });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

router.post('/standings/refresh', async (req, res) => {
  try {
    if (req.user?.role !== 'head_coach') {
      return res.status(403).json({ error: 'Доступ только для главного тренера' });
    }
    const results = await refreshAll();
    res.json({ ok: true, results });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

export default router;
