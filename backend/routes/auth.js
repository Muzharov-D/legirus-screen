import express from 'express';
import jwt from 'jsonwebtoken';
import rateLimit from 'express-rate-limit';
import { findUserByUsername, verifyPassword } from '../services/userStore.js';
import { authenticate, SIGNING_SECRET } from '../middleware/auth.js';

const router = express.Router();

const loginLimiter = rateLimit({
  windowMs: 60 * 1000,
  max: 8,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'Слишком много попыток. Подождите минуту.' },
});

router.post('/login', loginLimiter, async (req, res) => {
  try {
    const { username, password } = req.body || {};
    if (!username || !password) {
      return res.status(400).json({ error: 'Логин и пароль обязательны' });
    }
    const user = findUserByUsername(String(username).toLowerCase().trim());
    if (!user) return res.status(401).json({ error: 'Неверный логин или пароль' });
    const ok = await verifyPassword(user, password);
    if (!ok) return res.status(401).json({ error: 'Неверный логин или пароль' });

    const token = jwt.sign(
      { userId: user.id, role: user.role },
      SIGNING_SECRET,
      { expiresIn: '7d' }
    );
    res.json({
      token,
      user: {
        id: user.id,
        username: user.username,
        role: user.role,
        teamId: user.teamId ?? null,
        playerId: user.playerId || null,
        fullName: user.fullName,
      },
    });
  } catch (e) {
    console.error('[auth/login] crash:', e);
    res.status(500).json({ error: 'Login crash: ' + (e?.message || String(e)) });
  }
});

router.get('/me', authenticate, (req, res) => res.json({ user: req.user }));

export default router;
