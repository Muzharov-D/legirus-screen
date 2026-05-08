import express from 'express';
import jwt from 'jsonwebtoken';
import bcrypt from 'bcryptjs';
import rateLimit from 'express-rate-limit';
import { findUserByUsername, findUserById, verifyPassword } from '../services/userStore.js';
import { authenticate, SIGNING_SECRET } from '../middleware/auth.js';
import { isPgEnabled, query } from '../db/pool.js';

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
    const user = await findUserByUsername(String(username).toLowerCase().trim());
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

// Rate-limit смены пароля — 5 попыток в минуту от одного IP
const changeLimiter = rateLimit({
  windowMs: 60 * 1000,
  max: 5,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'Слишком много попыток. Подождите минуту.' },
});

// POST /api/auth/change-password — смена своего пароля
// Body: { currentPassword, newPassword }
// Требует currentPassword чтобы предотвратить hijacking токена.
router.post('/change-password', changeLimiter, authenticate, async (req, res) => {
  try {
    const { currentPassword, newPassword } = req.body || {};
    if (!currentPassword || !newPassword) {
      return res.status(400).json({ error: 'Текущий и новый пароли обязательны' });
    }
    if (String(newPassword).length < 6) {
      return res.status(400).json({ error: 'Новый пароль должен быть минимум 6 символов' });
    }
    if (currentPassword === newPassword) {
      return res.status(400).json({ error: 'Новый пароль совпадает с текущим' });
    }
    // Загрузить полного user'а с password_hash (req.user — sanitized без хэша)
    const user = await findUserById(req.user.id);
    if (!user) return res.status(401).json({ error: 'Пользователь не найден' });

    const ok = await verifyPassword(user, currentPassword);
    if (!ok) return res.status(401).json({ error: 'Неверный текущий пароль' });

    const newHash = bcrypt.hashSync(String(newPassword), 10);
    if (isPgEnabled()) {
      await query(`UPDATE users SET password_hash = $1 WHERE id = $2`, [newHash, user.id]);
    } else {
      // JSON-fallback path (на проде не используется, но безопасности ради)
      const { listUsers, persist } = await import('../services/userStore.js');
      const users = (await listUsers()) || [];
      const idx = users.findIndex((u) => u.id === user.id);
      if (idx === -1) return res.status(500).json({ error: 'PG недоступен и пользователь не найден в JSON' });
      users[idx].passwordHash = newHash;
      await persist(users);
    }
    res.json({ ok: true });
  } catch (e) {
    console.error('[auth/change-password] crash:', e.message);
    res.status(500).json({ error: 'Ошибка смены пароля' });
  }
});

export default router;
