import { spawn } from 'child_process';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import {
  PATHS,
  invalidateCache,
  appendMatchToIndex,
  loadMatchesIndex,
} from './dataLoader.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const PARSERS_DIR = path.resolve(__dirname, '..', 'parsers');
const PYTHON_BIN = process.env.PYTHON_BIN || (process.platform === 'win32' ? 'python' : 'python3');

function nextMatchId() {
  const index = loadMatchesIndex();
  const ids = index.matches
    .map((m) => m.id)
    .filter((id) => /^match-\d+$/.test(id))
    .map((id) => parseInt(id.split('-')[1], 10));
  const next = (ids.length ? Math.max(...ids) : 0) + 1;
  return `match-${String(next).padStart(3, '0')}`;
}

function runPython(script, args, cwd = PARSERS_DIR) {
  return new Promise((resolve, reject) => {
    const child = spawn(PYTHON_BIN, [script, ...args], { cwd });
    let stdout = '';
    let stderr = '';
    child.stdout.on('data', (d) => { stdout += d.toString(); });
    child.stderr.on('data', (d) => { stderr += d.toString(); });
    child.on('error', reject);
    child.on('close', (code) => {
      if (code !== 0) {
        return reject(new Error(`Python exited ${code}: ${stderr || stdout}`));
      }
      resolve({ stdout, stderr });
    });
  });
}

// tournament: 'league' (Турнир) | 'cup' (Кубок)
export async function processPdf(pdfPath, opts = {}) {
  if (!fs.existsSync(pdfPath)) {
    throw new Error('PDF файл не найден');
  }
  const teamId = opts.teamId || 'legirus-2010';
  const matchId = opts.matchId || nextMatchId();
  const outJson = path.join(PATHS.MATCHES_DIR, `${matchId}.json`);
  const mapsDir = process.env.MAPS_DIR || path.resolve(__dirname, '..', '..', 'frontend', 'public', 'assets', 'maps');
  if (!fs.existsSync(mapsDir)) fs.mkdirSync(mapsDir, { recursive: true });

  const buildScript = path.join(PARSERS_DIR, 'build_match.py');
  if (!fs.existsSync(buildScript)) {
    throw new Error('Парсер build_match.py не найден');
  }

  await runPython(buildScript, [pdfPath, outJson, teamId, matchId]).catch((err) => {
    throw new Error(`Ошибка парсинга PDF: ${err.message}`);
  });

  const cropTeam = path.join(PARSERS_DIR, 'crop_maps.py');
  if (fs.existsSync(cropTeam)) {
    await runPython(cropTeam, [pdfPath, mapsDir, matchId]).catch(() => {});
  }
  const cropPlayer = path.join(PARSERS_DIR, 'crop_player_maps.py');
  if (fs.existsSync(cropPlayer)) {
    await runPython(cropPlayer, [pdfPath, mapsDir, matchId]).catch(() => {});
  }

  invalidateCache(outJson);
  let matchData = null;
  if (fs.existsSync(outJson)) {
    matchData = JSON.parse(fs.readFileSync(outJson, 'utf-8'));
  } else {
    throw new Error('Парсер не создал JSON-файл матча');
  }

  // Гарантируем поля teamId/id даже если парсер не проставил их.
  if (!matchData.teamId || matchData.teamId !== teamId) {
    matchData.teamId = teamId;  // force-set, чтобы guard не падал
    fs.writeFileSync(outJson, JSON.stringify(matchData, null, 2), 'utf-8');
    invalidateCache(outJson);
  }
  if (!matchData.teamId) {
    throw new Error(`Парсер не записал teamId в ${outJson} — миграция отказана`);
  }

  const tournament = ['league', 'cup'].includes((opts.tournament || '').toLowerCase())
    ? opts.tournament.toLowerCase()
    : 'league';

  const entry = {
    id: matchData.id || matchId,
    teamId: matchData.teamId || teamId,
    date: matchData.date || new Date().toISOString().slice(0, 10),
    season: matchData.season || '',
    tournament,
    homeTeamId: matchData.homeTeam?.id || teamId,
    awayTeamId: matchData.awayTeam?.id || 'unknown',
    homeTeamName: matchData.homeTeam?.name || null,
    awayTeamName: matchData.awayTeam?.name || null,
    score: matchData.score || { home: 0, away: 0 },
    status: 'analyzed',
    statusLabel: 'МАТЧ РАЗОБРАН',
    detailsRef: `matches/${matchData.id || matchId}.json`,
  };
  if (!entry.teamId) throw new Error('Match entry missing teamId — refusing to write index');
  appendMatchToIndex(entry);

  return { matchId: entry.id, status: 'ready' };
}
