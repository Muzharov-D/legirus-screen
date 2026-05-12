// Регенерация паролей для тренеров (team_coach + head_coach).
//
// Запуск на Render Shell:
//   node scripts/regenerate-coach-passwords.js
//
// Что делает:
//   1. Селектит всех пользователей с role IN ('team_coach', 'head_coach')
//   2. Для каждого генерирует новый читаемый пароль (10 символов, без путаниц 0/O и 1/l)
//   3. bcrypt-хеширует, обновляет users.password_hash
//   4. Печатает таблицу: команда / username / новый пароль / роль
//
// ⚠️ Plain-text пароли выводятся ОДИН раз — сохрани вывод сразу.
// После закрытия терминала восстановить нельзя, придётся регенерировать снова.

import 'dotenv/config';
import bcrypt from 'bcryptjs';
import { query, getPool } from '../db/pool.js';

// Алфавит без визуально похожих символов (0/O, 1/I/l, etc.)
const ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnpqrstuvwxyz23456789';
const PASSWORD_LEN = 10;

function generatePassword() {
  let pwd = '';
  // Используем crypto.getRandomValues если есть, иначе Math.random
  const cryptoObj = (typeof globalThis !== 'undefined' && globalThis.crypto) || null;
  if (cryptoObj?.getRandomValues) {
    const buf = new Uint32Array(PASSWORD_LEN);
    cryptoObj.getRandomValues(buf);
    for (let i = 0; i < PASSWORD_LEN; i++) {
      pwd += ALPHABET[buf[i] % ALPHABET.length];
    }
  } else {
    for (let i = 0; i < PASSWORD_LEN; i++) {
      pwd += ALPHABET[Math.floor(Math.random() * ALPHABET.length)];
    }
  }
  return pwd;
}

async function main() {
  if (!process.env.DATABASE_URL) {
    console.error('❌ DATABASE_URL не задан — нечего обновлять');
    process.exit(1);
  }

  // 1. Берём всех тренеров (head_coach + team_coach)
  const r = await query(`
    SELECT u.id, u.username, u.full_name, u.role, u.team_id, t.name AS team_name
    FROM users u
    LEFT JOIN teams t ON t.id = u.team_id
    WHERE u.role IN ('team_coach', 'head_coach')
    ORDER BY u.role DESC, t.name NULLS LAST, u.username
  `);

  if (r.rows.length === 0) {
    console.log('Тренеров не найдено.');
    process.exit(0);
  }

  console.log(`\nНайдено тренеров: ${r.rows.length}\n`);
  console.log('═'.repeat(96));
  console.log(
    'Команда'.padEnd(28) +
    ' | ' + 'Имя'.padEnd(28) +
    ' | ' + 'Логин'.padEnd(16) +
    ' | ' + 'Новый пароль'.padEnd(12)
  );
  console.log('─'.repeat(96));

  let okCount = 0;
  let failCount = 0;

  for (const row of r.rows) {
    const newPwd = generatePassword();
    try {
      const hash = await bcrypt.hash(newPwd, 10);
      await query(
        `UPDATE users SET password_hash = $1 WHERE id = $2`,
        [hash, row.id]
      );
      const teamLabel = row.team_name || (row.role === 'head_coach' ? '[весь клуб]' : '—');
      const nameLabel = row.full_name || '—';
      console.log(
        teamLabel.padEnd(28).slice(0, 28) +
        ' | ' + nameLabel.padEnd(28).slice(0, 28) +
        ' | ' + (row.username || '').padEnd(16).slice(0, 16) +
        ' | ' + newPwd
      );
      okCount++;
    } catch (err) {
      console.error(`❌ ${row.username}: ${err.message}`);
      failCount++;
    }
  }

  console.log('═'.repeat(96));
  console.log(`\n✅ Обновлено: ${okCount}   ❌ Ошибок: ${failCount}\n`);
  console.log('⚠️  ВАЖНО: Скопируй таблицу сейчас. После закрытия терминала пароли восстановить нельзя.');
  console.log('   После рассылки тренеры могут сменить свой пароль через UI: профиль → сменить пароль.\n');

  await getPool().end();
}

main().catch((err) => {
  console.error('FATAL:', err);
  process.exit(1);
});
