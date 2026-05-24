import jwt from 'jsonwebtoken';
import { findUserById } from '../services/userStore.js';

// JWT_SECRET строго обязателен. Раньше требовался только если
// NODE_ENV=production — если Render забывал выставить NODE_ENV, прод
// бутался с публично известным dev-key. Теперь либо есть секрет, либо
// сервер не стартует, безотносительно env.
const SECRET = process.env.JWT_SECRET;
if (!SECRET || SECRET === 'dev-secret-change-me-in-prod') {
  console.error('FATAL: JWT_SECRET не задан или равен dev-default — сервер не стартует.');
  process.exit(1);
}

export async function authenticate(req, res, next) {
  const auth = req.headers.authorization || '';
  const token = auth.startsWith('Bearer ') ? auth.slice(7) : null;
  if (!token) return res.status(401).json({ error: 'Требуется авторизация' });

  let payload;
  try { payload = jwt.verify(token, SECRET); }
  catch (e) { return res.status(401).json({ error: 'Недействительный или истёкший токен' }); }

  try {
    const user = await findUserById(payload.userId);
    if (!user) return res.status(401).json({ error: 'Пользователь не найден' });
    req.user = {
      id: user.id,
      username: user.username,
      role: user.role,
      teamId: user.teamId ?? null,
      playerId: user.playerId || null,
      fullName: user.fullName,
    };
    next();
  } catch (e) {
    return res.status(500).json({ error: 'Ошибка авторизации: ' + e.message });
  }
}

export function authorize(...roles) {
  return (req, res, next) => {
    if (!req.user) return res.status(401).json({ error: 'Требуется авторизация' });
    if (roles.length && !roles.includes(req.user.role)) {
      return res.status(403).json({ error: 'Доступ запрещён' });
    }
    next();
  };
}

// Главный тренер видит все команды; остальные — только ту, к которой привязаны.
export function authorizeTeam(teamId) {
  return (req, res, next) => {
    if (!req.user) return res.status(401).json({ error: 'Требуется авторизация' });
    if (req.user.role === 'head_coach') return next();
    if (req.user.teamId && req.user.teamId === teamId) return next();
    return res.status(403).json({ error: 'Команда недоступна' });
  };
}

export const SIGNING_SECRET = SECRET;
