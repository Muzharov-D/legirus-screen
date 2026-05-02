import express from 'express';
import {
  loadTeams,
  loadPlayers,
  loadMetrics,
  loadMatchesIndex,
  loadMatch,
} from '../services/dataLoader.js';

const router = express.Router();

router.get('/teams', (_req, res) => {
  try { res.json(loadTeams()); }
  catch (e) { res.status(500).json({ error: e.message }); }
});

router.get('/players', (_req, res) => {
  try { res.json(loadPlayers()); }
  catch (e) { res.status(500).json({ error: e.message }); }
});

router.get('/metrics', (_req, res) => {
  try { res.json(loadMetrics()); }
  catch (e) { res.status(500).json({ error: e.message }); }
});

router.get('/matches', (_req, res) => {
  try { res.json(loadMatchesIndex()); }
  catch (e) { res.status(500).json({ error: e.message }); }
});

router.get('/match/:matchId', (req, res) => {
  try {
    const match = loadMatch(req.params.matchId);

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
