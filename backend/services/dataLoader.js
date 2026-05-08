import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const DATA_DIR = path.resolve(__dirname, '..', 'data');
const MATCHES_DIR = process.env.MATCHES_DIR
  ? path.resolve(process.env.MATCHES_DIR)
  : path.join(DATA_DIR, 'matches');

const cache = new Map();

function readJson(filePath) {
  if (cache.has(filePath)) return cache.get(filePath);
  if (!fs.existsSync(filePath)) {
    throw new Error(`Файл данных не найден: ${filePath}`);
  }
  const raw = fs.readFileSync(filePath, 'utf-8');
  const data = JSON.parse(raw);
  cache.set(filePath, data);
  return data;
}

export function invalidateCache(filePath) {
  if (filePath) cache.delete(filePath);
  else cache.clear();
}

export function loadTeams() {
  return readJson(path.join(DATA_DIR, 'teams.json'));
}

export function loadPlayers() {
  return readJson(path.join(DATA_DIR, 'players.json'));
}

export function loadMetrics() {
  return readJson(path.join(DATA_DIR, 'metrics.json'));
}

export function loadMatchesIndex() {
  const indexPath = path.join(MATCHES_DIR, '..', 'matches.json');
  if (fs.existsSync(indexPath)) return readJson(indexPath);
  const fallback = path.join(DATA_DIR, 'matches.json');
  return readJson(fallback);
}

export function loadMatch(matchId) {
  const filePath = path.join(MATCHES_DIR, `${matchId}.json`);
  return readJson(filePath);
}

export function listMatchFiles() {
  if (!fs.existsSync(MATCHES_DIR)) return [];
  return fs.readdirSync(MATCHES_DIR).filter((f) => f.endsWith('.json'));
}

export function appendMatchToIndex(matchEntry) {
  const indexPath = path.join(DATA_DIR, 'matches.json');
  const index = readJson(indexPath);
  const exists = index.matches.find((m) => m.id === matchEntry.id);
  if (!exists) {
    index.matches.push(matchEntry);
    fs.writeFileSync(indexPath, JSON.stringify(index, null, 2), 'utf-8');
    invalidateCache(indexPath);
  }
  return index;
}

export function ensureMatchesDir() {
  if (!fs.existsSync(MATCHES_DIR)) {
    fs.mkdirSync(MATCHES_DIR, { recursive: true });
  }
  // cold start seed: copy bundled seeds to persistent disk if empty
  const seedDir = path.join(DATA_DIR, 'matches');
  if (MATCHES_DIR !== seedDir && fs.existsSync(seedDir)) {
    const existing = fs.readdirSync(MATCHES_DIR);
    if (existing.length === 0) {
      for (const file of fs.readdirSync(seedDir)) {
        fs.copyFileSync(path.join(seedDir, file), path.join(MATCHES_DIR, file));
      }
    }
  }
}

export function loadStandings(ageGroup) {
  const filePath = path.join(DATA_DIR, 'standings', `${ageGroup}.json`);
  if (!fs.existsSync(filePath)) return null;
  return readJson(filePath);
}

export function listStandings() {
  const dir = path.join(DATA_DIR, 'standings');
  if (!fs.existsSync(dir)) return [];
  return fs.readdirSync(dir)
    .filter((f) => f.endsWith('.json') && !f.startsWith('_'))
    .map((f) => f.replace(/\.json$/, ''));
}

export function loadCup(ageGroup) {
  const filePath = path.join(DATA_DIR, 'cup', `${ageGroup}.json`);
  if (!fs.existsSync(filePath)) return null;
  return readJson(filePath);
}

export function listCup() {
  const dir = path.join(DATA_DIR, 'cup');
  if (!fs.existsSync(dir)) return [];
  return fs.readdirSync(dir)
    .filter((f) => f.endsWith('.json') && !f.startsWith('_'))
    .map((f) => f.replace(/\.json$/, ''));
}

export function loadCalendar(ageGroup) {
  const filePath = path.join(DATA_DIR, 'calendar', `${ageGroup}.json`);
  if (!fs.existsSync(filePath)) return null;
  return readJson(filePath);
}

export function listCalendar() {
  const dir = path.join(DATA_DIR, 'calendar');
  if (!fs.existsSync(dir)) return [];
  return fs.readdirSync(dir)
    .filter((f) => f.endsWith('.json') && !f.startsWith('_'))
    .map((f) => f.replace(/\.json$/, ''));
}

export const PATHS = { DATA_DIR, MATCHES_DIR };
