// Singleton PG pool. Импортируется из dataRepo и других сервисов.
// Активируется только если DATABASE_URL задан в env.
//
// Helpers:
//   query(sql, params)  — обычный SELECT/INSERT/UPDATE
//   tx(fn)              — обёртка для транзакции, fn получает client
//   isPgEnabled()       — true если DATABASE_URL есть и pool подключён
//
// Если PG отключён, остальные модули должны откатиться на JSON-хранилище
// (см. dataRepo.js — там реализован switching layer).

import pg from 'pg';
const { Pool } = pg;

let pool = null;
let initError = null;

// Проверка доступности PG. ВАЖНО: вызывает getPool() чтобы лениво создать
// пул при первом обращении (иначе isPgEnabled() всегда вернёт false на старте,
// потому что pool создается только в getPool/query/tx).
export function isPgEnabled() {
  if (!process.env.DATABASE_URL) return false;
  if (initError) return false;
  if (!pool) getPool(); // лениво инициализируем
  return !!pool && !initError;
}

export function getPool() {
  if (pool) return pool;
  if (!process.env.DATABASE_URL) {
    return null;
  }
  try {
    pool = new Pool({
      connectionString: process.env.DATABASE_URL,
      max: Number(process.env.DATABASE_POOL_MAX) || 10,
      ssl: process.env.DATABASE_SSL === 'false'
        ? false
        : { rejectUnauthorized: false },
      idleTimeoutMillis: 30000,
    });
    pool.on('error', (err) => {
      console.error('[pg] pool error:', err.message);
    });
    return pool;
  } catch (e) {
    initError = e;
    console.error('[pg] init failed:', e.message);
    return null;
  }
}

export async function query(sql, params = []) {
  const p = getPool();
  if (!p) throw new Error('PG не настроен (нет DATABASE_URL)');
  return p.query(sql, params);
}

// Транзакционный helper.
// Использование:
//   await tx(async (client) => {
//     await client.query('INSERT ...');
//     await client.query('UPDATE ...');
//   });
export async function tx(fn) {
  const p = getPool();
  if (!p) throw new Error('PG не настроен');
  const client = await p.connect();
  try {
    await client.query('BEGIN');
    const result = await fn(client);
    await client.query('COMMIT');
    return result;
  } catch (e) {
    await client.query('ROLLBACK');
    throw e;
  } finally {
    client.release();
  }
}

export async function ping() {
  const p = getPool();
  if (!p) return { ok: false, error: 'no DATABASE_URL' };
  try {
    const r = await p.query('SELECT 1 as ok, version() as version');
    return { ok: true, version: r.rows[0].version };
  } catch (e) {
    return { ok: false, error: e.message };
  }
}

export async function shutdown() {
  if (pool) {
    await pool.end();
    pool = null;
  }
}
