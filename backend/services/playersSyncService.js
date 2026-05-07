// Sprint 5.5 — синхронизация заявочных листов команд из FFSPB API.
// Cron 12h: для каждой нашей команды (legirus-2010..2013) находит ffspb team_id
// через standings (там есть наша команда с её id), затем тянет /players?team=...
// и UPSERT'ит в нашу таблицу players с id = 'ffspb-{numericId}'.
//
// Старые записи players с id типа 'p17-turapin' оставляем без изменений —
// при необходимости почистим отдельной SQL-командой:
//   DELETE FROM players WHERE id NOT LIKE 'ffspb-%';

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { isFfspbConfigured, listAll, listStandings } from './ffspbApi.js';
import { isPgEnabled, query } from '../db/pool.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const CONFIG_PATH = path.resolve(__dirname, '..', 'data', 'standings', '_config.json');

function readConfig() {
  return JSON.parse(fs.readFileSync(CONFIG_PATH, 'utf-8'));
}

function parseTournamentId(url) {
  if (!url) return null;
  const m = String(url).match(/tournament(\d+)/i);
  return m ? Number(m[1]) : null;
}

// Найти ffspb team_id нашей команды для возрастной группы — через standings.
async function findOurFfspbTeamId(tournamentId, ourMatcher) {
  const groups = await listStandings(tournamentId);
  const matcher = String(ourMatcher || 'Легирус').toLowerCase();
  for (const g of groups || []) {
    for (const t of g.teams || []) {
      const name = String(t.teamName || t.team?.name || '');
      if (name.toLowerCase().includes(matcher)) {
        return t.team?.id;
      }
    }
  }
  return null;
}

// Field в publicExtra: ищем по name
function pe(player, fieldName) {
  const arr = player.publicExtra || [];
  const f = arr.find((x) => x.field?.name === fieldName);
  return f?.value || null;
}

// Player из API: @id="/api/players/10369211", id поля нет, member может быть IRI-строкой,
// имена в этом случае на верхнем уровне (p.surname / p.firstName).
function extractPlayerId(p) {
  if (p.id != null) return String(p.id);
  if (p['@id']) {
    const m = String(p['@id']).match(/\/(\d+)$/);
    if (m) return m[1];
  }
  return null;
}

function ffspbPlayerToOur(p, teamId) {
  const playerId = extractPlayerId(p);
  if (!playerId) return null; // нет id — пропускаем
  const profile = (typeof p.member === 'object' && p.member) ? p.member : {};
  const firstName = p.firstName || profile.firstName || null;
  const lastName  = p.surname   || profile.surname   || null;
  const numberRaw = pe(p, 'Номер игрока');
  const number = Number.parseInt(numberRaw, 10);
  const position = pe(p, 'Амплуа');
  const fullName = [firstName, lastName].filter(Boolean).join(' ').trim();
  const photoUrl = p.photo || profile.photo || null;
  return {
    id: `ffspb-${playerId}`,
    teamId,
    fullName: fullName || lastName || null,
    firstName,
    lastName,
    number: Number.isFinite(number) ? number : null,
    position,
    positionFull: null,
    photoUrl,
  };
}

export async function syncPlayersForAge(age, cfg = null) {
  if (!isFfspbConfigured()) return { skipped: 'FFSPB_API_KEY not set' };
  if (!isPgEnabled())       return { skipped: 'PG not configured' };

  const config = cfg || readConfig();
  const tid = parseTournamentId(config.sources?.[age]);
  if (!tid) throw new Error('No tournament_id for ' + age);

  const ffspbTeamId = await findOurFfspbTeamId(tid, config.ourClubMatcher);
  if (!ffspbTeamId) {
    return { tid, ffspbTeamId: null, error: 'Наша команда не найдена в standings' };
  }

  const players = await listAll('/players', { team: `/api/teams/${ffspbTeamId}` });
  const teamId = `legirus-${age}`;
  let upserted = 0;
  let skipped = 0;
  for (const p of players) {
    const row = ffspbPlayerToOur(p, teamId);
    if (!row) { skipped++; continue; }
    if (!row.fullName) { skipped++; continue; }
    await query(
      `INSERT INTO players (id, team_id, full_name, first_name, last_name, number, position, position_full, photo_url)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
       ON CONFLICT (id) DO UPDATE SET
         team_id = EXCLUDED.team_id,
         full_name = EXCLUDED.full_name,
         first_name = EXCLUDED.first_name,
         last_name = EXCLUDED.last_name,
         number = EXCLUDED.number,
         position = EXCLUDED.position,
         photo_url = COALESCE(EXCLUDED.photo_url, players.photo_url)`,
      [row.id, row.teamId, row.fullName, row.firstName, row.lastName,
       row.number, row.position, row.positionFull, row.photoUrl]);
    upserted++;
  }
  return { tid, ffspbTeamId, found: players.length, upserted, skipped };
}

export async function syncAllPlayers() {
  const cfg = readConfig();
  const ages = Object.keys(cfg.sources || {});
  const results = {};
  for (const age of ages) {
    try {
      results[age] = await syncPlayersForAge(age, cfg);
      const r = results[age];
      if (r.upserted != null) {
        console.log(`[players-sync] ${age}: tid=${r.tid}, team=${r.ffspbTeamId}, found=${r.found}, upserted=${r.upserted}`);
      } else if (r.skipped) {
        console.log(`[players-sync] ${age}: skipped (${r.skipped})`);
      } else if (r.error) {
        console.warn(`[players-sync] ${age}: ${r.error}`);
      }
    } catch (e) {
      results[age] = { error: e.message };
      console.error(`[players-sync] ${age} failed: ${e.message}`);
    }
  }
  return results;
}

let timer = null;
const TWELVE_HOURS_MS = 12 * 60 * 60 * 1000;

export function startPlayersSyncCron() {
  if (timer) return;
  // Первый прогон через 15 сек после старта (после standings/cup которые запускаются раньше)
  setTimeout(() => syncAllPlayers().catch((e) => console.error('[players-sync] tick failed:', e.message)), 15_000);
  timer = setInterval(() => syncAllPlayers().catch(() => {}), TWELVE_HOURS_MS);
  console.log('[players-sync] cron started, every 12h');
}
export function stopPlayersSyncCron() { if (timer) clearInterval(timer); timer = null; }
