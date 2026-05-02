// Запуск:  node scripts/seed-users.js
// Создаёт users.json со всеми тренерами и игроками клуба и выводит
// пары login:password в credentials.txt. Скрипт прерывается, если
// users.json уже существует — переcоздавать существующих пользователей
// не нужно (используется только для первичного засева).
//
// Поддерживает три роли:
//   head_coach — главный тренер академии (teamId=null, видит все команды)
//   team_coach — тренер конкретной команды (teamId=<...>, видит только свою)
//   player     — игрок (teamId=<...> + playerId)
import fs from 'fs';
import path from 'path';
import bcrypt from 'bcryptjs';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const DATA_DIR = path.resolve(__dirname, '..', 'data');

const USERS_PATH = process.env.USERS_PATH || path.join(DATA_DIR, 'users.json');

function transliterate(s) {
  const map = {
    а:'a', б:'b', в:'v', г:'g', д:'d', е:'e', ё:'e', ж:'zh', з:'z', и:'i', й:'y',
    к:'k', л:'l', м:'m', н:'n', о:'o', п:'p', р:'r', с:'s', т:'t', у:'u', ф:'f',
    х:'h', ц:'ts', ч:'ch', ш:'sh', щ:'sch', ъ:'', ы:'y', ь:'', э:'e', ю:'yu', я:'ya',
  };
  return String(s || '').toLowerCase().split('').map((c) => map[c] ?? c).join('').replace(/[^a-z0-9]/g, '');
}

function genPassword() {
  const alpha = 'abcdefghjkmnpqrstuvwxyz';
  const digit = '23456789';
  let s = '';
  for (let i = 0; i < 7; i++) s += alpha[Math.floor(Math.random() * alpha.length)];
  for (let i = 0; i < 3; i++) s += digit[Math.floor(Math.random() * digit.length)];
  return s;
}

async function main() {
  if (fs.existsSync(USERS_PATH)) {
    console.error(`users.json уже существует: ${USERS_PATH}`);
    console.error('Удалите файл вручную, если хотите пересоздать. Скрипт прерван.');
    process.exit(1);
  }

  const playersPath = path.join(DATA_DIR, 'players.json');
  const teamsPath = path.join(DATA_DIR, 'teams.json');
  const players = JSON.parse(fs.readFileSync(playersPath, 'utf-8'));
  const teamsData = JSON.parse(fs.readFileSync(teamsPath, 'utf-8'));

  const users = [];
  const credentials = [];
  const usedUsernames = new Set();

  // 1) Главный тренер академии — head_coach (teamId=null, видит всё).
  const headPwd = genPassword();
  users.push({
    id: 'u-head-coach',
    username: 'coach',
    passwordHash: bcrypt.hashSync(headPwd, 10),
    role: 'head_coach',
    teamId: null,
    fullName: 'Главный тренер академии',
    createdAt: new Date().toISOString(),
  });
  credentials.push({ login: 'coach', password: headPwd, role: 'head_coach', name: 'Главный тренер академии' });
  usedUsernames.add('coach');

  // 2) По одному тренеру команды на каждую активную команду.
  const ourTeams = (teamsData.teams || []).filter((t) => t.isOurTeam);
  for (const team of ourTeams) {
    if (!team.active) continue; // на старте создаём только для уже наполненных команд
    const username = `coach${team.year || team.yearGroup || team.id}`;
    if (usedUsernames.has(username)) continue;
    const pwd = genPassword();
    users.push({
      id: `u-team-coach-${team.year || team.yearGroup || team.id}`,
      username,
      passwordHash: bcrypt.hashSync(pwd, 10),
      role: 'team_coach',
      teamId: team.id,
      fullName: `Тренер ${team.name}`,
      createdAt: new Date().toISOString(),
    });
    credentials.push({ login: username, password: pwd, role: 'team_coach', teamId: team.id, name: `Тренер ${team.name}` });
    usedUsernames.add(username);
  }

  // 3) Игроки. Каждому — playerId, teamId (берём из players.json).
  for (const p of players.players) {
    let base = transliterate(p.lastName || p.fullName || p.id);
    if (!base) base = p.id.replace(/[^a-z0-9]/g, '');
    let username = base;
    let i = 2;
    while (usedUsernames.has(username)) {
      username = `${base}${i++}`;
    }
    usedUsernames.add(username);

    const pwd = genPassword();
    users.push({
      id: `u-${p.id}`,
      username,
      passwordHash: bcrypt.hashSync(pwd, 10),
      role: 'player',
      teamId: p.teamId || null,
      playerId: p.id,
      fullName: p.fullName,
      createdAt: new Date().toISOString(),
    });
    credentials.push({ login: username, password: pwd, role: 'player', teamId: p.teamId || null, playerId: p.id, name: p.fullName });
  }

  const dir = path.dirname(USERS_PATH);
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(USERS_PATH, JSON.stringify({ users }, null, 2), 'utf-8');

  const credPath = path.join(dir, 'credentials.txt');
  const credText = [
    '# Учётные записи академии Легирус — сгенерированы автоматически',
    `# Дата: ${new Date().toISOString()}`,
    '# ВАЖНО: после раздачи учёток удалите этот файл.',
    '',
    ...credentials.map((c) =>
      `${c.role.padEnd(11)}  ${c.login.padEnd(20)}  ${c.password}  ${(c.teamId || '').padEnd(16)}  ${c.playerId || ''}  ${c.name}`
    ),
    '',
  ].join('\n');
  fs.writeFileSync(credPath, credText, 'utf-8');

  console.log(`✅ Создано ${users.length} пользователей в ${USERS_PATH}`);
  console.log(`✅ Реквизиты сохранены в ${credPath}`);
  console.log('\nПервые учётки:');
  for (const c of credentials.slice(0, 3)) {
    console.log(`  ${c.login} / ${c.password}  (${c.role}) ${c.name}`);
  }
  console.log('\n⚠️ После раздачи учёток удалите credentials.txt');
}

main().catch((e) => { console.error(e); process.exit(1); });
