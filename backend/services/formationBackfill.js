// One-shot бэкфилл: формация (расстановка + ссылки на картинки поля)
// мигрирует из backend/data/matches/*.json в PG matches.meta JSONB.
// До этого loadMatch резолвил formation через JSON-файл как fallback —
// рабочее решение, но при удалении JSON-файлов формация исчезла бы.
// Теперь meta.formation — single source of truth для PG-режима.
//
// Идемпотентно: можно запускать сколько угодно раз, обновляет только
// если в meta ещё нет formation или fileHash изменился.

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { isPgEnabled, query } from '../db/pool.js';
import * as legacy from './dataLoader.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const MATCHES_DIR = path.resolve(__dirname, '..', 'data', 'matches');

export async function backfillFormationToMeta() {
  if (!isPgEnabled()) return { skipped: 'PG not configured' };
  if (!fs.existsSync(MATCHES_DIR)) return { skipped: 'no matches dir' };

  const files = fs.readdirSync(MATCHES_DIR).filter((f) => f.endsWith('.json'));
  let updated = 0;
  let skipped = 0;
  let missing = 0;

  for (const file of files) {
    const matchId = file.replace(/\.json$/, '');
    const data = legacy.loadMatch(matchId);
    if (!data) { missing++; continue; }

    // Собираем то, что нет в основных колонках PG, но нужно фронту
    const extras = {};
    if (data.formation) extras.formation = data.formation;
    if (data.formationImage) extras.formationImage = data.formationImage;
    if (data.formationImageFull) extras.formationImageFull = data.formationImageFull;
    if (data.radarImages) extras.radarImages = data.radarImages;
    if (Object.keys(extras).length === 0) { skipped++; continue; }

    // Проверяем — может уже актуально
    const existing = await query(`SELECT meta FROM matches WHERE id = $1`, [matchId]);
    if (existing.rows.length === 0) { missing++; continue; }
    const curMeta = existing.rows[0].meta || {};
    const hasFormation = curMeta?.formation && curMeta?.formationImage;
    if (hasFormation) { skipped++; continue; }

    const newMeta = { ...curMeta, ...extras };
    await query(`UPDATE matches SET meta = $1 WHERE id = $2`,
      [JSON.stringify(newMeta), matchId]);
    updated++;
  }

  return { files: files.length, updated, skipped, missing };
}
