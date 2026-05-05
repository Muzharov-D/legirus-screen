// Минималистичный migration runner для PostgreSQL.
// Применяет SQL-файлы из db/migrations/*.sql по алфавиту, отслеживает применённые
// в таблице schema_migrations. Идемпотентен — повторный запуск пропустит применённые.
//
// Запуск: npm run db:migrate

import 'dotenv/config';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { getPool, shutdown } from './pool.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const MIGRATIONS_DIR = path.join(__dirname, 'migrations');

async function ensureMigrationsTable(client) {
  await client.query(`
    CREATE TABLE IF NOT EXISTS schema_migrations (
      filename    TEXT PRIMARY KEY,
      applied_at  TIMESTAMPTZ DEFAULT NOW()
    )
  `);
}

async function appliedMigrations(client) {
  const r = await client.query('SELECT filename FROM schema_migrations ORDER BY filename');
  return new Set(r.rows.map((row) => row.filename));
}

async function applyMigration(client, filename, sql) {
  console.log(`[migrate] applying ${filename}...`);
  await client.query('BEGIN');
  try {
    await client.query(sql);
    await client.query('INSERT INTO schema_migrations (filename) VALUES ($1)', [filename]);
    await client.query('COMMIT');
    console.log(`[migrate] ✅ ${filename}`);
  } catch (e) {
    await client.query('ROLLBACK');
    console.error(`[migrate] ❌ ${filename}: ${e.message}`);
    throw e;
  }
}

async function run() {
  const pool = getPool();
  if (!pool) {
    console.error('[migrate] DATABASE_URL не задан в .env');
    process.exit(1);
  }
  if (!fs.existsSync(MIGRATIONS_DIR)) {
    console.error('[migrate] директория migrations отсутствует:', MIGRATIONS_DIR);
    process.exit(1);
  }
  const files = fs
    .readdirSync(MIGRATIONS_DIR)
    .filter((f) => f.endsWith('.sql'))
    .sort();

  if (files.length === 0) {
    console.log('[migrate] нет .sql файлов в migrations/');
    process.exit(0);
  }

  const client = await pool.connect();
  try {
    await ensureMigrationsTable(client);
    const applied = await appliedMigrations(client);
    let applied_count = 0;
    let skipped_count = 0;
    for (const file of files) {
      if (applied.has(file)) {
        console.log(`[migrate] - skip ${file} (already applied)`);
        skipped_count++;
        continue;
      }
      const sql = fs.readFileSync(path.join(MIGRATIONS_DIR, file), 'utf-8');
      await applyMigration(client, file, sql);
      applied_count++;
    }
    console.log(`[migrate] done. applied=${applied_count}, skipped=${skipped_count}`);
  } finally {
    client.release();
    await shutdown();
  }
}

run().catch((e) => {
  console.error('[migrate] FATAL:', e.message);
  process.exit(1);
});
