import express from 'express';
import { generateInsight } from '../services/ruleEngine.js';

const router = express.Router();

router.post('/insight', (req, res) => {
  try {
    const { screenId, context } = req.body || {};
    if (!screenId) return res.status(400).json({ error: 'screenId обязателен' });
    const insight = generateInsight({ screenId, context: context || {} });
    res.json(insight);
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

export default router;
