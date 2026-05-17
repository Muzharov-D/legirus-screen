// One-shot бэкфилл legacy-игроков из backend/data/players.json в PG.
// Если на проде в PG только ffspb-XXX игроки (без русских имён и без фото),
// фронт рисует инициалы вместо фоток. Этот скрипт восстанавливает legacy
// игроков с id вида p\d+-name, photo = "p17-turapin.png" и т.д.
//
// Идемпотентно: ON CONFLICT (id) DO UPDATE — обновляет поля если есть,
// фото перетирает только если в БД пусто (COALESCE).

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { isPgEnabled, query } from '../db/pool.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const PLAYERS_JSON = path.resolve(__dirname, '..', 'data', 'players.json');

export async function backfillLegacyPlayers() {
  if (!isPgEnabled()) return { skipped: 'PG not configured' };
  if (!fs.existsSync(PLAYERS_JSON)) return { skipped: 'no players.json' };

  let raw;
  try { raw = JSON.parse(fs.readFileSync(PLAYERS_JSON, 'utf-8')); }
  catch (e) { return { error: 'parse failed: ' + e.message }; }

  const players = Array.isArray(raw.players) ? raw.players : [];
  let inserted = 0;
  let updated = 0;
  let skipped = 0;

  for (const p of players) {
    if (!p.id || !p.teamId) { skipped++; continue; }
    // Backfill только legacy-id (p\d+-...) — ffspb уже синкается своим cron'ом
    if (!/^p\d+-/.test(p.id)) { skipped++; continue; }

    const row = {
      id: p.id,
      team_id: p.teamId,
      full_name: p.fullName || `${p.firstName || ''} ${p.lastName || ''}`.trim(),
      first_name: p.firstName || null,
      last_name: p.lastName || null,
      number: Number.isFinite(Number(p.number)) ? Number(p.number) : null,
      position: p.position || null,
      position_full: p.positionFull || null,
      // Photo может быть filename (p17-turapin.png) или URL — храним as-is
      photo_url: p.photo || p.photoUrl || null,
    };

    const existing = await query(`SELECT id FROM players WHERE id = $1`, [row.id]);
    const isNew = existing.rows.length === 0;

    await query(
      `INSERT INTO players (id, team_id, full_name, first_name, last_name, number, position, position_full, photo_url)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
       ON CONFLICT (id) DO UPDATE SET
         team_id = EXCLUDED.team_id,
         full_name = EXCLUDED.full_name,
         first_name = COALESCE(EXCLUDED.first_name, players.first_name),
         last_name = COALESCE(EXCLUDED.last_name, players.last_name),
         number = COALESCE(EXCLUDED.number, players.number),
         position = COALESCE(EXCLUDED.position, players.position),
         position_full = COALESCE(EXCLUDED.position_full, players.position_full),
         photo_url = COALESCE(EXCLUDED.photo_url, players.photo_url)`,
      [row.id, row.team_id, row.full_name, row.first_name, row.last_name,
       row.number, row.position, row.position_full, row.photo_url]);

    if (isNew) inserted++; else updated++;
  }

  return { found: players.length, inserted, updated, skipped };
}
