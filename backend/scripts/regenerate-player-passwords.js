// Регенерация паролей для игроков одной команды (role=player).
//
// Запуск на Render Shell:
//   node scripts/regenerate-player-passwords.js 2010
//   node scripts/regenerate-player-passwords.js 2011
//   ...
//
// Аргумент — возраст команды (год рождения). Скрипт ищет команду по подстроке в
// teams.id или teams.name (т.к. team_id обычно вида 'legirus-2010', а имя — '2010 г.р.').
//
// ⚠️ Plain-text пароли выводятся ОДИН раз — сохрани вывод сразу.

import 'dotenv/config';
import bcrypt from 'bcryptjs';
import { query, getPool } from '../db/pool.js';

const ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnpqrstuvwxyz23456789';
const PASSWORD_LEN = 10;

function generatePassword() {
  let pwd = '';
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
    console.error('❌ DATABASE_URL не задан');
    process.exit(1);
  }

  const ageArg = process.argv[2];
  if (!ageArg) {
    console.error('❌ Не указан возраст. Пример: node scripts/regenerate-player-passwords.js 2010');
    process.exit(1);
  }

  // Ищем команду по подстроке: team.id содержит age (legirus-2010) ИЛИ team.name содержит age (2010 г.р.).
  const teamRes = await query(`
    SELECT id, name FROM teams
    WHERE id ILIKE $1 OR name ILIKE $1
    ORDER BY id
  `, [`%${ageArg}%`]);

  if (teamRes.rows.length === 0) {
    console.error(`❌ Команда для возраста "${ageArg}" не найдена. Доступные команды:`);
    const all = await query(`SELECT id, name FROM teams ORDER BY id`);
    for (const t of all.rows) console.error(`   ${t.id}  →  ${t.name}`);
    process.exit(1);
  }
  if (teamRes.rows.length > 1) {
    console.error(`⚠️  Найдено несколько команд по "${ageArg}":`);
    for (const t of teamRes.rows) console.error(`   ${t.id}  →  ${t.name}`);
    console.error('   Уточни возраст или передай точный team_id.');
    process.exit(1);
  }

  const team = teamRes.rows[0];
  console.log(`\n🎯 Команда: ${team.name} (${team.id})\n`);

  // Берём всех игроков этой команды
  const r = await query(`
    SELECT u.id, u.username, u.full_name, p.number AS jersey_number
    FROM users u
    LEFT JOIN players p ON p.id = u.player_id
    WHERE u.role = 'player' AND u.team_id = $1
    ORDER BY p.number NULLS LAST, u.full_name
  `, [team.id]);

  if (r.rows.length === 0) {
    console.log('Игроков с аккаунтами в этой команде не найдено.');
    process.exit(0);
  }

  console.log(`Найдено игроков: ${r.rows.length}\n`);
  console.log('═'.repeat(86));
  console.log(
    '#'.padStart(3) +
    ' | ' + 'Имя'.padEnd(32) +
    ' | ' + 'Логин'.padEnd(20) +
    ' | ' + 'Новый пароль'.padEnd(12)
  );
  console.log('─'.repeat(86));

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
      const numLabel = row.jersey_number != null ? String(row.jersey_number) : '—';
      const nameLabel = row.full_name || '—';
      console.log(
        numLabel.padStart(3) +
        ' | ' + nameLabel.padEnd(32).slice(0, 32) +
        ' | ' + (row.username || '').padEnd(20).slice(0, 20) +
        ' | ' + newPwd
      );
      okCount++;
    } catch (err) {
      console.error(`❌ ${row.username}: ${err.message}`);
      failCount++;
    }
  }

  console.log('═'.repeat(86));
  console.log(`\n✅ Обновлено: ${okCount}   ❌ Ошибок: ${failCount}\n`);
  console.log('⚠️  ВАЖНО: Скопируй таблицу сейчас. Хеши необратимы — пароли не восстановить.');
  console.log('   Игрок может сменить свой пароль через UI: профиль → сменить пароль.\n');

  await getPool().end();
}

main().catch((err) => {
  console.error('FATAL:', err);
  process.exit(1);
});
