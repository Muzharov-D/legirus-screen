import fs from 'fs';
import path from 'path';
import bcrypt from 'bcryptjs';
import { PATHS } from './dataLoader.js';

const USERS_PATH = process.env.USERS_PATH
  ? path.resolve(process.env.USERS_PATH)
  : path.join(PATHS.DATA_DIR, 'users.json');

let _cache = null;

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

export function findUserByUsername(username) {
  if (!username) return null;
  return load().users.find((u) => u.username === username);
}

export function findUserById(id) {
  if (!id) return null;
  return load().users.find((u) => u.id === id);
}

export async function verifyPassword(user, password) {
  if (!user || !user.passwordHash || !password) return false;
  return bcrypt.compare(password, user.passwordHash);
}

export function getUsersFilePath() { return USERS_PATH; }

export function listUsers() {
  return load().users.map(({ passwordHash, ...rest }) => rest);
}

export function persist(users) {
  const dir = path.dirname(USERS_PATH);
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(USERS_PATH, JSON.stringify({ users }, null, 2), 'utf-8');
  invalidateUsersCache();
}
