// Sprint 5.F: userStore стал PG-aware. При DATABASE_URL читает/пишет в users table,
// иначе fallback на JSON-файл. Сигнатуры async (для совместимости пути PG).
//
// ВНИМАНИЕ: ранее экспортировались SYNC-функции (findUserByUsername, findUserById).
// Теперь они async — caller'ы должны await'ить. Места использования:
//   - middleware/auth.js (findUserById)
//   - routes/auth.js (findUserByUsername, verifyPassword)

import fs from 'fs';
import path from 'path';
import bcrypt from 'bcryptjs';
import { PATHS } from './dataLoader.js';
import { isPgEnabled, query } from '../db/pool.js';

const USERS_PATH = process.env.USERS_PATH
  ? path.resolve(process.env.USERS_PATH)
  : path.join(PATHS.DATA_DIR, 'users.json');

let _cache = null;

// === JSON fallback ===
function load() {
  if (_cache) return _cache;
  if (!fs.existsSync(USERS_PATH)) {
    _cache = { users: [] };
    return _cache;
  }
  _cache = JSON.parse(fs.readFileSync(USERS_PATH, 'utf-8'));
  return _cache;
}

export function invalidateUsersCache() { _cache = null; }

function rowToUser(r) {
  return {
    id: r.id,
    username: r.username,
    passwordHash: r.password_hash,
    fullName: r.full_name,
    role: r.role,
    teamId: r.team_id,
    playerId: r.player_id,
    clubId: r.club_id,
    createdAt: r.created_at instanceof Date ? r.created_at.toISOString() : r.created_at,
  };
}

export async function findUserByUsername(username) {
  if (!username) return null;
  if (isPgEnabled()) {
    const r = await query(
      `SELECT id, username, password_hash, full_name, role, team_id, player_id, club_id, created_at
       FROM users WHERE username = $1 LIMIT 1`, [username]);
    return r.rows[0] ? rowToUser(r.rows[0]) : null;
  }
  return load().users.find((u) => u.username === username) || null;
}

export async function findUserById(id) {
  if (!id) return null;
  if (isPgEnabled()) {
    const r = await query(
      `SELECT id, username, password_hash, full_name, role, team_id, player_id, club_id, created_at
       FROM users WHERE id = $1 LIMIT 1`, [id]);
    return r.rows[0] ? rowToUser(r.rows[0]) : null;
  }
  return load().users.find((u) => u.id === id) || null;
}

export async function verifyPassword(user, password) {
  if (!user || !user.passwordHash || !password) return false;
  return bcrypt.compare(password, user.passwordHash);
}

export function getUsersFilePath() { return USERS_PATH; }

// Безопасное обновление пароля одного пользователя — НЕ через listUsers()/persist(),
// которые в JSON-режиме теряют password_hash у остальных юзеров (P0 из code review).
export async function updatePassword(userId, newPasswordHash) {
  if (!userId || !newPasswordHash) throw new Error('userId и newPasswordHash обязательны');
  if (isPgEnabled()) {
    await query(`UPDATE users SET password_hash = $1 WHERE id = $2`, [newPasswordHash, userId]);
    invalidateUsersCache();
    return true;
  }
  const data = load();
  const idx = (data.users || []).findIndex((u) => u.id === userId);
  if (idx === -1) throw new Error('User not found');
  data.users[idx].passwordHash = newPasswordHash;
  fs.writeFileSync(USERS_PATH, JSON.stringify(data, null, 2), 'utf-8');
  invalidateUsersCache();
  return true;
}

export async function listUsers() {
  if (isPgEnabled()) {
    const r = await query(
      `SELECT id, username, full_name, role, team_id, player_id, club_id, created_at
       FROM users ORDER BY username`);
    return r.rows.map((row) => ({
      id: row.id, username: row.username, fullName: row.full_name,
      role: row.role, teamId: row.team_id, playerId: row.player_id,
      clubId: row.club_id, createdAt: row.created_at?.toISOString?.() || row.created_at,
    }));
  }
  return load().users.map(({ passwordHash, ...rest }) => rest);
}

export async function persist(users) {
  // PG: UPSERT по каждому, без truncate
  if (isPgEnabled()) {
    for (const u of users) {
      await query(
        `INSERT INTO users (id, username, password_hash, full_name, role, team_id, player_id, club_id, created_at)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, COALESCE($9::timestamptz, NOW()))
         ON CONFLICT (id) DO UPDATE SET
           username = EXCLUDED.username,
           password_hash = COALESCE(EXCLUDED.password_hash, users.password_hash),
           full_name = EXCLUDED.full_name,
           role = EXCLUDED.role,
           team_id = EXCLUDED.team_id,
           player_id = EXCLUDED.player_id,
           club_id = EXCLUDED.club_id`,
        [u.id, u.username, u.passwordHash, u.fullName, u.role,
         u.teamId, u.playerId, u.clubId, u.createdAt]
      );
    }
    invalidateUsersCache();
    return true;
  }
  // JSON
  const tmp = USERS_PATH + '.tmp';
  fs.writeFileSync(tmp, JSON.stringify({ users }, null, 2), 'utf-8');
  fs.renameSync(tmp, USERS_PATH);
  invalidateUsersCache();
  return true;
}
